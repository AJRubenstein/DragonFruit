import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSupportSliceTessellation } from '../rasterLayerZipExport';
import { SUPPORT_TYPES } from '@/supports/supportTypeRegistry';
import type { SupportState } from '@/supports/types';

/**
 * How finely a scene's supports are tessellated before slicing.
 *
 * The detail level drops as the scene grows, so the count that drives it has to
 * see every type. It was five hand-written segment loops -- trunk, branch,
 * twig, stick, kickstand -- so a scene of anchors counted as empty and was
 * tessellated at full detail no matter how large.
 */

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

function emptyState(): SupportState {
    const state = { roots: {}, knots: {} } as unknown as SupportState;
    for (const descriptor of SUPPORT_TYPES) {
        (state as unknown as Record<string, unknown>)[descriptor.location.key] = {};
    }
    return state;
}

/** `count` entities of `typeId`, each with one segment. */
function manyOf(typeId: string, count: number): SupportState {
    const state = emptyState();
    const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
    const collection = (state as unknown as Record<string, Record<string, unknown>>)[descriptor.location.key];

    for (let i = 0; i < count; i += 1) {
        collection[`${typeId}-${i}`] = {
            id: `${typeId}-${i}`, modelId: 'm', typeId,
            segments: descriptor.hasSegments ? [seg(`${typeId}-s-${i}`)] : undefined,
        };
    }
    return state;
}

const detailOf = (state: SupportState) => resolveSupportSliceTessellation(state, state as never);

test('an empty scene gets full detail', () => {
    assert.equal(detailOf(emptyState()).shaftRadialSegments, 12);
});

test('every shafted type counts toward the detail threshold', () => {
    // 25k segments is past the 20k coarse threshold on its own, so each type
    // should drop the detail level by itself.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const detail = detailOf(manyOf(descriptor.id, 25_000));
        assert.equal(
            detail.shaftRadialSegments,
            3,
            `25k ${descriptor.id}s did not coarsen the tessellation`,
        );
    }
});

test('a shaftless type counts as one primitive each', () => {
    // Leaf and brace have no segments; they still contribute to the primitive
    // count, which has its own higher threshold.
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.hasSegments) continue;

        const detail = detailOf(manyOf(descriptor.id, 25_000));
        assert.equal(
            detail.shaftRadialSegments,
            3,
            `25k ${descriptor.id}s did not coarsen the tessellation`,
        );
    }
});

test('a small scene of any one type keeps full detail', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(detailOf(manyOf(descriptor.id, 10)).shaftRadialSegments, 12, descriptor.id);
    }
});
