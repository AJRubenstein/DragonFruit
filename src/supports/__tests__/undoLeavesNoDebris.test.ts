import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, getRedoCount, getUndoCount, undo } from '../../history/historyStore';
import { captureSupportEditSnapshot, flushSupportEditHistory, pushSupportEditHistory } from '../history/supportEditHistory';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import {
    addKnot, addRoot, addSupportEntity, addSupportEntityWithHistory, asOneSupportEdit,
    getSnapshot, resetStore, setHoveredState, setSelectedId, updateKnot,
} from '../state';
import { inspectSupport } from '../supportInspector';
import { cascadeExtras } from '../supportTypeRegistry';
import type { Segment, SupportState } from '../types';

/**
 * What an undo must not leave behind: an entry for an edit that changed
 * nothing, a selection naming something gone, or a support standing on a
 * primitive the undo took.
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
const cone = (id: string, z: number) => ({
    id,
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: -1 },
    profile: { type: 'cone', bodyDiameterMm: 1, contactDiameterMm: 0.4, lengthMm: 1 },
});

function seedTrunkWithKnot(): void {
    resetStore();
    addRoot({
        id: 'root-1', modelId: 'model-1',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('trunk', {
        id: 'trunk-1', modelId: 'model-1', rootId: 'root-1',
        segments: [segment('seg-1', 0, 10)], contactCone: cone('cone-1', 12),
    } as never);
    addKnot({
        id: 'knot-1', parentShaftId: 'seg-1', t: 0.5,
        pos: { x: 0, y: 0, z: 5 }, diameter: 1.125,
    } as never);
}

test('an edit that changed nothing records no undo step', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedTrunkWithKnot();
        clearHistory();

        // A real edit first, so there is a redo stack to protect.
        const realBefore = captureSupportEditSnapshot();
        updateKnot({ ...getSnapshot().knots['knot-1'], t: 0.7 } as never);
        pushSupportEditHistory(label, realBefore, captureSupportEditSnapshot());
        flushSupportEditHistory();
        undo();
        assert.equal(getRedoCount(), 1, 'the real edit can be redone');

        // A drag that grabbed a handle and let go: hover and selection moved,
        // nothing else did.
        const before = captureSupportEditSnapshot();
        setHoveredState('knot', 'knot-1');
        setSelectedId('knot-1');
        setHoveredState('none', null);
        pushSupportEditHistory(label, before, captureSupportEditSnapshot());
        flushSupportEditHistory();

        assert.equal(getUndoCount(), 0, 'the no-op edit is not an undo step');
        assert.equal(getRedoCount(), 1, 'and it did not clear the redo stack');
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});

test('undoing an add clears a selection it invalidated', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedTrunkWithKnot();
        clearHistory();

        addSupportEntityWithHistory('branch', {
            id: 'branch-1', modelId: 'model-1', parentKnotId: 'knot-1',
            segments: [segment('seg-branch', 0, 4)], contactCone: cone('cone-branch', 6),
        } as never, cascadeExtras('branch', 'knots', [getSnapshot().knots['knot-1']]));

        // A joint of the branch, which the id alone does not tie to the branch.
        setSelectedId('seg-branch-top');
        undo();

        assert.equal(
            getSnapshot().selectedId,
            null,
            'the selected joint went with the branch, so the selection is cleared',
        );
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});

test('a support standing on a floating knot reports the link as broken', () => {
    seedTrunkWithKnot();
    try {
        addSupportEntity('branch', {
            id: 'branch-1', modelId: 'model-1', parentKnotId: 'knot-1',
            segments: [segment('seg-branch', 0, 4)], contactCone: cone('cone-branch', 6),
        } as never);

        const state = getSnapshot() as unknown as SupportState;
        assert.deepEqual(
            inspectSupport(state, 'branch-1')?.danglingLinks ?? [],
            [],
            'a healthy branch reports nothing',
        );

        // The shaft goes without its cascade, as old damage or a bad file has it.
        const orphaned = { ...state, trunks: {} } as SupportState;
        assert.deepEqual(
            (inspectSupport(orphaned, 'branch-1')?.danglingLinks ?? []).map((link) => link.field),
            ['parentKnotId'],
            'the knot still exists, but it rides a deleted shaft',
        );
    } finally {
        resetStore();
    }
});

test('undoing a leaf discards the junction hub it staged', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        seedTrunkWithKnot();
        clearHistory();
        const parentKnot = getSnapshot().knots['knot-1'];

        asOneSupportEdit(() => {
            addSupportEntityWithHistory('leaf', {
                id: 'leaf-1', modelId: 'model-1', parentKnotId: 'knot-1',
                contactCone: cone('cone-leaf', 6),
            } as never, cascadeExtras('leaf', 'knots', [parentKnot]));
        });
        // The reload hub, staged after the entry closed so the next leaf in the
        // fan can hang off it.
        addKnot({ ...parentKnot, id: 'knot-reload' } as never);

        undo();

        // The controller's own subscription does the discarding; this asserts
        // the shape the fix relies on -- an unclaimed hub is identifiable.
        const claimed = Object.values(getSnapshot().leaves)
            .some((leaf) => leaf.parentKnotId === 'knot-reload');
        assert.equal(claimed, false, 'no leaf claims the staged hub after the undo');
    } finally {
        unregister();
        resetStore();
        clearHistory();
    }
});
