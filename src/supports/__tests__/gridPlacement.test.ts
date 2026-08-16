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
    angleDeg = 0,
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
        overhangAngleDeg: angleDeg,
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

test('grids a large flat region with dynamic spacing (never cut off)', () => {
    // 20×20 flat anchor surface (angle 0°), target density 8 mm²/support →
    // base spacing 2.83, but flat surfaces grid at 0.7× = 1.98 mm. The
    // spacing adjusts per axis to span the full region: nx = round(20/1.98)
    // = 10 → spacingX = 20/10 = 2.0, 11 columns exactly from -10 to +10.
    // The outer ring lands ON the boundary, so straight edges need no fill.
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400)], settings);

    assert.ok(candidates.length >= 115 && candidates.length <= 127,
        `flat grid count ${candidates.length} ≈ 11×11 = 121 (densified)`);
    assert.ok(candidates.every((c) => c.gridPoint === true), 'points are standalone trunks');
    assert.ok(candidates.every((c) => c.source === 'overhang'));
    assert.equal(candidates.filter((c) => c.id.startsWith('fill-')).length, 0,
        'rectangle needs no boundary fill (outer ring covers it)');

    // Equal spacing, spanning the full region — the far edge is not cut off.
    const xs = [...new Set(candidates.filter((c) => c.id.startsWith('grid-')).map((c) => c.tipPos.x))].sort((a, b) => a - b);
    assert.ok(Math.abs(xs[0] + 10) < 1e-9, `grid starts on the boundary (x=${xs[0]})`);
    assert.ok(Math.abs(xs[xs.length - 1] - 10) < 1e-9, `grid reaches the far boundary (x=${xs[xs.length - 1]})`);
    const spacingX = xs[1] - xs[0];
    assert.ok(Math.abs(spacingX - 2.0) < 1e-9, `uniform spacing ${spacingX} = 20/10`);
    for (let i = 1; i < xs.length; i++) {
        assert.ok(Math.abs((xs[i] - xs[i - 1]) - spacingX) < 1e-9, 'spacing is perfectly uniform');
    }
});

test('angle-aware density: flat anchor surfaces grid denser than slopes', () => {
    // Same 20×20 region, same density setting — only the surface angle
    // differs. Flat (0°) → spacing 2.83×0.7 ≈ 1.98 → ~11×11.
    // 40° slope → spacing 2.83×1.28 ≈ 3.63 → ~6×6.
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const flat = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400, 6.5, 0)], settings);
    const slope = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400, 6.5, 40)], settings);

    assert.ok(flat.length > slope.length,
        `flat (${flat.length}) denser than 40° slope (${slope.length})`);
    assert.ok(flat.length >= 115, `flat grids densified (${flat.length})`);
    assert.ok(slope.length <= 60, `steep slope grids sparser (${slope.length})`);
    assert.equal(slope.filter((c) => c.id.startsWith('fill-')).length, 0,
        'rectangle needs no boundary fill at any angle');
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
