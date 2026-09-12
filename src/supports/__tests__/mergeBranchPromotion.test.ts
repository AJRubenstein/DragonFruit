import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { runAutoPlace } from '../autoSupport/autoPlace';
import { getSnapshot, resetStore, resetKickstandsInState, setSnapshot } from '../state';
import { setSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import { initializeBVH } from '@/utils/bvh';
import { footprintFromPoints } from '@/volumeAnalysis/Islands/voxelFootprint';
import { buildTrunkData } from '../SupportTypes/Trunk/trunkBuilder';
import type { DetectedIsland } from '@/volumeAnalysis/Islands/types';

/**
 * The gridless merge's BRANCH promotion.
 *
 * When a candidate merges into a host but the knot→tip span exceeds
 * `MAX_LEAF_SPAN_BEFORE_BRANCH_MM`, the member should become a BRANCH instead of
 * a leaf. Nothing covered that arm: it needs a specific host geometry and, as
 * this test records, a specific non-default setting.
 *
 * ## What it takes to reach the arm at all
 *
 * Three constraints have to hold simultaneously, and they fight each other:
 *
 *  1. `findMergeHost` must find the host — within 4mm of the host's contact cone
 *     OR of a segment joint. A single-segment trunk exposes only its tip and its
 *     bottom joint, so the MIDDLE of a shaft is invisible to it.
 *  2. The knot must sit at least 45° above horizontal from the tip, which caps
 *     the span at `h·√2` when the knot lands on that 45° line. Exceeding 6mm
 *     therefore needs either a wide horizontal offset or a knot pushed below the
 *     line by the sample grid.
 *  3. The finished branch must LEAVE the host at no more than
 *     `90 − grid.minBranchAngleDeg` from vertical — and
 *     `branchDepartureAngleDeg` measures the branch's first joint, not the chord
 *     from knot to tip, so it is flatter than the chord.
 *
 * Here the host is a real built trunk (so its joint layout is the production
 * one) and the candidate sits beside a MID-SHAFT joint, which is what gets the
 * host found in the first place.
 */

const MODEL = 'model-a';

/** A trunk built by the production builder, so its joints are the real ones. */
function builtHost(tipZ: number) {
    const { root, trunk } = buildTrunkData({
        tipPos: new THREE.Vector3(0, 0, tipZ),
        tipNormal: new THREE.Vector3(0, 0, 1),
        modelId: MODEL,
    });
    const segments = (trunk as { segments: Array<{ bottomJoint?: { pos: { z: number } } }> }).segments;
    const midJointZ = segments[1]?.bottomJoint?.pos.z;
    assert.ok(midJointZ !== undefined, 'a built trunk must expose a mid-shaft joint');
    return { root, trunk, midJointZ };
}

/** A small island beside the host, low enough to be a merge candidate. */
function islandAt(x: number, z: number): DetectedIsland {
    return {
        id: 'I',
        source: 'voxel',
        contact: new THREE.Vector3(x, 0, z),
        baseZ: z,
        areaMm2: 2,
        contactVoxels: footprintFromPoints([
            { x, y: 0 },
            { x: x + 0.25, y: 0 },
            { x, y: 0.25 },
            { x: x + 0.25, y: 0.25 },
        ]),
    } as unknown as DetectedIsland;
}

/** Run the ladder against a scene that already contains the built host. */
function runAgainstHost(
    host: ReturnType<typeof builtHost>,
    candidate: DetectedIsland,
    minBranchAngleDeg: number,
) {
    resetStore();
    resetKickstandsInState();
    initializeBVH();
    const settings = createDefaultSettings();
    settings.grid.enabled = false;
    settings.grid.minBranchAngleDeg = minBranchAngleDeg;
    setSettings(settings);

    const before = getSnapshot() as unknown as Record<string, Record<string, unknown>>;
    setSnapshot({
        ...before,
        roots: { ...before.roots, [host.root.id]: host.root },
        trunks: { ...before.trunks, [host.trunk.id]: host.trunk },
    } as never);

    return runAutoPlace([candidate], MODEL, {
        debugSkipAutoBracing: true,
        stabilizationEnabled: false,
    } as never);
}

test('a long merge onto a mid-shaft joint becomes a BRANCH, not a leaf', () => {
    const host = builtHost(40);
    const result = runAgainstHost(host, islandAt(3.8, host.midJointZ), 20);

    assert.equal(result.placed.branch, 1, 'the long member should be a branch');
    assert.equal(result.placed.leaf, 0, 'and not a leaf');
    assert.equal(result.placed.trunk, 0, 'and not a standalone trunk');
});

test('the same scene under DEFAULT settings places a standalone trunk instead', () => {
    const host = builtHost(40);
    const result = runAgainstHost(host, islandAt(3.8, host.midJointZ), 60);

    assert.equal(result.placed.branch, 0);
    assert.equal(result.placed.trunk, 1, 'the merge is refused and the candidate stands alone');
});

/**
 * The boundary, not just the two ends: the arm turns on the departure angle, so
 * the setting that admits it is exactly one degree either side of this line.
 */
test('the branch arm turns on grid.minBranchAngleDeg within one degree', () => {
    const host = builtHost(40);
    const refused = runAgainstHost(host, islandAt(3.8, host.midJointZ), 28);
    const admitted = runAgainstHost(host, islandAt(3.8, host.midJointZ), 27);

    assert.equal(refused.placed.branch, 0, 'gate 62° refuses the 62° departure');
    assert.equal(admitted.placed.branch, 1, 'gate 63° admits it');
});

/**
 * And the arm is bounded: a candidate far from the host's tip and joints is not
 * a merge at all, so it stands alone. Without this the two tests above could be
 * passing for the wrong reason — if EVERY candidate branched, they would too.
 */
test('a candidate out of merge reach stands alone', () => {
    const host = builtHost(40);
    const result = runAgainstHost(host, islandAt(3.8, host.midJointZ + 20), 20);
    assert.ok(
        result.placed.leaf + result.placed.branch + result.placed.trunk === 1,
        'exactly one member is placed',
    );
    assert.equal(result.placed.trunk, 1, 'a candidate 20mm above the joint is out of merge reach');
});

test('the run is deterministic', () => {
    const host = builtHost(40);
    const a = runAgainstHost(host, islandAt(3.8, host.midJointZ), 20);
    const b = runAgainstHost(host, islandAt(3.8, host.midJointZ), 20);
    assert.deepEqual(a.placed, b.placed);
});
