import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, redo, undo } from '../../history/historyStore';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { addRoot, addSupportEntityWithHistory, getSnapshot, resetStore } from '../state';
import { inspectSupport } from '../supportInspector';
import { SUPPORT_GRAPH_NODES } from '../supportTypeRegistry';
import type { Roots, Trunk } from '../types';

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

/** Every collection's ids, so two snapshots can be compared outright. */
function census(): Record<string, string[]> {
    const state = getSnapshot() as unknown as Record<string, Record<string, unknown>>;
    const counts: Record<string, string[]> = {};
    for (const node of SUPPORT_GRAPH_NODES) {
        counts[node.key] = Object.keys(state[node.key] ?? {}).sort();
    }
    return counts;
}

/**
 * The trunk's unresolved links, through the same inspector the debug overlay
 * reads: a link naming a primitive the store no longer holds.
 */
function danglingLinks(): string[] {
    const inspection = inspectSupport(getSnapshot(), trunk.id);
    return (inspection?.danglingLinks ?? []).map((link) => link.field);
}

test('redo restores everything undo took', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        resetStore();
        clearHistory();
        addRoot(root);
        addSupportEntityWithHistory('trunk', trunk);

        const placed = census();
        assert.deepEqual(placed.roots, ['root-1'], 'the root is placed');

        undo();
        assert.deepEqual(census().roots, [], 'undo takes the root with the trunk');
        assert.deepEqual(census().trunks, []);

        redo();
        assert.deepEqual(census(), placed, 'redo puts back exactly what undo took');
        assert.deepEqual(danglingLinks(), [], 'no entity points at a missing primitive');
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});

test('a second undo and redo round-trips the same way', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        resetStore();
        clearHistory();
        addRoot(root);
        addSupportEntityWithHistory('trunk', trunk);
        const placed = census();

        for (let round = 0; round < 3; round += 1) {
            undo();
            redo();
            assert.deepEqual(census(), placed, `round ${round + 1} round-trips`);
            assert.deepEqual(danglingLinks(), [], `round ${round + 1} leaves no dangling link`);
        }
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});
