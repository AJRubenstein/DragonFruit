import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SUPPORT_REMOVAL_SHAPES,
    SUPPORT_TYPES,
    type SupportEntityPayload,
    type SupportRemovalResult,
} from '../supportTypeRegistry';
import type { Anchor, Knot, Leaf, Stick, Twig } from '../types';

/**
 * History payload shapes, derived from the registry rather than written out.
 *
 * Twig, stick and anchor each used to have a hand-written pair of payload
 * interfaces -- `{ self }` for the add and `{ self, knots, leaves }` for the
 * removal -- which `SUPPORT_REMOVAL_SHAPES` already declared. The intermediate
 * aliases are gone; these assertions are the real check, and they fail to build
 * if a derived payload stops matching the shape it replaced.
 */

// The shapes the hand-written interfaces had. A derived type that drifts from
// these is a compile error, not a silent change.
const _twigAdd: SupportEntityPayload<'twig'> = { twig: {} as Twig };
const _stickAdd: SupportEntityPayload<'stick'> = { stick: {} as Stick };
const _anchorAdd: SupportEntityPayload<'anchor'> = { anchor: {} as Anchor };

const _twigRemove: SupportRemovalResult<'twig'> = {
    twig: {} as Twig, knots: [] as Knot[], leaves: [] as Leaf[],
};
const _stickRemove: SupportRemovalResult<'stick'> = {
    stick: {} as Stick, knots: [] as Knot[], leaves: [] as Leaf[],
};
const _anchorRemove: SupportRemovalResult<'anchor'> = {
    anchor: {} as Anchor, knots: [] as Knot[], leaves: [] as Leaf[],
};

void _twigAdd; void _stickAdd; void _anchorAdd;
void _twigRemove; void _stickRemove; void _anchorRemove;

test('the derived payloads carry the fields their shape declares', () => {
    // The runtime half: the declaration those types read from still names the
    // fields the assertions above rely on.
    for (const typeId of ['twig', 'stick', 'anchor'] as const) {
        const shape = SUPPORT_REMOVAL_SHAPES[typeId];
        assert.equal(shape.self, typeId, `${typeId}: payload keyed on its own name`);
        assert.deepEqual(
            Object.entries(shape.cascade).sort(),
            [['knots', 'knots'], ['leaves', 'leaves']],
            `${typeId}: cascades knots and leaves`,
        );
    }
});

test('every type declares a removal shape keyed on a real field name', () => {
    // A shape whose `self` was empty would derive a payload with no entity
    // field at all, which no handler could seed from.
    for (const descriptor of SUPPORT_TYPES) {
        const shape = SUPPORT_REMOVAL_SHAPES[descriptor.id];
        assert.ok(shape, `${descriptor.id} declares a shape`);
        assert.ok(shape.self.length > 0, `${descriptor.id} names its entity field`);
    }
});
