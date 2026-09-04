import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SUPPORT_TYPES,
    type SupportEndpoint,
    type SupportTypeDescriptor,
} from '../supportTypeRegistry';

/**
 * The declared endpoint vocabulary, cross-checked against the older flags it
 * overlaps -- `ownsRoot`, the knot edges, `contactFields` -- so the two cannot
 * drift while both exist.
 */

const byId = (id: string): SupportTypeDescriptor => {
    const descriptor = SUPPORT_TYPES.find((d) => d.id === id);
    assert.ok(descriptor, `no descriptor for ${id}`);
    return descriptor;
};

const ends = (d: SupportTypeDescriptor): SupportEndpoint[] => [d.lower, d.upper];

test('every type declares both ends', () => {
    for (const descriptor of SUPPORT_TYPES) {
        for (const end of ends(descriptor)) {
            assert.ok(end, `${descriptor.id} must declare both ends`);
            assert.ok(end.kind, `${descriptor.id} endpoint needs a kind`);
        }
    }
});

test('a contact endpoint names the field it lives on', () => {
    // Without the field there is nothing to read the primitive from.
    for (const descriptor of SUPPORT_TYPES) {
        for (const end of ends(descriptor)) {
            if (end.kind === 'cone' || end.kind === 'disk' || end.kind === 'inlineRoot') {
                assert.ok(end.field, `${descriptor.id} ${end.kind} endpoint needs a field`);
            }
        }
    }
});

test('a linked endpoint takes its field from a declared edge, not its own', () => {
    // plateRoot and knot are already edges; duplicating the field would be a
    // second source of truth for the same link.
    for (const descriptor of SUPPORT_TYPES) {
        for (const end of ends(descriptor)) {
            if (end.kind === 'plateRoot' || end.kind === 'knot' || end.kind === 'none') {
                assert.equal(end.field, undefined, `${descriptor.id} ${end.kind} must not name a field`);
            }
        }
    }
});

test('declared contact endpoints match contactFields exactly', () => {
    // Both are still read; if they disagreed a consumer would get a different
    // endpoint depending which it asked.
    for (const descriptor of SUPPORT_TYPES) {
        const declared = ends(descriptor)
            .filter((e) => e.kind === 'cone' || e.kind === 'disk')
            .map((e) => e.field);
        assert.deepEqual(
            declared,
            [...descriptor.contactFields],
            `${descriptor.id}: endpoints and contactFields disagree`,
        );
    }
});

test('a plateRoot endpoint agrees with ownsRoot', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const hasPlateRoot = ends(descriptor).some((e) => e.kind === 'plateRoot');
        assert.equal(hasPlateRoot, descriptor.ownsRoot, `${descriptor.id}: plateRoot vs ownsRoot`);
    }
});

test('a knot endpoint agrees with the declared knot edges', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const knotEnds = ends(descriptor).filter((e) => e.kind === 'knot').length;
        const knotEdges = descriptor.edges.filter(
            (e) => e.to === 'knots' && e.ownership === 'hostedBy',
        ).length;
        assert.equal(knotEnds, knotEdges, `${descriptor.id}: knot endpoints vs knot edges`);
    }
});

test('an inlineRoot type owns no Roots row', () => {
    // The whole point of inlining is that there is no separate row to own.
    for (const descriptor of SUPPORT_TYPES) {
        if (ends(descriptor).some((e) => e.kind === 'inlineRoot')) {
            assert.equal(descriptor.ownsRoot, false, `${descriptor.id} inlines its root`);
        }
    }
});

test('the vocabulary is closed over the current types', () => {
    // If a type ever needs a seventh kind, this fails and the plan needs
    // revisiting rather than a quiet addition.
    const used = new Set(SUPPORT_TYPES.flatMap((d) => ends(d).map((e) => e.kind)));
    assert.deepEqual(
        [...used].sort(),
        ['cone', 'disk', 'inlineRoot', 'knot', 'plateRoot'],
        'unexpected endpoint kinds in use',
    );
});

test('the eight types are eight distinct endpoint pairs', () => {
    // The thesis: a type IS its endpoint pair plus whether a shaft joins them.
    // Two types sharing a signature would be the same type.
    const signature = (d: SupportTypeDescriptor) =>
        `${d.lower.kind}->${d.upper.kind}${d.hasSegments ? '+shaft' : ''}`;

    const seen = new Map<string, string>();
    for (const descriptor of SUPPORT_TYPES) {
        const key = signature(descriptor);
        const clash = seen.get(key);
        assert.equal(clash, undefined, `${descriptor.id} and ${clash} share signature ${key}`);
        seen.set(key, descriptor.id);
    }
    assert.equal(seen.size, SUPPORT_TYPES.length);
});

test('the signatures are the ones the plan records', () => {
    const actual = Object.fromEntries(
        SUPPORT_TYPES.map((d) => [d.id, `${d.lower.kind}->${d.upper.kind}${d.hasSegments ? '+shaft' : ''}`]),
    );
    assert.deepEqual(actual, {
        trunk: 'plateRoot->cone+shaft',
        branch: 'knot->cone+shaft',
        leaf: 'knot->cone',
        twig: 'disk->disk+shaft',
        stick: 'cone->cone+shaft',
        brace: 'knot->knot',
        anchor: 'inlineRoot->cone+shaft',
        kickstand: 'plateRoot->knot+shaft',
    });
});

test('a two-contact type declares its ends in order', () => {
    // stickBuilder sorts its ends on z and twigBuilder binds A to the segment
    // bottomJoint, so A is always the lower end -- but neither says so where a
    // reader of the type would look.
    for (const id of ['twig', 'stick']) {
        const descriptor = byId(id);
        assert.match(descriptor.lower.field ?? '', /A$/, `${id} lower should be the A contact`);
        assert.match(descriptor.upper.field ?? '', /B$/, `${id} upper should be the B contact`);
    }
});

test('a contact at both ends is a contact at both ends', () => {
    // Twig and stick are a shaft with a contact at each end -- never one.
    // Their interfaces make both non-optional, unlike contactCone? elsewhere.
    for (const id of ['twig', 'stick']) {
        const descriptor = byId(id);
        assert.equal(descriptor.hasSegments, true, `${id} has a shaft`);
        assert.equal(descriptor.contactFields.length, 2, `${id} has two contacts`);
        for (const end of ends(descriptor)) {
            assert.ok(end.kind === 'cone' || end.kind === 'disk', `${id} ${end.kind} should be a contact`);
        }
    }
});
