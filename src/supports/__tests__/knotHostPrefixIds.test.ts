import assert from 'node:assert/strict';
import test from 'node:test';

import { knotHostId, parseKnotHostId, SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * A knot rides either a real shaft segment or a pseudo-shaft whose prefix its
 * host type declares. Spelling those prefixes out is the widest remaining
 * rename hazard in the codebase: renaming leaf leaves every `'leafCone:'`
 * literal pointing at nothing, with tsc green.
 */

const HOSTS = SUPPORT_TYPES.filter((d) => d.knotHostPrefix);

test('a pseudo-shaft id round-trips through the registry', () => {
    assert.ok(HOSTS.length > 0, 'expected at least one pseudo-shaft host type');

    for (const descriptor of HOSTS) {
        const id = knotHostId(descriptor.id, 'entity-1');
        const parsed = parseKnotHostId(id);

        assert.equal(parsed?.typeId, descriptor.id, `${descriptor.id} did not round-trip`);
        assert.equal(parsed?.entityId, 'entity-1');
    }
});

test('exactly leaf and brace host knots on a pseudo-shaft', () => {
    assert.deepEqual(HOSTS.map((d) => d.id).sort(), ['brace', 'leaf']);
});

test('a real segment id belongs to no pseudo-shaft host', () => {
    assert.equal(parseKnotHostId('trunk-a-seg'), null);
    assert.equal(parseKnotHostId(''), null);
});

test('building an id for a type without a prefix is refused', () => {
    // Silently returning `entityId` would produce an id that parses as a real
    // segment, which is worse than failing.
    const shafted = SUPPORT_TYPES.find((d) => !d.knotHostPrefix);
    assert.ok(shafted, 'expected a type whose knots ride real segments');
    assert.throws(() => knotHostId(shafted!.id, 'entity-1'), /knotHostPrefix/);
});

test('the two prefix vocabularies stay distinct', () => {
    // knotHostPrefix and segmentSelectionPrefix agree for brace by
    // coincidence; leaf declares only the former. Deriving one from the other
    // would count every leaf as a selectable segment.
    const leaf = getSupportTypeDescriptor('leaf');
    assert.ok(leaf.knotHostPrefix, 'leaf hosts knots on its contact cone');
    assert.equal(leaf.segmentSelectionPrefix, undefined, 'a leaf cone is not a selectable segment');
});
