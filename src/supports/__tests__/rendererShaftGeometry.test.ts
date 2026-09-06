import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Knot, Roots, Segment } from '../types';

/**
 * The shaft geometry a renderer draws, against the shared resolver.
 *
 * Trunk, branch and kickstand each walk their segments with a local
 * `currentStart` that chains from the previous end, while stick reads the
 * joints. `resolveSegmentEndpoints` already serves the slicer; these hold that
 * it produces the same points, so the renderers can use it too.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 2, y: -3, z: 1 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const HOST_KNOT = {
    id: 'knot-a', parentShaftId: 'seg-x', t: 0.5,
    pos: { x: 9, y: 9, z: 14 }, diameter: 1,
} as Knot;

const joint = (id: string, z: number) => ({ id, pos: { x: 2, y: -3, z }, diameter: 1 });

/**
 * A shaft shaped the way the builders make them: segment 0 has no bottom
 * joint, adjacent segments share one joint object, and the last has no top.
 */
function shaft(prefix: string, count: number): Segment[] {
    const mids = Array.from({ length: count - 1 }, (_, i) => joint(`${prefix}-j${i}`, 4 + i * 3));
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-s${i}`,
        diameter: 1,
        bottomJoint: i === 0 ? undefined : mids[i - 1],
        topJoint: i === count - 1 ? undefined : mids[i],
    })) as Segment[];
}

/** The chain a renderer walks by hand: start at the anchor, then follow ends. */
function chainedEndpoints(
    segments: Segment[],
    anchor: { x: number; y: number; z: number },
    terminal: { x: number; y: number; z: number },
) {
    let start = anchor;
    return segments.map((segment) => {
        const end = segment.topJoint ? segment.topJoint.pos : terminal;
        const pair = { start, end };
        start = end;
        return pair;
    });
}

const rootTop = {
    x: ROOT.transform.pos.x,
    y: ROOT.transform.pos.y,
    z: ROOT.transform.pos.z + ROOT.diskHeight + ROOT.coneHeight,
};

test('a kickstand shaft resolves to the same points the renderer chains', () => {
    const segments = shaft('ks', 4);
    const entity = { id: 'ks-1', segments } as unknown as { segments: Segment[] };

    const chained = chainedEndpoints(segments, rootTop, HOST_KNOT.pos);

    segments.forEach((segment, index) => {
        const resolved = resolveSegmentEndpoints('kickstand', entity, segment, index, {
            root: ROOT, hostKnot: HOST_KNOT,
        });
        assert.ok(resolved, `segment ${index} did not resolve`);
        assert.deepEqual(resolved.start, chained[index].start, `segment ${index} start`);
        assert.deepEqual(resolved.end, chained[index].end, `segment ${index} end`);
    });
});

test('a trunk shaft starts at its root top', () => {
    const segments = shaft('tr', 3);
    const entity = { id: 'tr-1', segments } as unknown as { segments: Segment[] };

    const first = resolveSegmentEndpoints('trunk', entity, segments[0], 0, { root: ROOT });
    assert.deepEqual(first?.start, rootTop);
});

test('a branch shaft starts at its parent knot', () => {
    const segments = shaft('br', 3);
    const entity = { id: 'br-1', segments } as unknown as { segments: Segment[] };

    const first = resolveSegmentEndpoints('branch', entity, segments[0], 0, { hostKnot: HOST_KNOT });
    assert.deepEqual(first?.start, HOST_KNOT.pos);
});

test('each segment after the first continues from the one below', () => {
    // The invariant the chain and the resolver have to agree on; a gap here
    // would draw a shaft in pieces.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const segments = shaft(descriptor.id, 3);
        const entity = { id: `${descriptor.id}-1`, segments } as unknown as { segments: Segment[] };
        const hosts = { root: ROOT, hostKnot: HOST_KNOT };

        for (let i = 1; i < segments.length; i += 1) {
            const previous = resolveSegmentEndpoints(descriptor.id, entity, segments[i - 1], i - 1, hosts);
            const current = resolveSegmentEndpoints(descriptor.id, entity, segments[i], i, hosts);
            if (!previous || !current) continue;

            assert.deepEqual(
                current.start, previous.end,
                `${descriptor.id} segment ${i} does not continue from segment ${i - 1}`,
            );
        }
    }
});
