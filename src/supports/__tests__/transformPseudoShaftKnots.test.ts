import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
    addKnot,
    addRoot,
    addSupportEntity,
    getSnapshot,
    resetStore,
    transformSupportsForModel,
} from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Moving a model carries the knots riding its pseudo-shafts.
 *
 * A knot usually names a real segment, but it can also ride a leaf's contact
 * cone (`leafCone:`) or a brace's span (`braceSegment:`) -- declared as
 * `knotHostPrefix`. Those knots have no `modelId` and no segment of their own,
 * so the transform walk has to reach them through the host that WAS touched.
 *
 * Deleting the lookup entirely leaves the rest of the suite green, so this file
 * is the only thing holding it. See the `transformSupportsForModel` rows in
 * `docs/dev/support-registry-findings.md`.
 */

const MODEL = 'model-a';

const move = () => transformSupportsForModel(
    MODEL,
    { position: new THREE.Vector3(0, 0, 0), rotation: new THREE.Euler(0, 0, 0), scale: new THREE.Vector3(1, 1, 1) },
    { position: new THREE.Vector3(10, 0, 0), rotation: new THREE.Euler(0, 0, 0), scale: new THREE.Vector3(1, 1, 1) },
);

function seedTrunk() {
    resetStore();
    addRoot({
        id: 'root-1',
        modelId: MODEL,
        transform: { pos: { x: 0, y: 0, z: 0 } },
        diskHeight: 1,
        coneHeight: 1,
    } as never);
    addSupportEntity('trunk', {
        id: 'trunk-1',
        modelId: MODEL,
        rootId: 'root-1',
        segments: [{
            id: 'trunk-seg',
            diameter: 1,
            bottomJoint: { id: 'tj-b', pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
            topJoint: { id: 'tj-t', pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
        }],
    } as never);
    addKnot({ id: 'knot-host', parentShaftId: 'trunk-seg', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1 } as never);
}

test('a knot riding a leaf cone moves with the model', () => {
    seedTrunk();
    addSupportEntity('leaf', {
        id: 'leaf-1',
        modelId: MODEL,
        parentKnotId: 'knot-host',
        contactCone: {
            id: 'leaf-cone',
            socketJointId: 'leaf-socket',
            pos: { x: 0, y: 0, z: 8 },
            normal: { x: 0, y: 0, z: 1 },
            surfaceNormal: { x: 0, y: 0, z: 1 },
            diameter: 1,
            height: 1,
        },
    } as never);
    addKnot({ id: 'rider', parentShaftId: 'leafCone:leaf-1', t: 0.5, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as never);

    move();

    assert.equal(getSnapshot().knots.rider.pos.x, 10, 'the leaf-cone knot did not follow the model');
});

test('a knot riding a brace span moves with the model', () => {
    seedTrunk();
    addKnot({ id: 'knot-end', parentShaftId: 'trunk-seg', t: 0.8, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as never);
    addSupportEntity('brace', {
        id: 'brace-1',
        modelId: MODEL,
        startKnotId: 'knot-host',
        endKnotId: 'knot-end',
        profile: { diameter: 1 },
    } as never);
    addKnot({ id: 'rider', parentShaftId: 'braceSegment:brace-1', t: 0.5, pos: { x: 0, y: 0, z: 6 }, diameter: 1 } as never);

    move();

    assert.equal(getSnapshot().knots.rider.pos.x, 10, 'the brace-span knot did not follow the model');
});

test('a rider follows a host connected to this model, whatever its modelId', () => {
    // The walk is per-model: a rider whose host belongs elsewhere must not move.
    seedTrunk();
    addSupportEntity('leaf', {
        id: 'leaf-other',
        modelId: 'model-b',
        parentKnotId: 'knot-host',
        contactCone: {
            id: 'other-cone',
            socketJointId: 'other-socket',
            pos: { x: 0, y: 0, z: 8 },
            normal: { x: 0, y: 0, z: 1 },
            surfaceNormal: { x: 0, y: 0, z: 1 },
            diameter: 1,
            height: 1,
        },
    } as never);
    addKnot({ id: 'rider', parentShaftId: 'leafCone:leaf-other', t: 0.5, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as never);

    move();

    assert.equal(
        getSnapshot().knots.rider.pos.x,
        10,
        'a rider on a connected leaf no longer follows the moved model',
    );
});

test('every type declaring a knot-host prefix uses a distinct one', () => {
    // Two types sharing a prefix would make `slice(prefix.length)` look the
    // host up in the wrong collection.
    const prefixes = SUPPORT_TYPES
        .map((descriptor) => descriptor.knotHostPrefix)
        .filter((prefix): prefix is string => !!prefix);

    assert.equal(new Set(prefixes).size, prefixes.length, 'two types share a knotHostPrefix');
    assert.ok(prefixes.length >= 2, 'the leaf and brace prefixes are declared');
});
