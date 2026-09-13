import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAutoBracedSnapshot } from '../autoBracing/autoBrace';
import { createDefaultAutoBracingSettings } from '../autoBracing/settings';
import {
    autoBraceableShaftTypes,
    isAutoBraceableShaftType,
    lateralStabiliserTypes,
} from '../supportTypeRegistry';
import type { Branch, Roots, SupportState, Trunk } from '../types';

/**
 * What auto-bracing may brace, and the fact that it is DECLARED.
 *
 * `branch` declared `isAutoBraceable: true` and was unreachable: the pass built
 * a sample pool from the flag, then filtered every use site on the literal
 * `'trunk'`, so branch samples were produced and discarded. A flag that selects
 * nothing is indistinguishable from a flag that is false, which is why the
 * contradiction went unnoticed.
 *
 * These tests pin the DERIVED set, not the literal, so re-narrowing it fails
 * here rather than silently dropping a type from bracing.
 */

function root(id: string, modelId: string, x: number): Roots {
    return {
        id,
        modelId,
        transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3,
        diskHeight: 0.5,
        coneHeight: 0.5,
    };
}

function trunk(id: string, modelId: string, rootId: string, x: number, topZ = 12): Trunk {
    return {
        id,
        typeId: 'trunk',
        modelId,
        rootId,
        segments: [{
            id: `seg-${id}`,
            diameter: 1,
            topJoint: { id: `joint-${id}`, pos: { x, y: 0, z: topZ }, diameter: 1.2 },
        }],
    };
}

/** A branch hanging off a trunk's knot, ending at a model contact. */
function branch(id: string, modelId: string, parentKnotId: string, x: number, y: number): Branch {
    return {
        id,
        typeId: 'branch',
        modelId,
        parentKnotId,
        segments: [{
            id: `seg-${id}`,
            diameter: 1,
            bottomJoint: { id: `bjoint-${id}`, pos: { x: 0, y: 0, z: 8 }, diameter: 1.1 },
            topJoint: { id: `tjoint-${id}`, pos: { x, y, z: 10 }, diameter: 1.1 },
        }],
    } as unknown as Branch;
}

function emptySnapshot(): SupportState {
    return {
        roots: {}, trunks: {}, branches: {}, leaves: {}, twigs: {}, sticks: {},
        braces: {}, anchors: {}, kickstands: {}, knots: {},
        selectedId: null, selectedCategory: null, hoveredId: null,
        hoveredCategory: 'none', interactionWarning: null,
    };
}

test('the braceable set is derived, and holds trunk and branch', () => {
    assert.deepEqual(
        [...autoBraceableShaftTypes()].sort(),
        ['branch', 'trunk'],
        'trunk and branch are the braceable shafts',
    );
    assert.equal(isAutoBraceableShaftType('branch'), true, 'branch must be braceable, not just declared');
    assert.equal(isAutoBraceableShaftType('trunk'), true);
});

test('a lateral stabiliser is NOT a braceable member — it is generated as an extra', () => {
    // Kickstand declares `isAutoBraceable: true` AND has a shaft, so the flag
    // alone would admit it. It is excluded because it is the thing this pass
    // GENERATES, offered beside a group rather than braced as a member of one.
    assert.ok(
        lateralStabiliserTypes().includes('kickstand'),
        'precondition: kickstand registers as a lateral stabiliser',
    );
    assert.equal(isAutoBraceableShaftType('kickstand'), false);
});

test('types with no shaft, or that are not braceable, stay out', () => {
    for (const typeId of ['leaf', 'twig', 'stick', 'brace', 'anchor']) {
        assert.equal(isAutoBraceableShaftType(typeId), false, `${typeId} must not be braceable`);
    }
});

/**
 * The behaviour behind the flag, tested so it FAILS on the old literal.
 *
 * The scene holds branches and NO trunks, which makes the sample-pool filter the
 * only thing that can decide the outcome: the early return reports
 * `skippedSupportCount: samples.length`, so with the old `=== 'trunk'` filter
 * this is 0 and with the derived filter it is the branch count.
 *
 * An earlier version of this test used a scene that also held a trunk and
 * asserted `skippedSupportCount > 0`. It passed under the old literal too — the
 * trunk satisfied it — so it verified nothing. Caught by mutating the filter
 * back and watching the test stay green.
 */
test('a branch reaches the pass: a branches-only scene reports it as a sample', () => {
    const snapshot = emptySnapshot();
    const modelId = 'model-a';

    // Two branches off a host knot, and deliberately NO trunk: any sample the
    // pass reports can only have come from a branch.
    snapshot.knots['k-host'] = {
        id: 'k-host', parentShaftId: 'seg-absent', t: 0.5,
        pos: { x: 0, y: 0, z: 6 }, diameter: 1.1,
    };
    snapshot.branches['branch-a'] = branch('branch-a', modelId, 'k-host', 3, 0);
    snapshot.branches['branch-b'] = branch('branch-b', modelId, 'k-host', -3, 0);

    const result = buildAutoBracedSnapshot(snapshot, createDefaultAutoBracingSettings());

    assert.equal(
        result.skippedSupportCount,
        2,
        'both branches must be samples the pass accounts for',
    );
    assert.equal(result.generatedBraceCount, 0, 'two is below minGroupSize, so nothing is braced yet');
});
