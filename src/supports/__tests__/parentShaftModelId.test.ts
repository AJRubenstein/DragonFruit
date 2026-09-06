import assert from 'node:assert/strict';
import test from 'node:test';

import { modelIdOfParentShaft } from '../PlacementLogic/SupportModelLinker';
import { SUPPORT_TYPES, type SupportCollectionKey } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Which model a knot's parent shaft belongs to.
 *
 * Two callers resolve this -- the entity counts and the support-bounds walk --
 * and both wrote the same four-collection search by hand, brace prefix
 * included. These hold the shared derivation: every type is reachable, and a
 * declared `segmentSelectionPrefix` is stripped rather than matched by name.
 */

/** A snapshot holding one entity of `typeId` on `modelId`. */
function stateWith(typeId: string, id: string, modelId: string): Pick<SupportState, SupportCollectionKey> {
    const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
    const state = {} as Record<string, Record<string, unknown>>;
    for (const d of SUPPORT_TYPES) state[d.location.key] = {};
    state.roots = {};
    state.knots = {};
    state[descriptor.location.key] = { [id]: { id, modelId } };
    return state as unknown as Pick<SupportState, SupportCollectionKey>;
}

for (const descriptor of SUPPORT_TYPES) {
    test(`a knot on a ${descriptor.id} resolves to that ${descriptor.id}s model`, () => {
        const state = stateWith(descriptor.id, `${descriptor.id}-a`, 'model-a');
        // A type declaring a prefix hangs its knots off `<prefix><id>`.
        const parentShaftId = `${descriptor.segmentSelectionPrefix ?? ''}${descriptor.id}-a`;

        assert.equal(modelIdOfParentShaft(state, parentShaftId), 'model-a');
    });
}

test('a brace knot is found through its declared prefix', () => {
    const brace = SUPPORT_TYPES.find((d) => d.id === 'brace')!;
    assert.equal(brace.segmentSelectionPrefix, 'braceSegment:');

    const state = stateWith('brace', 'brace-a', 'model-b');
    assert.equal(modelIdOfParentShaft(state, 'braceSegment:brace-a'), 'model-b');
    // The bare id also resolves: the prefix is stripped only when present.
    assert.equal(modelIdOfParentShaft(state, 'brace-a'), 'model-b');
});

test('an unknown parent shaft belongs to no model', () => {
    assert.equal(modelIdOfParentShaft(stateWith('trunk', 'trunk-a', 'model-a'), 'nope'), null);
});
