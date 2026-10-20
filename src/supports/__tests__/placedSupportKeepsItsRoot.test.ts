import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addKnot,
    addRoot,
    addSupportEntity,
    asOneSupportEdit,
    getSnapshot,
    resetStore,
} from '../state';
import type { Kickstand, Knot, Roots, Trunk } from '../types';

const root = {
    id: 'root-1',
    modelId: 'model-1',
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 2,
    diskHeight: 0.5,
    coneHeight: 1,
} as Roots;

const trunk = {
    id: 'trunk-1',
    typeId: 'trunk',
    modelId: 'model-1',
    rootId: root.id,
    baseDiameterMm: 1,
    segments: [{
        id: 'seg-1',
        diameter: 1,
        topJoint: { id: 'j-1', pos: { x: 0, y: 0, z: 10 }, diameter: 1.1 },
    }],
} as unknown as Trunk;

/** Whether every entity's root is still in the store. */
function rootsResolve(): boolean {
    const state = getSnapshot();
    for (const entity of Object.values(state.trunks)) {
        const rootId = (entity as { rootId?: string }).rootId;
        if (rootId && !state.roots[rootId]) return false;
    }
    for (const entity of Object.values(state.kickstands)) {
        const rootId = (entity as { rootId?: string }).rootId;
        if (rootId && !state.roots[rootId]) return false;
    }
    return true;
}

test('a placed trunk keeps the root it owns', () => {
    resetStore();
    // commitTrunkBuild's two writes, as one edit.
    asOneSupportEdit(() => {
        addRoot(root);
        addSupportEntity(trunk);
    });

    assert.equal(Object.keys(getSnapshot().roots).length, 1);
    assert.ok(rootsResolve(), 'the trunk still owns a root that exists');
    resetStore();
});

test('a placed kickstand keeps the root it owns', () => {
    resetStore();
    const hostKnot = {
        id: 'knot-1',
        parentShaftId: 'shaft-1',
        t: 0.3,
        pos: { x: 1, y: 1, z: 10 },
        diameter: 1.1,
    } as Knot;
    const kickstand = {
        id: 'kick-1',
        modelId: 'model-1',
        rootId: root.id,
        hostKnotId: hostKnot.id,
        hostSegmentId: 'shaft-1',
        hostMinT: 0,
        segments: [{ id: 'seg-1', diameter: 1, topJoint: { id: 'j-1', pos: { x: 0, y: 0, z: 4 }, diameter: 1.1 } }],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1, terminalEndDiameterMm: 1 },
    } as unknown as Kickstand;

    asOneSupportEdit(() => {
        addRoot(root);
        addKnot(hostKnot);
        addSupportEntity('kickstand', kickstand);
    });

    assert.equal(Object.keys(getSnapshot().roots).length, 1);
    assert.ok(rootsResolve(), 'the kickstand still owns a root that exists');
    resetStore();
});

