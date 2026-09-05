import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSupportRenderLookup } from '../interaction/supportRenderLookupMath';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Which support a contact primitive belongs to.
 *
 * `supportIdByContactDiskId` is how a click on a contact cone or disk finds
 * the support it belongs to. It was five hand-written loops -- trunk, branch,
 * leaf, twig, stick -- so an anchor's contact cone was in no index, and
 * clicking one resolved to nothing.
 *
 * Now driven by the declared `contactFields`, which covers six types.
 */

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const cone = (id: string) => ({
    id,
    pos: { x: 0, y: 0, z: 4 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

const diskOf = (id: string) => ({
    id, pos: { x: 0, y: 0, z: 4 },
    surfaceNormal: { x: 0, y: 0, z: 1 }, coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.4,
    profile: { type: 'disk', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

/** An empty store with every collection present. */
function emptyState(): SupportState {
    const state = {
        roots: {}, knots: {},
        selectedId: null, hoveredId: null,
        selectedCategory: null, hoveredCategory: 'none', interactionWarning: null,
    } as unknown as SupportState;
    for (const descriptor of SUPPORT_TYPES) {
        (state as unknown as Record<string, unknown>)[descriptor.location.key] = {};
    }
    return state;
}

/** One entity of `typeId` carrying a contact primitive in each declared field. */
function withContacts(typeId: string): { state: SupportState; contactIds: string[] } {
    const state = emptyState();
    const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;

    const entity: Record<string, unknown> = {
        id: `${typeId}-a`, modelId: 'model-a', typeId,
        segments: descriptor.hasSegments ? [seg(`${typeId}-s`)] : undefined,
    };

    const contactIds: string[] = [];
    for (const field of descriptor.contactFields) {
        const contactId = `${typeId}-${field}`;
        contactIds.push(contactId);
        entity[field] = field.toLowerCase().includes('disk') ? diskOf(contactId) : cone(contactId);
    }

    (state as unknown as Record<string, Record<string, unknown>>)[descriptor.location.key][`${typeId}-a`] = entity;
    return { state, contactIds };
}

test('every declared contact resolves back to its support', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.contactFields.length === 0) continue;

        const { state, contactIds } = withContacts(descriptor.id);
        const lookup = computeSupportRenderLookup({ state });

        for (const contactId of contactIds) {
            assert.equal(
                lookup.supportIdByContactDiskId[contactId],
                `${descriptor.id}-a`,
                `${descriptor.id}: ${contactId} is in no index`,
            );
        }
    }
});

test('an anchor contact is indexed, which the hand-written loops missed', () => {
    // Named separately because it is the regression: anchor declares a
    // contactCone like a trunk, but was absent from the five loops.
    const { state, contactIds } = withContacts('anchor');
    const lookup = computeSupportRenderLookup({ state });

    assert.equal(contactIds.length, 1);
    assert.equal(lookup.supportIdByContactDiskId[contactIds[0]], 'anchor-a');
});

test('a type declaring no contacts contributes none', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.contactFields.length > 0) continue;

        const { contactIds } = withContacts(descriptor.id);
        assert.equal(contactIds.length, 0, `${descriptor.id} should declare no contacts`);
    }
});

test('a knot-hosted support indexes the knot it hangs from', () => {
    const state = emptyState();
    (state as unknown as Record<string, Record<string, unknown>>).leaves['leaf-a'] = {
        id: 'leaf-a', modelId: 'model-a', typeId: 'leaf',
        parentKnotId: 'knot-a', contactCone: cone('leaf-cone'),
    };

    const lookup = computeSupportRenderLookup({ state });
    assert.equal(lookup.supportIdByKnotId['knot-a'], 'leaf-a');
    assert.equal(lookup.entityModelIdByKnotId['knot-a'], 'model-a');
});
