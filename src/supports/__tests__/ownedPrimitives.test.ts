import assert from 'node:assert/strict';
import test from 'node:test';

import { getKickstandKnots, getKickstandRoots, getOwnedPrimitives, setSnapshot, getSnapshot } from '../state';
import { getKickstandSnapshot } from '../SupportTypes/Kickstand/kickstandStore';
import { createEmptySupportCollections, SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * `getOwnedPrimitives` replaces the hand-filtered view in `kickstandStore`,
 * which picked out the roots and knots kickstands own. Consumers need those
 * separately from every other type's -- raft base circles count trunk roots
 * and kickstand roots as distinct inputs, so widening to all roots would
 * double count.
 */

function seed() {
    setSnapshot({
        ...createEmptySupportCollections(),
        selectedId: null,
        roots: {
            'root-kick': { id: 'root-kick', modelId: 'm1' },
            'root-trunk': { id: 'root-trunk', modelId: 'm1' },
            'root-orphan': { id: 'root-orphan', modelId: 'm1' },
        },
        knots: {
            'knot-host': { id: 'knot-host', parentShaftId: 'trunk-seg', pos: { x: 0, y: 0, z: 1 }, diameter: 1 },
            'knot-other': { id: 'knot-other', parentShaftId: 'trunk-seg', pos: { x: 0, y: 0, z: 2 }, diameter: 1 },
        },
        kickstands: {
            'k1': {
                id: 'k1', modelId: 'm1', rootId: 'root-kick',
                hostKnotId: 'knot-host', hostSegmentId: 'trunk-seg', segments: [],
            },
        },
        trunks: {
            't1': { id: 't1', modelId: 'm1', rootId: 'root-trunk', segments: [] },
        },
    } as unknown as ReturnType<typeof getSnapshot>);
}

test('owned roots are the type\'s own, not every root in the scene', () => {
    seed();

    assert.deepEqual(Object.keys(getOwnedPrimitives('kickstand', 'roots')), ['root-kick']);
    assert.deepEqual(Object.keys(getOwnedPrimitives('trunk', 'roots')), ['root-trunk']);
});

test('owned knots follow the declared hostedBy edge', () => {
    seed();

    assert.deepEqual(Object.keys(getOwnedPrimitives('kickstand', 'knots')), ['knot-host']);
});

test('an edge onto another collection does not leak across', () => {
    // Kickstand declares rootId -> roots AND hostKnotId -> knots. Asking for
    // roots must not follow the knot edge, which would otherwise return a knot
    // whose id happens to exist in roots.
    setSnapshot({
        ...createEmptySupportCollections(),
        selectedId: null,
        roots: { 'shared-id': { id: 'shared-id', modelId: 'm1' } },
        knots: { 'shared-id': { id: 'shared-id', parentShaftId: 's', pos: { x: 0, y: 0, z: 0 }, diameter: 1 } },
        kickstands: {
            'k1': {
                id: 'k1', modelId: 'm1', rootId: 'no-such-root',
                hostKnotId: 'shared-id', hostSegmentId: 's', segments: [],
            },
        },
    } as unknown as ReturnType<typeof getSnapshot>);

    // The only root edge points at a missing id, so no roots are owned even
    // though the knot edge would match an id present in roots.
    assert.deepEqual(getOwnedPrimitives('kickstand', 'roots'), {});
    assert.deepEqual(Object.keys(getOwnedPrimitives('kickstand', 'knots')), ['shared-id']);
});

test('it reproduces the view kickstandStore built by hand', () => {
    seed();
    const view = getKickstandSnapshot();

    assert.deepEqual(getOwnedPrimitives('kickstand', 'roots'), view.roots);
    assert.deepEqual(getOwnedPrimitives('kickstand', 'knots'), view.knots);
});

test('a type owning no such primitive gets nothing', () => {
    seed();
    // Anchor carries an inline root rather than a Roots entry, so it declares
    // no edge onto roots.
    assert.deepEqual(getOwnedPrimitives('anchor', 'roots'), {});
});

test('every type declaring ownsRoot has an edge onto roots', () => {
    // What makes the derivation safe: the flag and the edge cannot disagree.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.ownsRoot) continue;
        const hasEdge = descriptor.edges.some((edge) => edge.to === 'roots');
        assert.ok(hasEdge, `${descriptor.id} declares ownsRoot but no edge onto roots`);
    }
});

test('getKickstandRoots is reference-stable between snapshots', () => {
    // useSyncExternalStore compares by reference; a fresh object per call
    // re-renders forever. Not something a render test would surface.
    seed();
    const first = getKickstandRoots();
    assert.equal(getKickstandRoots(), first, 'a second call returned a different object');

    setSnapshot({ ...getSnapshot() });
    assert.notEqual(getKickstandRoots(), first, 'a new snapshot returned the stale object');
});

test('an owned root indexes the same in the shared collection', () => {
    // What lets a consumer that looks a root up BY ID drop the filtered view:
    // the filter changes which roots are present, never which id maps where.
    seed();
    const owned = getOwnedPrimitives<{ id: string }>('kickstand', 'roots');
    const shared = getSnapshot().roots as unknown as Record<string, { id: string }>;

    for (const [id, root] of Object.entries(owned)) {
        assert.equal(shared[id], root, `${id} differs between the view and the collection`);
    }
});

test('owned primitives are always a subset of the shared collection', () => {
    // Why a `state.knots[id] ?? kickstandKnots[id]` fallback cannot fire: the
    // view is built by reading the shared collection, never alongside it.
    seed();
    const shared = getSnapshot();

    for (const collection of ['roots', 'knots'] as const) {
        const owned = getOwnedPrimitives('kickstand', collection);
        for (const id of Object.keys(owned)) {
            assert.ok(
                id in (shared[collection] as Record<string, unknown>),
                `${id} is in the kickstand view but not state.${collection}`,
            );
        }
    }
});

test('each cached view is keyed separately', () => {
    // One shared cache slot would make the second accessor return the first's
    // rows -- knots served as roots, silently.
    seed();
    const roots = getKickstandRoots();
    const knots = getKickstandKnots();

    assert.notEqual(roots, knots, 'both accessors returned the same object');
    assert.deepEqual(Object.keys(roots), ['root-kick']);
    assert.deepEqual(Object.keys(knots), ['knot-host']);

    // Still stable after interleaving.
    assert.equal(getKickstandRoots(), roots);
    assert.equal(getKickstandKnots(), knots);
});
