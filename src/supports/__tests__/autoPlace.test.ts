import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { clearHistory, undo, registerHistoryHandler } from '../../history/historyStore';
import { SUPPORT_AUTO_PLACE } from '../history/actionTypes';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { runAutoPlace } from '../autoSupport/autoPlace';
import { setModelMesh } from '../autoSupport/meshStore';
import { resetStore, getSnapshot, setSnapshot } from '../state';
import { resetKickstandStore } from '../SupportTypes/Kickstand/kickstandStore';
import { initializeBVH, accelerateGeometry } from '@/utils/bvh';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIsland(id: string, x: number, y: number, z: number, areaMm2: number): DetectedIsland {
    return {
        id,
        source: 'voxel',
        contact: new THREE.Vector3(x, y, z),
        baseZ: z,
        areaMm2,
        layerSpan: [0, Math.round(z / 0.05)],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runAutoPlace places standalone trunks and pushes an undoable history entry', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const disposeHandlers = registerSupportHistoryHandlers();

    const islands = [
        makeIsland('i1', 0, 0, 20, 0.5),
        makeIsland('i2', 8, 0, 30, 0.5),
    ];

    const captured: Array<{ type: string; payload?: unknown }> = [];
    const unregisterCapture = registerHistoryHandler(SUPPORT_AUTO_PLACE, (action) => {
        captured.push(action);
        return true;
    });

    const result = runAutoPlace(islands, 'model-a');

    assert.equal(result.placedTrunks, 2, 'both islands become trunks');
    assert.equal(result.rejectedCandidates, 0);
    assert.equal(result.changed, true);

    const snapshot = getSnapshot();
    assert.equal(Object.keys(snapshot.trunks).length, 2, 'two trunks committed to the store');
    assert.equal(Object.keys(snapshot.roots).length, 2, 'two roots committed');

    // The run must be undoable as one entry.
    undo();
    assert.equal(captured.length, 1, 'SUPPORT_AUTO_PLACE handler ran on undo');
    assert.equal(captured[0].type, SUPPORT_AUTO_PLACE);
    const payload = captured[0].payload as { before?: unknown; after?: unknown };
    assert.ok(payload.before && payload.after, 'payload carries before/after snapshots');
    assert.equal(Object.keys(getSnapshot().trunks).length, 0, 'undo restores the empty pre-run snapshot');

    unregisterCapture();
    disposeHandlers();
    setModelMesh('model-a', null);
});

test('runAutoPlace resolves the underside surface normal from the mesh', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const disposeHandlers = registerSupportHistoryHandlers();

    // Box 10x10x10, translated so its underside sits at z = 20, normal (0,0,-1).
    initializeBVH();
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    geometry.translate(0, 0, 25);
    accelerateGeometry(geometry);
    const mesh = new THREE.Mesh(geometry);
    setModelMesh('model-a', mesh);

    const islands = [makeIsland('i1', 0, 0, 20, 0.5)];
    const result = runAutoPlace(islands, 'model-a', { debugSkipAutoBracing: true });

    assert.equal(result.placedTrunks, 1, 'underside island places a trunk');

    const snapshot = getSnapshot();
    const trunk = Object.values(snapshot.trunks)[0];
    assert.ok(trunk, 'trunk exists');
    const cone = trunk.contactCone;
    assert.ok(cone?.pos, 'contact cone exists');
    assert.ok(Math.abs(cone.pos.z - 20) < 0.6, `tip sits on the underside (z=${cone.pos.z.toFixed(2)}, expected ~20)`);
    const normal = cone.normal ?? cone.surfaceNormal;
    assert.ok(normal, 'cone normal exists');
    assert.ok(normal.z < 0, `underside normal points down (z=${normal.z.toFixed(3)})`);

    setModelMesh('model-a', null);
    disposeHandlers();
});

test('runAutoPlace grids a large flat overhang region into standalone trunks', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const disposeHandlers = registerSupportHistoryHandlers();

    // 20×20 flat underside (the xyzCalibration cube bottom): the region
    // becomes a density grid instead of one support.
    const contactVoxels: { x: number; y: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            contactVoxels.push({ x, y });
        }
    }
    const facet: DetectedIsland = {
        id: 'o0',
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2: 400,
        contactVoxels,
    };

    const result = runAutoPlace([facet], 'model-a', { debugSkipAutoBracing: true });

    // 400 mm² flat anchor surface (angle 0°) at 8 mm²/support → base spacing
    // 2.83 mm, densified 0.7× = 1.98 mm → boundary-aligned 11×11 ≈ 121
    // standalone trunks (outer ring on the boundary).
    assert.ok(result.placedTrunks >= 110 && result.placedTrunks <= 132,
        `placed ${result.placedTrunks} grid trunks, expected ~121 (flat anchor grid)`);
    assert.equal(result.placedBranches, 0, 'grid points stay independent (no bush)');
    assert.equal(result.placedLeaves, 0);

    const snapshot = getSnapshot();
    const trunkCount = Object.keys(snapshot.trunks).length;
    assert.equal(trunkCount, result.placedTrunks, 'trunks committed to the store');

    setModelMesh('model-a', null);
    disposeHandlers();
});

test('runAutoPlace places grid trunks on a rotated mesh via the region normal', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const disposeHandlers = registerSupportHistoryHandlers();
    initializeBVH();

    // Box rotated 30° about X: the underside face normal is (0, 0.5, -0.866)
    // and its surface Z varies with y. This is the exact case the generic
    // raycast got wrong (side face vs underside) — the region's own normal
    // must be used instead.
    const geometry = new THREE.BoxGeometry(20, 20, 20);
    geometry.rotateX(THREE.MathUtils.degToRad(30));
    geometry.translate(0, 0, 20);
    accelerateGeometry(geometry);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld();
    setModelMesh('model-a', mesh);

    // Underside after rotateX(30) + translate(0,0,20): projected y in
    // [-3.66, 13.66], x in [-10, 10], surface z(y) = 0.577y + 8.45, normal
    // (0, 0.5, -sqrt(3)/2). (A plane through the cube's middle would put the
    // tips inside the model — the fixture must match the real face.)
    const normal = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
    const contactVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -3.66; y <= 13.66; y += 0.25) {
            contactVoxels.push({ x, y, z: 0.577 * y + 8.45 });
        }
    }
    const facet: DetectedIsland = {
        id: 'o0',
        source: 'overhang',
        contact: new THREE.Vector3(0, 5, 11.33),
        baseZ: 6.34,
        areaMm2: 400 * (Math.sqrt(3) / 2), // projected area ≈ 346
        surfaceNormal: normal,
        contactVoxels,
    };

    const result = runAutoPlace([facet], 'model-a', { debugSkipAutoBracing: true });

    assert.ok(result.placedTrunks >= 15,
        `placed ${result.placedTrunks} grid trunks on the rotated face`);
    assert.equal(result.rejectedCandidates, 0,
        'no rejections: the region normal keeps the cone clear');

    setModelMesh('model-a', null);
    disposeHandlers();
});

test('runAutoPlace gap-fills under-covered regions (coverage convergence)', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const disposeHandlers = registerSupportHistoryHandlers();

    // 20×20 facet at a SPARSE density (30 mm²/support → ~5.5mm spacing):
    // the initial grid's 3mm coverage discs leave bands uncovered, so the
    // convergence pass must add more trunks.
    const contactVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            contactVoxels.push({ x, y, z: 6.5 });
        }
    }
    const facet: DetectedIsland = {
        id: 'o0',
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2: 400,
        surfaceNormal: { x: 0, y: 0, z: -1 },
        contactVoxels,
    };

    const result = runAutoPlace([facet], 'model-a', {
        debugSkipAutoBracing: true,
        areaPerSupportMm2: 30,
        gridAreaThresholdMm2: 25,
    });

    // Initial grid at 5.5mm spacing ≈ 16 points; convergence must add more.
    assert.ok(result.placedTrunks >= 20,
        `gap-fill added trunks beyond the sparse grid (placed ${result.placedTrunks})`);

    setModelMesh('model-a', null);
    disposeHandlers();
});

test('runAutoPlace with no viable candidates returns changed=false and pushes nothing', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();

    const result = runAutoPlace([], 'model-a');
    assert.equal(result.changed, false);
    assert.equal(Object.keys(getSnapshot().trunks).length, 0);
});
