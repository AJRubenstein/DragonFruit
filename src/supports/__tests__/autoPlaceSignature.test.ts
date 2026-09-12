import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runAutoPlace } from '../autoSupport/autoPlace';
import { setModelMesh } from '../autoSupport/meshStore';
import { getSnapshot, resetStore, resetKickstandsInState } from '../state';
import { getSettings, setSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import { initializeBVH, accelerateGeometry } from '@/utils/bvh';
import { footprintFromPoints } from '@/volumeAnalysis/Islands/voxelFootprint';
import type { DetectedIsland } from '@/volumeAnalysis/Islands/types';

/**
 * A whole-run signature for auto-placement.
 *
 * Every other test in this folder asserts ONE behaviour. That is right for
 * pinning rules, and wrong for a rewrite: a change to the decision ladder can
 * move which TYPE a candidate becomes while every individual rule still holds,
 * and nothing would notice.
 *
 * This runs a scene end to end and pins what came out, per type. It is the
 * regression net for restructuring `placeOneCandidate` — treat any movement in
 * these numbers as a behaviour change to explain, not a fixture to update.
 *
 * Deliberately ONE scene rather than many: the value is in a broad signature
 * over the paths a rewrite touches, and a scene that exercises grid placement,
 * island trunks, fanning and the cavity fallback covers the ladder's branches.
 */

const MODEL = 'model-a';

/** A hollow box: a sealed interior cavity the trunk route cannot reach. */
function cavityMesh() {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        return g;
    };
    // Interior cavity x,y within (-8, 8), z within (2, 6).
    const geometry = mergeGeometries([
        box(2, 20, 12, -9, 0, 3),
        box(2, 20, 12, 9, 0, 3),
        box(20, 2, 12, 0, -9, 3),
        box(20, 2, 12, 0, 9, 3),
        box(20, 20, 2, 0, 0, 1),
        box(20, 20, 2, 0, 0, 7),
    ])!;
    accelerateGeometry(geometry);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld();
    return mesh;
}

/** A wide flat overhang: the grid path. */
function planarIsland(): DetectedIsland {
    const voxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            voxels.push({ x, y, z: 6.5 });
        }
    }
    return {
        id: 'o-planar',
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2: 400,
        contactVoxels: footprintFromPoints(voxels),
    };
}

/** A curved region well away from the planar one: the organic/standalone path. */
function organicIsland(): DetectedIsland {
    const voxels: { x: number; y: number; z?: number }[] = [];
    for (let x = 30; x <= 50; x += 0.25) {
        for (let y = 30; y <= 50; y += 0.25) {
            voxels.push({ x, y, z: 25 + ((x - 40) * (x - 40)) / 20 });
        }
    }
    return {
        id: 'o-organic',
        source: 'overhang',
        contact: new THREE.Vector3(40, 40, 25),
        baseZ: 25,
        areaMm2: 400,
        contactVoxels: footprintFromPoints(voxels),
    };
}

/** A high isolated tip: the trunk/leaf path with nothing near to fan onto. */
function islandTip(): DetectedIsland {
    return {
        id: 'i-tip',
        source: 'voxel',
        contact: new THREE.Vector3(-30, -30, 40),
        baseZ: 40,
        areaMm2: 0.5,
        layerSpan: [0, 800],
    };
}

/** A small tip inside the hollow box: the cavity fallback. */
function cavityTip(): DetectedIsland {
    return {
        id: 'i-cavity',
        source: 'voxel',
        contact: new THREE.Vector3(0, 0, 5.5),
        baseZ: 5.5,
        areaMm2: 1,
        layerSpan: [0, 110],
    };
}

/** A tip below the anchor band (5mm): the near-plate short-circuit. */
function lowAnchorTip(): DetectedIsland {
    return {
        id: 'i-low',
        source: 'voxel',
        contact: new THREE.Vector3(60, 0, 3),
        baseZ: 3,
        areaMm2: 1,
        layerSpan: [0, 60],
    };
}

/**
 * A voxel tip near enough to the planar grid to attach, but beyond leaf span:
 * the merge path that promotes a leaf to a BRANCH.
 */
function mergeBranchTip(): DetectedIsland {
    return {
        id: 'i-merge',
        source: 'voxel',
        contact: new THREE.Vector3(0, 0, 9),
        baseZ: 9,
        areaMm2: 4,
        layerSpan: [0, 180],
    };
}

function runSignature(gridEnabled: boolean) {
    resetStore();
    resetKickstandsInState();
    initializeBVH();
    setModelMesh(MODEL, cavityMesh());

    // The two settings produce two DIFFERENT ladders: with grid on, candidates
    // go through `decideGridPlacement`; with it off they go through the
    // merge/trunk/cavity fallback chain. A rewrite of that chain has to be
    // pinned in both.
    const settings = createDefaultSettings();
    settings.grid.enabled = gridEnabled;
    setSettings(settings);

    const result = runAutoPlace(
        [planarIsland(), organicIsland(), islandTip(), cavityTip(), lowAnchorTip(), mergeBranchTip()],
        MODEL,
        { debugSkipAutoBracing: true, stabilizationEnabled: false },
    );

    const state = getSnapshot() as unknown as Record<string, Record<string, unknown>>;
    const forest = result.analytics?.forestReport;

    const signature = {
        // What the placement ladder decided, per type.
        placed: { ...result.placed },
        rejectedCandidates: result.rejectedCandidates,
        changed: result.changed,
        // What ended up in the store -- the thing a user would see.
        inStore: {
            trunks: Object.keys(state.trunks ?? {}).length,
            branches: Object.keys(state.branches ?? {}).length,
            leaves: Object.keys(state.leaves ?? {}).length,
            twigs: Object.keys(state.twigs ?? {}).length,
            sticks: Object.keys(state.sticks ?? {}).length,
            anchors: Object.keys(state.anchors ?? {}).length,
            knots: Object.keys(state.knots ?? {}).length,
            roots: Object.keys(state.roots ?? {}).length,
        },
        // The report's own view, which the UI and the logs read.
        forest: forest
            ? {
                hostCount: forest.hostCount,
                leafCount: forest.leafCount,
                branchCount: forest.branchCount,
                bareHosts: forest.bareHosts.length,
            }
            : null,
    };

    setModelMesh(MODEL, null);
    return signature;
}

/**
 * The recorded signatures. Regenerate ONLY after confirming a change is
 * intended, and say why in the commit.
 *
 * `placed` is what the ladder decided; `inStore` is what survived the resize
 * and consolidation passes. Both move under a rewrite, so both are pinned.
 */
const RECORDED = {
    /** Grid enabled: candidates resolve through `decideGridPlacement`, branch-heavy. */
    gridOn: {
        placed: { trunk: 46, branch: 151, leaf: 0, twig: 199, stick: 0, brace: 0, anchor: 1, kickstand: 0 },
        rejectedCandidates: 0,
        changed: true,
        inStore: { trunks: 26, branches: 171, leaves: 0, twigs: 199, sticks: 0, anchors: 1, knots: 171, roots: 26 },
        forest: { hostCount: 26, leafCount: 0, branchCount: 171, bareHosts: 1 },
    },
    /** Grid disabled: candidates resolve through the merge/trunk/cavity ladder, leaf-heavy. */
    gridOff: {
        placed: { trunk: 71, branch: 0, leaf: 126, twig: 198, stick: 0, brace: 0, anchor: 1, kickstand: 0 },
        rejectedCandidates: 0,
        changed: true,
        inStore: { trunks: 71, branches: 0, leaves: 126, twigs: 198, sticks: 0, anchors: 1, knots: 126, roots: 71 },
        forest: { hostCount: 71, leafCount: 126, branchCount: 0, bareHosts: 1 },
    },
} as const;

function assertSignature(
    actual: ReturnType<typeof runSignature>,
    expected: (typeof RECORDED)['gridOn'] | (typeof RECORDED)['gridOff'],
) {
    // Compared per field so a failure names which part moved, rather than
    // dumping two opaque objects.
    assert.deepEqual(actual.placed, expected.placed, 'per-type placement counts moved');
    assert.equal(actual.rejectedCandidates, expected.rejectedCandidates, 'rejection count moved');
    assert.deepEqual(actual.inStore, expected.inStore, 'what landed in the store moved');
    assert.deepEqual(actual.forest, expected.forest, 'the forest report moved');
}

test('the grid path produces the recorded whole-run signature', () => {
    assertSignature(runSignature(true), RECORDED.gridOn);
});

test('the gridless ladder produces the recorded whole-run signature', () => {
    // The two settings take different code paths through the ladder, so a
    // rewrite has to be pinned in both or half of it is unguarded.
    assertSignature(runSignature(false), RECORDED.gridOff);
});

test('the two settings genuinely exercise different paths', () => {
    // If both settings collapsed onto the same outcome, this fixture would look
    // like coverage while providing half of it.
    const on = runSignature(true).placed;
    const off = runSignature(false).placed;
    assert.notDeepEqual(on, off, 'grid on and off must not produce the same outcome');
    assert.ok(on.branch > 0, 'grid on exercises the branch path');
    assert.ok(off.leaf > 0, 'grid off exercises the fan-leaf path');
});

test('the signature covers more than one placement path', () => {
    // A fixture that collapsed onto one path would still "pass" while testing
    // almost nothing. This guards the net, not the behaviour.
    const actual = runSignature(true).placed;
    const kinds = Object.entries(actual).filter(([, n]) => n > 0).map(([k]) => k);
    assert.ok(kinds.length >= 4, `the scene should exercise several types, got: ${kinds.join(', ')}`);
    assert.ok(actual.trunk > 0, 'trunks are covered');
    assert.ok(actual.branch > 0, 'branch placement is covered');
    assert.ok(actual.twig > 0, 'the cavity fallback is covered');
    assert.ok(actual.anchor > 0, 'the near-plate short-circuit is covered');
});

test('a second run of the same scene is identical', () => {
    // Determinism is what makes the signature usable as a net at all.
    assert.deepEqual(runSignature(true), runSignature(true));
    assert.deepEqual(runSignature(false), runSignature(false));
});
