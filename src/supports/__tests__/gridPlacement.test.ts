import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { generateGridCandidates } from '../autoSupport/gridPlacement';
import { createDefaultAutoSupportSettings } from '../autoSupport/settings';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Overhang island with a rectangular footprint mask at 0.25 mm spacing. */
function rectRegion(
    id: string,
    minX: number, maxX: number, minY: number, maxY: number,
    areaMm2: number,
    baseZ = 6.5,
): DetectedIsland {
    const contactVoxels: { x: number; y: number }[] = [];
    for (let x = minX; x <= maxX; x += 0.25) {
        for (let y = minY; y <= maxY; y += 0.25) {
            contactVoxels.push({ x, y });
        }
    }
    return {
        id,
        source: 'overhang',
        contact: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, baseZ),
        baseZ,
        areaMm2,
        contactVoxels,
    };
}

/** Ring region: outer 20×20, hole 6×6 in the middle. */
function ringRegion(id: string, areaMm2: number): DetectedIsland {
    const contactVoxels: { x: number; y: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            const inHole = Math.abs(x) < 3 && Math.abs(y) < 3;
            if (!inHole) contactVoxels.push({ x, y });
        }
    }
    return {
        id,
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2,
        contactVoxels,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('grids a large flat region as a boundary-aligned lattice', () => {
    // 20×20 face, density 8 mm²/support → spacing 2.83. The lattice starts
    // ON the boundary (−10 + k·2.83): 8 per axis → 64, outer ring = perimeter.
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400)], settings);

    assert.ok(candidates.length >= 60 && candidates.length <= 68,
        `lattice count ${candidates.length} ≈ 8×8 = 64`);
    assert.ok(candidates.every((c) => c.gridPoint === true), 'grid points are standalone trunks');
    assert.ok(candidates.every((c) => c.source === 'overhang'));

    // The outer ring sits ON the boundary (the perimeter is the lattice ring).
    const xs = [...new Set(candidates.map((c) => c.tipPos.x))].sort((a, b) => a - b);
    assert.ok(Math.abs(xs[0] + 10) < 0.01, `lattice starts on the boundary (x=${xs[0].toFixed(2)})`);
    assert.ok(Math.abs(xs[xs.length - 1] - 9.8) < 0.01, `last column near the far boundary (x=${xs[xs.length - 1].toFixed(2)})`);
    const spacing = xs[1] - xs[0];
    assert.ok(Math.abs(spacing - Math.sqrt(8)) < 0.01, `uniform spacing ${spacing} ≈ 2.83`);
});

test('skips regions below the grid area threshold', () => {
    const settings = { ...createDefaultAutoSupportSettings(), gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 10)], settings);
    assert.equal(candidates.length, 0, 'small region gets a single support, not a grid');
});

test('respects footprint containment (no supports in the hole)', () => {
    // Ring region: grid points inside the 6×6 hole must be excluded.
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([ringRegion('o0', 364)], settings);

    assert.ok(candidates.length > 0, 'ring produces grid points');
    for (const c of candidates) {
        // Hole is 6×6 centered; grid points must stay out of the inner core
        // (≥0.5 mm from the ring's edge pixels given the mask tolerance).
        assert.ok(Math.abs(c.tipPos.x) >= 2.5 || Math.abs(c.tipPos.y) >= 2.5,
            `no support in the hole core: (${c.tipPos.x.toFixed(1)}, ${c.tipPos.y.toFixed(1)})`);
    }
});

test('uses the region surface Z at each grid point (sloped facet)', () => {
    // A 45°-sloped facet: the surface Z at a grid point must come from the
    // region's own footprint voxels, not a whole-mesh raycast (which hits the
    // wrong face on slopes). Voxels carry their true Z.
    const contactVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            contactVoxels.push({ x, y, z: 6.5 + (y + 10) * 0.7 }); // slope
        }
    }
    const sloped: DetectedIsland = {
        id: 'o0',
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2: 400,
        contactVoxels,
    };

    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([sloped], settings);

    assert.ok(candidates.length > 0);
    for (const c of candidates) {
        // At y = -10 the slope Z is 6.5; at y = 10 it is 20.5.
        const expected = 6.5 + (c.tipPos.y + 10) * 0.7;
        assert.ok(Math.abs(c.tipPos.z - expected) < 0.3,
            `tip z ${c.tipPos.z.toFixed(2)} ≈ slope z ${expected.toFixed(2)} at y=${c.tipPos.y.toFixed(1)}`);
    }
});

test('falls back to region baseZ when voxels carry no Z', () => {
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400, 6.5)], settings);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((c) => Math.abs(c.tipPos.z - 6.5) < 1e-6));
});
