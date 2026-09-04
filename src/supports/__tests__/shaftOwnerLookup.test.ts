import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addSupportEntity,
    findShaftOwnerOfJoint,
    getSupportEntity,
    resetStore,
} from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Finding the support that owns a joint.
 *
 * Anchors were absent from the chain this replaces, so their joints were never
 * draggable, and a ninth type would have been treated as a kickstand.
 */

const seg = (id: string, z: number) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: z + 4 }, diameter: 1 },
});

/** A minimal entity of `typeId` carrying one segment. */
function seed(typeId: string, id: string, segmentId: string, z: number) {
    addSupportEntity(typeId as never, {
        id, modelId: 'model-a', segments: [seg(segmentId, z)],
        // Whatever links the type declares; unresolved ids are fine here.
        rootId: `${id}-root`, parentKnotId: `${id}-knot`,
        hostKnotId: `${id}-knot`, hostSegmentId: 'seg-host', hostMinT: 0.2,
    } as never);
}

const SHAFTED = SUPPORT_TYPES.filter((d) => d.hasSegments);

test('every shafted type is searched, anchors included', () => {
    // The old chain covered five of the six. Anchor is the one it missed.
    assert.ok(SHAFTED.some((d) => d.id === 'anchor'), 'anchor has segments');

    for (const descriptor of SHAFTED) {
        resetStore();
        seed(descriptor.id, `${descriptor.id}-a`, `seg-${descriptor.id}`, 0);

        const found = findShaftOwnerOfJoint(`seg-${descriptor.id}-tj`);
        assert.ok(found, `${descriptor.id}: a top joint should be found`);
        assert.equal(found.typeId, descriptor.id);
        assert.equal(found.id, `${descriptor.id}-a`);
    }
});

test('both ends of a segment resolve to the same owner', () => {
    resetStore();
    seed('trunk', 'trunk-a', 'seg-ta', 0);

    const top = findShaftOwnerOfJoint('seg-ta-tj');
    const bottom = findShaftOwnerOfJoint('seg-ta-bj');
    assert.equal(top?.id, 'trunk-a');
    assert.equal(bottom?.id, 'trunk-a');
    assert.notDeepEqual(top?.pos, bottom?.pos, 'the two ends are different points');
});

test('the reported position is the joint, not the entity', () => {
    resetStore();
    seed('trunk', 'trunk-a', 'seg-ta', 3);
    assert.deepEqual(findShaftOwnerOfJoint('seg-ta-bj')?.pos, { x: 0, y: 0, z: 3 });
    assert.deepEqual(findShaftOwnerOfJoint('seg-ta-tj')?.pos, { x: 0, y: 0, z: 7 });
});

test('an unknown joint belongs to nobody', () => {
    resetStore();
    seed('trunk', 'trunk-a', 'seg-ta', 0);
    assert.equal(findShaftOwnerOfJoint('nope'), null);
});

test('the right owner is found among several types at once', () => {
    resetStore();
    for (const descriptor of SHAFTED) {
        seed(descriptor.id, `${descriptor.id}-a`, `seg-${descriptor.id}`, 0);
    }
    for (const descriptor of SHAFTED) {
        const found = findShaftOwnerOfJoint(`seg-${descriptor.id}-tj`);
        assert.equal(found?.typeId, descriptor.id, `${descriptor.id} should not be shadowed`);
    }
});

test('getSupportEntity reads any type by id', () => {
    resetStore();
    for (const descriptor of SHAFTED) {
        seed(descriptor.id, `${descriptor.id}-a`, `seg-${descriptor.id}`, 0);
        assert.ok(
            getSupportEntity(descriptor.id, `${descriptor.id}-a`),
            `${descriptor.id} should be readable`,
        );
    }
    assert.equal(getSupportEntity('trunk', 'nope'), null);
});
