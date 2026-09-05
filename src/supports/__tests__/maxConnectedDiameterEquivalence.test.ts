import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMaxConnectedDiameterFromTrunk } from '../SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter';
import { originalMaxConnectedDiameterFromTrunk } from './fixtures/originalMaxConnectedDiameter';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * The widest member reachable from a trunk, which is what sizes its shaft.
 *
 * Seven per-type arms became one worklist over the registry. The two agree on
 * every graph the old one could reach; they differ only where it could not --
 * anchors and kickstands were absent from it, so a trunk connected through one
 * was sized from a truncated graph.
 *
 * Compared against the original directly rather than against expected numbers:
 * the point is that the derivation changed nothing except that omission.
 */

let nextId = 0;
const id = (prefix: string) => `${prefix}-${nextId += 1}`;

function emptyState(): SupportState {
    const state = {
        roots: {}, knots: {},
        selectedId: null, hoveredId: null,
        selectedCategory: null, hoveredCategory: 'none', interactionWarning: null,
    } as unknown as SupportState;
    for (const descriptor of SUPPORT_TYPES) {
        (state as unknown as Record<string, unknown>)[descriptor.location.key] = {};
    }
    return state;
}

const put = (state: SupportState, key: string, entity: { id: string }) => {
    (state as unknown as Record<string, Record<string, unknown>>)[key][entity.id] = entity;
};

const seg = (segId: string, diameter: number) => ({
    id: segId, diameter,
    bottomJoint: { id: `${segId}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter },
    topJoint: { id: `${segId}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter },
});

const cone = (bodyDiameterMm: number) => ({
    id: id('cone'),
    pos: { x: 0, y: 0, z: 4 }, normal: { x: 0, y: 0, z: 1 }, surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm },
});

/**
 * A random connected support graph rooted at one trunk.
 *
 * `includeOmitted` adds the two types the original walk could not see, which is
 * the only case the two implementations are expected to disagree on.
 */
function randomGraph(rand: () => number, includeOmitted: boolean) {
    const state = emptyState();
    const trunkId = id('trunk');
    const trunkSeg = id('seg');

    put(state, 'trunks', {
        id: trunkId, modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg(trunkSeg, 1 + rand() * 2)], contactCone: cone(0.8),
    } as never);

    const shafts = [trunkSeg];

    for (let i = 0; i < 6; i += 1) {
        const knotId = id('knot');
        const hostShaft = shafts[Math.floor(rand() * shafts.length)];
        put(state, 'knots', {
            id: knotId, parentShaftId: hostShaft, t: rand(),
            pos: { x: 0, y: 0, z: 2 }, diameter: 0.5 + rand() * 3,
        } as never);

        const roll = rand();
        if (roll < 0.3) {
            const branchSeg = id('seg');
            put(state, 'branches', {
                id: id('branch'), modelId: 'm', typeId: 'branch', parentKnotId: knotId,
                segments: [seg(branchSeg, 0.5 + rand() * 3)], contactCone: cone(0.6),
            } as never);
            shafts.push(branchSeg);
        } else if (roll < 0.5) {
            const leafId = id('leaf');
            put(state, 'leaves', {
                id: leafId, modelId: 'm', typeId: 'leaf',
                parentKnotId: knotId, contactCone: cone(0.4 + rand() * 2),
            } as never);
            // A leaf's cone is addressable as a shaft, so a knot can sit on it.
            if (rand() < 0.5) {
                put(state, 'knots', {
                    id: id('knot'), parentShaftId: `leafCone:${leafId}`, t: rand(),
                    pos: { x: 0, y: 0, z: 4 }, diameter: 0.5 + rand() * 4,
                } as never);
            }
        } else if (roll < 0.7) {
            const otherKnot = id('knot');
            put(state, 'knots', {
                id: otherKnot, parentShaftId: trunkSeg, t: rand(),
                pos: { x: 1, y: 0, z: 2 }, diameter: 0.5 + rand(),
            } as never);
            put(state, 'braces', {
                id: id('brace'), modelId: 'm', typeId: 'brace',
                startKnotId: knotId, endKnotId: otherKnot,
                profile: { diameter: 0.3 + rand() * 2 },
            } as never);
        } else if (roll < 0.85) {
            const twigSeg = id('seg');
            put(state, 'twigs', {
                id: id('twig'), modelId: 'm', typeId: 'twig',
                segments: [seg(twigSeg, 0.4 + rand() * 2)],
                contactDiskA: cone(0.5), contactDiskB: cone(0.5),
            } as never);
            shafts.push(twigSeg);
        } else if (includeOmitted) {
            const ksSeg = id('seg');
            put(state, 'kickstands', {
                id: id('kickstand'), modelId: 'm', typeId: 'kickstand',
                rootId: 'r', hostKnotId: knotId, hostSegmentId: trunkSeg, hostMinT: 0.2,
                segments: [seg(ksSeg, 4 + rand() * 4)],
            } as never);
            shafts.push(ksSeg);
        }
    }

    return { state, trunkId };
}

/** Deterministic PRNG, so a failure is reproducible from its seed. */
function makeRand(seed: number) {
    let value = seed;
    return () => {
        value = (value * 1103515245 + 12345) & 0x7fffffff;
        return value / 0x7fffffff;
    };
}

test('the derived walk agrees with the original on every graph it could reach', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
        nextId = seed * 1000;
        const { state, trunkId } = randomGraph(makeRand(seed), false);

        assert.equal(
            computeMaxConnectedDiameterFromTrunk(state, trunkId),
            originalMaxConnectedDiameterFromTrunk(state, trunkId),
            `seed ${seed}`,
        );
    }
});

test('a kickstand widens the graph the original could not see', () => {
    // The one intended difference. A fat kickstand hanging off a trunk was
    // invisible to the old walk, so the trunk was sized without it.
    const state = emptyState();
    put(state, 'trunks', {
        id: 'trunk-a', modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg('trunk-seg', 1)], contactCone: cone(0.5),
    } as never);
    put(state, 'knots', {
        id: 'knot-a', parentShaftId: 'trunk-seg', t: 0.5,
        pos: { x: 0, y: 0, z: 2 }, diameter: 0.6,
    } as never);
    put(state, 'kickstands', {
        id: 'ks-a', modelId: 'm', typeId: 'kickstand',
        rootId: 'r', hostKnotId: 'knot-a', hostSegmentId: 'trunk-seg', hostMinT: 0.2,
        segments: [seg('ks-seg', 9)],
    } as never);

    assert.equal(originalMaxConnectedDiameterFromTrunk(state, 'trunk-a'), 1);
    assert.equal(computeMaxConnectedDiameterFromTrunk(state, 'trunk-a'), 9);
});

test('an unknown trunk gives zero', () => {
    const state = emptyState();
    assert.equal(computeMaxConnectedDiameterFromTrunk(state, 'nope'), 0);
    assert.equal(originalMaxConnectedDiameterFromTrunk(state, 'nope'), 0);
});

test('a lone trunk reports its own widest segment', () => {
    const state = emptyState();
    put(state, 'trunks', {
        id: 'trunk-a', modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg('s1', 2), seg('s2', 5)], contactCone: cone(0.5),
    } as never);

    assert.equal(computeMaxConnectedDiameterFromTrunk(state, 'trunk-a'), 5);
    assert.equal(originalMaxConnectedDiameterFromTrunk(state, 'trunk-a'), 5);
});
