import assert from 'node:assert/strict';
import test from 'node:test';

import { anyContactMatches, contactEndpointsFor, SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Asking every declared contact a question.
 *
 * Interior filtering asked this per type in two places, covering four of the
 * eight and naming each field by hand.
 */

const interior = (contact: unknown) =>
    (contact as { placementSurface?: string } | undefined)?.placementSurface === 'interior';

test('a one-contact type matches on its single contact', () => {
    const trunk = { contactCone: { placementSurface: 'interior' } };
    assert.equal(anyContactMatches('trunk', trunk, interior), true);
    assert.equal(anyContactMatches('trunk', { contactCone: {} }, interior), false);
});

test('a two-contact type matches if either end does', () => {
    for (const [typeId, a, b] of [
        ['twig', 'contactDiskA', 'contactDiskB'],
        ['stick', 'contactConeA', 'contactConeB'],
    ] as const) {
        assert.equal(anyContactMatches(typeId, { [a]: { placementSurface: 'interior' } }, interior), true, `${typeId} lower`);
        assert.equal(anyContactMatches(typeId, { [b]: { placementSurface: 'interior' } }, interior), true, `${typeId} upper`);
        assert.equal(anyContactMatches(typeId, { [a]: {}, [b]: {} }, interior), false, `${typeId} neither`);
    }
});

test('a type with no contacts never matches', () => {
    // Brace and kickstand declare none; their surface comes from elsewhere.
    for (const typeId of ['brace', 'kickstand'] as const) {
        assert.equal(contactEndpointsFor(typeId).length, 0);
        assert.equal(anyContactMatches(typeId, { contactCone: { placementSurface: 'interior' } }, interior), false);
    }
});

test('a missing entity or contact is not a match', () => {
    assert.equal(anyContactMatches('trunk', null, interior), false);
    assert.equal(anyContactMatches('trunk', {}, interior), false);
});

test('every type answers, anchor and kickstand included', () => {
    // The hand-written index covered trunk, branch, twig and stick only.
    for (const descriptor of SUPPORT_TYPES) {
        assert.doesNotThrow(() => anyContactMatches(descriptor.id, {}, interior), descriptor.id);
    }
    assert.equal(contactEndpointsFor('anchor').length, 1, 'an anchor has a contact to test');
});

test('hasOrigin matches the types carrying an origin field', () => {
    // The debug origin overlay reads `origin`; only four types record one, and
    // the renderer consulted originColorFor for exactly those four.
    const withOrigin = SUPPORT_TYPES.filter((d) => d.hasOrigin).map((d) => d.id).sort();
    assert.deepEqual(withOrigin, ['anchor', 'branch', 'leaf', 'trunk']);
});

test('only origin-carrying types take part in origin colouring', () => {
    // Braces, twigs, sticks and kickstands record no origin. Colouring them by
    // it painted them all "no origin" grey, which reads as a fault rather than
    // as not applicable.
    const withoutOrigin = SUPPORT_TYPES.filter((d) => !d.hasOrigin).map((d) => d.id).sort();
    assert.deepEqual(withoutOrigin, ['brace', 'kickstand', 'stick', 'twig']);
});
