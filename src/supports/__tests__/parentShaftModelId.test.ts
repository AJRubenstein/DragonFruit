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
 *
 * The fixtures below keyed `parentShaftId` to the ENTITY id, which no knot
 * does: on a real shaft it is a SEGMENT id. Every knot in a 592-entity scene
 * carried a segment id and none an entity id, so the lookup returned null for
 * all of them and the active-model knot count read zero. The segment cases
 * below are the ones that match real data.
 */

/** A snapshot holding one entity of `typeId` on `modelId`. */
function stateWith(
    typeId: string,
    id: string,
    modelId: string,
    segments?: { id: string }[],
): Pick<SupportState, SupportCollectionKey> {
    const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
    const state = {} as Record<string, Record<string, unknown>>;
    for (const d of SUPPORT_TYPES) state[d.location.key] = {};
    state.roots = {};
    state.knots = {};
    state[descriptor.location.key] = { [id]: { id, modelId, segments } };
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

for (const descriptor of SUPPORT_TYPES) {
    if (!descriptor.hasSegments) continue;

    test(`a knot on a ${descriptor.id} SEGMENT resolves to that ${descriptor.id}s model`, () => {
        // What a real knot carries. The entity-id fixtures above never
        // exercised this path, so a lookup that could only match entity ids
        // passed every test and returned null for every actual knot.
        const segmentId = `${descriptor.id}-a-seg`;
        const state = stateWith(descriptor.id, `${descriptor.id}-a`, 'model-a', [{ id: segmentId }]);

        assert.equal(modelIdOfParentShaft(state, segmentId), 'model-a');
    });
}

test('a segment id belonging to no entity resolves to nothing', () => {
    const state = stateWith('trunk', 'trunk-a', 'model-a', [{ id: 'trunk-a-seg' }]);
    assert.equal(modelIdOfParentShaft(state, 'other-seg'), null);
});
