import assert from 'node:assert/strict';
import test from 'node:test';

import { dumpSupportGroup, inspectSupport, collectionOfEntity, ownerOfPickedId } from '../supportInspector';
import { createEmptySupportCollections, SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * What the debug overlay reads about a selected support.
 *
 * Everything comes off the registry -- the collection an entity lives in, the
 * edges out of it, what hangs off it, and what removing it would take. None of
 * it names a type, so a ninth is described by declaring it.
 */

const seg = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 5 }, diameter: 1 },
});

function stateWithOneOfEach(): SupportState {
    const state = createEmptySupportCollections() as unknown as SupportState;
    const record = state as unknown as Record<string, Record<string, unknown>>;

    for (const descriptor of SUPPORT_TYPES) {
        const id = `${descriptor.id}-1`;
        record[descriptor.location.key][id] = {
            id,
            modelId: 'model-a',
            typeId: descriptor.id,
            segments: descriptor.hasSegments ? [seg(`${descriptor.id}-seg`)] : undefined,
        };
    }
    return state;
}

test('every declared type is inspectable and names itself from the registry', () => {
    const state = stateWithOneOfEach();

    for (const descriptor of SUPPORT_TYPES) {
        const inspection = inspectSupport(state, `${descriptor.id}-1`);
        assert.ok(inspection, `${descriptor.id} is inspectable`);
        assert.equal(inspection.typeId, descriptor.id);
        assert.equal(inspection.label, descriptor.singular);
        assert.equal(inspection.collection, descriptor.location.key);
        assert.equal(inspection.modelId, 'model-a');
    }
});

test('a shafted type reports its segments and a shaftless one reports none', () => {
    const state = stateWithOneOfEach();

    for (const descriptor of SUPPORT_TYPES) {
        const inspection = inspectSupport(state, `${descriptor.id}-1`)!;
        assert.equal(
            inspection.segmentCount,
            descriptor.hasSegments ? 1 : 0,
            `${descriptor.id} segment count`,
        );
    }
});

test('the contacts reported are the ones the type declares', () => {
    const state = stateWithOneOfEach();

    for (const descriptor of SUPPORT_TYPES) {
        const inspection = inspectSupport(state, `${descriptor.id}-1`)!;
        const declared = (['lower', 'upper'] as const)
            .map((end) => descriptor[end].field)
            .filter((field): field is string => !!field);

        assert.deepEqual(
            inspection.contacts.map((c) => c.field),
            declared,
            `${descriptor.id} contact fields`,
        );
        // The fixture carries none of them, so every one reads absent -- which
        // is itself the useful signal when a real entity is missing a contact.
        assert.ok(inspection.contacts.every((c) => !c.present));
    }
});

test('a knot on a shaft segment is reported as a dependent of that shaft', () => {
    // What the overlay is for: "what is connected to this". A knot names a
    // segment, so the shaft has to be found through the segments it owns.
    const state = stateWithOneOfEach();
    (state.knots as unknown as Record<string, unknown>)['knot-1'] = {
        id: 'knot-1',
        parentShaftId: 'trunk-seg',
        pos: { x: 0, y: 0, z: 2 },
        diameter: 1,
    };

    const trunk = inspectSupport(state, 'trunk-1')!;
    assert.ok(
        trunk.dependents.some((d) => d.id === 'knot-1'),
        'the knot hangs off the trunk',
    );
});

test('a link pointing at nothing is reported as dangling', () => {
    // The overlay should show a broken reference rather than hiding it.
    const state = stateWithOneOfEach();
    (state.branches as unknown as Record<string, Record<string, unknown>>)['branch-1'].parentKnotId = 'ghost-knot';

    const branch = inspectSupport(state, 'branch-1')!;
    const link = branch.links.find((l) => l.field === 'parentKnotId');
    assert.ok(link, 'the declared edge is reported');
    assert.equal(link.resolved, false);
    assert.ok(branch.danglingLinks.some((l) => l.field === 'parentKnotId'));
});

test('a resolved link is not reported as dangling', () => {
    const state = stateWithOneOfEach();
    (state.knots as unknown as Record<string, unknown>)['knot-1'] = {
        id: 'knot-1',
        parentShaftId: 'trunk-seg',
        pos: { x: 0, y: 0, z: 2 },
        diameter: 1,
    };
    (state.branches as unknown as Record<string, Record<string, unknown>>)['branch-1'].parentKnotId = 'knot-1';

    const branch = inspectSupport(state, 'branch-1')!;
    assert.equal(branch.links.find((l) => l.field === 'parentKnotId')?.resolved, true);
    assert.deepEqual(branch.danglingLinks, []);
});

test('the cascade count is what removing the support would take with it', () => {
    const state = stateWithOneOfEach();
    (state.knots as unknown as Record<string, unknown>)['knot-1'] = {
        id: 'knot-1',
        parentShaftId: 'trunk-seg',
        pos: { x: 0, y: 0, z: 2 },
        diameter: 1,
    };

    const trunk = inspectSupport(state, 'trunk-1')!;
    assert.ok(trunk.cascadeCount >= 1, 'the hosted knot is counted');

    // A support nothing hangs off takes nothing with it.
    const bare = inspectSupport(stateWithOneOfEach(), 'stick-1')!;
    assert.equal(bare.cascadeCount, 0);
});

test('an unknown id inspects to nothing', () => {
    assert.equal(inspectSupport(stateWithOneOfEach(), 'not-a-support'), null);
    assert.equal(collectionOfEntity(stateWithOneOfEach(), 'not-a-support'), null);
});

test('a picked joint resolves to the support that owns it', () => {
    // What the overlay showed before: hovering a joint gave "joint" and an id,
    // and nothing about the support it belongs to.
    const state = stateWithOneOfEach();

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const owner = ownerOfPickedId(state, `${descriptor.id}-seg-tj`);
        assert.ok(owner, `${descriptor.id} top joint resolves`);
        assert.equal(owner.id, `${descriptor.id}-1`);
        assert.equal(owner.via, 'joint');
    }
});

test('a picked segment resolves to the support that owns it', () => {
    const state = stateWithOneOfEach();

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const owner = ownerOfPickedId(state, `${descriptor.id}-seg`);
        assert.ok(owner, `${descriptor.id} segment resolves`);
        assert.equal(owner.id, `${descriptor.id}-1`);
        assert.equal(owner.via, 'segment');
    }
});

test('an entity id resolves to itself', () => {
    const state = stateWithOneOfEach();
    const owner = ownerOfPickedId(state, 'trunk-1');
    assert.deepEqual(owner, { id: 'trunk-1', via: 'entity' });
});

test('an id belonging to nothing resolves to nothing', () => {
    assert.equal(ownerOfPickedId(stateWithOneOfEach(), 'ghost'), null);
});

test('the group dump carries the support and everything connected to it', () => {
    // The button exists so a bug report can paste the whole group, not a
    // summary of it -- so the dump has to hold real entities.
    const state = stateWithOneOfEach();
    (state.knots as unknown as Record<string, unknown>)['knot-1'] = {
        id: 'knot-1',
        parentShaftId: 'trunk-seg',
        pos: { x: 0, y: 0, z: 2 },
        diameter: 1,
    };

    const dump = dumpSupportGroup(state, 'trunk-1');
    assert.ok(dump, 'a dump is produced');

    const parsed = JSON.parse(dump) as {
        root: { id: string; collection: string };
        entityCount: number;
        entities: Record<string, Record<string, { id: string }>>;
        inspection: { typeId: string } | null;
    };

    assert.deepEqual(parsed.root, { id: 'trunk-1', collection: 'trunks' });
    assert.equal(parsed.inspection?.typeId, 'trunk');
    assert.ok(parsed.entities.trunks?.['trunk-1'], 'the trunk itself is included');
    assert.ok(parsed.entities.knots?.['knot-1'], 'the hosted knot comes with it');
    assert.equal(parsed.entityCount, 2);
});

test('the dump holds whole entities, not just their ids', () => {
    const state = stateWithOneOfEach();
    const parsed = JSON.parse(dumpSupportGroup(state, 'trunk-1')!) as {
        entities: Record<string, Record<string, { modelId?: string; segments?: unknown[] }>>;
    };

    const trunk = parsed.entities.trunks['trunk-1'];
    assert.equal(trunk.modelId, 'model-a', 'fields survive the round trip');
    assert.equal(trunk.segments?.length, 1, 'segments survive the round trip');
});

test('dumping something that is not a support produces nothing', () => {
    assert.equal(dumpSupportGroup(stateWithOneOfEach(), 'ghost'), null);
});
