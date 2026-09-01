import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, registerHistoryHandler, undo } from '../../history/historyStore';
import { SUPPORT_AUTO_BRACE_REPLACE } from '../history/actionTypes';
import { runAutoBracing } from '../autoBracing/autoBrace';
import { getSnapshot, resetStore, setSnapshot  } from '../state';
import { getKickstandSnapshot, resetKickstandStore } from '../SupportTypes/Kickstand/kickstandStore';
import type { Roots, SupportState, Trunk } from '../types';

function createRoot(id: string, modelId: string, x: number): Roots {
    return {
        id,
        modelId,
        transform: {
            pos: { x, y: 0, z: 0 },
            rot: { x: 0, y: 0, z: 0, w: 1 },
        },
        diameter: 3,
        diskHeight: 0.5,
        coneHeight: 0.5,
    };
}

function createTrunk(id: string, modelId: string, rootId: string, segmentId: string, x: number): Trunk {
    return {
        id,
        modelId,
        rootId,
        segments: [
            {
                id: segmentId,
                diameter: 1,
                topJoint: {
                    id: `joint-${id}`,
                    pos: { x, y: 0, z: 10 },
                    diameter: 1.2,
                },
            },
        ],
    };
}

function seedLadderSnapshot(): void {
    const modelId = 'model-a';
    const snapshot: SupportState = {
        roots: {},
        trunks: {},
        branches: {},
        leaves: {},
        twigs: {},
        sticks: {},
        braces: {},
        anchors: {},
        kickstands: {},
        knots: {},
        selectedId: null,
        selectedCategory: null,
        hoveredId: null,
        hoveredCategory: 'none',
        interactionWarning: null,
    };

    for (const [i, x] of [0, 2, 4].entries()) {
        const root = createRoot(`root-${i}`, modelId, x);
        const trunk = createTrunk(`trunk-${i}`, modelId, root.id, `seg-${i}`, x);
        snapshot.roots[root.id] = root;
        snapshot.trunks[trunk.id] = trunk;
    }

    setSnapshot(snapshot);
}

// Rewritten from asserting the payload SHAPE (kickstandBefore/kickstandAfter) to
// asserting the OUTCOME. Those fields existed because kickstands lived in a second
// store that setSnapshot did not restore; they are a SupportState collection now,
// so what matters is that one snapshot round-trips both.
test('the auto-brace history snapshot carries kickstands with everything else', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    seedLadderSnapshot();

    const captured: Array<{ type: string; payload?: unknown }> = [];
    const unregister = registerHistoryHandler(SUPPORT_AUTO_BRACE_REPLACE, (action) => {
        captured.push(action);
        return true;
    });

    try {
        const before = getSnapshot();
        const result = runAutoBracing();
        assert.equal(result.changed, true, 'ladder setup must generate braces for this test to be meaningful');

        undo();
        assert.equal(captured.length, 1, 'undo must dispatch the auto-brace history action');

        // The spy above swallows the action, so restore from the payload by hand:
        // this asserts the payload is sufficient, which is the property that used
        // to need a second kickstand snapshot alongside it.
        const payload = captured[0].payload as { before: ReturnType<typeof getSnapshot> };
        setSnapshot(payload.before);

        assert.deepEqual(
            Object.keys(getSnapshot().braces).sort(),
            Object.keys(before.braces).sort(),
            'restoring payload.before puts the braces back',
        );
        assert.deepEqual(
            Object.keys(getSnapshot().kickstands).sort(),
            Object.keys(before.kickstands).sort(),
            'and the kickstands with them -- no separate kickstand snapshot needed',
        );
    } finally {
        unregister();
        clearHistory();
        resetStore();
        resetKickstandStore();
    }
});
