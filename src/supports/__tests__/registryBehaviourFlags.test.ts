import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Pins the behaviour flags to the hardcoded type lists they replaced.
 *
 * These flags were introduced by converting five `id !== 'trunk'`-style filters
 * into declared properties. Nothing else asserts them, so without this file a
 * wrong value is silent: the filter simply selects a different set and the
 * affected feature misbehaves in a way no test notices.
 *
 * A new support type SHOULD fail these. Update the expectation deliberately,
 * having decided what the new type does -- that decision is the point.
 */

function idsWhere(flag: (d: (typeof SUPPORT_TYPES)[number]) => boolean): string[] {
    return SUPPORT_TYPES.filter(flag).map((d) => d.id).sort();
}

test('segmentsCarryBothJoints marks the self-contained shafts', () => {
    // Trunks, branches and kickstands resolve endpoints from a root, a parent
    // knot or a neighbouring segment, so they need their own endpoint maps in
    // normalizeLoadedKnotAndLeafGeometry.
    assert.deepEqual(
        idsWhere((d) => d.hasSegments && d.segmentsCarryBothJoints),
        ['anchor', 'stick', 'twig'],
    );
    for (const id of ['trunk', 'branch', 'kickstand'] as const) {
        assert.equal(getSupportTypeDescriptor(id).segmentsCarryBothJoints, false, id);
    }
});

test('hasDedicatedSnapPass marks types with their own snap loop', () => {
    // supportPathTargets builds trunk, branch and brace targets in dedicated
    // passes; the generic shafted loop must skip them or it offers duplicates.
    assert.deepEqual(idsWhere((d) => d.hasDedicatedSnapPass), ['brace', 'branch', 'trunk']);
});

test('the generic shafted snap loop covers exactly the remaining shafts', () => {
    assert.deepEqual(
        idsWhere((d) => d.hasSegments && !d.hasDedicatedSnapPass),
        ['anchor', 'kickstand', 'stick', 'twig'],
    );
});

test('hasContactDiskLengthOverride marks the types a joint drag strips', () => {
    assert.deepEqual(idsWhere((d) => d.hasContactDiskLengthOverride), ['branch', 'trunk']);
});

test('exactly one type records its own edit-history entry', () => {
    // Two would double-record; zero would lose the trunk's before/after entry.
    assert.deepEqual(idsWhere((d) => d.ownsEditHistoryEntry), ['trunk']);
});

test('every descriptor declares all four behaviour flags', () => {
    // An added type defaulting to undefined would read as false at every call
    // site -- silently opting into the generic path everywhere.
    for (const d of SUPPORT_TYPES) {
        for (const flag of [
            'segmentsCarryBothJoints',
            'hasDedicatedSnapPass',
            'hasContactDiskLengthOverride',
            'ownsEditHistoryEntry',
        ] as const) {
            assert.equal(typeof d[flag], 'boolean', `${d.id}.${flag} must be declared`);
        }
    }
});
