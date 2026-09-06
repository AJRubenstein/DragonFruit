import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSegmentEndpoints, resolveShaftAnchor } from '../SupportPrimitives/Knot/segmentEndpoints';
import type { Roots, Segment, Trunk } from '../types';

/**
 * The clamp origin a joint drag starts from.
 *
 * The trunk arm resolves it per segment, not from the shaft anchor: dragging
 * the top joint of segment N clamps against segment N's own start, which is
 * the previous segment's top joint. Only segment 0 starts at the root top.
 * These hold that difference, so the arm is not collapsed into a plain
 * `resolveShaftAnchor` call that would move the origin on every multi-segment
 * trunk.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const segment = (id: string, zBottom: number, zTop: number): Segment => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: zBottom }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: zTop }, diameter: 1 },
} as Segment);

const TRUNK = {
    id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
    segments: [segment('s0', 2, 10), segment('s1', 10, 20)],
} as Trunk;

test('segment 0 starts at the root top, which is the shaft anchor', () => {
    const endpoints = resolveSegmentEndpoints('trunk', TRUNK, TRUNK.segments[0], 0, { root: ROOT });
    assert.deepEqual(endpoints?.start, resolveShaftAnchor('trunk', { root: ROOT }));
    assert.deepEqual(endpoints?.start, { x: 0, y: 0, z: 2 });
});

test('segment 1 starts at segment 0s top joint, not the root top', () => {
    const endpoints = resolveSegmentEndpoints('trunk', TRUNK, TRUNK.segments[1], 1, { root: ROOT });
    assert.deepEqual(endpoints?.start, { x: 0, y: 0, z: 10 });
    assert.notDeepEqual(
        endpoints?.start,
        resolveShaftAnchor('trunk', { root: ROOT }),
        'a per-segment start must not equal the shaft anchor here',
    );
});
