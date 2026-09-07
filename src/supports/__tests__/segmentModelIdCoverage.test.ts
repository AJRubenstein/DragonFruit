import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSupportRenderLookup } from '../interaction/supportRenderLookupMath';
import {
    createEmptySupportCollections,
    SHAFTED_COLLECTION_KEYS,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Every shafted type's segments resolve back to the model they hang off.
 *
 * `modelId` decides two things: whether a support is hidden with its model,
 * and which model's drop offset its batched geometry takes. A segment missing
 * from this map resolves to `undefined`, so anything riding it batches as
 * unassigned and skips the drop.
 *
 * The renderer listed five types by hand -- trunk, branch, twig, stick,
 * kickstand -- and omitted anchor, which declares `hasSegments` like the rest.
 * No anchor carries segments today (its builder always writes `[]`, confirmed
 * against a 592-entity scene), so the omission was latent rather than live.
 * These hold the set to what the registry declares, so it stays that way if an
 * anchor ever gains a shaft, and a ninth type is covered by declaring it.
 */

const seg = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 5 }, diameter: 1 },
});

test('anchor is one of the shafted collections', () => {
    // The omission this pins: anchor declares a shaft, so it belongs to the
    // derived set the hand-written loop left out -- whether or not one is
    // populated today.
    const anchor = SUPPORT_TYPES.find((d) => d.id === 'anchor');
    assert.ok(anchor, 'anchor is declared');
    assert.equal(anchor.hasSegments, true, 'anchor has a shaft');
    assert.ok(
        SHAFTED_COLLECTION_KEYS.includes(anchor.location.key as never),
        'anchor is in the shafted set',
    );
});

test('every shafted type maps its segments to its model', () => {
    const state = createEmptySupportCollections() as unknown as SupportState;
    const expected = new Map<string, string>();

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const id = `${descriptor.id}-1`;
        const modelId = `model-${descriptor.id}`;
        const segmentId = `${descriptor.id}-seg`;
        expected.set(segmentId, modelId);

        (state as unknown as Record<string, Record<string, unknown>>)[descriptor.location.key][id] = {
            id,
            modelId,
            typeId: descriptor.id,
            segments: [seg(segmentId)],
        };
    }

    const snapshot = computeSupportRenderLookup({ state, activePreviewSupport: null });

    for (const [segmentId, modelId] of expected) {
        assert.equal(
            snapshot.entitySegmentModelIdById[segmentId],
            modelId,
            `${segmentId} resolves to the model it hangs off`,
        );
    }
});

test('the shafted set is derived, not a hand-written list', () => {
    // Comparing against `hasSegments` rather than a literal list is the whole
    // point: a type that gains a shaft joins both sides at once.
    const declared = SUPPORT_TYPES
        .filter((d) => d.hasSegments)
        .map((d) => d.location.key)
        .sort();

    assert.deepEqual([...SHAFTED_COLLECTION_KEYS].sort(), declared);
    assert.ok(declared.length >= 6, 'six types carry a shaft today');
});

test('the batching flags match the shafts a type actually has', () => {
    // Both flags were extracted from hand-written lists, so they must agree
    // with the structure they describe rather than with those lists.
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.batchesShaftJoints || descriptor.batchesPlainShafts) {
            assert.equal(
                descriptor.hasSegments,
                true,
                `${descriptor.id}: batches shafts, so it must declare one`,
            );
        }
    }

    // Brace has no shaft of its own and anchor builds none, so neither joins
    // the plain batcher; every other shafted type does.
    const plain = SUPPORT_TYPES.filter((d) => d.batchesPlainShafts).map((d) => d.id).sort();
    assert.deepEqual(plain, ['branch', 'kickstand', 'stick', 'trunk', 'twig']);

    const joints = SUPPORT_TYPES.filter((d) => d.batchesShaftJoints).map((d) => d.id).sort();
    assert.deepEqual(joints, ['branch', 'kickstand', 'stick', 'trunk', 'twig']);
});

test('a type owning a root or hosted by a knot declares the edge', () => {
    // The shaft builder reads its hosts off `ownsRoot` and the `hostedBy` knot
    // edge instead of a per-type closure; these are the declarations it walks.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.batchesPlainShafts) continue;

        if (descriptor.ownsRoot) {
            assert.ok(
                descriptor.edges.some((e) => e.to === 'roots' && e.ownership === 'owns'),
                `${descriptor.id}: owns a root, so it declares the edge`,
            );
        }

        if (descriptor.lower.kind === 'knot') {
            assert.ok(
                descriptor.edges.some((e) => e.to === 'knots' && e.ownership === 'hostedBy'),
                `${descriptor.id}: hangs from a knot, so it declares the edge`,
            );
        }
    }
});
