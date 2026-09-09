import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Removing a joint records an update entry for the types that declare one and
 * selects the owning support. The manager branched on three result variants,
 * each naming its own id field; nothing covered it, so breaking the trunk
 * branch left the whole suite green.
 */

const SOURCE = readFileSync(
    new URL('../../features/supports/useSupportInteractionManager.ts', import.meta.url),
    'utf8',
);

test('whether a joint removal records history comes from the registry', () => {
    assert.match(
        SOURCE,
        /if \(recordHistory && descriptor\.historyUpdate\)/,
        'the manager no longer asks the registry whether an update is recorded',
    );
});

test('exactly trunk and branch declare an update action', () => {
    // What the guard depends on. A third type gaining one must also gain a
    // push, since the payload map is keyed per action.
    assert.deepEqual(
        SUPPORT_TYPES.filter((d) => d.historyUpdate).map((d) => d.id).sort(),
        ['branch', 'trunk'],
    );
});

test('kickstand records no update, which is why it only selects', () => {
    assert.equal(getSupportTypeDescriptor('kickstand').historyUpdate, undefined);
});

test('the result no longer names a per-type id field', () => {
    // trunkId / branchId / kickstandId were three names for one thing; a
    // fourth shafted type would have needed a fourth branch.
    for (const field of ['result.trunkId', 'result.branchId', 'result.kickstandId']) {
        assert.ok(!SOURCE.includes(field), `${field} is back; the result should carry one id`);
    }
    assert.ok(SOURCE.includes('setSelectedId(result.id)'), 'the owner is no longer selected by id');
});

test('the joint-removal description names the type', () => {
    // Derived from `singular`, so a ninth type reads correctly unlisted.
    assert.match(SOURCE, /Delete \$\{descriptor\.singular\} joint/);
});

test('the parent-knot hotkey covers types with one host edge', () => {
    // `E` walks from a support to the knot it hangs from. Derived from the
    // declared edges, which adds kickstand -- it hangs from a host knot like a
    // branch does. Brace is excluded: two knot edges, no single parent.
    const oneHost = SUPPORT_TYPES.filter((d) => d.edges
        .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy').length === 1);

    assert.deepEqual(oneHost.map((d) => d.id).sort(), ['branch', 'kickstand', 'leaf']);

    const brace = getSupportTypeDescriptor('brace').edges
        .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy');
    assert.equal(brace.length, 2, 'a brace hangs from two knots, so it has no single parent');
});
