"use client";

import React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  getSavedSpaceMouseSettings,
  subscribeToSpaceMouseSettings,
} from '@/components/settings/spacemousePreferences';
import {
  getNativeSpaceMouseActive,
  nativeSpaceMouseSync,
  requestNativeSpaceMouse,
  type NativeCameraInput,
  type NativeNavOutput,
} from './nativeSpaceMouseBridge';

type OrbitLikeControls = {
  target: THREE.Vector3;
  enabled?: boolean;
  update: () => void;
};

function isOrbitLikeControls(value: unknown): value is OrbitLikeControls {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<OrbitLikeControls>;
  return !!maybe.target && typeof maybe.update === 'function';
}

// Recompute the model bounding box at most this often (frames) — it only feeds
// navlib's speed/zoom scaling, so it doesn't need to be exact every frame.
const MODEL_EXTENTS_REFRESH_FRAMES = 30;

/**
 * Native 3DxWare / navlib SpaceMouse driver (Windows/macOS).
 *
 * Unlike {@link SpaceMouseController} (which reads raw Gamepad axes and computes
 * the camera itself), here the 3Dconnexion driver computes the camera pose and
 * we simply apply it. Each frame we push the current camera to navlib via the
 * Rust bridge and apply the pose it returns while it is navigating.
 *
 * When this controller is live it sets a shared flag so the Gamepad-API
 * controller stands down (both APIs can see the same physical puck). If the
 * driver is absent, `start` resolves to `null`, this controller stays dormant,
 * and the Gamepad path takes over.
 */
export function NativeSpaceMouseController({
  pivotPoint,
  fallbackPivot,
  onNavigationActiveChange,
  onNavigationFrame,
}: {
  pivotPoint?: THREE.Vector3 | null;
  fallbackPivot?: THREE.Vector3 | null;
  onNavigationActiveChange?: (active: boolean) => void;
  onNavigationFrame?: () => void;
}) {
  const { camera, controls, scene } = useThree();

  const settings = React.useSyncExternalStore(
    subscribeToSpaceMouseSettings,
    getSavedSpaceMouseSettings,
    getSavedSpaceMouseSettings,
  );

  // Latest navlib output; the frame loop applies it and issues the next sync.
  const latestOutRef = React.useRef<NativeNavOutput | null>(null);
  const inFlightRef = React.useRef(false);
  const lastAppliedSeqRef = React.useRef(0);
  const lastAppliedExtentsSeqRef = React.useRef(0);
  const prevMotionRef = React.useRef(false);
  const weDisabledOrbitRef = React.useRef(false);

  // Cached model extents + refresh counter.
  const modelBoxRef = React.useRef(new THREE.Box3());
  const modelBoxAgeRef = React.useRef(MODEL_EXTENTS_REFRESH_FRAMES);

  // Scratch objects reused across frames.
  const tmpMatrix = React.useRef(new THREE.Matrix4());
  const tmpScale = React.useRef(new THREE.Vector3());
  const tmpTarget = React.useRef(new THREE.Vector3());

  // ── Request the bridge on/off with the SpaceMouse enabled setting ──
  // The reconciler in the bridge owns the async lifecycle (StrictMode-safe);
  // the shared active flag it sets gates the frame loop below.
  React.useEffect(() => {
    requestNativeSpaceMouse(settings.enabled);
    return () => {
      requestNativeSpaceMouse(false);
      prevMotionRef.current = false;
      weDisabledOrbitRef.current = false;
    };
  }, [settings.enabled]);

  const getTarget = React.useCallback(
    (out: THREE.Vector3): THREE.Vector3 => {
      if (pivotPoint) return out.copy(pivotPoint);
      if (isOrbitLikeControls(controls)) return out.copy(controls.target);
      if (fallbackPivot) return out.copy(fallbackPivot);
      return out.set(0, 0, 0);
    },
    [controls, fallbackPivot, pivotPoint],
  );

  const refreshModelExtents = React.useCallback(() => {
    const box = modelBoxRef.current;
    box.makeEmpty();
    scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry) return;
      if (!object.userData || typeof object.userData.modelId !== 'string') return;
      box.expandByObject(object);
    });
    if (box.isEmpty()) {
      // No model yet — a small box around the target keeps navlib's scaling sane.
      const t = getTarget(tmpTarget.current);
      box.setFromCenterAndSize(t, new THREE.Vector3(20, 20, 20));
    }
  }, [getTarget, scene]);

  const applyAffine = React.useCallback(
    (affine: number[]) => {
      if (affine.length < 16) return;
      const m = tmpMatrix.current.fromArray(affine);
      m.decompose(camera.position, camera.quaternion, tmpScale.current);
      // Preserve roll: take the camera up-vector straight from the matrix rather
      // than re-deriving it via lookAt.
      camera.up.set(affine[4], affine[5], affine[6]).normalize();
      camera.updateMatrixWorld();
    },
    [camera],
  );

  const handBackToOrbit = React.useCallback(() => {
    if (!weDisabledOrbitRef.current) return;
    if (isOrbitLikeControls(controls)) {
      controls.target.copy(getTarget(tmpTarget.current));
      controls.enabled = true;
      controls.update();
    }
    weDisabledOrbitRef.current = false;
  }, [controls, getTarget]);

  // Current orthographic view extents in camera/eye space, matching three's
  // OrthographicCamera projection (frustum scaled by zoom). navlib needs these to
  // scale ortho pan and to drive ortho zoom. `[[-1,-1,-1],[1,1,1]]` in perspective
  // mode, where navlib ignores them.
  const computeOrthoExtents = React.useCallback((): {
    min: [number, number, number];
    max: [number, number, number];
  } => {
    const ortho = camera as THREE.OrthographicCamera;
    if (ortho.isOrthographicCamera !== true) {
      return { min: [-1, -1, -1], max: [1, 1, 1] };
    }
    const zoom = ortho.zoom || 1;
    const dx = (ortho.right - ortho.left) / (2 * zoom);
    const dy = (ortho.top - ortho.bottom) / (2 * zoom);
    const cx = (ortho.right + ortho.left) / 2;
    const cy = (ortho.top + ortho.bottom) / 2;
    return {
      min: [cx - dx, cy - dy, -ortho.far],
      max: [cx + dx, cy + dy, -ortho.near],
    };
  }, [camera]);

  // Apply navlib's ortho extents back as a camera zoom (width ratio vs the base
  // frustum). Pan is handled by the affine; here we only take the zoom.
  const applyOrthoExtents = React.useCallback(
    (min: [number, number, number], max: [number, number, number]) => {
      const ortho = camera as THREE.OrthographicCamera;
      if (ortho.isOrthographicCamera !== true) return;
      const navWidth = max[0] - min[0];
      const baseWidth = ortho.right - ortho.left;
      if (navWidth <= 1e-9 || baseWidth <= 1e-9) return;
      ortho.zoom = THREE.MathUtils.clamp(baseWidth / navWidth, 0.0001, 2000);
      ortho.updateProjectionMatrix();
    },
    [camera],
  );

  const buildCameraInput = React.useCallback((): NativeCameraInput => {
    camera.updateMatrixWorld();
    const target = getTarget(tmpTarget.current);
    const focusDistance = Math.max(0.1, camera.position.distanceTo(target));
    const isPerspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
    const fov = isPerspective
      ? THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)
      : 0.8;

    if (modelBoxAgeRef.current >= MODEL_EXTENTS_REFRESH_FRAMES) {
      refreshModelExtents();
      modelBoxAgeRef.current = 0;
    }
    modelBoxAgeRef.current++;
    const box = modelBoxRef.current;
    const extents = computeOrthoExtents();

    return {
      affine: Array.from(camera.matrixWorld.elements),
      fov,
      focusDistance,
      perspective: isPerspective,
      target: [target.x, target.y, target.z],
      modelMin: [box.min.x, box.min.y, box.min.z],
      modelMax: [box.max.x, box.max.y, box.max.z],
      orthoMin: extents.min,
      orthoMax: extents.max,
    };
  }, [camera, computeOrthoExtents, getTarget, refreshModelExtents]);

  useFrame(() => {
    if (!getNativeSpaceMouseActive() || !settings.enabled) return;
    if (!isOrbitLikeControls(controls)) return;

    // 1. Apply navlib's latest camera (from the previous frame's sync).
    const out = latestOutRef.current;
    if (out) {
      let changed = false;
      if (out.seq !== lastAppliedSeqRef.current) {
        lastAppliedSeqRef.current = out.seq;
        applyAffine(out.affine); // pan + orbit
        changed = true;
      }
      if (out.extentsSeq !== lastAppliedExtentsSeqRef.current) {
        lastAppliedExtentsSeqRef.current = out.extentsSeq;
        applyOrthoExtents(out.orthoMin, out.orthoMax); // ortho zoom
        changed = true;
      }
      if (changed) onNavigationFrame?.();
      // Motion edge: take/release exclusive control of OrbitControls.
      if (out.motion !== prevMotionRef.current) {
        prevMotionRef.current = out.motion;
        if (out.motion) {
          if (!weDisabledOrbitRef.current) {
            controls.enabled = false;
            weDisabledOrbitRef.current = true;
          }
          onNavigationActiveChange?.(true);
        } else {
          handBackToOrbit();
          onNavigationActiveChange?.(false);
        }
      }
    }

    // 2. Push the current camera to navlib for the next frame (one call in
    //    flight at a time — the result is picked up above next frame).
    if (!inFlightRef.current) {
      inFlightRef.current = true;
      const cam = buildCameraInput();
      nativeSpaceMouseSync(cam)
        .then((res) => {
          if (res) latestOutRef.current = res;
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }
  });

  return null;
}
