import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isJointDragPreviewType,
    JOINT_DRAG_PREVIEW_BY_TYPE,
    JOINT_DRAG_PREVIEW_TYPES,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';
import type { JointDragPreviewKind } from '../interaction/jointDragPreviewMath';

/**
 * The joint-drag preview type set.
 *
 * `JOINT_DRAG_PREVIEW_BY_TYPE` is the only place these types are named:
 * `JointDragPreviewKind` narrows from it (so passing an unsupported type stays
 * a compile error) and the runtime guard reads it too. These pin the parts a
 * type checker cannot: that the runtime list agrees with the table, and that
 * the guard rejects what is not in it.
 */

test('the runtime list holds exactly the types declared true', () => {
    const declared = Object.entries(JOINT_DRAG_PREVIEW_BY_TYPE)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

    assert.deepEqual([...JOINT_DRAG_PREVIEW_TYPES].sort(), declared.sort());
});

test('the table covers every support type', () => {
    // A type absent from the table is a compile error via `satisfies`, but a
    // type REMOVED from the registry would leave a stale entry behind.
    assert.deepEqual(
        Object.keys(JOINT_DRAG_PREVIEW_BY_TYPE).sort(),
        SUPPORT_TYPES.map((descriptor) => descriptor.id).sort(),
    );
});

test('the guard accepts every declared type and rejects the rest', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            isJointDragPreviewType(descriptor.id),
            JOINT_DRAG_PREVIEW_BY_TYPE[descriptor.id],
            `${descriptor.id} guard disagrees with the table`,
        );
    }
});

test('the guard rejects anything that is not a support type', () => {
    // It reads an untrusted `kind` off a DOM event payload.
    for (const value of ['', 'knot', 'segment', 'joint', 'Trunk', 'trunks']) {
        assert.equal(isJointDragPreviewType(value), false, `${value || '<empty>'} accepted`);
    }
});

test('the narrowed union admits the declared types', () => {
    // Compile-time: each assignment fails to build if the union widened or
    // dropped a member. The runtime assertion just keeps the test honest.
    const kinds: JointDragPreviewKind[] = ['trunk', 'branch', 'kickstand'];
    assert.deepEqual([...kinds].sort(), [...JOINT_DRAG_PREVIEW_TYPES].sort());
});
