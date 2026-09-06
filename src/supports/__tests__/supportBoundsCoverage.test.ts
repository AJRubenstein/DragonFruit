import assert from 'node:assert/strict';
import test from 'node:test';

import { contactEndpointsFor, SUPPORT_TYPES } from '../supportTypeRegistry';
import { knotFields } from '../interaction/shared/selection/selectedIdsByType';

/**
 * What the support-bounds walk in page.tsx has to visit.
 *
 * The walk grew per type, and covered six of the eight: an anchor never
 * expanded a model's bounds, so support-aware dimensions read short for a
 * model held up by anchors alone. It now iterates SUPPORT_TYPES, and these
 * hold the two properties that makes correct -- every type is reachable, and
 * every contact it must measure is declared rather than named.
 */

test('every type declaring a contact exposes it through the registry', () => {
    // The walk reads contact positions only through contactEndpointsFor, so a
    // contact absent here is a contact the bounds never see.
    for (const descriptor of SUPPORT_TYPES) {
        const declared = contactEndpointsFor(descriptor.id).map((c) => c.field).sort();
        assert.deepEqual(
            declared,
            [...descriptor.contactFields].sort(),
            `${descriptor.id}: contactFields and contactEndpointsFor disagree`,
        );
    }
});

test('anchor is a type the walk reaches and has a contact to measure', () => {
    const anchor = SUPPORT_TYPES.find((d) => d.id === 'anchor');
    assert.ok(anchor, 'anchor is still a declared type');
    assert.ok(
        contactEndpointsFor('anchor').length > 0,
        'an anchor contributes a contact, so omitting it understates the bounds',
    );
});

test('each contact declares whether it is a disk or a cone', () => {
    // The two carry their contact diameter in different places, so the walk
    // picks by `kind`. An undeclared kind would silently measure zero.
    for (const descriptor of SUPPORT_TYPES) {
        for (const contact of contactEndpointsFor(descriptor.id)) {
            assert.ok(
                contact.kind === 'disk' || contact.kind === 'cone',
                `${descriptor.id}.${contact.field} has no measurable kind`,
            );
        }
    }
});

test('the knot-to-model index covers every hosted-by-knot edge', () => {
    // knotModelById is built from these fields; a type hosting on a knot but
    // absent here leaves its knots unattributed to any model.
    const hosts = SUPPORT_TYPES.filter((d) => knotFields(d).length > 0).map((d) => d.id);
    assert.ok(hosts.includes('branch'));
    assert.ok(hosts.includes('leaf'));
    assert.ok(hosts.includes('brace'), 'a brace hangs from two knots');
    assert.ok(hosts.includes('kickstand'));

    // A brace declares both ends, which is why it indexes under two knots.
    assert.equal(knotFields(SUPPORT_TYPES.find((d) => d.id === 'brace')!).length, 2);
});
