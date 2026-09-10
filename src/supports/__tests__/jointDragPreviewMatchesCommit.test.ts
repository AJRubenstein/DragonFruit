import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { moveJoint } from '../SupportPrimitives/Joint/jointUtils';
import type { Trunk } from '../types';

/**
 * What the drag preview shows must be what the commit writes.
 *
 * The preview used to pass `skipContactConeSolve`, which aims the cone axis
 * straight at the socket; the commit ran the iterative solve, which offsets the
 * cone start along the surface normal first. The two disagree on both the
 * normal and the length, so a tip settled somewhere the preview never drew.
 */

const HOOK = readFileSync(
    new URL('../SupportPrimitives/Joint/useJointInteraction.ts', import.meta.url),
    'utf8',
);

function trunkWithAngledContact(): Trunk {
    return {
        id: 't', modelId: 'm', rootId: 'r',
        segments: [{
            id: 's', diameter: 1,
            bottomJoint: { id: 'bj', pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
            topJoint: { id: 'socket', pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
        }],
        contactCone: {
            id: 'c', socketJointId: 'socket',
            pos: { x: 0, y: 0, z: 12 },
            normal: { x: 0, y: 0, z: 1 },
            // Tilted, so the standoff offset is non-zero and the solves diverge.
            surfaceNormal: { x: 0.2, y: 0, z: 0.98 },
            diameter: 1, height: 1,
            profile: {
                type: 'disk', shape: 'cone', contactDiameterMm: 0.4, bodyDiameterMm: 1,
                lengthMm: 2, penetrationMm: 0.1, diskThicknessMm: 0.2,
                maxStandoffMm: 0.35, standoffAngleThreshold: 30,
            },
        },
    } as unknown as Trunk;
}

const solve = (skip: boolean) => moveJoint(
    trunkWithAngledContact(), 'socket', { x: 1, y: 0, z: 10.5 },
    undefined, false, undefined, undefined, { skipContactConeSolve: skip },
);

test('the two solves genuinely disagree, which is why the preview must not skip', () => {
    // Guards the premise. If these ever converge, the flag stopped mattering
    // and this whole file can go.
    const skipped = solve(true).contactCone!;
    const full = solve(false).contactCone!;

    assert.notEqual(
        skipped.profile.lengthMm.toFixed(4),
        full.profile.lengthMm.toFixed(4),
        'the skipped and full solves agree; the divergence this pins is gone',
    );
});

test('no drag-preview call skips the contact cone solve', () => {
    assert.ok(
        !/skipContactConeSolve:\s*true/.test(HOOK),
        'a drag preview skips the solve again, so the tip will move on release',
    );
});

test('the full solve offsets the cone start along the surface normal', () => {
    // What the skipped path omits: it aims the axis at the socket from the
    // contact point, ignoring the disk standoff.
    const full = solve(false).contactCone!;
    const skipped = solve(true).contactCone!;

    assert.ok(full.profile.lengthMm > skipped.profile.lengthMm,
        'the solved cone should be longer, having started off the surface');
});
