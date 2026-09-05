import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addKnot,
    addRoot,
    addSupportEntity,
    getSnapshot,
    getSupports,
    removeSupportEntity,
    resetStore,
} from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Every support by id, across the eight collections.
 *
 * The merged view the collections are heading towards. It is derived rather
 * than stored, so the property that matters is that it cannot disagree with
 * them -- and that ids do not collide, which holds because they are UUIDs.
 *
 * If a collision were ever possible this view would silently drop entities,
 * so it is asserted here rather than assumed.
 */

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const root = (id: string, x: number) => ({
    id, modelId: 'model-a',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

const cone = () => ({
    pos: { x: 0, y: 0, z: 4 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

const disk = (x: number) => ({
    id: `disk-${x}`, pos: { x, y: 0, z: 4 },
    surfaceNormal: { x: 0, y: 0, z: 1 }, coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.4,
    profile: { type: 'disk', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

const SEED: Record<string, (id: string) => Record<string, unknown>> = {
    trunk: (id) => ({ id, modelId: 'model-a', rootId: 'root-a', segments: [seg(`${id}-s`)], contactCone: cone() }),
    branch: (id) => ({ id, modelId: 'model-a', parentKnotId: 'knot-a', segments: [seg(`${id}-s`)], contactCone: cone() }),
    leaf: (id) => ({ id, modelId: 'model-a', parentKnotId: 'knot-a', contactCone: cone() }),
    twig: (id) => ({ id, modelId: 'model-a', segments: [seg(`${id}-s`)], contactDiskA: disk(1), contactDiskB: disk(2) }),
    stick: (id) => ({ id, modelId: 'model-a', segments: [seg(`${id}-s`)], contactConeA: cone(), contactConeB: cone() }),
    brace: (id) => ({ id, modelId: 'model-a', startKnotId: 'knot-a', endKnotId: 'knot-b' }),
    anchor: (id) => ({ id, modelId: 'model-a', segments: [seg(`${id}-s`)], contactCone: cone() }),
    kickstand: (id) => ({
        id, modelId: 'model-a', rootId: 'ks-root', hostKnotId: 'knot-b',
        hostSegmentId: 'trunk-a-s', hostMinT: 0.2, segments: [seg(`${id}-s`)],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 0.8 },
    }),
};

function oneOfEach() {
    resetStore();
    addRoot(root('root-a', 0) as never);
    addRoot(root('ks-root', 3) as never);
    addKnot({ id: 'knot-a', parentShaftId: 'trunk-a-s', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);
    addKnot({ id: 'knot-b', parentShaftId: 'trunk-a-s', t: 0.3, pos: { x: 0, y: 0, z: 1.2 }, diameter: 1 } as never);
    for (const descriptor of SUPPORT_TYPES) {
        addSupportEntity(descriptor.id, SEED[descriptor.id](`${descriptor.id}-a`) as never);
    }
}

/** Every id the eight collections hold, with duplicates kept. */
function allIdsWithDuplicates(): string[] {
    const state = getSnapshot();
    return SUPPORT_TYPES.flatMap((descriptor) =>
        Object.keys(state[descriptor.location.key] ?? {}));
}

test('the merged view holds every entity from every collection', () => {
    oneOfEach();
    const ids = allIdsWithDuplicates();
    const supports = getSupports();

    assert.equal(Object.keys(supports).length, ids.length);
    for (const id of ids) assert.ok(supports[id], `${id} missing from the merged view`);
});

test('no id appears in two collections', () => {
    // The whole view depends on this: a collision would silently drop one of
    // the two. Ids are UUIDs, so it holds by construction -- asserted because
    // the merge is what makes it load-bearing.
    oneOfEach();
    const ids = allIdsWithDuplicates();
    assert.equal(new Set(ids).size, ids.length, 'an id is in more than one collection');
});

test('each entity carries the type its collection implies', () => {
    oneOfEach();
    const supports = getSupports();

    for (const descriptor of SUPPORT_TYPES) {
        const entity = supports[`${descriptor.id}-a`] as { typeId?: string };
        assert.equal(entity?.typeId, descriptor.id);
    }
});

test('the view follows a removal', () => {
    oneOfEach();
    assert.ok(getSupports()['twig-a']);

    removeSupportEntity('twig', 'twig-a');
    assert.equal(getSupports()['twig-a'], undefined, 'a removed entity is still in the view');
});

test('the view follows an addition', () => {
    oneOfEach();
    const before = Object.keys(getSupports()).length;

    addSupportEntity('twig', SEED.twig('twig-b') as never);

    assert.equal(Object.keys(getSupports()).length, before + 1);
    assert.ok(getSupports()['twig-b']);
});

test('reading twice without a write returns the same object', () => {
    // Memoised on the state identity: a consumer can use it as a dependency
    // without rebuilding on every render.
    oneOfEach();
    assert.equal(getSupports(), getSupports());
});

test('a write invalidates the memo', () => {
    oneOfEach();
    const before = getSupports();
    addSupportEntity('twig', SEED.twig('twig-c') as never);

    assert.notEqual(getSupports(), before, 'the view was not rebuilt after a write');
});

test('an empty store has an empty view', () => {
    resetStore();
    assert.deepEqual(getSupports(), {});
});

test('primitives are not in the view', () => {
    // `roots` and `knots` are collections but not support types; the merged
    // view is entities-by-type, and they keep their own maps.
    oneOfEach();
    const supports = getSupports();

    assert.equal(supports['root-a'], undefined);
    assert.equal(supports['knot-a'], undefined);
});
