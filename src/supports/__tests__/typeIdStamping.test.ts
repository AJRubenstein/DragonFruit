import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
    addSupportEntity,
    getSnapshot,
    getSupports,
    resetStore,
    setSnapshot,
    updateAnchor,
    updateBrace,
    updateBranch,
    updateKickstand,
    updateLeaf,
    updateStick,
    updateTrunk,
    updateTwig,
} from '../state';
import { draftAddAnchor, draftAddLeaf, draftAddTrunk } from '../autoSupport/supportDraft';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * `typeId` must be on every entity, always.
 *
 * Collection membership is the type discriminator today and `typeId` merely
 * agrees with it, so a gap here is currently invisible: `getSupportTypeOf`
 * falls back to scanning the collections. Once storage collapses to one map
 * the field becomes the ONLY discriminator, and an entity that loses its stamp
 * does not degrade -- it vanishes from its collection.
 *
 * These pin the stamp at each way an entity can enter or change in the store,
 * so the flip cannot silently drop one.
 */

const entityFor = (typeId: string, id: string) => ({
    id,
    modelId: 'model-1',
    segments: [],
    ...(typeId === 'brace' ? { startKnotId: 'k1', endKnotId: 'k2' } : {}),
});

beforeEach(() => {
    resetStore();
});

test('every added entity carries the typeId of its collection', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const id = `${descriptor.id}-added`;
        addSupportEntity(descriptor.id, entityFor(descriptor.id, id) as never);

        const collection = getSnapshot()[descriptor.location.key] as unknown as Record<string, { typeId?: string }>;
        assert.equal(
            collection[id]?.typeId,
            descriptor.id,
            `${descriptor.id} was added without a typeId stamp`,
        );
    }
});

/** The public updater for each type, which is what production calls. */
const UPDATERS: Record<string, (entity: never) => void> = {
    trunk: updateTrunk as (e: never) => void,
    branch: updateBranch as (e: never) => void,
    leaf: updateLeaf as (e: never) => void,
    twig: updateTwig as (e: never) => void,
    stick: updateStick as (e: never) => void,
    brace: updateBrace as (e: never) => void,
    anchor: updateAnchor as (e: never) => void,
    kickstand: updateKickstand as (e: never) => void,
};

test('an update preserves the stamp', () => {
    // The realistic way a stamp goes missing: an updater takes a whole entity
    // built by a caller that does not know about the field, and writes it over
    // the stored one. Every updater takes exactly that shape.
    for (const descriptor of SUPPORT_TYPES) {
        const id = `${descriptor.id}-updated`;
        addSupportEntity(descriptor.id, entityFor(descriptor.id, id) as never);

        // Deliberately UNSTAMPED, as an outside caller would build it.
        UPDATERS[descriptor.id]({ ...entityFor(descriptor.id, id), modelId: 'model-2' } as never);

        const collection = getSnapshot()[descriptor.location.key] as unknown as Record<string, { typeId?: string; modelId?: string }>;
        assert.equal(collection[id]?.modelId, 'model-2', `${descriptor.id} update did not apply`);
        assert.equal(collection[id]?.typeId, descriptor.id, `${descriptor.id} lost its typeId on update`);
    }
});

test('the merged view agrees with collection membership for every entity', () => {
    // The invariant the flip inverts. While collections are stored this is a
    // redundancy check; afterwards it is the definition, so it has to hold in
    // both directions before the storage changes.
    for (const descriptor of SUPPORT_TYPES) {
        addSupportEntity(descriptor.id, entityFor(descriptor.id, `${descriptor.id}-merged`) as never);
    }

    const supports = getSupports();
    const state = getSnapshot();

    for (const descriptor of SUPPORT_TYPES) {
        const collection = state[descriptor.location.key] as unknown as Record<string, { typeId?: string }>;

        for (const id of Object.keys(collection)) {
            assert.ok(supports[id], `${id} is in ${descriptor.location.key} but not in the merged view`);
            assert.equal(
                (supports[id] as { typeId?: string }).typeId,
                descriptor.id,
                `${id} is stored in ${descriptor.location.key} but stamped differently`,
            );
        }
    }

    // And nothing in the merged view is absent from the collection its stamp names.
    for (const [id, entity] of Object.entries(supports)) {
        const typeId = (entity as { typeId?: string }).typeId;
        assert.ok(typeId, `${id} is in the merged view with no typeId`);

        const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
        const collection = state[descriptor.location.key] as unknown as Record<string, unknown>;
        assert.ok(collection[id], `${id} is stamped ${typeId} but is not in ${descriptor.location.key}`);
    }
});

test('the auto-support draft adders stamp what they add', () => {
    // The auto pipeline builds a LOCAL draft and commits it with one
    // `setSnapshot`, bypassing `addSupportEntity` deliberately -- no notify, no
    // settings cache. It also bypasses the stamp, and `setSnapshot` has no
    // stamping pass of its own, so every entity an auto run produces reaches
    // the store unstamped. Invisible today because collection membership still
    // answers the question; fatal once the collections are derived from it.
    const draft = getSnapshot() as SupportState;

    const withTrunk = draftAddTrunk(draft, { id: 'auto-trunk', modelId: 'm', segments: [] } as never);
    const withLeaf = draftAddLeaf(withTrunk, { id: 'auto-leaf', modelId: 'm' } as never);
    const withAnchor = draftAddAnchor(withLeaf, { id: 'auto-anchor', modelId: 'm', segments: [] } as never);

    assert.equal((withAnchor.trunks['auto-trunk'] as { typeId?: string }).typeId, 'trunk');
    assert.equal((withAnchor.leaves['auto-leaf'] as { typeId?: string }).typeId, 'leaf');
    assert.equal((withAnchor.anchors['auto-anchor'] as { typeId?: string }).typeId, 'anchor');
});

test('a snapshot restored wholesale keeps every stamp', () => {
    // `setSnapshot` assigns an arbitrary state object with no stamping pass of
    // its own -- undo/redo and the auto-support panel both go through it.
    for (const descriptor of SUPPORT_TYPES) {
        addSupportEntity(descriptor.id, entityFor(descriptor.id, `${descriptor.id}-snap`) as never);
    }

    const saved = getSnapshot();
    resetStore();
    setSnapshot(saved as SupportState);

    for (const descriptor of SUPPORT_TYPES) {
        const collection = getSnapshot()[descriptor.location.key] as unknown as Record<string, { typeId?: string }>;
        const entity = collection[`${descriptor.id}-snap`];
        assert.ok(entity, `${descriptor.id} did not survive setSnapshot`);
        assert.equal(entity.typeId, descriptor.id, `${descriptor.id} lost its typeId through setSnapshot`);
    }
});
