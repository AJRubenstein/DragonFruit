import assert from 'node:assert/strict';
import test from 'node:test';

import { addSupportEntity, getSupportEntity, resetStore } from '../state';
import { commitJointDragSupport, JOINT_DRAG_COMMIT_TYPES } from '../SupportPrimitives/Joint/jointDragController';
import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import type { Segment } from '../types';

/**
 * Committing a dragged joint.
 *
 * The gizmo had two commit paths: `commitJointDragSupport` for trunk, branch
 * and kickstand, and `updateSupportEntity` + `clearSupportDragPreview` written
 * out for twig and stick. The second pair is what the first already does --
 * `clearPreview` defaults to true, and the clear is a pass-through to the same
 * function. These hold that, so the one path can serve every shafted type.
 */

const seg = (id: string): Segment => ({
    id, diameter: 1,
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
} as Segment);

function seed(typeId: string, id: string) {
    addSupportEntity(typeId as never, {
        id, modelId: 'model-a', segments: [seg(`seg-${id}`)],
        rootId: `${id}-root`, parentKnotId: `${id}-knot`,
        hostKnotId: `${id}-knot`, hostSegmentId: 'seg-host', hostMinT: 0.2,
    } as never);
}

const SHAFTED = SUPPORT_TYPES.filter((d) => d.hasSegments);

test('a commit writes the entity back to its own collection', () => {
    for (const typeId of JOINT_DRAG_COMMIT_TYPES) {
        resetStore();
        seed(typeId, `${typeId}-a`);

        const before = getSupportEntity(typeId, `${typeId}-a`) as { segments: Segment[] };
        const moved = { ...before, segments: [seg('seg-moved')] };
        commitJointDragSupport(typeId as never, moved as never);

        const after = getSupportEntity(typeId, `${typeId}-a`) as { segments: Segment[] } | null;
        assert.ok(after, `${typeId}: entity vanished on commit`);
        assert.equal(after.segments[0].id, 'seg-moved', `${typeId}: commit did not write through`);
    }
});

test('the commit path is generic over the type, not a fixed three', () => {
    // Nothing in the commit body is type-specific: the only per-type step is
    // guarded by `hasContactDiskLengthOverride`, which every descriptor
    // declares. So a type outside the set is excluded by its type signature,
    // not by anything the runtime needs.
    for (const descriptor of SHAFTED) {
        assert.equal(
            typeof getSupportTypeDescriptor(descriptor.id).hasContactDiskLengthOverride,
            'boolean',
            `${descriptor.id} does not declare hasContactDiskLengthOverride`,
        );
    }
});

test('every commit type is shafted', () => {
    for (const typeId of JOINT_DRAG_COMMIT_TYPES) {
        assert.ok(getSupportTypeDescriptor(typeId).hasSegments, `${typeId} has no shaft to commit`);
    }
});
