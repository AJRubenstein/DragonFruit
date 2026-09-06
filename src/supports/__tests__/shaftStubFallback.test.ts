import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import type { Knot, Roots, Segment } from '../types';

/**
 * How long a shaft runs when nothing declares its far end.
 *
 * The length is `shaftFallback.stubLengthMm`, which differs per type: trunk
 * declares 10, the rest 5. `resolveSegmentEndpoints` used one hardcoded 10 for
 * all of them, so the joint-split path in page.tsx wrote the per-type numbers
 * out again by hand. These hold the declared value, so the two cannot drift.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const HOST_KNOT = { id: 'knot-a', pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as Knot;

/** One segment with a bottom joint and no top joint, so the far end falls back. */
const stub = (id: string): Segment => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 2 }, diameter: 1 },
} as Segment);

for (const descriptor of SUPPORT_TYPES) {
    if (!descriptor.hasSegments) continue;
    // A type ending at a knot resolves its end from the host, never a stub.
    if (descriptor.upper.kind === 'knot') continue;

    test(`a ${descriptor.id} stub runs its declared ${descriptor.shaftFallback.stubLengthMm}mm`, () => {
        const segment = stub(`seg-${descriptor.id}`);
        const entity = { id: `${descriptor.id}-a`, segments: [segment] };

        const endpoints = resolveSegmentEndpoints(
            descriptor.id, entity as never, segment, 0,
            { root: ROOT, hostKnot: HOST_KNOT },
        );

        assert.ok(endpoints, `${descriptor.id}: no endpoints resolved`);
        assert.equal(
            endpoints.end.z - endpoints.start.z,
            getSupportTypeDescriptor(descriptor.id).shaftFallback.stubLengthMm,
            `${descriptor.id} did not use its declared stub length`,
        );
    });
}
