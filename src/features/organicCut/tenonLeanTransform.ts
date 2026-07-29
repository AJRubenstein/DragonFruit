import * as THREE from 'three';
import { TENON_MAX_TILT_RAD, type TenonPreviewFrame } from './types';

/**
 * The live lean/roll of the registration tenon, as a matrix.
 *
 * The tenon SOUP is built STRAIGHT in Rust and the aim is applied here, so dragging
 * the gizmo never costs a Rust round-trip. The price is that this has to match
 * `LeanXform` in `tenon.rs` exactly — every sign in it has a twin over there — which
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
export function tenonLeanMatrix(
  frame: TenonPreviewFrame,
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

  const tilt = clampTenonTilt(tiltRad, frame);
  const roll = rollRad;
  if (Math.abs(tilt) < 1e-6 && Math.abs(roll) < 1e-6) return null;

  // Apply order (matches LeanXform::apply): roll about build +axis, then lean about
  // the in-plane axis k, composed as q = qLean · qRoll.
  const q = new THREE.Quaternion();
  if (Math.abs(roll) >= 1e-6) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(buildAxis, roll));
  }
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
    }
  }

  // A pure rigid rotation about the anchor — nothing else. Rust used to sink the
  // leaned tenon and stretch its trunk (so the cap stayed at a fixed height above
  // the cut face) and this had to mirror both; neither exists now, because leaning
  // a solid does not resize it. See LeanXform.
  const toOrigin = new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z);
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const back = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z);
  return back.multiply(rot).multiply(toOrigin);
}

/**
 * The lean, clamped to what this placement can take: the room the part leaves
 * around the tenon (`maxTiltRad`, measured in Rust), never past the hard ceiling.
 * Keeps its sign — a negative lean tips the other way in the same plane.
 */
export function clampTenonTilt(tiltRad: number, frame: TenonPreviewFrame | null): number {
  const cap = Math.min(frame?.maxTiltRad ?? TENON_MAX_TILT_RAD, TENON_MAX_TILT_RAD);
  return Math.max(-cap, Math.min(cap, tiltRad));
}
