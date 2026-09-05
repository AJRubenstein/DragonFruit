import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import { JOINT_DRAG_COMMIT_TYPES } from '../SupportPrimitives/Joint/jointDragController';

/**
 * Which collection a dragged joint's support is written back to.
 *
 * `commitJointDragSupport` dispatched on a trailing `else` that landed on
 * kickstand, so a fourth draggable type would have been written into the
 * kickstand collection with no error. The switch is now exhaustive over
 * `JointDragSupportKind`; these pin the registry facts it leans on.
 */

test('every type has a singular name, and it is not the plural', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.ok(descriptor.singular, `${descriptor.id} has no singular`);
        assert.notEqual(
            descriptor.singular,
            descriptor.label,
            `${descriptor.id} singular should differ from the plural label`,
        );
        assert.equal(descriptor.singular, descriptor.singular.toLowerCase(), descriptor.id);
    }
});

test('the singular is the type id, so a history string needs no table', () => {
    // History descriptions read `Move ${singular} joint`. Depluralising the
    // label would give "Leave" for leaf, which is why this is declared.
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(descriptor.singular, descriptor.id);
    }
});

test('only shafted types can own a dragged joint', () => {
    // A joint lives on a segment, so a type with no shaft has none to drag.
    for (const typeId of ['trunk', 'branch', 'kickstand'] as const) {
        assert.equal(getSupportTypeDescriptor(typeId).hasSegments, true, typeId);
    }
});

test('exactly one type pushes its own joint-drag history entry', () => {
    // The rest share `Move ${singular} joint`. Trunk pushes a typed
    // SUPPORT_UPDATE_TRUNK entry instead, which is what the flag records.
    const owns = SUPPORT_TYPES.filter((d) => d.ownsEditHistoryEntry).map((d) => d.id);
    assert.deepEqual(owns, ['trunk']);
});

test('the types that commit through the shared controller clear their own preview', () => {
    // Membership decides whether the drag-end path clears the live preview by
    // hand. A type added to the controller but not this set would leave a
    // preview stuck on screen -- no test or golden catches that, so it is
    // pinned here.
    assert.deepEqual([...JOINT_DRAG_COMMIT_TYPES].sort(), ['branch', 'kickstand', 'trunk']);

    for (const typeId of JOINT_DRAG_COMMIT_TYPES) {
        assert.equal(getSupportTypeDescriptor(typeId).hasSegments, true, typeId);
    }
});
