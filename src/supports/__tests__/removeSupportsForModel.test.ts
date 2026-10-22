import assert from 'node:assert/strict';
import test from 'node:test';

import { addKnot, addRoot, addSupportEntity, getSnapshot, removeSupportEntitiesForModel, resetStore } from '../state';
import { inspectSupport } from '../supportInspector';
import type { Segment, SupportState } from '../types';

/**
 * Replacing one model's supports is a cascade over that model's entities, not a
 * sweep by collection: a dependent of another model hanging off one of them has
 * to go too, or it is left pointing at a deleted host.
 */

const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });
const segment = (id: string, bottomZ: number, topZ: number): Segment => ({
    id,
    type: 'straight',
    diameter: 1,
    bottomJoint: joint(`${id}-bottom`, bottomZ),
    topJoint: joint(`${id}-top`, topZ),
});
const cone = (id: string, z: number) => ({
    id,
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: -1 },
    profile: { type: 'cone', bodyDiameterMm: 1, contactDiameterMm: 0.4, lengthMm: 1 },
});
const root = (id: string, modelId: string) => ({
    id,
    modelId,
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3,
    diskHeight: 0.5,
    coneHeight: 1.5,
});

/** Model A owns a trunk; model B hangs a branch off it. */
function seedTwoModels(): void {
    resetStore();
    addRoot(root('root-a', 'model-a'));
    addSupportEntity('trunk', {
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
        segments: [segment('seg-a', 0, 10)], contactCone: cone('cone-a', 12),
    });
    addKnot({
        id: 'knot-shared', parentShaftId: 'seg-a', t: 0.5,
        pos: { x: 0, y: 0, z: 5 }, diameter: 1.125,
    });
    addSupportEntity('branch', {
        id: 'branch-b', modelId: 'model-b', parentKnotId: 'knot-shared',
        segments: [segment('seg-b', 0, 4)], contactCone: cone('cone-b', 6),
    });
}

test('replacing a model takes the other model dependent that hung off it', () => {
    seedTwoModels();
    try {
        assert.ok(removeSupportEntitiesForModel('model-a'), 'the model had supports');

        const state = getSnapshot() as unknown as SupportState;
        assert.deepEqual(Object.keys(state.trunks), [], 'the model own trunk is gone');
        assert.deepEqual(
            Object.keys(state.branches),
            [],
            'the other model branch hung off its shaft, so it goes too',
        );
        assert.deepEqual(Object.keys(state.knots), [], 'and the knot it hung from');
    } finally {
        resetStore();
    }
});

test('a model with no supports reports nothing to remove', () => {
    seedTwoModels();
    try {
        assert.equal(removeSupportEntitiesForModel('model-absent'), false);
        assert.ok(getSnapshot().trunks['trunk-a'], 'nothing was touched');
    } finally {
        resetStore();
    }
});

test('what survives a replace points only at entities that exist', () => {
    resetStore();
    try {
        // Two independent trunks: one replaced, one untouched.
        for (const model of ['model-a', 'model-b']) {
            addRoot(root(`root-${model}`, model));
            addSupportEntity('trunk', {
                id: `trunk-${model}`, modelId: model, rootId: `root-${model}`,
                segments: [segment(`seg-${model}`, 0, 10)], contactCone: cone(`cone-${model}`, 12),
            });
            addKnot({
                id: `knot-${model}`, parentShaftId: `seg-${model}`, t: 0.5,
                pos: { x: 0, y: 0, z: 5 }, diameter: 1.125,
            });
            addSupportEntity('leaf', {
                id: `leaf-${model}`, modelId: model, parentKnotId: `knot-${model}`,
                contactCone: cone(`leafcone-${model}`, 6),
            });
        }

        removeSupportEntitiesForModel('model-a');

        const state = getSnapshot() as unknown as SupportState;
        assert.ok(state.trunks['trunk-model-b'], 'the other model is untouched');
        for (const id of Object.keys(state.leaves)) {
            assert.deepEqual(
                inspectSupport(state, 'leaves', id)?.danglingLinks ?? [],
                [],
                `leaf ${id} points at nothing missing`,
            );
        }
    } finally {
        resetStore();
    }
});
