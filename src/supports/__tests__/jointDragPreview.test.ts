import assert from 'node:assert/strict';
import test from 'node:test';

import { computeJointDragSupportPreview } from '../SupportPrimitives/Joint/jointDragController';
import { moveJoint } from '../SupportPrimitives/Joint/jointUtils';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Roots, Segment, Trunk, Vec3 } from '../types';

/**
 * What a joint drag produces, before any of it is derived.
 *
 * `computeJointDragSupportPreview` branches on trunk / branch / everything
 * else, and the three arms differ only in whether `root` is passed. These pin
 * the output of each so the branch can be replaced by what the registry
 * already declares about the type's lower endpoint.
 */

const ROOT: Roots = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });

/**
 * A two-segment shaft shaped like a real one: segment 0 starts at the root and
 * carries no bottom joint, and the mid joint is one id shared by both segments.
 */
const shaft = (id: string): Trunk => {
    const mid = joint(`${id}-mid`, 6);
    return {
        id, modelId: 'model-a', typeId: 'trunk', rootId: ROOT.id,
        segments: [
            { id: `${id}-s0`, diameter: 1, topJoint: mid },
            { id: `${id}-s1`, diameter: 1, bottomJoint: mid, topJoint: joint(`${id}-top`, 10) },
        ] as Segment[],
    } as unknown as Trunk;
};

const TARGET: Vec3 = { x: 1.5, y: -0.75, z: 6.5 };

/**
 * Far enough sideways that the shaft-angle constraint clamps it. The clamp is
 * the only thing `root` feeds, so a test using a near-vertical target cannot
 * tell whether the root was passed.
 */
const STEEP_TARGET: Vec3 = { x: 40, y: 0, z: 6.5 };

const jointPositions = (support: { segments: Segment[] }) =>
    support.segments.flatMap((s) => [
        s.bottomJoint ? `${s.bottomJoint.id}@${s.bottomJoint.pos.x},${s.bottomJoint.pos.y},${s.bottomJoint.pos.z}` : 'none',
        s.topJoint ? `${s.topJoint.id}@${s.topJoint.pos.x},${s.topJoint.pos.y},${s.topJoint.pos.z}` : 'none',
    ]);

test('a dragged joint moves to the target position', () => {
    const moved = computeJointDragSupportPreview({
        kind: 'trunk', support: shaft('t1'), jointId: 't1-mid',
        newPos: TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });

    const dragged = moved.segments[0].topJoint!;
    assert.deepEqual({ x: dragged.pos.x, y: dragged.pos.y, z: dragged.pos.z }, TARGET);
});

test('the joint shared with the next segment moves with it', () => {
    // Segment 0's top joint and segment 1's bottom joint are the same point;
    // a drag that moved only one would split the shaft.
    const moved = computeJointDragSupportPreview({
        kind: 'trunk', support: shaft('t2'), jointId: 't2-mid',
        newPos: TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });

    assert.deepEqual(moved.segments[1].bottomJoint!.pos, moved.segments[0].topJoint!.pos);
});

test('a drag leaves the other joints alone', () => {
    const before = shaft('t3');
    const untouchedBefore = before.segments[1].topJoint!.pos;

    const moved = computeJointDragSupportPreview({
        kind: 'trunk', support: before, jointId: 't3-mid',
        newPos: TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });

    assert.deepEqual(moved.segments[1].topJoint!.pos, untouchedBefore);
});

test('a trunk drag is clamped against its root; a branch drag is not', () => {
    // The one real difference between the arms: a trunk passes its root to the
    // angle constraint, a branch passes none. Only a target steep enough to be
    // clamped can see it.
    const asTrunk = computeJointDragSupportPreview({
        kind: 'trunk', support: shaft('t4'), jointId: 't4-mid',
        newPos: STEEP_TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });
    const asBranch = computeJointDragSupportPreview({
        kind: 'branch', support: shaft('t4') as never, jointId: 't4-mid',
        newPos: STEEP_TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });

    const trunkX = asTrunk.segments[0].topJoint!.pos.x;
    const branchX = (asBranch as unknown as { segments: Segment[] }).segments[0].topJoint!.pos.x;

    assert.ok(trunkX < STEEP_TARGET.x, `the trunk drag should be clamped, got x=${trunkX}`);
    assert.notEqual(trunkX, branchX, 'passing the root has to change the clamp');
});

test('every drag-committing type produces the same geometry for the same input', () => {
    // The third arm serves twig, stick and kickstand with one call. Pinning all
    // of them against `moveJoint` directly shows the wrapper adds nothing.
    const direct = moveJoint(
        shaft('t5'), 't5-mid', TARGET, undefined, false, ROOT, undefined,
        { skipContactConeSolve: true },
    );

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const viaController = computeJointDragSupportPreview({
            kind: descriptor.id as never, support: shaft('t5') as never, jointId: 't5-mid',
            newPos: TARGET, isCurveMode: false, root: ROOT,
            contextStart: undefined, skipContactConeSolve: true,
        });

        assert.deepEqual(
            jointPositions(viaController as unknown as { segments: Segment[] }),
            jointPositions(direct as unknown as { segments: Segment[] }),
            `${descriptor.id} diverged from moveJoint`,
        );
    }
});

test('an unknown joint id leaves the shaft unchanged', () => {
    const before = shaft('t6');
    const moved = computeJointDragSupportPreview({
        kind: 'trunk', support: before, jointId: 'not-a-joint',
        newPos: TARGET, isCurveMode: false, root: ROOT,
        contextStart: undefined, skipContactConeSolve: true,
    });

    assert.deepEqual(jointPositions(moved), jointPositions(before));
});
