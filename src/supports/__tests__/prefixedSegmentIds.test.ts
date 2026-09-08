import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePrefixedSegmentId, SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Segment selection ids for a type with no real segments carry a declared
 * prefix. Four call sites parsed it; three spelled the string out, so renaming
 * the type would have left them matching nothing.
 */

const PREFIXED = SUPPORT_TYPES.filter((d) => d.segmentSelectionPrefix);

test('a prefixed id round-trips to its type and entity', () => {
    assert.ok(PREFIXED.length > 0, 'expected at least one type with a segment prefix');

    for (const descriptor of PREFIXED) {
        const parsed = parsePrefixedSegmentId(`${descriptor.segmentSelectionPrefix}entity-1`);

        assert.equal(parsed?.typeId, descriptor.id);
        assert.equal(parsed?.entityId, 'entity-1');
    }
});

test('a plain segment id is not claimed by any type', () => {
    assert.equal(parsePrefixedSegmentId('seg-123'), null);
    assert.equal(parsePrefixedSegmentId(''), null);
});

test('only a type declaring a prefix can claim an id', () => {
    // A bare type id is not a prefix; without this a renamed type could start
    // swallowing plain segment ids.
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.segmentSelectionPrefix) continue;
        assert.equal(
            parsePrefixedSegmentId(`${descriptor.id}:entity-1`),
            null,
            `${descriptor.id} declares no prefix but claimed an id`,
        );
    }
});
