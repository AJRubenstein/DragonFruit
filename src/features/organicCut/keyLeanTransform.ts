import * as THREE from 'three';
import { KEY_MAX_TILT_RAD, type KeyPreviewFrame } from './types';

/**
 * The live lean/roll of the registration key, as a matrix.
 *
 * The key SOUP is built STRAIGHT in Rust and the aim is applied here, so dragging
 * the gizmo never costs a Rust round-trip. The price is that this has to match
 * `LeanXform` in `key.rs` exactly — every sign in it has a twin over there — which
 * is why it lives in its own module with its own tests instead of inside a
 * component: the mismatches are invisible on screen until they are gross, and the
 * only ones we ever shipped were sign errors.
 *
 * CRITICAL: the soup is built in the Rust BUILD frame
 * (`frame_extruding_toward_part_b`) — the reported natural frame with the axis
 * NEGATED and u/v SWAPPED. Leaning in the natural frame instead would MIRROR the
 * result, because that swap flips handedness.
 *
 * Returns null when there is nothing to apply (no lean, no roll).
 */
export function keyLeanMatrix(
  frame: KeyPreviewFrame,
  tiltRad: number,
  azimuthRad: number,
  rollRad: number,
): THREE.Matrix4 | null {
  const anchor = new THREE.Vector3(...frame.anchor);
  // Natural ("orig") frame as reported.
  const axisN = new THREE.Vector3(...frame.axis).normalize();
  const uN = new THREE.Vector3(...frame.u).normalize();
  const vN = new THREE.Vector3(...frame.v).normalize();
  // Build frame = frame_extruding_toward_part_b(natural): negate axis, swap u/v.
  const buildAxis = axisN.clone().multiplyScalar(-1);
  const buildU = vN.clone();
  const buildV = uN.clone();

  const tilt = clampKeyTilt(tiltRad, frame);
  const roll = rollRad;
  if (Math.abs(tilt) < 1e-6 && Math.abs(roll) < 1e-6) return null;

  // Apply order (matches LeanXform::apply): roll about build +axis, then lean about
  // the in-plane axis k, composed as q = qLean · qRoll.
  const q = new THREE.Quaternion();
  if (Math.abs(roll) >= 1e-6) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(buildAxis, roll));
  }
  let sink = 0;
  let lateral: THREE.Vector3 | null = null;
  if (Math.abs(tilt) >= 1e-6) {
    // leanWorld = cos(az)·uN + sin(az)·vN (in the ORIGINAL/natural tangent plane).
    const leanWorld = uN
      .clone()
      .multiplyScalar(Math.cos(azimuthRad))
      .add(vN.clone().multiplyScalar(Math.sin(azimuthRad)));
    // Project onto the BUILD basis: lu = leanWorld·buildU, lv = leanWorld·buildV.
    const lu = leanWorld.dot(buildU);
    const lv = leanWorld.dot(buildV);
    const len = Math.hypot(lu, lv);
    if (len > 1e-9) {
      // k (build-local) = (−lv, lu, 0)/len → world vector via the build basis.
      const k = buildU
        .clone()
        .multiplyScalar(-lv / len)
        .add(buildV.clone().multiplyScalar(lu / len))
        .normalize();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(k, tilt));
      // Sink so the tilted base stays buried — the same half_diag·sin(tilt) Rust
      // uses, with the real footprint it reports.
      sink = (frame.halfDiagMm ?? frame.depth * 0.9) * Math.sin(Math.abs(tilt));
      // Slide back in-plane so the axis still passes through the anchor, matching
      // LeanXform's shift. This matrix pivots ON the anchor (not on Rust's sunk
      // build origin), so here it is the sink alone that walks the key sideways.
      lateral = leanWorld
        .clone()
        .multiplyScalar((-sink * Math.tan(tilt)) / len)
        .projectOnPlane(buildAxis);
    }
  }

  // The soup was built STRAIGHT, so it is built to the un-leaned depth. Rust
  // lengthens the trunk when it leans (LeanXform::stretch_depth) so the key keeps
  // standing its full depth proud; stretch by the same factor along the build axis
  // or the previewed key comes out shorter than the one that cuts.
  const depth = Math.max(frame.depth, 1e-4);
  const stretch =
    Math.abs(tilt) < 1e-6
      ? 1
      : (depth + sink) / (depth * Math.max(Math.cos(Math.abs(tilt)), 0.2));

  // Compose about the anchor: to origin, stretch along the axis, rotate, sink +
  // slide, back. m = back · move · rot · stretch · toOrigin.
  const toOrigin = new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z);
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
  // Scale along ONE direction: I + (f−1)·(a ⊗ a), with a the unit build axis.
  const g = stretch - 1;
  const { x: ax, y: ay, z: az } = buildAxis;
  const stretchM = new THREE.Matrix4().set(
    1 + g * ax * ax, g * ax * ay, g * ax * az, 0,
    g * ay * ax, 1 + g * ay * ay, g * ay * az, 0,
    g * az * ax, g * az * ay, 1 + g * az * az, 0,
    0, 0, 0, 1,
  );
  const move = buildAxis.clone().multiplyScalar(-sink);
  if (lateral) move.add(lateral);
  const moveM = new THREE.Matrix4().makeTranslation(move.x, move.y, move.z);
  const back = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z);
  return back.multiply(moveM).multiply(rot).multiply(stretchM).multiply(toOrigin);
}

/**
 * The lean, clamped to what this placement can take: the room the part leaves
 * around the key (`maxTiltRad`, measured in Rust), never past the hard ceiling.
 * Keeps its sign — a negative lean tips the other way in the same plane.
 */
export function clampKeyTilt(tiltRad: number, frame: KeyPreviewFrame | null): number {
  const cap = Math.min(frame?.maxTiltRad ?? KEY_MAX_TILT_RAD, KEY_MAX_TILT_RAD);
  return Math.max(-cap, Math.min(cap, tiltRad));
}
