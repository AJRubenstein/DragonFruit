import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShaftAnchor } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import type { Knot, Roots } from '../types';

/**
 * The bezier handle contexts, which the gizmo builds one per curve endpoint.
 *
 * Five near-identical walks became one loop over the shafted types. Two things
 * that loop derives are load-bearing and invisible to the suite:
 *
 * - the context `id` is a React key, and trunk's alone carries no type prefix;
 * - a first segment with no bottom joint starts at the type's declared lower
 *   endpoint, which is what puts the handle on the shaft rather than at origin.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 1, y: 2, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const HOST_KNOT = { id: 'knot-a', pos: { x: 4, y: 5, z: 6 }, diameter: 1.2 } as Knot;

/** The prefix the walk builds a context id from. */
const prefixFor = (typeId: string) => getSupportTypeDescriptor(typeId as never).bezierContextIdPrefix;

test('trunk context ids are unprefixed; every other type is prefixed', () => {
    // These are React keys. Renaming them remounts every handle, and colliding
    // them merges handles from different supports.
    assert.equal(prefixFor('trunk'), '');

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments || descriptor.id === 'trunk') continue;
        assert.equal(prefixFor(descriptor.id), `${descriptor.id}-`);
    }
});

test('exactly one shafted type is unprefixed, so ids cannot collide', () => {
    const unprefixed = SUPPORT_TYPES
        .filter((d) => d.hasSegments && prefixFor(d.id) === '')
        .map((d) => d.id);
    assert.deepEqual(unprefixed, ['trunk']);
});

test('a plate-rooted shaft anchors its first handle at the root top', () => {
    // The trunk walk built this joint inline as z + diskHeight + coneHeight.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments || descriptor.lower.kind !== 'plateRoot') continue;
        assert.deepEqual(
            resolveShaftAnchor(descriptor.id, { root: ROOT }),
            { x: 1, y: 2, z: 0 + ROOT.diskHeight + ROOT.coneHeight },
            `${descriptor.id} should anchor at the root top`,
        );
    }
});

test('a knot-hosted shaft anchors its first handle at the host knot', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments || descriptor.lower.kind !== 'knot') continue;
        assert.deepEqual(
            resolveShaftAnchor(descriptor.id, { root: ROOT, hostKnot: HOST_KNOT }),
            HOST_KNOT.pos,
            `${descriptor.id} should anchor at its host knot, not a root`,
        );
    }
});

test('a self-contained shaft resolves no anchor, so it keeps its own joints', () => {
    // Twig and stick carry both joints; handing them hosts must not move them.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;
        if (descriptor.lower.kind === 'plateRoot' || descriptor.lower.kind === 'knot') continue;
        assert.equal(
            resolveShaftAnchor(descriptor.id, { root: ROOT, hostKnot: HOST_KNOT }),
            null,
            `${descriptor.id} should not claim an anchor`,
        );
    }
});

test('brace is excluded from the shafted walk', () => {
    // It has no segments; its handles come from its two end knots instead.
    const brace = SUPPORT_TYPES.find((d) => d.id === 'brace')!;
    assert.equal(brace.hasSegments, false);
});
