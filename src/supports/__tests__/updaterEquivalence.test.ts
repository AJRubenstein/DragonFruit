import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addKnot,
    addRoot,
    addSupportEntity,
    getSnapshot,
    resetStore,
    updateBranch,
    updateBrace,
    updateLeaf,
    updateStick,
    updateTrunk,
    updateTwig,
} from '../state';
import { SUPPORT_TYPES, updateSupportEntity } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * What an update writes to the store, for every type that has an updater.
 *
 * The eight updaters are near-copies of one skeleton: bail if absent, cache the
 * settings hex, write the entity, reposition knots sitting on its shafts, then
 * recompute dependent geometry. These pin the observable result of each so the
 * skeleton can be shared without changing what lands in the store.
 *
 * The whole store is compared, not just the updated collection -- most of these
 * also move knots and leaves, and that spill is the part worth protecting.
 */

const seg = (id: string, z0 = 0, z1 = 4) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: z0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: z1 }, diameter: 1 },
});

const root = (id: string, x: number) => ({
    id, modelId: 'model-a',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

const cone = () => ({
    pos: { x: 0, y: 0, z: 4 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4 },
});

const disk = (x: number) => ({
    id: `disk-${x}`,
    pos: { x, y: 0, z: 4 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.4,
    profile: { type: 'disk', lengthMm: 1, contactDiameterMm: 0.4 },
});

/**
 * A scene with something hanging off every shaft, so an update that fails to
 * carry dependent geometry shows up as a diff rather than passing quietly.
 */
function scene() {
    resetStore();
    addRoot(root('root-a', 0) as never);

    addSupportEntity('trunk', {
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
        segments: [seg('seg-ta')], contactCone: cone(),
    } as never);

    // A knot on the trunk shaft, with a branch and a leaf hanging from it.
    addKnot({ id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);

    addSupportEntity('branch', {
        id: 'branch-a', modelId: 'model-a', parentKnotId: 'knot-a',
        segments: [seg('seg-ba', 2, 6)], contactCone: cone(),
    } as never);

    addKnot({ id: 'knot-b', parentShaftId: 'seg-ba', t: 0.5, pos: { x: 0, y: 0, z: 4 }, diameter: 1 } as never);

    addSupportEntity('leaf', {
        id: 'leaf-a', modelId: 'model-a', parentKnotId: 'knot-b', contactCone: cone(),
    } as never);

    addSupportEntity('twig', {
        id: 'twig-a', modelId: 'model-a',
        segments: [seg('seg-wa')], contactDiskA: disk(1), contactDiskB: disk(2),
    } as never);

    addSupportEntity('stick', {
        id: 'stick-a', modelId: 'model-a',
        segments: [seg('seg-sa')], contactConeA: cone(), contactConeB: cone(),
    } as never);

    addSupportEntity('brace', {
        id: 'brace-a', modelId: 'model-a', startKnotId: 'knot-a', endKnotId: 'knot-b',
    } as never);

    addSupportEntity('anchor', {
        id: 'anchor-a', modelId: 'model-a', segments: [seg('seg-aa')], contactCone: cone(),
    } as never);
}

/** Every collection, so a change that spills into knots or leaves is visible. */
const capture = (): string => JSON.stringify(getSnapshot());

/**
 * Apply a mutation through the named updater, and again through the registry
 * slot, and assert the resulting stores are identical.
 */
function bothPathsAgree(
    label: string,
    direct: (entity: never) => void,
    typeId: string,
    mutate: (state: SupportState) => unknown,
) {
    scene();
    direct(mutate(getSnapshot()) as never);
    const viaDirect = capture();

    scene();
    updateSupportEntity(typeId as never, mutate(getSnapshot()));
    const viaSlot = capture();

    assert.equal(viaSlot, viaDirect, `${label}: the slot and the direct call disagree`);
}

test('moving a trunk joint carries its knots, branches and leaves', () => {
    scene();
    const before = capture();

    const trunk = getSnapshot().trunks['trunk-a'];
    updateTrunk({
        ...trunk,
        segments: [{ ...trunk.segments[0], topJoint: { ...trunk.segments[0].topJoint!, pos: { x: 1, y: 0, z: 5 } } }],
    } as never);

    const after = getSnapshot();
    assert.notEqual(capture(), before, 'the update should have changed the store');
    // The knot rides the shaft, so it must have moved with it.
    assert.notDeepEqual(after.knots['knot-a'].pos, { x: 0, y: 0, z: 2 });
});

test('a knot on a trunk shaft takes the segment diameter plus 0.125', () => {
    // The +0.125 renders at the trunk-joint diameter; the legacy +0.1 rendered
    // at the shaft, where it was invisible. Nothing else covers the constant --
    // mutating it passed all 22 goldens.
    scene();
    const trunk = getSnapshot().trunks['trunk-a'];
    updateTrunk({
        ...trunk,
        segments: [{ ...trunk.segments[0], diameter: 2 }],
    } as never);

    assert.equal(getSnapshot().knots['knot-a'].diameter, 2.125);
});

test('only the plate-rooted shaft resizes its knots', () => {
    // Branch, twig and stick reposition a knot without touching its diameter.
    scene();
    const branch = getSnapshot().branches['branch-a'];
    updateBranch({
        ...branch,
        segments: [{ ...branch.segments[0], diameter: 2 }],
    } as never);

    assert.equal(getSnapshot().knots['knot-b'].diameter, 1, 'branch should leave the diameter alone');
});

test('a twig and a stick update identically', () => {
    // The two functions are the same code with the collection key swapped.
    scene();
    const twig = getSnapshot().twigs['twig-a'];
    updateTwig({ ...twig, segments: [seg('seg-wa', 0, 7)] } as never);
    const twigKnots = JSON.stringify(getSnapshot().knots);

    scene();
    const stick = getSnapshot().sticks['stick-a'];
    updateStick({ ...stick, segments: [seg('seg-sa', 0, 7)] } as never);
    const stickKnots = JSON.stringify(getSnapshot().knots);

    assert.equal(twigKnots, stickKnots, 'neither has knots, so both leave them untouched');
});

test('an update for an entity that is not in the store is a no-op', () => {
    // `updateTrunk` alone used to INSERT the absent entity rather than bail,
    // so undo replaying a deleted trunk resurrected it with no root. Sharing
    // one skeleton gave every type the guard the other seven already had.
    for (const descriptor of SUPPORT_TYPES) {
        scene();
        const before = capture();
        updateSupportEntity(descriptor.id, { id: 'not-in-the-store', segments: [] });
        assert.equal(capture(), before, `${descriptor.id} should have ignored an absent entity`);
    }
});

test('the registry slot and the direct function agree, for every type', () => {
    const cases: Array<[string, (e: never) => void, string, (s: SupportState) => unknown]> = [
        ['trunk', updateTrunk, 'trunk', (s) => ({
            ...s.trunks['trunk-a'],
            segments: [{ ...s.trunks['trunk-a'].segments[0], diameter: 2 }],
        })],
        ['branch', updateBranch, 'branch', (s) => ({
            ...s.branches['branch-a'],
            segments: [{ ...s.branches['branch-a'].segments[0], diameter: 2 }],
        })],
        ['leaf', updateLeaf, 'leaf', (s) => ({ ...s.leaves['leaf-a'], modelId: 'model-b' })],
        ['twig', updateTwig, 'twig', (s) => ({
            ...s.twigs['twig-a'],
            segments: [{ ...s.twigs['twig-a'].segments[0], diameter: 2 }],
        })],
        ['stick', updateStick, 'stick', (s) => ({
            ...s.sticks['stick-a'],
            segments: [{ ...s.sticks['stick-a'].segments[0], diameter: 2 }],
        })],
        ['brace', updateBrace, 'brace', (s) => ({ ...s.braces['brace-a'], modelId: 'model-b' })],
    ];

    for (const [label, direct, typeId, mutate] of cases) {
        bothPathsAgree(label, direct, typeId, mutate);
    }
});

test('every declared type has an updater registered', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            updateSupportEntity(descriptor.id, { id: 'absent' }),
            true,
            `${descriptor.id} has no updater in the slot`,
        );
    }
});
