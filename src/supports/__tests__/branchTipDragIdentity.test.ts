import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBranchData, remapBranchGeometryIds } from '../SupportTypes/Branch/branchBuilder';
import type { Knot } from '../types';

const parentKnot: Knot = {
    id: 'knot-1',
    parentShaftId: 'trunk-seg-1',
    pos: { x: 1.6, y: 0, z: 3 },
};

function buildAt(tipPos: { x: number; y: number; z: number }) {
    return buildBranchData({
        tipPos,
        tipNormal: { x: 1, y: 0, z: 0 },
        modelId: 'model-1',
        parentKnot,
    }).branch;
}

test('a rebuilt branch keeps the contact cone id the drag started with', () => {
    const original = buildAt({ x: 0, y: 0, z: 0 });
    const rebuilt = buildAt({ x: 0, y: 0.8, z: 0.4 });

    const remapped = remapBranchGeometryIds(rebuilt, original);

    assert.equal(remapped.contactCone!.id, original.contactCone!.id);
    assert.notEqual(rebuilt.contactCone!.id, original.contactCone!.id);
    assert.deepEqual(remapped.contactCone!.pos, rebuilt.contactCone!.pos);
});

test('a rebuilt branch keeps its segment and joint ids so hosted knots stay attached', () => {
    const original = buildAt({ x: 0, y: 0, z: 0 });
    const rebuilt = buildAt({ x: 0, y: 0.8, z: 0.4 });

    const remapped = remapBranchGeometryIds(rebuilt, original);

    const sharedSegmentCount = Math.min(original.segments.length, remapped.segments.length);
    for (let i = 0; i < sharedSegmentCount; i++) {
        assert.equal(remapped.segments[i].id, original.segments[i].id);
        assert.equal(remapped.segments[i].topJoint?.id, original.segments[i].topJoint?.id);
    }

    const lastSegment = remapped.segments[remapped.segments.length - 1];
    assert.equal(remapped.contactCone!.socketJointId, lastSegment.topJoint!.id);
    for (let i = 1; i < remapped.segments.length; i++) {
        assert.equal(remapped.segments[i].bottomJoint?.id, remapped.segments[i - 1].topJoint?.id);
    }
});

test('geometry the rebuild adds keeps its own ids', () => {
    const original = buildAt({ x: 0, y: 0, z: 0 });
    const rebuilt = buildAt({ x: 0, y: 0.8, z: 0.4 });
    const truncated = { ...original, segments: original.segments.slice(0, 1) };

    const remapped = remapBranchGeometryIds(rebuilt, truncated);

    assert.equal(remapped.segments[0].id, truncated.segments[0].id);
    assert.equal(remapped.segments[1].id, rebuilt.segments[1].id);
    assert.equal(remapped.contactCone!.socketJointId, rebuilt.contactCone!.socketJointId);
});

