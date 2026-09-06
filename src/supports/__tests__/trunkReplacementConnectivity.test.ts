import assert from 'node:assert/strict';
import test from 'node:test';

import { collectConnectedToTrunk } from '../SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement';
import { originalCollectConnectedToTrunk } from './fixtures/originalTrunkConnectivity';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState, Trunk } from '../types';

/**
 * Everything a trunk replacement has to carry over: the branch tree hanging
 * from it, and the leaves, braces and knots on that tree.
 *
 * The tree is grown with a worklist. These compare it against the original
 * fixpoint directly, since a green suite alone does not establish that a graph
 * algorithm on an uncovered path still returns the same set.
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

const seg = (segId: string) => ({
    id: segId, diameter: 1,
    bottomJoint: { id: `${segId}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${segId}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const cone = () => ({
    id: id('cone'),
    pos: { x: 0, y: 0, z: 4 }, normal: { x: 0, y: 0, z: 1 }, surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

/** Deterministic PRNG, so a failing seed is reproducible. */
function makeRand(seed: number) {
    let value = seed;
    return () => {
        value = (value * 1103515245 + 12345) & 0x7fffffff;
        return value / 0x7fffffff;
    };
}

/**
 * A trunk with a randomly shaped branch tree on it, plus leaves and braces.
 *
 * Branches hang off knots, and a branch's own segments carry more knots, so the
 * tree can nest arbitrarily deep.
 */
function randomTree(rand: () => number, depth: number) {
    const state = emptyState();
    const trunkSeg = id('seg');
    const trunk = {
        id: id('trunk'), modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg(trunkSeg)], contactCone: cone(),
    } as unknown as Trunk;
    put(state, 'trunks', trunk);

    let frontier = [trunkSeg];

    for (let level = 0; level < depth; level += 1) {
        const nextFrontier: string[] = [];

        for (const shaft of frontier) {
            const branchCount = Math.floor(rand() * 3);
            for (let i = 0; i < branchCount; i += 1) {
                const knotId = id('knot');
                put(state, 'knots', {
                    id: knotId, parentShaftId: shaft, t: rand(),
                    pos: { x: 0, y: 0, z: 2 }, diameter: 1,
                } as never);

                const roll = rand();
                if (roll < 0.6) {
                    const branchSeg = id('seg');
                    put(state, 'branches', {
                        id: id('branch'), modelId: 'm', typeId: 'branch',
                        parentKnotId: knotId, segments: [seg(branchSeg)], contactCone: cone(),
                    } as never);
                    nextFrontier.push(branchSeg);
                } else if (roll < 0.8) {
                    put(state, 'leaves', {
                        id: id('leaf'), modelId: 'm', typeId: 'leaf',
                        parentKnotId: knotId, contactCone: cone(),
                    } as never);
                } else {
                    const otherKnot = id('knot');
                    put(state, 'knots', {
                        id: otherKnot, parentShaftId: trunkSeg, t: rand(),
                        pos: { x: 1, y: 0, z: 2 }, diameter: 1,
                    } as never);
                    put(state, 'braces', {
                        id: id('brace'), modelId: 'm', typeId: 'brace',
                        startKnotId: knotId, endKnotId: otherKnot,
                    } as never);
                }
            }
        }

        frontier = nextFrontier;
        if (frontier.length === 0) break;
    }

    return { state, trunk };
}

const sorted = (ids: Iterable<string>) => Array.from(ids).sort();

test('the worklist finds exactly what the fixpoint found', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
        nextId = seed * 10000;
        const { state, trunk } = randomTree(makeRand(seed), 4);

        const now = collectConnectedToTrunk(state, trunk);
        const before = originalCollectConnectedToTrunk(state, trunk);

        assert.deepEqual(sorted(now.connectedBranchIds), sorted(before.connectedBranchIds), `seed ${seed}: branches`);
        assert.deepEqual(sorted(now.connectedLeafIds), sorted(before.connectedLeafIds), `seed ${seed}: leaves`);
        assert.deepEqual(sorted(now.connectedBraceIds), sorted(before.connectedBraceIds), `seed ${seed}: braces`);
        assert.deepEqual(sorted(now.connectedKnotIds), sorted(before.connectedKnotIds), `seed ${seed}: knots`);
    }
});

test('a deep chain resolves the same as the fixpoint did', () => {
    // Each branch hangs off a knot on the previous one.
    const state = emptyState();
    const trunkSeg = id('seg');
    const trunk = {
        id: 'trunk-deep', modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg(trunkSeg)], contactCone: cone(),
    } as unknown as Trunk;
    put(state, 'trunks', trunk);

    let shaft = trunkSeg;
    for (let i = 0; i < 60; i += 1) {
        const knotId = `k-${i}`;
        put(state, 'knots', {
            id: knotId, parentShaftId: shaft, t: 0.5,
            pos: { x: 0, y: 0, z: i }, diameter: 1,
        } as never);
        const branchSeg = `bs-${i}`;
        put(state, 'branches', {
            id: `b-${i}`, modelId: 'm', typeId: 'branch',
            parentKnotId: knotId, segments: [seg(branchSeg)], contactCone: cone(),
        } as never);
        shaft = branchSeg;
    }

    const now = collectConnectedToTrunk(state, trunk);
    const before = originalCollectConnectedToTrunk(state, trunk);

    assert.equal(now.connectedBranchIds.size, 60, 'the whole chain should be reached');
    assert.deepEqual(sorted(now.connectedBranchIds), sorted(before.connectedBranchIds));
    assert.deepEqual(sorted(now.connectedKnotIds), sorted(before.connectedKnotIds));
});

test('a trunk with nothing on it carries nothing', () => {
    const state = emptyState();
    const trunk = {
        id: 'lonely', modelId: 'm', typeId: 'trunk', rootId: 'r',
        segments: [seg('lonely-seg')], contactCone: cone(),
    } as unknown as Trunk;
    put(state, 'trunks', trunk);

    const now = collectConnectedToTrunk(state, trunk);
    assert.equal(now.connectedBranchIds.size, 0);
    assert.equal(now.connectedLeafIds.size, 0);
    assert.equal(now.connectedBraceIds.size, 0);
});
