import assert from 'node:assert/strict';
import test from 'node:test';

import { pickFanHost, type FanShaftPoint } from '../autoSupport/autoPlace';

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
