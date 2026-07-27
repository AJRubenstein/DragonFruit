import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LoadedModel } from '@/features/scene/useSceneCollectionManager';
import type { ModelTransform } from '@/hooks/useModelTransform';
import { quaternionFromGlobalEuler } from '@/utils/rotation';
import { ScreenSpaceGizmo } from '@/components/gizmo';
import type { GizmoAxis } from '@/components/gizmo';
import type { ThreeEvent } from '@react-three/fiber';
import type { KeyPreviewFrame } from './types';
import { useOrganicCutColorNumbers } from './useOrganicCutColors';

/** Max key tilt (radians) — mirrors the Rust `KEY_MAX_TILT_RAD` (~60°). */
const KEY_MAX_TILT_RAD = Math.PI / 3;

/** The key has two rotations, not three: the lean (green ring) and the roll. */
const LEAN_AND_ROLL_RINGS: GizmoAxis[] = ['y', 'z'];

export interface OrganicCutKeyGizmoProps {
  /** All loaded models (to find the active one for its geometry/offset). */
  models: LoadedModel[];
  /** The active model's id. */
  activeModelId: string | null;
  /** The active model's transform (plate position/rotation/scale). */
  activeTransform?: ModelTransform;
  /**
   * The previewed key's placement frame in MODEL-LOCAL space (anchor = base center,
   * axis = un-tilted cut normal, u/v = in-plane basis). Null → no gizmo.
   */
  keyFrame: KeyPreviewFrame | null;
  /**
   * Current key lean / roll (radians). The lean's azimuth is not an input: it
   * follows the roll (see `leanAzimuthFor`), so the gizmo derives it.
   */
  keyTiltRad: number;
  keyRollRad: number;
  /** Report a new aim/roll (radians); tilt is pre-clamped. */
  onKeyAimChange: (tiltRad: number, azimuthRad: number, rollRad: number) => void;
  /**
   * Where the key sits on the cut face (mm along the frame's u/v), and the
   * reporter for the base handle that slides it. Omit the setter and no handle is
   * drawn — the key stays on the centroid.
   */
  keyOffsetUMm?: number;
  keyOffsetVMm?: number;
  /** The offset the previewed key was built with — see `keyOffsetMatrix` in the
   *  tool. The crosshair rides the same difference so it stays under the cursor
   *  instead of snapping back to the last frame Rust returned. */
  keyPreviewOffset?: { u: number; v: number };
  onKeyOffsetChange?: (offsetUMm: number, offsetVMm: number) => void;
  /** Notifies the host that a gizmo drag started/ended (to pause OrbitControls). */
  onDragStateChange?: (dragging: boolean) => void;
}

/**
 * Fold an angle into (−π, π]. Roll is the only unbounded one of the three (tilt is
 * clamped, azimuth comes out of `atan2`), so without this it just keeps counting
 * up as the user spins the ring.
 */
function wrapAngle(rad: number): number {
  const TWO_PI = Math.PI * 2;
  let wrapped = rad % TWO_PI;
  if (wrapped > Math.PI) wrapped -= TWO_PI;
  else if (wrapped <= -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

/**
 * The lean's azimuth for a given roll — the key has TWO freedoms, not three.
 *
 * MIND THE SIGN. The key is built in a frame whose axis is NEGATED against the cut
 * frame (`frame_extruding_toward_part_b`), so a roll of +ρ there turns the body the
 * other way round the cut normal. Deriving the azimuth as `roll + c` therefore did
 * not weld the two together — it left the body turning at 2ρ against a lean plane
 * turning at ρ, which is exactly the extra spin about its own axis that had no
 * ring and no name. Subtracting cancels it: body and lean plane move as one.
 *
 * The old gizmo had the lean (off the normal), the plane that lean happens in, and
 * the key's own spin about its axis, all independent. The third one is the one
 * nobody wants: the lean plane should simply BE the plane of one of the key's
 * narrow faces, at every roll. So the roll turns the lean plane and the key
 * together, as one body, and the azimuth is derived here rather than free.
 *
 * The quarter turn is which face gets it. The key is built in a frame whose u/v
 * are SWAPPED against the cut frame (`frame_extruding_toward_part_b` in key.rs),
 * so its width — the narrow face — lies along the cut frame's v. Leaning toward v
 * is therefore leaning in the plane of a narrow face; drop the quarter turn to
 * tip it over a wide face instead.
 */
function leanAzimuthFor(rollRad: number): number {
  return wrapAngle(Math.PI / 2 - rollRad);
}

/**
 * The registration-key aim/roll gizmo — the app's standard ScreenSpaceGizmo
 * (rotate-only) mounted at the key's base center, oriented to the key's frame.
 *
 * IMPORTANT: this MUST be mounted INSIDE the scene's PickingProviderWrapper (the
 * same subtree as the main transform gizmo). The gizmo's handle hit-testing flows
 * through the GPU picking system; mounted outside the provider, its handles can't be
 * grabbed (the model mesh in front swallows the pointer). So it's rendered via a
 * SceneCanvas in-provider slot, NOT inside OrganicCutTool (which sits outside it).
 *
 * The key frame is reported in MODEL-LOCAL space; we compose the model's group chain
 * (plate transform → meshLocalOffset) into a WORLD anchor + a WORLD orientation whose
 * local x/y/z map to the key's u/v/axis. The three rotation rings then spin about the
 * key's own basis, and we map the per-axis deltas to tilt/azimuth/roll:
 *   - ring about the normal (z) → roll: turns the key AND the plane it leans in,
 *     as one body (see `leanAzimuthFor`)
 *   - green ring about the key's rolled u (y) → the lean off the normal, signed
 *     and clamped to what the geometry allows
 * There is no third ring and no free azimuth. The key's spin about its own axis
 * is not a freedom of its own: the lean plane is welded to one of the key's narrow
 * faces, so rolling moves both together.
 */
export function OrganicCutKeyGizmo({
  models,
  activeModelId,
  activeTransform,
  keyFrame,
  keyTiltRad,
  keyRollRad,
  onKeyAimChange,
  keyOffsetUMm = 0,
  keyOffsetVMm = 0,
  keyPreviewOffset,
  onKeyOffsetChange,
  onDragStateChange,
}: OrganicCutKeyGizmoProps) {
  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId),
    [models, activeModelId],
  );
  const transform = activeTransform ?? activeModel?.transform;

  // The model's inner mesh offset (= −bboxCenter): the same nested offset StlMesh
  // applies, so local key-frame coords map to world correctly.
  const meshLocalOffset = useMemo(() => {
    if (!activeModel) return new THREE.Vector3();
    const geometry = activeModel.geometry.geometry;
    const bbox =
      geometry.boundingBox ??
      new THREE.Box3().setFromBufferAttribute(
        geometry.getAttribute('position') as THREE.BufferAttribute,
      );
    const center = bbox.getCenter(new THREE.Vector3());
    return new THREE.Vector3(-center.x, -center.y, -center.z);
  }, [activeModel]);

  // Stable primitive snapshots so the memo below only recomputes when VALUES change,
  // not when the `transform` object identity churns (it's rebuilt every render). An
  // unstable gizmo position/rotation feeds TransformGizmo's per-frame view-cull
  // setState and can spiral into a render loop.
  const tpx = transform?.position.x ?? 0;
  const tpy = transform?.position.y ?? 0;
  const tpz = transform?.position.z ?? 0;
  const trx = transform?.rotation.x ?? 0;
  const try_ = transform?.rotation.y ?? 0;
  const trz = transform?.rotation.z ?? 0;
  const tsx = transform?.scale.x ?? 1;
  const tsy = transform?.scale.y ?? 1;
  const tsz = transform?.scale.z ?? 1;
  const hasTransform = !!transform;

  const worldKeyGizmo = useMemo(() => {
    if (!keyFrame || !transform) return null;
    // Local frame vectors.
    const anchorL = new THREE.Vector3(...keyFrame.anchor);
    const uL = new THREE.Vector3(...keyFrame.u).normalize();
    const vL = new THREE.Vector3(...keyFrame.v).normalize();
    const axisL = new THREE.Vector3(...keyFrame.axis).normalize();
    // The model's local→world matrix = plate(position,quat,scale) ∘ meshLocalOffset.
    const modelQuat = quaternionFromGlobalEuler(transform.rotation);
    const outer = new THREE.Matrix4().compose(
      new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
      modelQuat,
      new THREE.Vector3(transform.scale.x, transform.scale.y, transform.scale.z),
    );
    const inner = new THREE.Matrix4().makeTranslation(
      meshLocalOffset.x,
      meshLocalOffset.y,
      meshLocalOffset.z,
    );
    const localToWorld = outer.multiply(inner);
    // World anchor.
    const anchorW = anchorL.clone().applyMatrix4(localToWorld);
    // World basis directions (rotation+scale only → transform as directions, then
    // renormalize, so non-uniform plate scale doesn't skew the gizmo orientation).
    const normalMat = new THREE.Matrix3().getNormalMatrix(localToWorld);
    const uW = uL.clone().applyMatrix3(normalMat).normalize();
    const vW = vL.clone().applyMatrix3(normalMat).normalize();
    const axisW = axisL.clone().applyMatrix3(normalMat).normalize();
    // The in-plane basis is ROLLED with the key: the lean plane turns with the roll
    // (that is what the roll ring is FOR), so the lean ring has to turn with it or
    // it would stop showing where the key is about to tip.
    // Turned by −roll for the sign reason in `leanAzimuthFor`: this is the frame
    // the body actually ends up in.
    const cr = Math.cos(keyRollRad);
    const sr = Math.sin(keyRollRad);
    const uR = uW.clone().multiplyScalar(cr).sub(vW.clone().multiplyScalar(sr)).normalize();
    const vR = uW.clone().multiplyScalar(sr).add(vW.clone().multiplyScalar(cr)).normalize();
    // The gizmo's local Y is the key's rolled u — the axis the lean turns about —
    // so the GREEN ring is the lean. Right-handed with z = axis means x = y × z =
    // u × axis = −v.
    const basis = new THREE.Matrix4().makeBasis(vR.clone().negate(), uR, axisW);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    const euler = new THREE.Euler().setFromQuaternion(quat);
    return {
      position: [anchorW.x, anchorW.y, anchorW.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      anchorW,
      axisW,
      // Kept for the base handle's drag: the pointer lands in WORLD space and the
      // offsets are LOCAL millimetres, so the hit has to come back through this.
      worldToLocal: new THREE.Matrix4().copy(localToWorld).invert(),
      uL,
      vL,
      anchorL,
    };
    // Depend on primitive transform values (not the churning object) + keyFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyFrame, keyRollRad, meshLocalOffset, hasTransform, tpx, tpy, tpz, trx, try_, trz, tsx, tsy, tsz]);

  const handleGizmoRotate = useCallback(
    (axis: GizmoAxis, delta: number) => {
      if (axis === 'z') {
        // Roll takes the delta UNFLIPPED: the flip the lean ring needs drove the
        // key the opposite way to the handle the user was dragging on this one.
        //
        // It also accumulates, so spinning the ring a few times used to report
        // absurd angles ("6403.1° roll") for a key that is geometrically at 43°.
        // Wrap every revolution away at the source: the rotation is the same one,
        // and the readout, the Reset-aim check and Rust all see a sane number.
        const roll = wrapAngle(keyRollRad + delta);
        // Rolling turns the key AND the direction it leans, together — that is the
        // whole point of aiming with the roll ring.
        onKeyAimChange(keyTiltRad, leanAzimuthFor(roll), roll);
        return;
      }
      // The green ring turns about the key's own u, tipping it toward its own v —
      // the plane of a narrow face. What it reports IS the lean, signed: past 0 it
      // keeps going to the other side of the normal instead of flipping the
      // azimuth, which is the −90° end of the user's sketch. The azimuth is never
      // touched here; it belongs to the roll.
      // The cap is the part's, not a constant: a key with a wall right next to it
      // stops leaning sooner, and one in open material goes the full 60°.
      const cap = Math.min(keyFrame?.maxTiltRad ?? KEY_MAX_TILT_RAD, KEY_MAX_TILT_RAD);
      const tilt = Math.max(-cap, Math.min(cap, keyTiltRad + delta));
      onKeyAimChange(tilt, leanAzimuthFor(keyRollRad), keyRollRad);
    },
    [onKeyAimChange, keyTiltRad, keyRollRad, keyFrame],
  );

  // --- The base handle: slide the key across the cut face --------------------
  // It lives HERE, not in OrganicCutTool, for the reason in this file's header:
  // the key's anchor sits ON the cut face, buried inside the body, so a handle
  // mounted outside the picking provider loses every click to the model surface
  // in front of it — which then read as "add a waypoint".
  const colors = useOrganicCutColorNumbers();
  const [draggingHandle, setDraggingHandle] = useState(false);
  const handleDragRef = useRef<{ u: number; v: number; startU: number; startV: number } | null>(null);

  /** Pointer ray → (u, v) millimetres on the key's cut-face plane, in LOCAL mm. */
  const planePoint = useCallback(
    (e: ThreeEvent<PointerEvent>): { u: number; v: number } | null => {
      const g = worldKeyGizmo;
      if (!g) return null;
      const denom = e.ray.direction.dot(g.axisW);
      if (Math.abs(denom) < 1e-6) return null; // ray parallel to the cut face
      const t = g.anchorW.clone().sub(e.ray.origin).dot(g.axisW) / denom;
      if (!Number.isFinite(t)) return null;
      // Back to model-local space, where the offsets are measured: a scaled plate
      // would otherwise turn a 1mm drag into 1mm of WORLD, not of model.
      const hitLocal = e.ray.origin
        .clone()
        .add(e.ray.direction.clone().multiplyScalar(t))
        .applyMatrix4(g.worldToLocal);
      const d = hitLocal.sub(g.anchorL);
      return { u: d.dot(g.uL), v: d.dot(g.vL) };
    },
    [worldKeyGizmo],
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || !onKeyOffsetChange) return;
      e.stopPropagation();
      const grab = planePoint(e);
      if (!grab) return;
      try {
        (e.currentTarget as unknown as { setPointerCapture?: (id: number) => void })
          .setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      // Grab-relative, so the key follows the cursor from wherever it was picked
      // up instead of snapping its centre under the pointer.
      handleDragRef.current = { u: grab.u, v: grab.v, startU: keyOffsetUMm, startV: keyOffsetVMm };
      // `grab` is measured from the anchor of the LAST built frame, and startU/V
      // are the live offsets — the difference between them is exactly the pending
      // slide, so the deltas below stay right even mid-rebuild.
      setDraggingHandle(true);
      onDragStateChange?.(true);
      document.body.style.cursor = 'grabbing';
    },
    [planePoint, keyOffsetUMm, keyOffsetVMm, onDragStateChange, onKeyOffsetChange],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const drag = handleDragRef.current;
      if (!drag || !onKeyOffsetChange) return;
      e.stopPropagation();
      const now = planePoint(e);
      if (!now) return;
      onKeyOffsetChange(drag.startU + (now.u - drag.u), drag.startV + (now.v - drag.v));
    },
    [planePoint, onKeyOffsetChange],
  );

  const endHandleDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!handleDragRef.current) return;
      e.stopPropagation();
      try {
        const target = e.currentTarget as unknown as {
          hasPointerCapture?: (id: number) => boolean;
          releasePointerCapture?: (id: number) => void;
        };
        if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture?.(e.pointerId);
      } catch {
        /* best-effort release */
      }
      handleDragRef.current = null;
      setDraggingHandle(false);
      onDragStateChange?.(false);
      document.body.style.cursor = '';
    },
    [onDragStateChange],
  );

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!handleDragRef.current) document.body.style.cursor = 'grab';
  }, []);
  const handlePointerOut = useCallback(() => {
    if (!handleDragRef.current) document.body.style.cursor = '';
  }, []);

  /**
   * Crosshair radius in world units, from the key's own depth so it scales with
   * the key — but small: this marks a point, it must not hide the peg it sits on.
   */
  const handleRadius = useMemo(() => {
    const depth = keyFrame?.depth ?? 2.5;
    return Math.min(0.5, Math.max(0.08, depth * 0.06));
  }, [keyFrame]);

  /** The four ticks of the crosshair, in the cut plane (local XY). */
  const crosshairTicks = useMemo(() => {
    const r = handleRadius;
    const inner = r * 0.45;
    const outer = r * 1.35;
    const pts = [
      inner, 0, 0, outer, 0, 0,
      -inner, 0, 0, -outer, 0, 0,
      0, inner, 0, 0, outer, 0,
      0, -inner, 0, 0, -outer, 0,
    ];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geom;
  }, [handleRadius]);

  const crosshairRing = useMemo(
    () => new THREE.RingGeometry(handleRadius * 0.78, handleRadius, 28),
    [handleRadius],
  );

  /**
   * Report this handle as the NEAREST hit, whatever its real depth.
   *
   * R3F sorts intersections by distance and runs the handlers nearest-first, and
   * the key's anchor sits on the cut face — buried inside the body. The model
   * surface in front therefore won every click and read it as "add a waypoint",
   * both inside and outside the picking provider. Forcing the distance is the
   * pointer-side twin of the `depthTest: false` this overlay already draws with:
   * if the ray passes through the handle, the handle gets it.
   */
  const grabRaycast = useMemo(() => {
    return function raycastAlwaysNearest(
      this: THREE.Mesh,
      raycaster: THREE.Raycaster,
      intersects: THREE.Intersection[],
    ) {
      const own: THREE.Intersection[] = [];
      THREE.Mesh.prototype.raycast.call(this, raycaster, own);
      for (const hit of own) intersects.push({ ...hit, distance: 1e-6 });
    };
  }, []);

  /** The crosshair's world position, carrying the not-yet-rebuilt drag offset. */
  const handlePosition = useMemo((): [number, number, number] | null => {
    const g = worldKeyGizmo;
    if (!g) return null;
    const du = keyOffsetUMm - (keyPreviewOffset?.u ?? keyOffsetUMm);
    const dv = keyOffsetVMm - (keyPreviewOffset?.v ?? keyOffsetVMm);
    if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) return g.position;
    // The offsets are LOCAL mm, so shift in local space and go back out to world.
    const localToWorld = new THREE.Matrix4().copy(g.worldToLocal).invert();
    const p = g.anchorL
      .clone()
      .add(g.uL.clone().multiplyScalar(du))
      .add(g.vL.clone().multiplyScalar(dv))
      .applyMatrix4(localToWorld);
    return [p.x, p.y, p.z];
  }, [worldKeyGizmo, keyOffsetUMm, keyOffsetVMm, keyPreviewOffset]);

  const handleGizmoDragState = useCallback(
    (dragging: boolean) => {
      onDragStateChange?.(dragging);
    },
    [onDragStateChange],
  );

  if (!worldKeyGizmo) return null;

  return (
    <>
    {onKeyOffsetChange && (
      <group position={handlePosition ?? worldKeyGizmo.position} rotation={worldKeyGizmo.rotation}>
        {/* Invisible grab volume. A sphere rather than a disc in the cut plane:
            seen edge-on a disc is a line and there is nothing left to grab. */}
        <mesh
          raycast={grabRaycast}
          renderOrder={1002}
          frustumCulled={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <sphereGeometry args={[handleRadius * 2.6, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {/* Crosshair, lying IN the cut plane so it also shows which plane the key
            slides on. A filled dot hid the peg and read as a sticker on it. */}
        <mesh geometry={crosshairRing} renderOrder={1003} frustumCulled={false}>
          <meshBasicMaterial
            color={colors.keyHandle}
            depthTest={false}
            transparent
            opacity={draggingHandle ? 1 : 0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
        <lineSegments geometry={crosshairTicks} renderOrder={1004} frustumCulled={false}>
          <lineBasicMaterial
            color={colors.keyHandle}
            depthTest={false}
            transparent
            opacity={draggingHandle ? 1 : 0.85}
          />
        </lineSegments>
      </group>
    )}
    <ScreenSpaceGizmo
      position={worldKeyGizmo.position}
      rotation={worldKeyGizmo.rotation}
      followMeshRef={false}
      enableMove={false}
      enableScale={false}
      enableRotate
      showCenter={false}
      showMovePlanes={false}
      rotateAxes={LEAN_AND_ROLL_RINGS}
      onRotate={handleGizmoRotate}
      onDragStateChange={handleGizmoDragState}
    />
    </>
  );
}
