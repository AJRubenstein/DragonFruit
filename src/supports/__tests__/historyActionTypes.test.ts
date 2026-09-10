import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import {
    SUPPORT_ADD_TRUNK, SUPPORT_REMOVE_TRUNK, SUPPORT_UPDATE_TRUNK,
    SUPPORT_ADD_KICKSTAND, SUPPORT_REMOVE_KICKSTAND,
    SUPPORT_AUTO_PLACE, SUPPORT_EDIT_REPLACE,
} from '../history/actionTypes';

/**
 * History action strings, and the descriptors that name them.
 *
 * The strings are `support:<verb>-<typeId>` for every type. They are NOT
 * persisted -- nothing in the voxl codec writes them, and history is in-memory
 * undo/redo only -- so the shape is free to be derived. These pin the exact
 * spellings so a derivation that changes one is a test failure, not a silently
 * unmatched handler.
 */

/** The spellings as they stand, per type. A change here is a behaviour change. */
const EXPECTED: Record<string, { add: string; remove: string }> = {
    trunk: { add: 'support:add-trunk', remove: 'support:remove-trunk' },
    branch: { add: 'support:add-branch', remove: 'support:remove-branch' },
    leaf: { add: 'support:add-leaf', remove: 'support:remove-leaf' },
    twig: { add: 'support:add-twig', remove: 'support:remove-twig' },
    stick: { add: 'support:add-stick', remove: 'support:remove-stick' },
    brace: { add: 'support:add-brace', remove: 'support:remove-brace' },
    anchor: { add: 'support:add-anchor', remove: 'support:remove-anchor' },
    kickstand: { add: 'support:add-kickstand', remove: 'support:remove-kickstand' },
};

test('every descriptor names the action strings for its own type', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const expected = EXPECTED[descriptor.id];
        assert.ok(expected, `${descriptor.id} has no expected spelling -- add one deliberately`);
        assert.equal(descriptor.historyAdd, expected.add, `${descriptor.id} add action`);
        assert.equal(descriptor.historyRemove, expected.remove, `${descriptor.id} remove action`);
    }
});

test('the strings follow support:<verb>-<typeId> with no exceptions', () => {
    // What makes deriving them safe. A type whose action does not follow the
    // rule would be silently renamed by a derivation.
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(descriptor.historyAdd, `support:add-${descriptor.id}`);
        assert.equal(descriptor.historyRemove, `support:remove-${descriptor.id}`);
    }
});

test('the exported constants match their descriptors', () => {
    // Both spellings must agree while the constants still exist; call sites use
    // the constants, the registry walks use the descriptor.
    assert.equal(getSupportTypeDescriptor('trunk').historyAdd, SUPPORT_ADD_TRUNK);
    assert.equal(getSupportTypeDescriptor('trunk').historyRemove, SUPPORT_REMOVE_TRUNK);
    assert.equal(getSupportTypeDescriptor('kickstand').historyAdd, SUPPORT_ADD_KICKSTAND);
    assert.equal(getSupportTypeDescriptor('kickstand').historyRemove, SUPPORT_REMOVE_KICKSTAND);
});

test('the non-type actions are unaffected by any derivation', () => {
    // These name a whole-store operation, not a type, so they stay written out.
    assert.equal(SUPPORT_UPDATE_TRUNK, 'support:update-trunk');
    assert.equal(SUPPORT_AUTO_PLACE, 'support:auto-place');
    assert.equal(SUPPORT_EDIT_REPLACE, 'support:edit-replace');
});

test('no two types share an action string', () => {
    const all = SUPPORT_TYPES.flatMap((d) => [d.historyAdd, d.historyRemove]);
    assert.equal(new Set(all).size, all.length, 'two types collide on a history action');
});
