import * as THREE from 'three';
import type { InstancedShaft } from './InstancedShaftGroup';

/**
 * Tapered shafts merged into one geometry, the way curved ones are.
 *
 * An instance is one cylinder scaled by a matrix, so a shaft whose ends differ
 * cannot ride the batch. Drawing each as its own mesh would hand the renderer
 * back the per-object cost this layer exists to avoid, so they are baked into a
 * single buffer instead: one mesh, one material, however many shafts.
 *
 * `triangleRangeEnds` maps a raycast's face back to the shaft that owns it,
 * through the same resolver the curved tubes use.
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

    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const triangleRangeEnds: number[] = [];

    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (const shaft of shafts) {
        start.set(shaft.start.x, shaft.start.y, shaft.start.z);
        end.set(shaft.end.x, shaft.end.y, shaft.end.z);
        direction.subVectors(end, start);
        const length = direction.length();
        if (length < 0.001) {
            // Keep the range aligned with the list: a shaft drawing nothing
            // still owns the (empty) face range at its index.
            triangleRangeEnds.push(indices.length / 3);
            continue;
        }
        direction.divideScalar(length);
        midpoint.addVectors(start, end).multiplyScalar(0.5);
        quaternion.setFromUnitVectors(UP, direction);
        matrix.compose(midpoint, quaternion, new THREE.Vector3(1, 1, 1));
        normalMatrix.getNormalMatrix(matrix);

        // +Y was aligned to `end`, so the top radius is the end's.
        const cone = new THREE.CylinderGeometry(
            Math.max(0.0005, (shaft.diameterEnd ?? shaft.diameter) / 2),
            Math.max(0.0005, shaft.diameter / 2),
            length,
            radialSegments,
        );

        const vertexBase = positions.length / 3;
        const pos = cone.getAttribute('position') as THREE.BufferAttribute;
        const nor = cone.getAttribute('normal') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i += 1) {
            vertex.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matrix);
            normal.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(normalMatrix).normalize();
            positions.push(vertex.x, vertex.y, vertex.z);
            normals.push(normal.x, normal.y, normal.z);
        }
        const idx = cone.getIndex()!;
        for (let i = 0; i < idx.count; i += 1) {
            indices.push(vertexBase + idx.getX(i));
        }
        cone.dispose();

        triangleRangeEnds.push(indices.length / 3);
    }

    if (indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    return { geometry, triangleRangeEnds };
}
