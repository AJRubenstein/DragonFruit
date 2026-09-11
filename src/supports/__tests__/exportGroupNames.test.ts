import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, exportGroupName } from '../supportTypeRegistry';

/**
 * The group names an exported mesh carries, per type.
 *
 * Unlike history actions these DO leave the app: they are written into 3MF and
 * OBJ files and read back by other tools. Eight builders spelled them out by
 * hand; these pin the exact strings so a derivation that changes one is a test
 * failure rather than a silently renamed group in every file exported after.
 */

/** The spellings as they stand. A change here changes exported files. */
const EXPECTED: Record<string, string> = {
    trunk: 'Trunk_',
    branch: 'Branch_',
    leaf: 'Leaf_',
    twig: 'Twig_',
    stick: 'Stick_',
    brace: 'Brace_',
    anchor: 'Anchor_',
    kickstand: 'Kickstand_',
};

test('every type derives the prefix its builder used to hardcode', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const expected = EXPECTED[descriptor.id];
        assert.ok(expected, `${descriptor.id} has no expected prefix -- add one deliberately`);
        assert.equal(exportGroupName(descriptor.id, 'abc'), `${expected}abc`);
    }
});

test('the name is the singular capitalised, with no exceptions', () => {
    // What makes deriving them safe: a type whose export name did not follow
    // the rule would be silently renamed.
    for (const descriptor of SUPPORT_TYPES) {
        const { singular } = descriptor;
        const capitalised = singular.charAt(0).toUpperCase() + singular.slice(1);
        assert.equal(exportGroupName(descriptor.id, 'x'), `${capitalised}_x`);
    }
});

test('no two types share an export prefix', () => {
    const prefixes = SUPPORT_TYPES.map((d) => exportGroupName(d.id, ''));
    assert.equal(new Set(prefixes).size, prefixes.length, 'two types collide on an export group name');
});

test('the id is appended verbatim', () => {
    // Ids carry dashes and digits; nothing may normalise them.
    assert.equal(exportGroupName('trunk', 'grid-12a'), 'Trunk_grid-12a');
});
