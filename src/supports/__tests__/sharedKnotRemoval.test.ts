import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addAnchor,
    addBrace,
    addBranch,
    addKnot,
    addLeaf,
    addStick,
    addTrunk,
    getSnapshot,
    removeAnchor,
    removeBrace,
    removeStick,
    resetStore,
} from '../state';
import type { Anchor, Brace, Branch, Knot, Leaf, Stick, Trunk } from '../types';

/**
 * A knot shared by several supports must outlive any one of them.
 *
 * `removeBrace` used to delete both its knots unconditionally, so removing a
 * brace destroyed a knot a branch or leaf was still attached to. They survived
 * pointing at an id that no longer resolved -- invisible until something walked
 * the graph and found nothing there.
 */

const MODEL = 'model-a';

const segment = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const knot = (id: string, shaftId: string): Knot => ({
    id,
    parentShaftId: shaftId,
    t: 0.5,
    pos: { x: 0, y: 0, z: 2 },
    diameter: 1,
}) as Knot;

/** Two trunks, a knot on each, and a brace spanning them. */
function buildScene() {
    resetStore();
    addTrunk({ id: 'trunk-a', modelId: MODEL, rootId: 'root-a', segments: [segment('seg-a')] } as Trunk);
    addTrunk({ id: 'trunk-b', modelId: MODEL, rootId: 'root-b', segments: [segment('seg-b')] } as Trunk);
    addKnot(knot('knot-a', 'seg-a'));
    addKnot(knot('knot-b', 'seg-b'));
    addBrace({
        id: 'brace-a', modelId: MODEL,
        startKnotId: 'knot-a', endKnotId: 'knot-b',
        profile: { diameter: 0.8 },
    } as unknown as Brace);
}

test('a knot still used by a branch survives its brace', () => {
    buildScene();
    addBranch({
        id: 'branch-a', modelId: MODEL, parentKnotId: 'knot-a',
        segments: [segment('seg-ba')],
    } as Branch);

    removeBrace('brace-a');
    const state = getSnapshot();

    assert.ok(state.branches['branch-a'], 'the branch should survive');
    assert.ok(state.knots['knot-a'], 'its knot must not be deleted with the brace');
    assert.equal(state.knots['knot-b'], undefined, 'the unshared far knot still goes');
});

test('a knot still used by a leaf survives its brace', () => {
    buildScene();
    addLeaf({ id: 'leaf-a', modelId: MODEL, parentKnotId: 'knot-a' } as Leaf);

    removeBrace('brace-a');
    const state = getSnapshot();

    assert.ok(state.leaves['leaf-a']);
    assert.ok(state.knots['knot-a'], 'its knot must not be deleted with the brace');
});

test('an unshared brace still takes both its knots', () => {
    // The guard must not overreach: with nothing else attached, removing the
    // brace should still tidy up the knots it was the only user of.
    buildScene();

    removeBrace('brace-a');
    const state = getSnapshot();

    assert.equal(state.knots['knot-a'], undefined);
    assert.equal(state.knots['knot-b'], undefined);
});

test('two braces on one knot: the first to go leaves it', () => {
    buildScene();
    addKnot(knot('knot-c', 'seg-b'));
    addBrace({
        id: 'brace-b', modelId: MODEL,
        startKnotId: 'knot-a', endKnotId: 'knot-c',
        profile: { diameter: 0.8 },
    } as unknown as Brace);

    removeBrace('brace-a');
    let state = getSnapshot();
    assert.ok(state.knots['knot-a'], 'brace-b still needs it');
    assert.equal(state.knots['knot-b'], undefined, 'nothing else used it');

    removeBrace('brace-b');
    state = getSnapshot();
    assert.equal(state.knots['knot-a'], undefined, 'now the last user is gone');
});

test('no removal leaves a support pointing at a missing knot', () => {
    buildScene();
    addBranch({
        id: 'branch-a', modelId: MODEL, parentKnotId: 'knot-a',
        segments: [segment('seg-ba')],
    } as Branch);
    addLeaf({ id: 'leaf-a', modelId: MODEL, parentKnotId: 'knot-a' } as Leaf);

    removeBrace('brace-a');
    const state = getSnapshot();

    for (const branch of Object.values(state.branches)) {
        if (!branch.parentKnotId) continue;
        assert.ok(state.knots[branch.parentKnotId], `branch ${branch.id} dangles`);
    }
    for (const leaf of Object.values(state.leaves)) {
        if (!leaf.parentKnotId) continue;
        assert.ok(state.knots[leaf.parentKnotId], `leaf ${leaf.id} dangles`);
    }
});

test('removing a stick takes the knots on its shaft', () => {
    // Sticks used to delete only themselves, orphaning any knot on their
    // segments -- and any leaf hanging off that knot.
    resetStore();
    addStick({
        id: 'stick-a', modelId: MODEL, segments: [segment('seg-sa')],
    } as unknown as Stick);
    addKnot(knot('knot-on-stick', 'seg-sa'));
    addLeaf({ id: 'leaf-on-stick', modelId: MODEL, parentKnotId: 'knot-on-stick' } as Leaf);

    const removed = removeStick('stick-a');
    const state = getSnapshot();

    assert.equal(state.knots['knot-on-stick'], undefined, 'the knot goes with the stick');
    assert.equal(state.leaves['leaf-on-stick'], undefined, 'so does the leaf on it');
    assert.equal(removed?.knots.length, 1, 'undo needs the knot back');
    assert.equal(removed?.leaves.length, 1, 'and the leaf');
});

test('removing an anchor takes the knots on its shaft', () => {
    resetStore();
    addAnchor({
        id: 'anchor-a', modelId: MODEL, segments: [segment('seg-aa')],
    } as unknown as Anchor);
    addKnot(knot('knot-on-anchor', 'seg-aa'));

    const removed = removeAnchor('anchor-a');
    const state = getSnapshot();

    assert.equal(state.knots['knot-on-anchor'], undefined);
    assert.equal(removed?.knots.length, 1);
});

test('a stick with nothing on it removes only itself', () => {
    resetStore();
    addStick({
        id: 'stick-a', modelId: MODEL, segments: [segment('seg-sa')],
    } as unknown as Stick);

    const removed = removeStick('stick-a');

    assert.equal(removed?.knots.length, 0);
    assert.equal(removed?.leaves.length, 0);
});
