import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, undo } from '../../history/historyStore';
import { pushSupportHistory } from '../history/supportHistory';
import { SUPPORT_UPDATE_TRUNK, SUPPORT_REMOVE_TRUNK, SUPPORT_REMOVE_BRANCH } from '../history/actionTypes';
import { pushSupportEditHistory, captureSupportEditSnapshot } from '../history/supportEditHistory';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { resetStore, getSnapshot, setSnapshot, updateTrunk, removeTrunk, removeBranch, addRoot, addTrunk } from '../state';
import { resetKickstandStore } from '../SupportTypes/Kickstand/kickstandStore';
import type { SupportState, Trunk, Roots, Segment, Branch } from '../types';

function emptySnapshot(): SupportState {
    return {
        roots: {}, trunks: {}, branches: {}, leaves: {}, twigs: {}, sticks: {},
        braces: {}, anchors: {}, knots: {},
        selectedId: null, selectedCategory: null, hoveredId: null, hoveredCategory: 'none', interactionWarning: null,
    };
}

function seedTrunk(id: string, segmentId: string, jointPos: { x: number; y: number; z: number }): void {
    const root: Roots = {
        id: `root-${id}`,
        modelId: 'model-a',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3,
        diskHeight: 0.5,
        coneHeight: 0.5,
    };
    const segments: Segment[] = [
        {
            id: segmentId,
            diameter: 1,
            bottomJoint: { id: `bottom-${id}`, pos: { x: 0, y: 0, z: 0 }, diameter: 1.2 },
            topJoint: { id: `top-${id}`, pos: jointPos, diameter: 1.2 },
        },
    ];
    const trunk: Trunk = { id, modelId: 'model-a', rootId: root.id, segments };
    const snapshot = emptySnapshot();
    snapshot.roots[root.id] = root;
    snapshot.trunks[id] = trunk;
    setSnapshot(snapshot);
}

test('undo restores a moved trunk joint (SUPPORT_UPDATE_TRUNK)', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const dispose = registerSupportHistoryHandlers();

    seedTrunk('t1', 's1', { x: 0, y: 0, z: 10 });
    const before = structuredClone(getSnapshot().trunks.t1);
    // Move the top joint.
    const moved: Trunk = {
        ...before,
        segments: before.segments.map((s) => ({
            ...s,
            topJoint: s.topJoint ? { ...s.topJoint, pos: { x: 5, y: 0, z: 12 } } : s.topJoint,
        })),
    };
    updateTrunk(moved);
    pushSupportHistory({ type: SUPPORT_UPDATE_TRUNK, payload: { before, after: moved } });

    assert.equal(getSnapshot().trunks.t1.segments[0].topJoint?.pos.x, 5, 'joint moved before undo');

    undo();

    const restored = getSnapshot().trunks.t1;
    assert.equal(restored.segments[0].topJoint?.pos.x, 0, 'joint x restored');
    assert.equal(restored.segments[0].topJoint?.pos.z, 10, 'joint z restored');
    dispose();
});

test('undo restores a deleted trunk (SUPPORT_REMOVE_TRUNK)', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const dispose = registerSupportHistoryHandlers();

    seedTrunk('t1', 's1', { x: 0, y: 0, z: 10 });
    const removed = removeTrunk('t1');
    assert.ok(removed, 'removeTrunk cascades');
    assert.equal(getSnapshot().trunks.t1, undefined, 'trunk gone after delete');

    pushSupportHistory({
        type: SUPPORT_REMOVE_TRUNK,
        payload: {
            trunk: removed.trunk,
            root: removed.root ?? undefined,
            branches: removed.branches,
            braces: removed.braces,
            kickstands: removed.kickstands,
            leaves: removed.leaves,
            knots: removed.knots,
        },
    });

    undo();

    const restored = getSnapshot();
    assert.ok(restored.trunks.t1, 'trunk restored after undo');
    assert.ok(restored.roots[removed.trunk.rootId], 'root restored after undo');
    dispose();
});

test('undo restores a branch-joint move pushed via pushSupportEditHistory (deferred flush)', async () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const dispose = registerSupportHistoryHandlers();

    seedTrunk('t1', 's1', { x: 0, y: 0, z: 10 });
    const before = captureSupportEditSnapshot();

    // Simulate the branch-joint drag: mutate the trunk joint (via updateTrunk)
    // then push the edit history exactly like useJointInteraction does.
    const moved: Trunk = {
        ...getSnapshot().trunks.t1,
        segments: getSnapshot().trunks.t1.segments.map((s) => ({
            ...s,
            topJoint: s.topJoint ? { ...s.topJoint, pos: { x: 5, y: 0, z: 12 } } : s.topJoint,
        })),
    };
    updateTrunk(moved);
    pushSupportEditHistory('Move branch joint', before, captureSupportEditSnapshot());

    // The push is deferred to idle; wait for the flush (setTimeout fallback).
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(getSnapshot().trunks.t1.segments[0].topJoint?.pos.x, 5, 'joint moved before undo');

    undo();

    assert.equal(getSnapshot().trunks.t1.segments[0].topJoint?.pos.x, 0, 'joint restored after undo');
    dispose();
});

test('undo restores a deleted branch (SUPPORT_REMOVE_BRANCH cascade)', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const dispose = registerSupportHistoryHandlers();

    seedTrunk('t1', 's1', { x: 0, y: 0, z: 10 });
    const seed = getSnapshot();
    const branch: Branch = {
        id: 'b1',
        modelId: 'model-a',
        parentKnotId: 'k1',
        segments: [{ id: 'bs1', diameter: 1, bottomJoint: { id: 'bj', pos: { x: 0, y: 0, z: 5 }, diameter: 1 }, topJoint: { id: 'bt', pos: { x: 0, y: 0, z: 8 }, diameter: 1 } }],
        contactCone: { id: 'cc', pos: { x: 0, y: 0, z: 8 }, normal: { x: 0, y: 0, z: -1 }, surfaceNormal: { x: 0, y: 0, z: -1 }, profile: { contactDiameterMm: 0.4 } } as any,
    };
    const knot = { id: 'k1', parentShaftId: 's1', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1.1 };
    const seeded = { ...seed, branches: { b1: branch }, knots: { k1: knot as any } };
    setSnapshot(seeded);

    const removed = removeBranch('b1');
    assert.ok(removed, 'removeBranch cascades');
    assert.equal(getSnapshot().branches.b1, undefined, 'branch gone after delete');

    pushSupportHistory({
        type: SUPPORT_REMOVE_BRANCH,
        payload: {
            branches: removed.branches,
            braces: removed.braces,
            kickstands: removed.kickstands,
            leaves: removed.leaves,
            knots: removed.knots,
        },
    });

    undo();

    const restored = getSnapshot();
    assert.ok(restored.branches.b1, 'branch restored after undo');
    assert.ok(restored.knots.k1, 'knot restored after undo');
    dispose();
});
