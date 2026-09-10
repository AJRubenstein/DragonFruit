import assert from 'node:assert/strict';
import test from 'node:test';

import { collectRaftBaseCirclesByModel } from '../Rafts/Crenelated/raftFootprintCircles';
import { addRoot, addKnot, addSupportEntity, getSnapshot, resetStore } from '../state';
import { getOwnedPrimitives } from '../state';
import type { Roots } from '../types';

/**
 * Raft base circles come from the roots collection, once per root.
 *
 * Kickstand roots ARE support roots -- they live in the same collection -- so
 * passing them again as a separate input pushed every one of them twice. The
 * convex hull absorbed it, which is why nothing caught it.
 */

const root = (id: string, x: number) => ({
    id, modelId: 'm',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

function sceneWithKickstand() {
    resetStore();
    addRoot(root('r-trunk', 0) as never);
    addSupportEntity('trunk', { id: 't', modelId: 'm', rootId: 'r-trunk', segments: [] } as never);
    addKnot({ id: 'k', parentShaftId: 'seg', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1 } as never);
    addRoot(root('r-kick', 5) as never);
    addSupportEntity('kickstand', {
        id: 'ks', modelId: 'm', rootId: 'r-kick',
        hostKnotId: 'k', hostSegmentId: 'seg', segments: [],
    } as never);
}

test('a kickstand root lives in the shared roots collection', () => {
    // The premise. If this stops holding, the raft inputs really are distinct
    // and this whole file needs rethinking.
    sceneWithKickstand();
    const owned = getOwnedPrimitives<Roots>('kickstand', 'roots');

    assert.deepEqual(Object.keys(owned), ['r-kick']);
    assert.ok(getSnapshot().roots['r-kick'], 'the kickstand root is also in state.roots');
});

test('every root contributes exactly one base circle', () => {
    sceneWithKickstand();
    const byModel = collectRaftBaseCirclesByModel({
        roots: Object.values(getSnapshot().roots),
    });

    const circles = byModel.get('m') ?? [];
    assert.equal(circles.length, 2, 'one circle per root, with no kickstand root counted twice');
});

test('passing the owned kickstand roots again duplicates them', () => {
    // What the old call sites did. Pinned so the reason the argument was
    // dropped stays legible.
    sceneWithKickstand();
    const state = getSnapshot();
    const byModel = collectRaftBaseCirclesByModel({
        roots: Object.values(state.roots),
        kickstandRoots: Object.values(getOwnedPrimitives<Roots>('kickstand', 'roots')),
    });

    assert.equal((byModel.get('m') ?? []).length, 3, 'the kickstand root is pushed twice');
});
