import assert from 'node:assert/strict';
import test from 'node:test';

import { pickFanHost, leafPathCrossesSupports, type FanShaftPoint } from '../autoSupport/autoPlace';
import type { SupportState } from '../types';

function emptySnapshot(): SupportState {
    return {
        roots: {}, trunks: {}, branches: {}, leaves: {}, twigs: {}, sticks: {},
        braces: {}, anchors: {}, knots: {},
        selectedId: null, selectedCategory: null,
        hoveredId: null, hoveredCategory: 'none', interactionWarning: null,
    };
}

function trunkWithShaft(trunkId: string, x: number, y: number, z0: number, z1: number, diameter = 1): SupportState {
    const s = emptySnapshot();
    s.trunks[trunkId] = {
        id: trunkId,
        modelId: 'm',
        rootId: `r-${trunkId}`,
        segments: [{
            id: `seg-${trunkId}`,
            diameter,
            bottomJoint: { id: `${trunkId}-b`, pos: { x, y, z: z0 }, diameter: diameter + 0.2 },
            topJoint: { id: `${trunkId}-t`, pos: { x, y, z: z1 }, diameter: diameter + 0.2 },
        }],
    };
    return s;
}

const sp = (trunkId: string, x: number, y: number, z: number): FanShaftPoint => ({
    trunkId,
    pos: { x, y, z },
    diameter: 1,
});

const REGULAR_FAN = 5;
const GRID_FAN = 2.5;

test('nearest shaft wins', () => {
    const points = [sp('t1', 0, 0, 10), sp('t2', 6, 0, 10)];
    const picked = pickFanHost(points, new Set(), { x: 1, y: 0, z: 10 }, REGULAR_FAN, GRID_FAN);
    assert.equal(picked?.sp.trunkId, 't1');
});

test('grid trunk hosts fans when close enough (tight radius)', () => {
    const grid = new Set(['g1']);
    const points = [sp('g1', 0, 0, 10), sp('r1', 8, 0, 10)];
    const picked = pickFanHost(points, grid, { x: 2, y: 0, z: 10 }, REGULAR_FAN, GRID_FAN);
    assert.equal(picked?.sp.trunkId, 'g1', '2mm from the grid shaft → attach to the grid trunk');
});

test('falls back to the nearest regular trunk when the grid host is too far', () => {
    const grid = new Set(['g1']);
    const points = [sp('g1', 0, 0, 10), sp('r1', 4, 0, 10)];
    // Target 3mm from the grid shaft (> 2.5 tight cap) but 1mm from a
    // regular trunk — the long grid-host leaf is refused, the regular host wins.
    const picked = pickFanHost(points, grid, { x: 3, y: 0, z: 10 }, REGULAR_FAN, GRID_FAN);
    assert.equal(picked?.sp.trunkId, 'r1');
});

test('no host qualifies within the radii', () => {
    const grid = new Set(['g1']);
    const points = [sp('g1', 0, 0, 10), sp('r1', 9, 0, 10)];
    // 3mm from the grid shaft (beyond the tight cap) and 6mm from the
    // regular shaft (beyond the regular fan radius) → nothing.
    assert.equal(pickFanHost(points, grid, { x: 3, y: 0, z: 10 }, REGULAR_FAN, GRID_FAN), null);
});

test('regular fan radius still bounds non-grid hosts', () => {
    const points = [sp('t1', 0, 0, 10)];
    assert.equal(pickFanHost(points, new Set(), { x: 6, y: 0, z: 10 }, REGULAR_FAN, GRID_FAN), null);
});

test('leaf crossing another trunk shaft is detected', () => {
    // Host trunk at x=0; a fan from its shaft (0,0,5) to an island at (0,0,25)
    // passes straight through a second trunk at x=0, z 8..20.
    const draft = trunkWithShaft('host', 0, 0, 1, 30);
    draft.trunks['other'] = {
        id: 'other',
        modelId: 'm',
        rootId: 'r-other',
        segments: [{
            id: 'seg-other',
            diameter: 1,
            bottomJoint: { id: 'o-b', pos: { x: 0, y: 0, z: 8 }, diameter: 1.2 },
            topJoint: { id: 'o-t', pos: { x: 0, y: 0, z: 20 }, diameter: 1.2 },
        }],
    };

    assert.equal(
        leafPathCrossesSupports({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 25 }, 0.25, draft, 'host'),
        true,
        'the fan path passes through the other trunk shaft',
    );
});

test('leaf beside another trunk does not cross', () => {
    // The second trunk is 5mm away in X — the vertical fan stays clear.
    const draft = trunkWithShaft('host', 0, 0, 1, 30);
    draft.trunks['other'] = {
        id: 'other',
        modelId: 'm',
        rootId: 'r-other',
        segments: [{
            id: 'seg-other',
            diameter: 1,
            bottomJoint: { id: 'o-b', pos: { x: 5, y: 0, z: 8 }, diameter: 1.2 },
            topJoint: { id: 'o-t', pos: { x: 5, y: 0, z: 20 }, diameter: 1.2 },
        }],
    };

    assert.equal(
        leafPathCrossesSupports({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 25 }, 0.25, draft, 'host'),
        false,
        '5mm clearance is beyond leaf radius + shaft radius',
    );
});

test('host trunk itself is excluded from the crossing check', () => {
    const draft = trunkWithShaft('host', 0, 0, 1, 30);
    assert.equal(
        leafPathCrossesSupports({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 25 }, 0.25, draft, 'host'),
        false,
        'the leaf attaches to its own shaft — never flagged',
    );
});
