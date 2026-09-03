import assert from 'node:assert/strict';
import test from 'node:test';

import { collectCascade } from '../supportCascade';
import {
    addKnot,
    addRoot,
    addSupportEntity,
    getSnapshot,
    removeSupportEntity,
    resetStore,
} from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * A kickstand connects to a trunk and mounts to the plate. Nothing else.
 *
 * The registry already says so -- `ownsRoot` like a trunk, `hostedBy knots` like
 * a branch -- but the store took a `{ kickstand, root, hostKnot }` bundle where
 * every other type takes an entity, and that bundle is what forced
 * `nestedRemoval`, `KickstandBuildResult` and a hand-written cascade.
 */

const seg = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const root = (id: string, x: number) => ({
    id, modelId: 'model-a',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

/** A trunk on the plate with a kickstand hanging off a knot on its shaft. */
function scene() {
    resetStore();
    addRoot(root('root-a', 0) as never);
    addSupportEntity('trunk', {
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a', segments: [seg('seg-ta')],
    } as never);
    addKnot({ id: 'ks-host', parentShaftId: 'seg-ta', t: 0.3, pos: { x: 0, y: 0, z: 1 }, diameter: 1 } as never);

    // Added as three ordinary entities, exactly as a trunk plus its root would be.
    addRoot(root('ks-root', 3) as never);
    addSupportEntity('kickstand', {
        id: 'ks-a', modelId: 'model-a', rootId: 'ks-root', hostKnotId: 'ks-host',
        hostSegmentId: 'seg-ta', hostMinT: 0.2, segments: [seg('seg-ka')],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 0.8 },
    } as never);
}

test('a kickstand is declared like a trunk that hangs off a knot', () => {
    const kickstand = SUPPORT_TYPES.find((d) => d.id === 'kickstand')!;
    const trunk = SUPPORT_TYPES.find((d) => d.id === 'trunk')!;
    const branch = SUPPORT_TYPES.find((d) => d.id === 'branch')!;

    // Mounts to the plate, like a trunk.
    assert.equal(kickstand.ownsRoot, trunk.ownsRoot);
    assert.ok(kickstand.edges.some((e) => e.to === 'roots' && e.ownership === 'owns'));

    // Connects to a support, like a branch.
    assert.ok(kickstand.edges.some((e) => e.to === 'knots' && e.ownership === 'hostedBy'));
    assert.ok(branch.edges.some((e) => e.to === 'knots' && e.ownership === 'hostedBy'));

    assert.equal(kickstand.hasSegments, true);
    assert.equal(kickstand.carriesModelId, true);
});

test('adding a kickstand needs no bundle', () => {
    scene();
    const state = getSnapshot();
    assert.ok(state.kickstands['ks-a'], 'the kickstand should be in its own collection');
    assert.ok(state.roots['ks-root'], 'its root is an ordinary root');
    assert.ok(state.knots['ks-host'], 'its host knot is an ordinary knot');
});

test('the cascade reaches a kickstand root and host knot from edges alone', () => {
    // This is the whole argument: the bundle carries nothing the declared
    // edges do not already reach.
    scene();
    const doomed = collectCascade(getSnapshot() as unknown as SupportState, [
        { collection: 'kickstands', id: 'ks-a' },
    ]);

    assert.ok(doomed.has('roots:ks-root'), 'its own root goes with it, as a trunk\'s does');
    assert.ok(doomed.has('knots:ks-host'), 'its host knot goes with it, as a branch\'s does');
    assert.ok(!doomed.has('trunks:trunk-a'), 'the trunk it supports survives');
    assert.ok(!doomed.has('roots:root-a'), 'and so does the trunk\'s own root');
});

test('every shafted type cascades kickstands, so none of them are nested specially', () => {
    // "Nested kickstand" is not a concept: a kickstand on a doomed shaft is
    // reached exactly like a branch on one.
    scene();
    const doomed = collectCascade(getSnapshot() as unknown as SupportState, [
        { collection: 'trunks', id: 'trunk-a' },
    ]);
    assert.ok(doomed.has('kickstands:ks-a'), 'removing the host trunk takes the kickstand');
    assert.ok(doomed.has('roots:ks-root'), 'and the kickstand\'s own root');
});

test('removing a kickstand reports its root and host knot', () => {
    scene();
    const removed = removeSupportEntity('kickstand', 'ks-a') as unknown as Record<string, unknown>;
    assert.ok(removed, 'the removal should report something');

    const state = getSnapshot();
    assert.equal(state.kickstands['ks-a'], undefined);
    assert.equal(state.roots['ks-root'], undefined, 'its root goes with it');
    assert.equal(state.knots['ks-host'], undefined, 'its host knot goes with it');
    assert.ok(state.trunks['trunk-a'], 'the supported trunk survives');
});
