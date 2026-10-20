import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InstancedShaft } from './InstancedShaftGroup';

/**
 * Tapered shafts merged into one geometry, the way curved ones are: an instance
 * cannot narrow, and a mesh apiece would cost what this layer exists to avoid.
 *
 * `triangleRangeEnds` maps a face back to its shaft, as the curved tubes do.
 */
export interface BatchedTaperedShafts {
    geometry: THREE.BufferGeometry;
    triangleRangeEnds: number[];
}

const UP = new THREE.Vector3(0, 1, 0);

/** True when this shaft's two ends differ enough to need its own cone. */
export function isTaperedBatchedShaft(shaft: InstancedShaft): boolean {
    return shaft.diameterEnd != null
        && Math.abs(shaft.diameterEnd - shaft.diameter) > 1e-6;
}

export function buildBatchedTaperedShafts(
    shafts: readonly InstancedShaft[],
    radialSegments: number,
): BatchedTaperedShafts | null {
    if (shafts.length === 0) return null;

    const cones: THREE.BufferGeometry[] = [];
    const triangleRangeEnds: number[] = [];
    let faces = 0;

    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);

    for (const shaft of shafts) {
        start.set(shaft.start.x, shaft.start.y, shaft.start.z);
        end.set(shaft.end.x, shaft.end.y, shaft.end.z);
        direction.subVectors(end, start);
        const length = direction.length();
        // A shaft drawing nothing still owns the empty range at its index.
        if (length >= 0.001) {
            // +Y is aligned to `end` below, so the top radius is the end's.
            const cone = new THREE.CylinderGeometry(
                Math.max(0.0005, (shaft.diameterEnd ?? shaft.diameter) / 2),
                Math.max(0.0005, shaft.diameter / 2),
                length,
                radialSegments,
            );
            midpoint.addVectors(start, end).multiplyScalar(0.5);
            quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
            cone.applyMatrix4(matrix.compose(midpoint, quaternion, scale));
            cones.push(cone);
            faces += (cone.getIndex()?.count ?? 0) / 3;
        }
        triangleRangeEnds.push(faces);
    }

    if (cones.length === 0) return null;

    const geometry = mergeGeometries(cones, false);
    for (const cone of cones) cone.dispose();
    if (!geometry) return null;

    geometry.computeBoundingSphere();
    return { geometry, triangleRangeEnds };
}
