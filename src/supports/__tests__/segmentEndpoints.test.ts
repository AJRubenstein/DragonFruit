import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Branch, Knot, Roots, Segment, Trunk, Vec3 } from '../types';

type Endpoints = { start: Vec3; end: Vec3 };

/**
 * The generic walker must agree with the two functions it replaces.
 *
 * Trunk and branch endpoints drive knot dragging, joint gizmos, auto-bracing
 * and grid placement across 13 files, and nothing pinned them. These compare
 * the derived result against the originals case by case, including the
 * fallbacks that only fire on malformed geometry.
 */

const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });

const segment = (id: string, bottomZ: number | null, topZ: number | null): Segment => ({
    id,
    diameter: 1,
    bottomJoint: bottomZ === null ? undefined : joint(`${id}-bj`, bottomZ),
    topJoint: topZ === null ? undefined : joint(`${id}-tj`, topZ),
} as unknown as Segment);

const root = (overrides: Partial<Roots> = {}): Roots => ({
    id: 'root-a',
    modelId: 'model-a',
    transform: { pos: { x: 1, y: 2, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3,
    diskHeight: 0.5,
    coneHeight: 1.5,
    ...overrides,
} as Roots);

const cone = (z: number) => ({
    id: 'cone-a',
    socketJointId: 'socket',
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1,
    height: 1,
    profile: { contactDiameterMm: 0.4, lengthMm: 2 },
});

const hostKnot: Knot = { id: 'knot-a', parentShaftId: 'seg-x', t: 0.5, pos: { x: 5, y: 6, z: 7 }, diameter: 1 } as Knot;

const trunkWith = (segments: Segment[], contactCone?: unknown): Trunk =>
    ({ id: 'trunk-a', modelId: 'model-a', rootId: 'root-a', segments, contactCone } as unknown as Trunk);

const branchWith = (segments: Segment[], contactCone?: unknown): Branch =>
    ({ id: 'branch-a', modelId: 'model-a', parentKnotId: 'knot-a', segments, contactCone } as unknown as Branch);

/** Both joints present, first segment, missing joints, and no contact at all. */
const SEGMENT_CASES: [string, Segment[], number, unknown][] = [
    ['both joints', [segment('s0', 2, 6)], 0, cone(12)],
    ['no bottom joint, first segment', [segment('s0', null, 6)], 0, cone(12)],
    ['no bottom joint, second segment', [segment('s0', 2, 6), segment('s1', null, 9)], 1, cone(12)],
    ['no top joint, falls to contact', [segment('s0', 2, null)], 0, cone(12)],
    ['no top joint, no contact', [segment('s0', 2, null)], 0, undefined],
    ['neither joint', [segment('s0', null, null)], 0, cone(12)],
    ['second segment with no previous top joint', [segment('s0', 2, null), segment('s1', null, 9)], 1, cone(12)],
];

/**
 * Expected endpoints per case, pinned rather than differential.
 *
 * These compared the generic against `getTrunkSegmentEndpoints` and
 * `getBranchSegmentEndpoints`, which had become one-line wrappers around the
 * generic -- so both sides ran the same code and the comparison could not
 * fail. The wrappers are gone; these are the values that implementation
 * produced, so a change to it has to be deliberate.
 *
 * A trunk with no bottom joint starts at its root's top: z = 0 (base) + 0.5
 * (disk) + 1.5 (cone). A branch starts at its host knot, (5, 6, 7).
 */
const EXPECTED: Record<string, { trunk: Endpoints; branch: Endpoints }> = {
    'both joints': {
        trunk: { start: { x: 0, y: 0, z: 2 }, end: { x: 0, y: 0, z: 6 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 0, y: 0, z: 6 } },
    },
    'no bottom joint, first segment': {
        trunk: { start: { x: 1, y: 2, z: 2 }, end: { x: 0, y: 0, z: 6 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 0, y: 0, z: 6 } },
    },
    'no bottom joint, second segment': {
        trunk: { start: { x: 0, y: 0, z: 6 }, end: { x: 0, y: 0, z: 9 } },
        branch: { start: { x: 0, y: 0, z: 6 }, end: { x: 0, y: 0, z: 9 } },
    },
    'no top joint, falls to contact': {
        trunk: { start: { x: 0, y: 0, z: 2 }, end: { x: 0, y: 0, z: 14 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 0, y: 0, z: 14 } },
    },
    'no top joint, no contact': {
        trunk: { start: { x: 0, y: 0, z: 2 }, end: { x: 0, y: 0, z: 12 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 5, y: 6, z: 12 } },
    },
    'neither joint': {
        trunk: { start: { x: 1, y: 2, z: 2 }, end: { x: 0, y: 0, z: 14 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 0, y: 0, z: 14 } },
    },
    'second segment with no previous top joint': {
        trunk: { start: { x: 1, y: 2, z: 2 }, end: { x: 0, y: 0, z: 9 } },
        branch: { start: { x: 5, y: 6, z: 7 }, end: { x: 0, y: 0, z: 9 } },
    },
};

for (const [name, segments, index, contact] of SEGMENT_CASES) {
    test(`trunk endpoints: ${name}`, () => {
        assert.deepEqual(
            resolveSegmentEndpoints('trunk', trunkWith(segments, contact) as never, segments[index], index, { root: root() }),
            EXPECTED[name].trunk,
        );
    });

    test(`branch endpoints: ${name}`, () => {
        assert.deepEqual(
            resolveSegmentEndpoints('branch', branchWith(segments, contact) as never, segments[index], index, { hostKnot }),
            EXPECTED[name].branch,
        );
    });
}

test('the declared lower endpoint decides which host is read', () => {
    // A differential against the originals cannot catch a mis-declared endpoint:
    // both sides read the same descriptor, so they agree on the wrong answer.
    const segments = [segment('s0', null, 6)];

    // A knot-hosted type reads hostKnot and ignores a root.
    const branch = branchWith(segments, cone(12));
    assert.deepEqual(
        resolveSegmentEndpoints('branch', branch as never, segments[0], 0, { hostKnot })?.start,
        { x: 5, y: 6, z: 7 },
        'a branch starts at its host knot',
    );
    assert.equal(
        resolveSegmentEndpoints('branch', branch as never, segments[0], 0, { root: root() }),
        null,
        'a branch handed only a root cannot resolve',
    );

    // A plate-rooted type is the mirror image.
    const trunk = trunkWith(segments, cone(12));
    assert.deepEqual(
        resolveSegmentEndpoints('trunk', trunk as never, segments[0], 0, { root: root() })?.start,
        { x: 1, y: 2, z: 2 },
        'a trunk starts at the top of its root',
    );
    assert.equal(
        resolveSegmentEndpoints('trunk', trunk as never, segments[0], 0, { hostKnot }),
        null,
        'a trunk handed only a knot cannot resolve',
    );
});

test('the declared upper endpoint is what a shaft ends at', () => {
    // Reading contactFields[0] instead would pick the lower contact on a
    // two-contact type.
    // The end is the cone's final socket, so it sits a cone-length above pos.
    const segments = [segment('s0', 2, null)];
    const withCone = resolveSegmentEndpoints(
        'trunk', trunkWith(segments, cone(12)) as never, segments[0], 0, { root: root() },
    );
    const withHigherCone = resolveSegmentEndpoints(
        'trunk', trunkWith(segments, cone(20)) as never, segments[0], 0, { root: root() },
    );
    assert.equal(
        (withHigherCone?.end.z ?? 0) - (withCone?.end.z ?? 0),
        8,
        'the shaft end tracks the declared upper contact',
    );

    // With no contact declared at all it falls back to a fixed stub length.
    const noContact = resolveSegmentEndpoints(
        'trunk', trunkWith(segments) as never, segments[0], 0, { root: root() },
    );
    assert.notEqual(noContact?.end.z, withCone?.end.z);
});

test('a knot upper ends the shaft at the knot it braces', () => {
    // A kickstand is plateRoot->knot: with no top joint it ends at its host
    // knot, not at a contact or the stub. useKnotInteraction did this by hand.
    const segments = [segment('s0', 2, null)];
    const kickstand = {
        id: 'ks-a', modelId: 'model-a', rootId: 'root-a',
        hostKnotId: 'knot-a', hostSegmentId: 'seg-x', hostMinT: 0.2, segments,
    } as unknown as Parameters<typeof resolveSegmentEndpoints>[1];

    const resolved = resolveSegmentEndpoints('kickstand', kickstand, segments[0], 0, {
        root: root(), hostKnot,
    });
    assert.deepEqual(resolved?.end, { x: 5, y: 6, z: 7 }, 'the end is the host knot');

    assert.equal(
        resolveSegmentEndpoints('kickstand', kickstand, segments[0], 0, { root: root() }),
        null,
        'with no host knot there is no end to resolve',
    );
});

test('a segment needing a host it was not given resolves to nothing', () => {
    // Segment 0 has no bottom joint, so it can only start at its declared
    // host. Without one there is no answer, and inventing an origin would put
    // the shaft somewhere arbitrary.
    const segments = [segment('s0', null, 6)];

    assert.equal(
        resolveSegmentEndpoints('trunk', trunkWith(segments, cone(12)) as never, segments[0], 0, { root: null }),
        null,
    );
    assert.equal(
        resolveSegmentEndpoints('branch', branchWith(segments, cone(12)) as never, segments[0], 0, { hostKnot: null }),
        null,
    );
});

test('a root carrying the legacy height field still gives a start', () => {
    // Older roots carried `height` rather than `coneHeight`; the start is the
    // base plus the disk plus that height: 0 + 0.5 + 4.
    const segments = [segment('s0', null, 6)];
    const legacy = root({ coneHeight: undefined as never, height: 4 } as never);

    assert.deepEqual(
        resolveSegmentEndpoints('trunk', trunkWith(segments, cone(12)) as never, segments[0], 0, { root: legacy }),
        { start: { x: 1, y: 2, z: 4.5 }, end: { x: 0, y: 0, z: 6 } },
    );
});

test('self-contained types resolve without any host', () => {
    // Twig, stick and anchor declare segmentsCarryBothJoints, so they read the
    // segment alone -- passing no hosts must still work.
    const segments = [segment('s0', 2, 8)];
    for (const descriptor of SUPPORT_TYPES) {
        // leaf and brace also declare the flag, vacuously -- they have no segments.
        if (!descriptor.segmentsCarryBothJoints || !descriptor.hasSegments) continue;
        const entity = { id: 'x', modelId: 'm', segments };
        assert.deepEqual(
            resolveSegmentEndpoints(descriptor.id, entity as never, segments[0], 0),
            { start: { x: 0, y: 0, z: 2 }, end: { x: 0, y: 0, z: 8 } },
            `${descriptor.id} should resolve from its own joints`,
        );
    }
});

test('every shafted type resolves, and non-shafted ones do not', () => {
    const segments = [segment('s0', 2, 8)];
    for (const descriptor of SUPPORT_TYPES) {
        const entity = { id: 'x', modelId: 'm', segments, rootId: 'root-a', parentKnotId: 'knot-a' };
        const result = resolveSegmentEndpoints(
            descriptor.id, entity as never, segments[0], 0, { root: root(), hostKnot },
        );
        if (descriptor.hasSegments) {
            assert.ok(result, `${descriptor.id} declares segments but resolved nothing`);
        } else {
            assert.equal(result, null, `${descriptor.id} has no segments but resolved endpoints`);
        }
    }
});
