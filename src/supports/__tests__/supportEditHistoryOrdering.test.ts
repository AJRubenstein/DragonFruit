import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, getUndoCount, peekUndo, undo } from '../../history/historyStore';
import { SUPPORT_MULTI_DELETE } from '../history/actionTypes';
import { captureSupportEditSnapshot, pushSupportEditHistory } from '../history/supportEditHistory';
import { pushSupportHistory } from '../history/supportHistory';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { addRoot, addSupportEntity, getSnapshot, removeSupportEntity, resetStore } from '../state';
import type { Segment, SupportState } from '../types';

/**
 * Support snapshots are queued to an idle callback, so the store drains them
 * before any other push and drops them when it clears. Without that, a queued
 * entry lands above an edit made after it and one undo reverts the wrong one.
 */

const label = { id: 'test', message: 'edit' } as never;
const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });
const segment = (id: string, bottomZ: number, topZ: number): Segment => ({
    id,
    type: 'straight',
    diameter: 1,
    bottomJoint: joint(`${id}-bottom`, bottomZ),
    topJoint: joint(`${id}-top`, topZ),
});

function seedTrunk(id: string): void {
    addSupportEntity('trunk', {
        id, modelId: 'model-1', rootId: 'root-1',
        segments: [segment(`${id}-seg`, 0, 10)],
    } as never);
}

function seedStore(): void {
    resetStore();
    addRoot({
        id: 'root-1', modelId: 'model-1',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    seedTrunk('trunk-a');
}

test('a queued snapshot lands below an edit pushed after it', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedStore();
        clearHistory();

        const before = captureSupportEditSnapshot();
        pushSupportEditHistory(label, before, captureSupportEditSnapshot());
        pushSupportHistory({
            type: SUPPORT_MULTI_DELETE,
            description: label,
            payload: { before: before.support, after: before.support },
        } as never);

        assert.equal(getUndoCount(), 2, 'both entries are on the stack');
        assert.equal(
            peekUndo()?.type,
            SUPPORT_MULTI_DELETE,
            'the later push sits on top, so one undo reverts it',
        );
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});

test('clearing the stacks drops a queued snapshot', async () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedStore();
        const before = captureSupportEditSnapshot();
        pushSupportEditHistory(label, before, captureSupportEditSnapshot());

        clearHistory();
        // The queue flushes on a later task, which is when an uncancelled entry
        // would refill the stack the clear just emptied.
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(getUndoCount(), 0, 'nothing lands after the clear');
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});

test('a queued snapshot records the state the edit saw, not a later one', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedStore();
        clearHistory();

        const before = captureSupportEditSnapshot();
        seedTrunk('trunk-b');
        pushSupportEditHistory(label, before, captureSupportEditSnapshot());

        // An edit after the queueing must not change what the entry recorded.
        removeSupportEntity('trunk', 'trunk-a');

        // Any other push drains the queue, so the entry is on the stack now.
        pushSupportHistory({
            type: SUPPORT_MULTI_DELETE,
            description: label,
            payload: { before: getSnapshot(), after: getSnapshot() },
        } as never);

        undo();
        undo();
        const restored = getSnapshot() as unknown as SupportState;
        assert.deepEqual(
            Object.keys(restored.trunks).sort(),
            ['trunk-a'],
            'undo restores what the edit saw, without the later removal',
        );
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});
