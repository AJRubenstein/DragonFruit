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

test('runAutoPlace with no viable candidates returns changed=false and pushes nothing', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();

    const result = runAutoPlace([], 'model-a');
    assert.equal(result.changed, false);
    assert.equal(Object.keys(getSnapshot().trunks).length, 0);
});
