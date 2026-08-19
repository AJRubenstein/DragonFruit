import * as THREE from 'three';
import type { DragonfruitImportFormat } from '../../types';

/**
 * Shared fixture for the support-store tests.
 *
 * Deliberately populates EVERY collection: the recurring defect in this area is a
 * function that walks seven of eight support types and silently skips the eighth,
 * so a fixture missing a type cannot catch its own blind spot.
 *
 * All ids are fixed rather than generated, which keeps the golden-master output
 * byte-stable across runs.
 */

export const MODEL_A = 'model-a';
export const MODEL_B = 'model-b';

function seg(id: string, z: number, diameter = 1) {
    return {
        id,
        type: 'straight' as const,
        diameter,
        bottomJoint: { id: `${id}-bot`, pos: { x: 0, y: 0, z }, diameter: 1 },
        topJoint: { id: `${id}-top`, pos: { x: 0, y: 0, z: z + 5 }, diameter: 1 },
    };
}

function cone(id: string, z: number) {
    return {
        id,
        pos: { x: 0, y: 0, z },
        normal: { x: 0, y: 0, z: 1 },
        surfaceNormal: { x: 0, y: 0, z: 1 },
        profile: {
            type: 'disk' as const,
            contactDiameterMm: 0.4,
            bodyDiameterMm: 1.2,
            lengthMm: 2.5,
            penetrationMm: 0.1,
            diskThicknessMm: 0.1,
            maxStandoffMm: 1.5,
            standoffAngleThreshold: Math.PI / 4,
        },
    };
}

function disk(id: string, z: number) {
    return {
        id,
        pos: { x: 0, y: 0, z },
        surfaceNormal: { x: 0, y: 0, z: 1 },
        coneAxis: { x: 0, y: 0, z: 1 },
        profile: {
            type: 'disk' as const,
            diskThicknessMm: 0.1,
            maxStandoffMm: 1.5,
            standoffAngleThreshold: Math.PI / 4,
        },
        contactDiameterMm: 0.4,
    };
}

/** A model transform at the origin, translated `z` up. */
export function identityTransform(z: number) {
    return {
        position: new THREE.Vector3(0, 0, z),
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
    };
}

/** A payload exercising every support collection, across two models. */
export function buildCharacterisationFixture(): DragonfruitImportFormat {
    return {
        version: 1,
        meta: { source: 'characterisation', objectCenter: { x: 0, y: 0, z: 0 } },
        roots: [
            { id: 'root-a', modelId: MODEL_A, transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }, diameter: 3, diskHeight: 0.5, coneHeight: 1.5 },
            { id: 'root-b', modelId: MODEL_B, transform: { pos: { x: 20, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }, diameter: 3, diskHeight: 0.5, coneHeight: 1.5 },
        ],
        trunks: [
            { id: 'trunk-a', modelId: MODEL_A, rootId: 'root-a', segments: [seg('seg-ta', 2)], contactCone: cone('cone-ta', 12) },
            { id: 'trunk-b', modelId: MODEL_B, rootId: 'root-b', segments: [seg('seg-tb', 2)], contactCone: cone('cone-tb', 12) },
        ],
        branches: [
            { id: 'branch-a', modelId: MODEL_A, parentKnotId: 'knot-a', segments: [seg('seg-ba', 6)], contactCone: cone('cone-ba', 16) },
        ],
        leaves: [
            { id: 'leaf-a', modelId: MODEL_A, parentKnotId: 'knot-a', contactCone: cone('cone-la', 14) },
        ],
        twigs: [
            { id: 'twig-a', modelId: MODEL_A, segments: [seg('seg-wa', 8)], contactDiskA: disk('disk-wa1', 8), contactDiskB: disk('disk-wa2', 13) },
        ],
        sticks: [
            { id: 'stick-a', modelId: MODEL_A, segments: [seg('seg-sa', 9)], contactConeA: cone('cone-sa1', 9), contactConeB: cone('cone-sa2', 14) },
        ],
        braces: [
            { id: 'brace-a', modelId: MODEL_A, startKnotId: 'knot-a', endKnotId: 'knot-b', profile: { diameter: 0.8 } },
        ],
        anchors: [
            {
                id: 'anchor-a',
                modelId: MODEL_A,
                rootPos: { x: 5, y: 0, z: 0 },
                rootBaseDiameter: 2,
                rootTopDiameter: 1,
                rootHeight: 1,
                joint: { id: 'anchor-a-joint', pos: { x: 5, y: 0, z: 1 }, diameter: 1 },
                segments: [seg('seg-aa', 1)],
                contactCone: cone('cone-aa', 7),
            },
        ],
        knots: [
            { id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 4.5 }, diameter: 1.1 },
            { id: 'knot-b', parentShaftId: 'seg-tb', t: 0.5, pos: { x: 20, y: 0, z: 4.5 }, diameter: 1.1 },
        ],
    };
}

