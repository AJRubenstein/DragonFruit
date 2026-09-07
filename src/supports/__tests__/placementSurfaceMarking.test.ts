import assert from 'node:assert/strict';
import test from 'node:test';

import { contactEndpointsFor, SUPPORT_TYPES } from '../supportTypeRegistry';
import { markPlacementSurface } from '../PlacementLogic/placementSurface';

/**
 * Stamping the placement surface onto a support's contacts.
 *
 * Five per-type markers named their own fields -- `contactCone`,
 * `contactConeA`/`B`, `contactDiskA`/`B` -- so a type whose contacts changed
 * silently stopped being marked, and interior/exterior filtering then treated
 * it as unknown. The stamp now walks the declared endpoints; this holds that
 * the declaration covers what the markers named by hand.
 */

test('every contact a type declares gets the stamp', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const contacts = contactEndpointsFor(descriptor.id);
        if (contacts.length === 0) continue;

        const entity = Object.fromEntries(
            contacts.map(({ field }) => [field, { id: `${field}-1` }]),
        );

        const marked = markPlacementSurface(descriptor.id, entity, 'interior') as Record<string, { placementSurface?: string }>;
        for (const { field } of contacts) {
            assert.equal(
                marked[field].placementSurface,
                'interior',
                `${descriptor.id}.${field} was not stamped`,
            );
        }
    }
});

test('the fields the hand-written markers named are all declared', () => {
    // trunk/branch/leaf/anchor named `contactCone`; stick named
    // contactConeA/B; twig named contactDiskA/B.
    const byHand: Record<string, string[]> = {
        trunk: ['contactCone'],
        branch: ['contactCone'],
        leaf: ['contactCone'],
        anchor: ['contactCone'],
        stick: ['contactConeA', 'contactConeB'],
        twig: ['contactDiskA', 'contactDiskB'],
    };

    for (const [typeId, fields] of Object.entries(byHand)) {
        const declared = contactEndpointsFor(typeId as never).map((c) => c.field).sort();
        assert.deepEqual(declared, fields.sort(), `${typeId}: declared contacts differ from the old marker`);
    }
});

test('a missing contact is skipped rather than invented', () => {
    const stick = { contactConeA: { id: 'a' } };
    const marked = markPlacementSurface('stick', stick, 'exterior') as Record<string, unknown>;
    assert.ok(marked.contactConeA, 'the present contact is stamped');
    assert.equal(marked.contactConeB, undefined, 'an absent contact must not be created');
});
