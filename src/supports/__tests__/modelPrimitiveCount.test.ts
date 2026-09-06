import assert from 'node:assert/strict';
import test from 'node:test';

import { getSupportsForModel } from '../PlacementLogic/SupportModelLinker';
import { MODEL_ID_COLLECTION_KEYS, type SupportCollectionKey } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * How many support primitives a model carries.
 *
 * The count is the sum over every modelId-bearing collection. Written out by
 * hand it listed seven of the nine: anchors were missing, and kickstands were
 * counted from a separate store rather than the walk. These hold the sum
 * against the registry, so a type cannot go uncounted.
 */

/** One entity of each modelId-bearing collection, all on the same model. */
function stateWithOnePerCollection(modelId: string): Pick<SupportState, SupportCollectionKey> {
    const state = {} as Record<string, Record<string, { id: string; modelId: string }>>;
    for (const key of MODEL_ID_COLLECTION_KEYS) {
        state[key] = { [`${key}-1`]: { id: `${key}-1`, modelId } };
    }
    return state as unknown as Pick<SupportState, SupportCollectionKey>;
}

const sumOf = (ids: Record<string, string[]>) =>
    MODEL_ID_COLLECTION_KEYS.reduce((total, key) => total + ids[key].length, 0);

test('every modelId-bearing collection is counted', () => {
    const ids = getSupportsForModel(stateWithOnePerCollection('model-a'), 'model-a');
    assert.equal(sumOf(ids), MODEL_ID_COLLECTION_KEYS.length);
});

test('anchors and kickstands are among the counted collections', () => {
    // Both were absent from the hand-written sum: anchors entirely, kickstands
    // because they were taken from a separate store instead.
    assert.ok(MODEL_ID_COLLECTION_KEYS.includes('anchors' as SupportCollectionKey));
    assert.ok(MODEL_ID_COLLECTION_KEYS.includes('kickstands' as SupportCollectionKey));

    const ids = getSupportsForModel(stateWithOnePerCollection('model-a'), 'model-a');
    assert.equal(ids.anchors.length, 1, 'an anchor on the model must be counted');
    assert.equal(ids.kickstands.length, 1, 'a kickstand on the model must be counted once');
});

test('another models entities are not counted', () => {
    const ids = getSupportsForModel(stateWithOnePerCollection('model-a'), 'model-b');
    assert.equal(sumOf(ids), 0);
});
