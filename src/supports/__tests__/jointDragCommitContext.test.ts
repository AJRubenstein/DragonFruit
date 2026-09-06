import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShaftAnchor } from '../SupportPrimitives/Knot/segmentEndpoints';
import { JOINT_DRAG_COMMIT_TYPES } from '../SupportPrimitives/Joint/jointDragController';
import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import type { Knot, Roots } from '../types';

/**
 * The clamp origin a joint-drag commit falls back to, per type.
 *
 * The commit path resolves it from the type's declared lower endpoint. These
 * hold that derivation against what each arm computed by hand, so a wrong
 * endpoint moves a dragged joint rather than passing silently.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 2, y: -3, z: 1 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const HOST_KNOT = {
    id: 'knot-a', parentShaftId: 'seg-1', t: 0.5,
    pos: { x: 7, y: 8, z: 9 }, diameter: 1,
} as Knot;

/** What the trunk and kickstand arms each computed inline. */
const rootTopByHand = (root: Roots) => ({
    x: root.transform.pos.x,
    y: root.transform.pos.y,
    z: root.transform.pos.z + root.diskHeight + root.coneHeight,
});

test('a trunk commit clamps from its root top', () => {
    assert.deepEqual(
        resolveShaftAnchor('trunk', { root: ROOT, hostKnot: HOST_KNOT }),
        rootTopByHand(ROOT),
    );
});

test('a kickstand commit clamps from the same root top', () => {
    // The kickstand arm wrote `rPos.z + diskHeight + coneHeight` out again.
    assert.deepEqual(
        resolveShaftAnchor('kickstand', { root: ROOT, hostKnot: HOST_KNOT }),
        rootTopByHand(ROOT),
    );
});

test('a branch commit clamps from its parent knot, not from a root', () => {
    // The branch arm passed no root at all; handed both, the declared endpoint
    // still has to pick the knot.
    assert.deepEqual(
        resolveShaftAnchor('branch', { root: ROOT, hostKnot: HOST_KNOT }),
        HOST_KNOT.pos,
    );
});

test('the three commit types resolve an anchor; the others do not', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const anchor = resolveShaftAnchor(descriptor.id, { root: ROOT, hostKnot: HOST_KNOT });

        if (JOINT_DRAG_COMMIT_TYPES.has(descriptor.id)) {
            assert.ok(anchor, `${descriptor.id} commits a joint drag but has no anchor`);
        } else if (descriptor.lower.kind !== 'plateRoot' && descriptor.lower.kind !== 'knot') {
            assert.equal(anchor, null, `${descriptor.id} should not claim an anchor`);
        }
    }
});

test('every joint-drag commit type is shafted and declares a lower host', () => {
    // The collapsed arm reads `rootId` or `parentKnotId` off the entity, so a
    // type joining this set without one would clamp from nothing.
    for (const typeId of JOINT_DRAG_COMMIT_TYPES) {
        const descriptor = getSupportTypeDescriptor(typeId);
        assert.ok(descriptor.hasSegments, `${typeId} has no shaft to drag`);
        assert.ok(
            descriptor.lower.kind === 'plateRoot' || descriptor.lower.kind === 'knot',
            `${typeId} commits a drag but declares lower.kind=${descriptor.lower.kind}`,
        );
    }
});
