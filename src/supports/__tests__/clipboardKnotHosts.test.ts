import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { addKnot, addRoot, addSupportEntity, getSnapshot, resetStore } from '../state';
import { captureModelSupportsToClipboard } from '../PlacementLogic/supportClipboard';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * A knot on any shafted type is copied with its model.
 *
 * The membership test walks shafted types to find which support owns
 * `knot.parentShaftId`. A type left out of that walk means a knot riding one of
 * its shafts is treated as belonging to no model, so it is dropped from the
 * copy along with whatever hangs from it.
 */

const MODEL = 'model-a';

const segment = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

beforeEach(() => {
    resetStore();
    addRoot({
        id: 'root-a', modelId: MODEL,
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
});

const shafted = SUPPORT_TYPES.filter((d) => d.hasSegments);

for (const descriptor of shafted) {
    test(`a knot on a ${descriptor.id} shaft is copied with the model`, () => {
        const segmentId = `${descriptor.id}-seg`;
        addSupportEntity(descriptor.id, {
            id: `${descriptor.id}-1`,
            modelId: MODEL,
            rootId: 'root-a',
            segments: [segment(segmentId)],
        } as never);

        addKnot({
            id: 'knot-1', parentShaftId: segmentId, t: 0.5,
            pos: { x: 0, y: 0, z: 2 }, diameter: 1,
        } as never);

        const payload = captureModelSupportsToClipboard(MODEL);
        assert.ok(payload, `${descriptor.id}: nothing was copied`);
        assert.ok(
            payload.knots.some((knot) => knot.id === 'knot-1'),
            `a knot riding a ${descriptor.id} shaft was not copied with its model`,
        );
    });
}

test('a knot on another model\'s shaft is not copied', () => {
    addSupportEntity('trunk', {
        id: 'trunk-other', modelId: 'model-b', rootId: 'root-a',
        segments: [segment('other-seg')],
    } as never);
    addKnot({
        id: 'knot-other', parentShaftId: 'other-seg', t: 0.5,
        pos: { x: 0, y: 0, z: 2 }, diameter: 1,
    } as never);
    addSupportEntity('trunk', {
        id: 'trunk-mine', modelId: MODEL, rootId: 'root-a',
        segments: [segment('mine-seg')],
    } as never);

    const payload = captureModelSupportsToClipboard(MODEL);
    assert.ok(payload);
    assert.ok(!payload.knots.some((knot) => knot.id === 'knot-other'));
});

test('the fixture shapes resolve: a knot names a segment id, not a support id', () => {
    // Guards the assumption the walk rests on.
    addSupportEntity('trunk', {
        id: 'trunk-1', modelId: MODEL, rootId: 'root-a', segments: [segment('seg-1')],
    } as never);
    addKnot({
        id: 'knot-1', parentShaftId: 'seg-1', t: 0.5,
        pos: { x: 0, y: 0, z: 2 }, diameter: 1,
    } as never);

    const knot = getSnapshot().knots['knot-1'];
    assert.equal(knot.parentShaftId, 'seg-1');
});
