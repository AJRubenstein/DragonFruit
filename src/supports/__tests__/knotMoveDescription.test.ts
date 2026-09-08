import assert from 'node:assert/strict';
import test from 'node:test';

import { knotMoveDescription } from '../SupportPrimitives/Knot/knotUtils';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Knot-move history labels. Two call sites (the drag path and the gizmo) share
 * this rule; neither is reachable from a test, so a wrong label is otherwise
 * silent -- the same gap that once left trunk, anchor and kickstand reading
 * "Move support knot".
 */

test('every support type names itself in the label', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const description = knotMoveDescription(descriptor.id);

        assert.ok(
            description.includes(descriptor.id),
            `${descriptor.id} knot move reads "${description}", which does not name the type`,
        );
        assert.notEqual(description, 'Move support knot', `${descriptor.id} fell through to the generic label`);
    }
});

test('a leaf cone is named as a tip, not as a type', () => {
    // leafCone is a contact primitive, not a support type.
    assert.equal(knotMoveDescription('leafCone'), 'Move tip knot');
});

test('an unresolved host falls back to the generic label', () => {
    assert.equal(knotMoveDescription(null), 'Move support knot');
    assert.equal(knotMoveDescription(undefined), 'Move support knot');
});
