import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, redo, undo } from '../../history/historyStore';
import { addAction } from '../history/actionTypes';
import { pushSupportHistory } from '../history/supportHistory';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { addKnot, addRoot, addSupportEntity, getSnapshot, resetStore } from '../state';
import type { Kickstand, Knot, Roots } from '../types';

const MODEL_ID = 'model-1';

const root: Roots = {
    id: 'root-1',
    modelId: MODEL_ID,
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 2,
    diskHeight: 0.5,
    coneHeight: 1,
} as Roots;

const hostKnot: Knot = {
    id: 'knot-1',
    parentShaftId: 'shaft-1',
    t: 0.3,
    pos: { x: 1, y: 1, z: 10 },
    diameter: 1.1,
} as Knot;

const kickstand: Kickstand = {
    id: 'kick-1',
    modelId: MODEL_ID,
    rootId: root.id,
    hostKnotId: hostKnot.id,
    hostSegmentId: 'shaft-1',
    hostMinT: 0,
    segments: [{
        id: 'seg-1',
        diameter: 1,
        bottomJoint: { id: 'joint-1', pos: { x: 0, y: 0, z: 0 }, diameter: 1.1 },
        topJoint: { id: 'joint-2', pos: { x: 1, y: 1, z: 10 }, diameter: 1.1 },
    }],
    profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1, terminalEndDiameterMm: 1 },
} as Kickstand;

/** Places a kickstand the way its placement controller does. */
function placeKickstand(): void {
    addRoot(root);
    addKnot(hostKnot);
    addSupportEntity('kickstand', kickstand);
    pushSupportHistory({
        type: addAction('kickstand'),
        payload: { kickstand, roots: root, knots: hostKnot },
    });
}

function counts(): { kickstands: number; roots: number; knots: number } {
    const snapshot = getSnapshot();
    return {
        kickstands: Object.keys(snapshot.kickstands).length,
        roots: Object.keys(snapshot.roots).length,
        knots: Object.keys(snapshot.knots).length,
    };
}

test('undoing a placed kickstand takes its root and host knot with it', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        resetStore();
        clearHistory();
        placeKickstand();
        assert.deepEqual(counts(), { kickstands: 1, roots: 1, knots: 1 });

        undo();
        assert.deepEqual(counts(), { kickstands: 0, roots: 0, knots: 0 });

        redo();
        assert.deepEqual(counts(), { kickstands: 1, roots: 1, knots: 1 });
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});
