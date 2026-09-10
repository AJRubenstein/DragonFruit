import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    addSupportEntity, addRoot, addKnot, updateKnot, getSnapshot, resetStore,
} from '../state';

/**
 * Clicking a knot must not reshape what hangs off it.
 *
 * The knot drag-end path had no movement gate at all: `shouldEndDrag` asked
 * only whether a knot was active, and its fallback re-wrote the knot even with
 * no preview. `updateKnot` runs `settleKnotDependentGeometry`, which re-derives
 * a hosted leaf's cone from the knot -- so a click could swing the cone's
 * normal and change its length without the knot moving at all.
 */

const HOOK = readFileSync(
    new URL('../SupportPrimitives/Knot/useKnotInteraction.ts', import.meta.url),
    'utf8',
);

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
});

function sceneWithHostedLeaf() {
    resetStore();
    addRoot({
        id: 'r', modelId: 'm',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('trunk', { id: 't', modelId: 'm', rootId: 'r', segments: [seg('s')] } as never);
    addKnot({ id: 'k', parentShaftId: 's', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1 } as never);
    addSupportEntity('leaf', {
        id: 'lf', modelId: 'm', parentKnotId: 'k',
        contactCone: {
            id: 'c', socketJointId: 'cs', pos: { x: 1, y: 0, z: 6 },
            normal: { x: 0, y: 0, z: 1 }, surfaceNormal: { x: 0, y: 0, z: 1 },
            diameter: 1, height: 1,
            profile: {
                type: 'cone', shape: 'cone', contactDiameterMm: 0.4,
                bodyDiameterMm: 1, lengthMm: 2, penetrationMm: 0.1,
            },
        },
    } as never);
}

test('writing an unchanged knot reshapes the leaf hanging off it', () => {
    // The mechanism, pinned rather than endorsed: this is why the drag-end
    // fallback must not fire on a click. If this ever stops being true, the
    // gate below is belt-and-braces and this file can be revisited.
    sceneWithHostedLeaf();
    const before = structuredClone(getSnapshot().leaves['lf'].contactCone);

    updateKnot(getSnapshot().knots['k']);

    const after = getSnapshot().leaves['lf'].contactCone;
    assert.notDeepEqual(after.normal, before.normal, 'the cone normal should have moved');
});

test('the knot drag-end path gates its commit on movement', () => {
    // The gate must guard the `updateKnot` call, not merely exist in the file.
    const commit = HOOK.slice(
        HOOK.indexOf('const previewKnotAtEnd'),
        HOOK.indexOf('// If the released knot lives on a twig'),
    );
    assert.ok(commit.length > 0, 'the drag-end commit block moved -- this test needs rewriting');
    assert.match(
        commit,
        /shouldCommitJointDrag\(dragStartKnotPos\.current, previewKnotAtEnd\.pos\)[\s\S]{0,40}updateKnot\(previewKnotAtEnd\)/,
        'the knot commit is not gated on the knot having actually moved',
    );
});

test('the drag-end fallback does not re-write an untouched knot', () => {
    // `else if (activeKnotIdAtEnd) { updateKnot(knotAtEnd) }` re-committed the
    // stored knot verbatim when no preview existed -- pure churn that still
    // resettled dependent geometry.
    assert.ok(
        !/const knotAtEnd = getKnotById\(activeKnotIdAtEnd\);\s*\n\s*if \(knotAtEnd\) updateKnot\(knotAtEnd\);/.test(HOOK),
        'the unconditional re-write of the stored knot is back',
    );
});
