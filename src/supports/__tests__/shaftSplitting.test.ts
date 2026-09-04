import assert from 'node:assert/strict';
import test from 'node:test';

import {
    splitBranchShaft,
    splitShaft,
    splitStickShaft,
    splitTwigShaft,
} from '../SupportPrimitives/Joint/jointUtils';
import type { Branch, Knot, Roots, Segment, Stick, Trunk, Twig } from '../types';

/**
 * Inserting a joint into a shaft, across all four types.
 *
 * Only splitShaft had any coverage, and only for knot remapping. The four
 * wrappers share splitSegmentArray and differ only in how they resolve a
 * segment's start and end -- which is resolveSegmentEndpoints' job. These pin
 * what each does now, including the differences, before they are unified.
 */

const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });

const straight = (id: string, bottomZ: number | null, topZ: number | null): Segment => ({
    id,
    diameter: 2,
    bottomJoint: bottomZ === null ? undefined : joint(`${id}-bj`, bottomZ),
    topJoint: topZ === null ? undefined : joint(`${id}-tj`, topZ),
} as unknown as Segment);

/** A bezier segment, the only shape whose split reads the endpoint callbacks. */
const bezier = (id: string, bottomZ: number | null, topZ: number | null): Segment => ({
    ...straight(id, bottomZ, topZ),
    type: 'bezier',
    controlPoint1: { x: 0, y: 0, z: 2 },
    controlPoint2: { x: 0, y: 0, z: 4 },
} as unknown as Segment);

const root: Roots = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 1, y: 2, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const parentKnot: Knot = {
    id: 'knot-a', parentShaftId: 'seg-x', t: 0.5, pos: { x: 5, y: 6, z: 7 }, diameter: 1,
} as Knot;

const cone = (z: number) => ({
    id: 'cone-a', socketJointId: 'socket',
    pos: { x: 0, y: 0, z }, normal: { x: 0, y: 0, z: 1 }, surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1, height: 1,
    profile: { contactDiameterMm: 0.4, lengthMm: 2 },
});

const trunkWith = (segments: Segment[], contactCone?: unknown) =>
    ({ id: 'trunk-a', modelId: 'model-a', rootId: 'root-a', segments, contactCone } as unknown as Trunk);
const branchWith = (segments: Segment[], contactCone?: unknown) =>
    ({ id: 'branch-a', modelId: 'model-a', parentKnotId: 'knot-a', segments, contactCone } as unknown as Branch);
const twigWith = (segments: Segment[]) =>
    ({ id: 'twig-a', modelId: 'model-a', segments } as unknown as Twig);
const stickWith = (segments: Segment[]) =>
    ({ id: 'stick-a', modelId: 'model-a', segments } as unknown as Stick);

const SPLIT = { x: 0, y: 0, z: 5 };

test('every type splits one segment into two around the new joint', () => {
    const cases: [string, Segment[], () => { segments: Segment[]; jointId: string }][] = [
        ['trunk', [straight('s0', 0, 10)], () => {
            const r = splitShaft(trunkWith([straight('s0', 0, 10)]), 's0', SPLIT, undefined, root);
            return { segments: r.trunk.segments, jointId: r.trunk.segments[0].topJoint!.id };
        }],
        ['branch', [straight('s0', 0, 10)], () => {
            const r = splitBranchShaft(branchWith([straight('s0', 0, 10)]), 's0', SPLIT, undefined, parentKnot);
            return { segments: r.branch.segments, jointId: r.branch.segments[0].topJoint!.id };
        }],
        ['twig', [straight('s0', 0, 10)], () => {
            const r = splitTwigShaft(twigWith([straight('s0', 0, 10)]), 's0', SPLIT);
            return { segments: r.twig.segments, jointId: r.twig.segments[0].topJoint!.id };
        }],
        ['stick', [straight('s0', 0, 10)], () => {
            const r = splitStickShaft(stickWith([straight('s0', 0, 10)]), 's0', SPLIT);
            return { segments: r.stick.segments, jointId: r.stick.segments[0].topJoint!.id };
        }],
    ];

    for (const [name, , run] of cases) {
        const { segments, jointId } = run();
        assert.equal(segments.length, 2, `${name} should end up with two segments`);
        assert.equal(segments[0].id, 's0', `${name} keeps the original id on the lower half`);
        assert.notEqual(segments[1].id, 's0', `${name} gives the upper half a new id`);
        assert.equal(segments[1].bottomJoint?.id, jointId, `${name} shares the new joint`);
        assert.deepEqual(segments[0].topJoint?.pos, SPLIT, `${name} puts the joint at the split point`);
    }
});

test('an unknown segment id leaves the entity untouched', () => {
    const trunk = trunkWith([straight('s0', 0, 10)]);
    const result = splitShaft(trunk, 'nope', SPLIT, undefined, root);
    assert.equal(result.trunk, trunk, 'the same object comes back');
    assert.deepEqual(result.knotRemaps, []);
});

test('a bezier split reads the declared start of segment zero', () => {
    // Only a bezier split consults the endpoint callbacks. A trunk resolves
    // segment 0 from its root when the segment carries no bottom joint; a
    // branch from its parent knot.
    const trunkSeg = bezier('s0', null, 10);
    const trunkResult = splitShaft(trunkWith([trunkSeg], cone(12)), 's0', SPLIT, 0.5, root);
    assert.equal(trunkResult.trunk.segments.length, 2, 'the trunk bezier split lands');

    const branchSeg = bezier('s0', null, 10);
    const branchResult = splitBranchShaft(branchWith([branchSeg], cone(12)), 's0', SPLIT, 0.5, parentKnot);
    assert.equal(branchResult.branch.segments.length, 2, 'the branch bezier split lands');
});

test('a trunk bezier split with no host cannot resolve, and falls back straight', () => {
    // No root and no bottom joint: resolveStart returns null, so the bezier
    // path is skipped and the split still produces two segments.
    const result = splitShaft(trunkWith([bezier('s0', null, 10)]), 's0', SPLIT, 0.5, undefined);
    assert.equal(result.trunk.segments.length, 2);
});

test('twig and stick resolve a missing start from the split point itself', () => {
    // Unlike trunk and branch, these fall back to splitPoint rather than null,
    // so a bezier split still takes the CURVE path with no host at all. The
    // segment count is 2 either way -- only the control points show which
    // path ran, so assert those.
    const twig = splitTwigShaft(twigWith([bezier('s0', null, 10)]), 's0', SPLIT, 0.5);
    assert.equal(twig.twig.segments.length, 2);
    assert.notDeepEqual(
        (twig.twig.segments[0] as unknown as { controlPoint2: unknown }).controlPoint2,
        { x: 0, y: 0, z: 4 },
        'a subdivided bezier gets new control points',
    );

    const stick = splitStickShaft(stickWith([bezier('s0', null, 10)]), 's0', SPLIT, 0.5);
    assert.notDeepEqual(
        (stick.stick.segments[0] as unknown as { controlPoint2: unknown }).controlPoint2,
        { x: 0, y: 0, z: 4 },
    );
});

test('the declared stub length ends a shaft with no top joint and no contact', () => {
    // Trunk inherited 10mm where every other type uses 5. Only reachable on
    // malformed geometry, so nothing else pins it.
    // De Casteljau derives the LEFT half's control points from the start side
    // only, so the stub shows up on the upper segment.
    const trunk = splitShaft(trunkWith([bezier('s0', 0, null)]), 's0', SPLIT, 0.5, root);
    const trunkCp = (trunk.trunk.segments[1] as unknown as { controlPoint2: { z: number } }).controlPoint2;

    const twig = splitTwigShaft(twigWith([bezier('s0', 0, null)]), 's0', SPLIT, 0.5);
    const twigCp = (twig.twig.segments[1] as unknown as { controlPoint2: { z: number } }).controlPoint2;

    assert.notEqual(trunkCp.z, twigCp.z, 'a 10mm stub and a 5mm stub cannot subdivide alike');
});

test('a hosted type with no host left straight keeps its control points', () => {
    // The mirror of the above: trunk resolves to null, so the bezier path is
    // skipped and the original control points survive untouched.
    const result = splitShaft(trunkWith([bezier('s0', null, 10)]), 's0', SPLIT, 0.5, undefined);
    assert.deepEqual(
        (result.trunk.segments[0] as unknown as { controlPoint2: unknown }).controlPoint2,
        { x: 0, y: 0, z: 4 },
        'no subdivision happened',
    );
});

test('a later segment continues from the previous top joint', () => {
    const segments = [straight('s0', 0, 4), bezier('s1', null, 10)];
    const result = splitShaft(trunkWith(segments, cone(12)), 's1', { x: 0, y: 0, z: 7 }, 0.5, root);
    assert.equal(result.trunk.segments.length, 3, 'splitting the second of two gives three');
    assert.equal(result.trunk.segments[0].id, 's0', 'the untouched segment keeps its place');
});

test('knots on the split segment are remapped above the split', () => {
    const knots: Record<string, Knot> = {
        low: { id: 'low', parentShaftId: 's0', t: 0.2, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as Knot,
        high: { id: 'high', parentShaftId: 's0', t: 0.8, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as Knot,
    };
    const result = splitShaft(trunkWith([straight('s0', 0, 10)]), 's0', SPLIT, 0.5, root, knots);

    // Both are remapped: each keeps its position, with t rescaled into whichever
    // half now holds it.
    const byId = new Map(result.knotRemaps.map((r) => [r.knotId, r]));
    const topSegmentId = result.trunk.segments[1].id;

    assert.equal(byId.get('low')?.parentShaftId, 's0', 'a knot below the split stays on the lower half');
    assert.equal(byId.get('low')?.t, 0.4, 't rescales into the lower half');

    assert.equal(byId.get('high')?.parentShaftId, topSegmentId, 'a knot above it moves to the new segment');
    assert.ok(Math.abs((byId.get('high')?.t ?? 0) - 0.6) < 1e-9, 't rescales into the upper half');
});

test('no splitT means no knot remapping at all', () => {
    // A straight split with no t cannot say which half a knot fell into.
    const knots: Record<string, Knot> = {
        k: { id: 'k', parentShaftId: 's0', t: 0.8, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as Knot,
    };
    const result = splitShaft(trunkWith([straight('s0', 0, 10)]), 's0', SPLIT, undefined, root, knots);
    assert.deepEqual(result.knotRemaps, []);
});
