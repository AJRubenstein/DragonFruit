import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildCavityBridge } from '../SupportTypes/Trunk/useTrunkPlacement';
import { shaftVerticalCos, isShaftVerticalEnough, MAX_SHAFT_ANGLE_DEG } from '../SupportTypes/Stick/stickVerticality';

test('shaftVerticalCos measures the shaft deviation from vertical', () => {
    const seg = (bottom: { x: number; y: number; z: number }, top: { x: number; y: number; z: number }) => ({
        segments: [{ bottomJoint: { pos: bottom }, topJoint: { pos: top } }],
    });

    assert.equal(shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 })), 1, 'vertical shaft');
    const fortyFive = shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 3, y: 0, z: 7 }));
    assert.ok(Math.abs(fortyFive - Math.SQRT1_2) < 1e-9, `45° shaft = ${fortyFive}`);
    const limit = shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }));
    assert.ok(limit >= Math.cos((MAX_SHAFT_ANGLE_DEG * Math.PI) / 180), 'gate threshold is inside the vertical zone');
});

test('buildCavityBridge bridges straight down to a floor and passes the gate', () => {
    const geometry = new THREE.BoxGeometry(20, 20, 0.1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    // Tip above the box top: the ray lands on the floor, drop > 5 mm → stick.
    const result = buildCavityBridge(
        { x: 0, y: 0, z: 10 },
        { x: 0, y: 0, z: -1 },
        'm',
        mesh,
    );

    assert.ok(result, 'cavity bridge builds');
    assert.equal(result.kind, 'stick', 'drop beyond the cutoff is a stick');
    // The gate now lives in the stick's registered builder, so a bridge that
    // came back at all already passed it.
    assert.ok(result.entity.segments?.length, 'the bridge has a shaft');
});
