import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { shaftVerticalCos, CAVITY_STICK_MAX_SHAFT_ANGLE_DEG, CAVITY_TWIG_MAX_SHAFT_ANGLE_DEG, buildCavityStick } from '../SupportTypes/Trunk/useTrunkPlacement';

test('shaftVerticalCos measures the shaft deviation from vertical', () => {
    const seg = (bottom: { x: number; y: number; z: number }, top: { x: number; y: number; z: number }) => ({
        segments: [{ bottomJoint: { pos: bottom }, topJoint: { pos: top } }],
    });

    assert.equal(shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 })), 1, 'vertical shaft');
    const fortyFive = shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 3, y: 0, z: 7 }));
    assert.ok(Math.abs(fortyFive - Math.SQRT1_2) < 1e-9, `45° shaft = ${fortyFive}`);
    const limit = shaftVerticalCos(seg({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }));
    assert.ok(limit >= Math.cos((CAVITY_STICK_MAX_SHAFT_ANGLE_DEG * Math.PI) / 180), 'gate threshold is inside the vertical zone');
});

test('buildCavityStick bridges straight down to a floor and passes the gate', () => {
    const geometry = new THREE.BoxGeometry(20, 20, 0.1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    // Tip above the box top: the ray lands on the floor, drop > 5 mm → stick.
    const result = buildCavityStick(
        { x: 0, y: 0, z: 10 },
        { x: 0, y: 0, z: -1 },
        'm',
        mesh,
    );

    assert.ok(result, 'cavity stick builds');
    assert.equal(result.kind, 'stick', 'drop beyond the cutoff is a stick');
    if (result.kind === 'stick') {
        assert.ok(shaftVerticalCos(result.stick) >= Math.cos((CAVITY_STICK_MAX_SHAFT_ANGLE_DEG * Math.PI) / 180),
            'straight bridge passes the verticality gate');
    }
});

/**
 * A punched drain hole directly under the tip used to leave the contact with
 * NO support: the single straight-down ray escaped through the hole and the
 * bridge was abandoned, even though the floor a millimetre to the side is
 * right there. The search now steps a small disc of verticals around the tip.
 */
test('buildCavityStick still bridges when a drain hole sits under the tip', () => {
    const floor = new THREE.BufferGeometry();
    {
        // Floor with a 2mm slot through it, centred on the tip's XY.
        const left = new THREE.BoxGeometry(9, 20, 0.1);
        left.translate(-5.5, 0, 0);
        const right = new THREE.BoxGeometry(9, 20, 0.1);
        right.translate(5.5, 0, 0);
        const positions: number[] = [];
        for (const g of [left, right]) {
            const attr = g.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i < attr.count; i++) positions.push(attr.getX(i), attr.getY(i), attr.getZ(i));
            g.dispose();
        }
        floor.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        floor.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(floor, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const result = buildCavityStick(
        { x: 0, y: 0, z: 10 },
        { x: 0, y: 0, z: -1 },
        'm',
        mesh,
    );

    assert.ok(result, 'the floor beside the hole is still found');
    assert.equal(result.kind, 'stick', '8mm drop is a stick');
    if (result.kind !== 'stick') return;
    const cones = [result.stick.contactConeA?.pos, result.stick.contactConeB?.pos]
        .filter((p): p is { x: number; y: number; z: number } => Boolean(p));
    assert.equal(cones.length, 2, 'stick has both contacts');
    const floorContact = cones.reduce((lowest, p) => (p.z < lowest.z ? p : lowest));
    assert.ok(Math.abs(floorContact.x) >= 1,
        `the bridge lands beside the slot, not through it (x=${floorContact.x.toFixed(2)})`);
    assert.ok(shaftVerticalCos(result.stick) >= Math.cos((CAVITY_STICK_MAX_SHAFT_ANGLE_DEG * Math.PI) / 180),
        'the cant stays inside the verticality gate');
});

/**
 * A wall beside the tip with its top just below it used to produce a twig:
 * the lateral search lands on the wall's top edge and the twig grazes across
 * at ~50–75° from vertical — a whisker that cannot carry peel, and the
 * near-horizontal strut in the preview. The twig gate rejects it, like the
 * 20° stick gate rejects crammed sticks. Same wall with a real drop below
 * still props the tip.
 */
test('buildCavityStick rejects a grazing twig to a nearby wall edge', () => {
    const wall = (topZ: number): THREE.Mesh => {
        const geometry = new THREE.BoxGeometry(4, 4, 10);
        geometry.translate(4, 0, topZ - 5);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.updateMatrixWorld(true);
        return mesh;
    };

    // Wall top 0.5 mm below the tip: the search lands 2.25 mm sideways for a
    // ~2.3 mm twig at ~77° from vertical — a grazer, rejected.
    const grazer = buildCavityStick({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -1 }, 'm', wall(9.5));
    assert.equal(grazer, null, 'near-horizontal twig is rejected, not placed as a whisker');

    // Same wall 4 mm below the tip: lateral 2.25 mm over a 4 mm drop is a
    // ~29° bridge — kept.
    const prop = buildCavityStick({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -1 }, 'm', wall(6));
    assert.ok(prop, 'twig with a real drop still builds');
    assert.equal(prop!.kind, 'twig', 'short bridge stays a twig');
    if (prop!.kind === 'twig') {
        assert.ok(shaftVerticalCos(prop!.twig) >= Math.cos((CAVITY_TWIG_MAX_SHAFT_ANGLE_DEG * Math.PI) / 180),
            'the kept twig stays inside the twig verticality gate');
    }
});

test('buildCavityStick keeps a vertical thin-gap twig', () => {
    const header = new THREE.BoxGeometry(6, 6, 1);
    header.translate(0, 0, 12);
    const body = new THREE.BoxGeometry(30, 30, 2);
    body.translate(0, 0, 9.5);
    const positions: number[] = [];
    for (const g of [header, body]) {
        const attr = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < attr.count; i++) positions.push(attr.getX(i), attr.getY(i), attr.getZ(i));
        g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const result = buildCavityStick({ x: 0, y: 0, z: 11.4 }, { x: 0, y: 0, z: -1 }, 'm', mesh);
    assert.ok(result, 'thin-gap twig builds');
    assert.equal(result!.kind, 'twig', '1.5 mm gap is a twig');
});
