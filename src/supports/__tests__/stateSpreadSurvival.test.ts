import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { addSupportEntity, cloneSupportState, getSnapshot, resetStore, setSnapshot } from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * `{ ...state }` has to keep the eight collections.
 *
 * They are getters over `state.supports`, and roughly 97 sites across the app
 * spread a state object to change one field. A spread that drops them leaves
 * `state.trunks` undefined, which surfaces as `Object.keys(undefined)` deep
 * inside a caller rather than at the spread.
 */

const entity = (typeId: string, id: string) => ({
    id,
    modelId: 'model-a',
    segments: [],
    ...(typeId === 'brace' ? { startKnotId: 'k1', endKnotId: 'k2' } : {}),
});

beforeEach(() => {
    resetStore();
    for (const descriptor of SUPPORT_TYPES) {
        addSupportEntity(descriptor.id, entity(descriptor.id, `${descriptor.id}-1`) as never);
    }
});

test('a spread keeps every collection readable', () => {
    const spread = { ...getSnapshot() } as SupportState;

    for (const descriptor of SUPPORT_TYPES) {
        const collection = spread[descriptor.location.key];
        assert.ok(collection, `${descriptor.location.key} vanished from the spread`);
        assert.equal(Object.keys(collection).length, 1, descriptor.location.key);
    }
});

test('a spread that replaces one collection leaves the others intact', () => {
    // The shape autoPlace uses on its draft.
    const spread = { ...getSnapshot(), knots: {} } as SupportState;

    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            Object.keys(spread[descriptor.location.key] ?? {}).length,
            1,
            `${descriptor.location.key} was lost when knots were replaced`,
        );
    }
});

test('a clone survives being spread repeatedly', () => {
    let draft = cloneSupportState(getSnapshot());
    draft = { ...draft, knots: { ...draft.knots } } as SupportState;
    draft = { ...draft, trunks: { ...draft.trunks }, leaves: { ...draft.leaves } } as SupportState;

    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(Object.keys(draft[descriptor.location.key] ?? {}).length, 1, descriptor.id);
    }
});

test('an explicit collection write wins over what supports still holds', () => {
    const replaced = {
        ...getSnapshot(),
        trunks: { 'trunk-2': { id: 'trunk-2', modelId: 'model-a', segments: [], typeId: 'trunk' } },
    } as unknown as SupportState;
    setSnapshot(replaced);

    const now = getSnapshot();
    assert.deepEqual(Object.keys(now.trunks), ['trunk-2'], 'the written trunks should replace the old');
    assert.deepEqual(Object.keys(now.leaves), ['leaf-1'], 'an untouched type should survive');
});

test('a state carrying only supports still resolves its collections', () => {
    setSnapshot({
        supports: { 'anchor-9': { id: 'anchor-9', modelId: 'model-a', typeId: 'anchor', segments: [] } },
        roots: {}, knots: {},
        selectedId: null, hoveredId: null,
        selectedCategory: null, hoveredCategory: 'none', interactionWarning: null,
    } as unknown as SupportState);

    assert.deepEqual(Object.keys(getSnapshot().anchors), ['anchor-9']);
    assert.deepEqual(Object.keys(getSnapshot().trunks), []);
});
