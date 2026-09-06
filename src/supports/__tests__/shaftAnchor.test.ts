import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShaftAnchor } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Knot, Roots } from '../types';

/**
 * Where a shaft is anchored, which is what the joint-drag clamp measures from.
 *
 * The drag derived this per type: a trunk from its root's top, a branch from
 * its parent knot, a kickstand from the same root top written out again.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 2, y: -3, z: 1 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const KNOT = {
    id: 'knot-a', parentShaftId: 'seg-1', t: 0.5,
    pos: { x: 7, y: 8, z: 9 }, diameter: 1,
} as Knot;

/** The root-top the trunk and kickstand drags each computed by hand. */
const ROOT_TOP = {
    x: ROOT.transform.pos.x,
    y: ROOT.transform.pos.y,
    z: ROOT.transform.pos.z + ROOT.diskHeight + ROOT.coneHeight,
};

test('a plate-rooted type anchors at its root top', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.lower.kind !== 'plateRoot') continue;
        assert.deepEqual(
            resolveShaftAnchor(descriptor.id, { root: ROOT }),
            ROOT_TOP,
            `${descriptor.id} should anchor at the root top`,
        );
    }
});

test('a knot-hosted type anchors at its host knot', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.lower.kind !== 'knot') continue;
        assert.deepEqual(
            resolveShaftAnchor(descriptor.id, { hostKnot: KNOT }),
            KNOT.pos,
            `${descriptor.id} should anchor at its host knot`,
        );
    }
});

test('a self-contained shaft has no anchor of its own', () => {
    // Twig and stick carry both joints on the segment, so nothing outside it
    // positions the shaft.
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.lower.kind === 'plateRoot' || descriptor.lower.kind === 'knot') continue;
        assert.equal(
            resolveShaftAnchor(descriptor.id, { root: ROOT, hostKnot: KNOT }),
            null,
            `${descriptor.id} should not claim an anchor`,
        );
    }
});

test('a missing host yields no anchor rather than a wrong one', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(resolveShaftAnchor(descriptor.id, {}), null, descriptor.id);
    }
});

test('a root without finite disk or cone heights still anchors at its position', () => {
    const bare = {
        ...ROOT,
        diskHeight: Number.NaN,
        coneHeight: Number.NaN,
    } as Roots;

    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.lower.kind !== 'plateRoot') continue;
        assert.deepEqual(resolveShaftAnchor(descriptor.id, { root: bare }), ROOT.transform.pos);
    }
});
