import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * A knot host either rides real segments or a declared pseudo-shaft. The knot
 * drag path used one `containerType !== 'leafCone'` helper for two different
 * questions -- whether the host has segments, and whether a knot takes its
 * diameter from the shaft -- which agree for every type except brace.
 */

test('a type declaring knotHostPrefix has no real segments', () => {
    // What lets the pseudo-shaft check stand in for the old entity-shape guard.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.knotHostPrefix) continue;
        assert.equal(
            descriptor.hasSegments,
            false,
            `${descriptor.id} declares a knotHostPrefix and real segments; the knot host predicate assumes it cannot be both`,
        );
    }
});

test('exactly leaf and brace ride a pseudo-shaft', () => {
    assert.deepEqual(
        SUPPORT_TYPES.filter((d) => d.knotHostPrefix).map((d) => d.id).sort(),
        ['brace', 'leaf'],
    );
});

test('brace is the type the two questions disagree about', () => {
    // It takes a shaft diameter (it is not a leaf cone) but has no segments.
    const brace = getSupportTypeDescriptor('brace');
    assert.ok(brace.knotHostPrefix, 'brace should ride a pseudo-shaft');
    assert.equal(brace.hasSegments, false, 'brace should carry no real segments');
});
