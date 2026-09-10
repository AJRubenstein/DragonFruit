import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { shouldCommitJointDrag, MIN_COMMIT_DELTA_SQ } from '../SupportPrimitives/Joint/jointDragController';

/**
 * A click that moves nothing must commit nothing.
 *
 * The end-drag path recomputes the support and writes it back. On commit the
 * contact cone is re-solved (the drag preview passes `skipContactConeSolve`,
 * the commit does not), so a zero-distance drag can move a tip that the user
 * only clicked -- visible on LYS imports, whose cones were solved elsewhere.
 */

const SOURCE = readFileSync(
    new URL('../SupportPrimitives/Joint/useJointInteraction.ts', import.meta.url),
    'utf8',
);

test('a press and release at the same point does not commit', () => {
    const p = { x: 1, y: 2, z: 3 };
    assert.equal(shouldCommitJointDrag(p, p), false);
    assert.equal(shouldCommitJointDrag(p, { ...p }), false);
});

test('sub-epsilon jitter does not commit', () => {
    // A pointer that wobbles below the drag epsilon is a click, not a drag.
    const start = { x: 0, y: 0, z: 0 };
    const jitter = Math.sqrt(MIN_COMMIT_DELTA_SQ) / 2;
    assert.equal(shouldCommitJointDrag(start, { x: jitter, y: 0, z: 0 }), false);
});

test('a real drag commits', () => {
    const start = { x: 0, y: 0, z: 0 };
    assert.equal(shouldCommitJointDrag(start, { x: 0.5, y: 0, z: 0 }), true);
    assert.equal(shouldCommitJointDrag(start, { x: 0, y: 0, z: 0.01 }), true);
});

test('a missing endpoint does not commit', () => {
    // No press position recorded means no drag happened.
    assert.equal(shouldCommitJointDrag(null, { x: 1, y: 1, z: 1 }), false);
    assert.equal(shouldCommitJointDrag({ x: 1, y: 1, z: 1 }, null), false);
    assert.equal(shouldCommitJointDrag(null, null), false);
});

test('the hook gates its commit on movement, not on a non-null position', () => {
    // The bug: `if (lastDragPos.current)` is a null check, so one sub-pixel
    // pointer-move between press and release was enough to reach the commit.
    assert.match(
        SOURCE,
        /shouldCommitJointDrag\(/,
        'the end-drag path no longer asks whether the joint actually moved',
    );
});
