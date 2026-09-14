import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runAutoPlace } from '../autoSupport/autoPlace';
import { setModelMesh } from '../autoSupport/meshStore';
import type { AutoPlaceResult } from '../autoSupport/types';
import { getSnapshot, resetStore, resetKickstandsInState } from '../state';
import { getSettings, setSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
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
 * over the paths a rewrite touches.
 *
 * ## What this actually covers — measured by mutation, not assumed
 *
 * Caught:
 *   - the anchor height threshold (5 -> 40): 4 failures
 *   - the fan radius the settings resolve to (5 -> 15): 1 failure
 *
 * NOT caught, with the reason:
 *   - `MAX_LEAF_SPAN_BEFORE_BRANCH_MM` — the gridless merge never reaches the
 *     branch arm. A merge needs a host within 4mm of the candidate's TIP or of a
 *     segment JOINT, and a single-segment trunk only exposes its tip and its
 *     bottom joint, so candidates near the middle or top of a shaft find no
 *     host at all; those it does find are refused as `rejected`.
 *   - the post-placement FANNING LOOP (`MAX_FANNING_PASSES`). Its precondition
 *     is reached (`islandsUncovered > 0` happens for far-off tiny islands), but
 *     the loop's own reach is TIGHTER than the ladder's: the loop uses the raw
 *     fan radius (5) while the ladder floors its own at 8mm. Every island the
 *     loop could reach, the ladder already reached, so the loop never places
 *     anything and its pass count is unobservable.
 *   - the fan ANGLE gate — the fan is refused for distance before it is refused
 *     for angle in every geometry reachable here.
 *   - `ALREADY_SUPPORTED_RADIUS_MM` — widening it does not change this scene.
 *
 * So this net guards the ladder, the cavity fallback, the anchor short-circuit,
 * the grid decision and the fan radius. It does NOT guard the branch promotion
 * or the fanning loop; converting those without a targeted test is unguarded
 * work, and a smaller targeted test per path is the cheaper way to close it.
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
 * A voxel host well away from everything else, so the fanning pair below has a
 * shaft to attach to without disturbing the other islands.
 */
function fanHost(): DetectedIsland {
    return {
        id: 'i-fan-host',
        source: 'voxel',
        contact: new THREE.Vector3(80, 80, 40),
        baseZ: 40,
        areaMm2: 30,
        layerSpan: [0, 800],
    };
}

/**
 * A sub-threshold overhang a given offset from that host's shaft.
 *
 * The offset picks the outcome, which is why there are two: one close enough to
 * attach, and one at ~9.8mm that sits OUTSIDE the fan's effective reach. The
 * far one is the interesting case — it flips between a standalone trunk and a
 * fanned leaf depending on the fan radius, which is what makes the radius
 * observable from a whole run.
 *
 * (Measured, not assumed: at 3mm the outcome is the same whether the radius is 2
 * or 15, so a fixture with only the near case cannot see the radius at all.)
 */
function fanTarget(xOffsetMm: number, zOffsetMm: number): DetectedIsland {
    return {
        id: `o-fan-${xOffsetMm}-${zOffsetMm}`,
        source: 'overhang',
        contact: new THREE.Vector3(80 + xOffsetMm, 80, 40 + zOffsetMm),
        baseZ: 40 + zOffsetMm,
        areaMm2: 16,
        contactVoxels: footprintFromPoints([
            { x: 80 + xOffsetMm, y: 80 },
            { x: 80 + xOffsetMm + 0.25, y: 80 },
            { x: 80 + xOffsetMm, y: 80.25 },
            { x: 80 + xOffsetMm + 0.25, y: 80.25 },
        ]),
    };
}

/**
 * One whole-run signature: what `runSignature` returns and `assertSignature`
 * pins. `placed` is the ladder's own per-type ledger, keyed by the registry.
 */
interface RunSignature {
    placed: AutoPlaceResult['placed'];
    rejectedCandidates: number;
    changed: boolean;
    /** The visible outcome, keyed by `SupportState` collection. */
    inStore: Record<string, number>;
    forest: { hostCount: number; leafCount: number; branchCount: number; bareHosts: number } | null;
}

function runSignature(gridEnabled: boolean): RunSignature {
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
        [
            planarIsland(), organicIsland(), islandTip(), cavityTip(), lowAnchorTip(),
            // The fanning pair: one in reach, one beyond it.
            fanHost(), fanTarget(3, -7), fanTarget(4, 9),
        ],
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
            anchors: Object.keys(state.stumps ?? {}).length,
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
 * `placed` is what the ladder decided, one number per `SUPPORT_TYPES` entry in
 * registry order; `inStore` is what survived the resize and consolidation
 * passes. Both move under a rewrite, so both are pinned.
 */
const RECORDED = {
    /** Grid enabled: candidates resolve through `decideGridPlacement`, branch-heavy. */
    gridOn: {
        placed: [49, 151, 0, 198, 0, 0, 1, 0],
        rejectedCandidates: 0,
        changed: true,
        inStore: { trunks: 28, branches: 172, leaves: 0, twigs: 198, sticks: 0, anchors: 1, knots: 172, roots: 28 },
        forest: { hostCount: 28, leafCount: 0, branchCount: 172, bareHosts: 2 },
    },
    /** Grid disabled: candidates resolve through the merge/trunk/cavity ladder, leaf-heavy. */
    gridOff: {
        placed: [73, 0, 127, 197, 0, 0, 1, 0],
        rejectedCandidates: 0,
        changed: true,
        inStore: { trunks: 73, branches: 0, leaves: 127, twigs: 197, sticks: 0, anchors: 1, knots: 127, roots: 73 },
        forest: { hostCount: 73, leafCount: 127, branchCount: 0, bareHosts: 2 },
    },
} as const;

function assertSignature(
    actual: RunSignature,
    expected: (typeof RECORDED)['gridOn'] | (typeof RECORDED)['gridOff'],
) {
    // Compared per field so a failure names which part moved, rather than
    // dumping two opaque objects. `placed` is read along the registry's axis:
    // one entry per declared type, in `SUPPORT_TYPES` order.
    assert.deepEqual(
        SUPPORT_TYPES.map((descriptor) => actual.placed[descriptor.id]),
        expected.placed,
        'per-type placement counts moved (SUPPORT_TYPES order)',
    );
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
    // The ledger carries one entry per declared type, which is what lets the
    // recorded counts be compared along the registry's axis without losing a key.
    assert.deepEqual(
        Object.keys(actual).sort(),
        SUPPORT_TYPES.map((descriptor) => descriptor.id).sort(),
        'the ledger must carry every declared type',
    );
    // Every type the recording says the scene places must still be placed, read
    // off the registry along that same axis.
    for (const [index, count] of RECORDED.gridOn.placed.entries()) {
        if (count === 0) continue;
        const typeId = SUPPORT_TYPES[index].id;
        assert.ok(actual[typeId] > 0, `${typeId} placement is covered`);
    }
});

test('a second run of the same scene is identical', () => {
    // Determinism is what makes the signature usable as a net at all.
    assert.deepEqual(runSignature(true), runSignature(true));
    assert.deepEqual(runSignature(false), runSignature(false));
});
