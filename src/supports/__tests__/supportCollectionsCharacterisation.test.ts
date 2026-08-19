import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getSnapshot,
    loadFromImportFormat,
    reassignAllSupportModelIds,
    resetStore,
    transformAllSupportsForSingleModel,
} from '../state';
import { buildCharacterisationFixture, identityTransform, MODEL_B } from './fixtures/supportFixture';

/**
 * CHARACTERISATION TESTS -- these pin down what the store does TODAY.
 *
 * They exist to support refactoring `state.ts`, where several functions walk all
 * eight support collections with near-identical per-type blocks. Collapsing that
 * repetition behind a descriptor is only safe if behaviour is provably unchanged,
 * and "provably" needs a baseline.
 *
 * So these are deliberately assertions about CURRENT behaviour, not about what
 * the behaviour ought to be. If one fails after a refactor, the refactor changed
 * something -- which is exactly the signal wanted. If a test here encodes a bug,
 * that is fine: fix the bug and update the test as a separate, visible change.
 *
 * The fixture covers every collection, because the recurring defect in this area
 * is a function that walks seven of eight types and silently skips the eighth.
 */

/** Every top-level entity id in the store, grouped by collection. */
function collectionIds() {
    const s = getSnapshot();
    return {
        roots: Object.keys(s.roots).sort(),
        trunks: Object.keys(s.trunks).sort(),
        branches: Object.keys(s.branches).sort(),
        leaves: Object.keys(s.leaves).sort(),
        twigs: Object.keys(s.twigs).sort(),
        sticks: Object.keys(s.sticks).sort(),
        braces: Object.keys(s.braces).sort(),
        anchors: Object.keys(s.anchors).sort(),
    };
}

/** modelId of every top-level entity, keyed by `collection:id`. */
function modelIdsByEntity(): Record<string, string | undefined> {
    const s = getSnapshot();
    const out: Record<string, string | undefined> = {};
    for (const [key, record] of Object.entries({
        roots: s.roots, trunks: s.trunks, branches: s.branches, leaves: s.leaves,
        twigs: s.twigs, sticks: s.sticks, braces: s.braces, anchors: s.anchors,
    })) {
        for (const [id, entity] of Object.entries(record as Record<string, { modelId?: string }>)) {
            out[`${key}:${id}`] = entity.modelId;
        }
    }
    return out;
}

test('fixture loads every support collection', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    // Guards the fixture itself: a refactor is only meaningfully covered if every
    // collection actually has an entity in it.
    const ids = collectionIds();
    for (const [collection, list] of Object.entries(ids)) {
        assert.ok(list.length > 0, `fixture has no ${collection}`);
    }
    assert.deepEqual(ids.trunks, ['trunk-a', 'trunk-b']);
    assert.deepEqual(ids.sticks, ['stick-a']);
    assert.deepEqual(ids.anchors, ['anchor-a']);
});

test('reassignAllSupportModelIds stamps every collection', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    const before = modelIdsByEntity();
    assert.ok(Object.values(before).some((m) => m === MODEL_B), 'fixture should start with two models');

    const changed = reassignAllSupportModelIds('model-target');
    assert.equal(changed, true);

    const after = modelIdsByEntity();
    // The characterised behaviour: EVERY top-level entity ends up on the target
    // model, in every collection. A refactor that misses a collection fails here.
    for (const [key, modelId] of Object.entries(after)) {
        assert.equal(modelId, 'model-target', `${key} was not reassigned`);
    }
    assert.equal(Object.keys(after).length, Object.keys(before).length, 'entity count changed');
});

test('reassignAllSupportModelIds reports no change when ids already match', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    reassignAllSupportModelIds('model-target');
    // Second call is a no-op: the `changed` flag guards the copy-on-write, so this
    // pins the short-circuit as well as the stamping.
    assert.equal(reassignAllSupportModelIds('model-target'), false);
});

test('reassignAllSupportModelIds preserves non-modelId fields', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    const trunkBefore = getSnapshot().trunks['trunk-a'];
    const segIdsBefore = trunkBefore.segments.map((s) => s.id);
    const coneIdBefore = trunkBefore.contactCone?.id;

    reassignAllSupportModelIds('model-target');

    const trunkAfter = getSnapshot().trunks['trunk-a'];
    assert.deepEqual(trunkAfter.segments.map((s) => s.id), segIdsBefore);
    assert.equal(trunkAfter.contactCone?.id, coneIdBefore);
    assert.equal(trunkAfter.rootId, trunkBefore.rootId);
});

test('transformAllSupports moves geometry in every collection', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    const before = getSnapshot();
    const trunkZBefore = before.trunks['trunk-a'].segments[0].topJoint!.pos.z;
    const twigDiskZBefore = before.twigs['twig-a'].contactDiskA.pos.z;
    const stickConeZBefore = before.sticks['stick-a'].contactConeA.pos.z;
    const anchorConeZBefore = before.anchors['anchor-a'].contactCone.pos.z;
    const leafConeZBefore = before.leaves['leaf-a'].contactCone.pos.z;
    const rootZBefore = before.roots['root-a'].transform.pos.z;

    const dz = 10;
    transformAllSupportsForSingleModel(identityTransform(0), identityTransform(dz));

    const after = getSnapshot();
    // Each collection must actually move. A refactor that drops a collection from
    // the walk leaves that type behind -- the exact bug this guards.
    assert.equal(after.trunks['trunk-a'].segments[0].topJoint!.pos.z, trunkZBefore + dz, 'trunk segment');
    assert.equal(after.twigs['twig-a'].contactDiskA.pos.z, twigDiskZBefore + dz, 'twig disk');
    assert.equal(after.sticks['stick-a'].contactConeA.pos.z, stickConeZBefore + dz, 'stick cone');
    assert.equal(after.anchors['anchor-a'].contactCone.pos.z, anchorConeZBefore + dz, 'anchor cone');
    assert.equal(after.leaves['leaf-a'].contactCone.pos.z, leafConeZBefore + dz, 'leaf cone');

    // Roots are the deliberate exception: on a pure Z translation `preserveRootZ`
    // keeps them pinned to the plate while the rest of the support moves, so the
    // shaft stretches rather than the whole assembly lifting off the bed. Their
    // XY still follows. Characterised here so a refactor cannot quietly drop it.
    assert.equal(after.roots['root-a'].transform.pos.z, rootZBefore, 'root Z pinned to plate');
});

test('transformAllSupports moves knots with their shafts', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());

    const knotZBefore = getSnapshot().knots['knot-a'].pos.z;

    const dz = 7;
    transformAllSupportsForSingleModel(identityTransform(0), identityTransform(dz));

    assert.equal(getSnapshot().knots['knot-a'].pos.z, knotZBefore + dz);
});
