import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getSnapshot,
    resetStore,
    addKnot,
    addSupportEntity,
    updateBrace,
} from '../state';
import type { Brace, Knot, Leaf } from '../types';

/**
 * The knot-dependent geometry chain.
 *
 * Three things chain when a knot moves: the leaves parented to it reshape
 * their contact cones, a reshaped cone moves any knot riding `leafCone:<id>`,
 * and a brace spanning moved knots moves the knots on its own segment.
 *
 * These cover the first pass. The SECOND pass -- the one that runs when the
 * brace step itself moved something -- is NOT covered here: instrumenting it
 * showed it fires once across the whole suite and changes nothing when it
 * does. See the note in `docs/dev/backlog.md`; it may be dead work rather
 * than a coverage gap, which is why nothing here pretends to pin it.
 */

const vec = (x: number, y: number, z: number) => ({ x, y, z });

const knot = (id: string, parentShaftId: string, z: number, t = 0.5): Knot => ({
    id,
    parentShaftId,
    t,
    pos: vec(0, 0, z),
    diameter: 1,
} as Knot);

/** A leaf whose cone starts at its parent knot and points +Z. */
const leaf = (id: string, parentKnotId: string, z: number): Leaf => ({
    id,
    modelId: 'model-a',
    parentKnotId,
    contactCone: {
        id: `${id}-cone`,
        socketJointId: `${id}-socket`,
        pos: vec(0, 0, z),
        normal: vec(0, 0, 1),
        surfaceNormal: vec(0, 0, 1),
        diameter: 1,
        height: 1,
        profile: { contactDiameterMm: 0.4, lengthMm: 2 },
    },
} as unknown as Leaf);

const brace = (id: string, startKnotId: string, endKnotId: string): Brace => ({
    id,
    modelId: 'model-a',
    startKnotId,
    endKnotId,
    profile: { diameter: 1 },
} as unknown as Brace);

test('a knot riding a leaf cone follows when a brace moves that leaf host', () => {
    resetStore();

    // The brace spans two knots; a leaf hangs off the first; a third knot
    // rides that leaf's cone. Moving the brace has to reach all three.
    addSupportEntity('leaf', leaf('leaf-a', 'knot-start', 4));
    addKnot(knot('knot-start', 'seg-x', 4));
    addKnot(knot('knot-end', 'seg-y', 10));
    // Seeded far from where the cone puts it, so a pass that never ran is
    // distinguishable from one that ran and agreed.
    addKnot(knot('knot-on-cone', 'leafCone:leaf-a', 77));
    // A knot ON the brace, seeded away from its span. The brace pass moves it,
    // which is what makes the settle report a change and run the leaf side.
    addKnot(knot('knot-on-brace', 'braceSegment:brace-a', 99));
    addSupportEntity('brace', brace('brace-a', 'knot-start', 'knot-end'));

    updateBrace(brace('brace-a', 'knot-start', 'knot-end'));

    const after = getSnapshot().knots['knot-on-cone'].pos;

    // The cone runs from its socket back along -Z for its 2mm length, so a
    // knot at t=0.5 sits at the midpoint -- not the seeded z=77.
    assert.notEqual(after.z, 77, 'the leaf-cone pass placed the knot');
    assert.equal(after.x, 0);
    assert.equal(after.y, 0);
});

test('a knot on a brace segment is placed between the brace ends', () => {
    // The brace step itself: the pass that has to run before the leaf side can
    // see anything changed.
    resetStore();

    addKnot(knot('knot-start', 'seg-x', 0));
    addKnot(knot('knot-end', 'seg-y', 10));
    addKnot(knot('knot-mid', 'braceSegment:brace-a', 99, 0.5));
    addSupportEntity('brace', brace('brace-a', 'knot-start', 'knot-end'));
    updateBrace(brace('brace-a', 'knot-start', 'knot-end'));

    const mid = getSnapshot().knots['knot-mid'].pos;

    // Halfway along a brace running z=0 to z=10, not the seeded z=99.
    assert.equal(mid.z, 5, 'the brace knot sits at its parameter along the span');
});

test('a leaf on a brace-moved knot reshapes and carries its own cone knot', () => {
    // A brace moves its segment knot, a leaf hangs off that knot, and a third
    // knot rides that leaf's cone. All three settle in one update.
    resetStore();

    addKnot(knot('knot-start', 'seg-x', 0));
    addKnot(knot('knot-end', 'seg-y', 10));
    addKnot(knot('knot-on-brace', 'braceSegment:brace-a', 99));
    addSupportEntity('brace', brace('brace-a', 'knot-start', 'knot-end'));

    // The leaf hangs off the knot the brace is about to move.
    addSupportEntity('leaf', leaf('leaf-b', 'knot-on-brace', 4));
    addKnot(knot('knot-on-leaf-b', 'leafCone:leaf-b', 88));

    updateBrace(brace('brace-a', 'knot-start', 'knot-end'));

    const braceKnot = getSnapshot().knots['knot-on-brace'].pos;
    assert.equal(braceKnot.z, 5, 'the brace moved its own knot to the span midpoint');

    const coneKnot = getSnapshot().knots['knot-on-leaf-b'].pos;
    assert.notEqual(coneKnot.z, 88, 'the leaf on that moved knot reshaped and carried its cone knot');
});
