import assert from 'node:assert/strict';
import test from 'node:test';

import {
    removalShapeFor,
    SUPPORT_REMOVAL_SHAPES,
    SUPPORT_TYPES,
    type SupportEntityFor,
    type SupportEntityPayload,
    type SupportRemovalResult,
    type SupportTypeId,
} from '../supportTypeRegistry';

/**
 * History payload shapes, derived from the registry rather than written out:
 * `{ self }` for an add, `{ self, ...cascade }` for a removal, both from the
 * shape each type declares in `SUPPORT_REMOVAL_SHAPES`.
 *
 * These assertions fail to build if a derived payload stops matching its
 * declared shape. Nothing here names a type.
 */

/**
 * An add payload for one type: the field the entity arrives under, carrying that
 * type's entity from the registry's entity mapping.
 */
type ExpectedEntityPayload<T extends SupportTypeId> = {
    [S in (typeof SUPPORT_REMOVAL_SHAPES)[T]['self']]: SupportEntityFor<T>;
};

/**
 * The fields a removal of `T` reports: its own entity field, plus one name per
 * declared cascade entry. An entry declared as an array names several slots
 * rather than one.
 */
type ExpectedRemovalFields<T extends SupportTypeId> =
    | (typeof SUPPORT_REMOVAL_SHAPES)[T]['self']
    | {
        [K in keyof (typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade']]:
            (typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade'][K] extends readonly string[]
                ? (typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade'][K][number]
                : (typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade'][K]
    }[keyof (typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade']];

/** Whether two types are the same, in both directions. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * The declared types whose derived payloads no longer match the shape they
 * declare; empty when every one agrees.
 *
 * The mutual check on `SupportEntityPayload` is what pins the entity: the
 * payload reaches its collection through `SUPPORT_TYPE_COLLECTION` and reports
 * it through `SupportRemovedEntityByCollection`, while the expectation above
 * uses the registry's entity mapping -- so a collection that grows a nested
 * removal form stops matching here. `SupportRemovalResult` must still carry
 * that field, and report exactly the declared field names.
 *
 * Mapped rather than a conditional over the whole union, so every check below
 * is evaluated for one declared type at a time.
 */
type PayloadShapeDrift = {
    [T in SupportTypeId]:
        Same<SupportEntityPayload<T>, ExpectedEntityPayload<T>> extends true
            ? SupportRemovalResult<T> extends ExpectedEntityPayload<T>
                ? Same<keyof SupportRemovalResult<T>, ExpectedRemovalFields<T>> extends true ? never : T
                : T
            : T;
}[SupportTypeId];

/**
 * The compile-time net, over every declared type: `never` when nothing drifts,
 * and the failing type ids otherwise -- which is what this initialiser then
 * fails to satisfy.
 */
const _payloadShapeDrift: Record<PayloadShapeDrift, true> = true;
void _payloadShapeDrift;

test('the derived payloads carry the fields their shape declares', () => {
    // The runtime half: the declaration those types read from names, for every
    // declared type, the field its payload is keyed on and the slots its
    // removal reports.
    for (const descriptor of SUPPORT_TYPES) {
        const shape = removalShapeFor(descriptor.id);
        // The payload is keyed on the type's own name, which is what lets the
        // compile-time expectation above and the derived type move together.
        assert.equal(shape.self, descriptor.id, `${descriptor.id}: payload keyed on its own name`);

        // Every collection a removal drains, and the field each one reports
        // under. Every type takes knots with it -- a shaft it hosts them on, a
        // knot it rides, or a leaf's contact cone -- so a shape that dropped
        // them would leave undo with orphans.
        const drained = Object.keys(shape.cascade);
        assert.ok(drained.length > 0, `${descriptor.id} declares a cascade`);
        assert.ok(drained.includes('knots'), `${descriptor.id} cascades its knots`);
    }
});

test('every type declares a removal shape keyed on a real field name', () => {
    // A shape whose `self` was empty would derive a payload with no entity
    // field at all, which no handler could seed from.
    for (const descriptor of SUPPORT_TYPES) {
        const shape = removalShapeFor(descriptor.id);
        assert.ok(shape, `${descriptor.id} declares a shape`);
        assert.ok(shape.self.length > 0, `${descriptor.id} names its entity field`);
    }
});
