import assert from 'node:assert/strict';
import test from 'node:test';

import { addSupportEntity, findShaftOwnerOfJoint, getSupportEntity, resetStore } from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The owner a joint drag resolves already names its type.
 *
 * The drag-start chain restated it -- `{ typeId: 'stick', id: foundStick.id }`
 * in the stick arm, and four more like it -- behind `ofType(t)`, which returns
 * non-null only when `owner.typeId === t`. Collapsing those to `owner` is sound
 * only while `getSupportEntity` refuses an id under any other type; this holds
 * that, so the collapse cannot silently start dragging the wrong type.
 */

const seg = (id: string) => ({
    id,
    diameter: 1,
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

function seed(typeId: string, id: string, segmentId: string) {
    addSupportEntity(typeId as never, {
        id, modelId: 'model-a', segments: [seg(segmentId)],
        rootId: `${id}-root`, parentKnotId: `${id}-knot`,
        hostKnotId: `${id}-knot`, hostSegmentId: 'seg-host', hostMinT: 0.2,
    } as never);
}

const SHAFTED = SUPPORT_TYPES.filter((d) => d.hasSegments);

test('an entity resolves under its own type and no other', () => {
    for (const descriptor of SHAFTED) {
        resetStore();
        seed(descriptor.id, `${descriptor.id}-a`, `seg-${descriptor.id}`);

        const owner = findShaftOwnerOfJoint(`seg-${descriptor.id}-tj`);
        assert.ok(owner, `${descriptor.id}: no owner for its own joint`);

        for (const other of SHAFTED) {
            const read = getSupportEntity(other.id, owner.id);
            if (other.id === owner.typeId) {
                assert.ok(read, `${descriptor.id} does not resolve under its own type`);
            } else {
                assert.equal(read, null, `a ${descriptor.id} also resolved as ${other.id}`);
            }
        }
    }
});

test('the owner type is the one the drag arm would have matched', () => {
    // `ofType(t)` fired for exactly one t. That t is owner.typeId, which is
    // what the collapsed assignment now uses directly.
    resetStore();
    for (const descriptor of SHAFTED) {
        seed(descriptor.id, `${descriptor.id}-a`, `seg-${descriptor.id}`);
    }

    for (const descriptor of SHAFTED) {
        const owner = findShaftOwnerOfJoint(`seg-${descriptor.id}-tj`)!;
        const matched = SHAFTED.filter((d) => getSupportEntity(d.id, owner.id) !== null);
        assert.deepEqual(
            matched.map((d) => d.id),
            [owner.typeId],
            `${descriptor.id}: exactly one arm must match`,
        );
    }
});
