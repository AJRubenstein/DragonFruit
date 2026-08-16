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

test('grids a large flat region at sqrt(areaPerSupport) spacing', () => {
    // 20×20 face, area 400, density 8 mm²/support → spacing 2.83 → ~49 points.
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400)], settings);

    assert.ok(candidates.length >= 40 && candidates.length <= 60,
        `grid count ${candidates.length} ≈ 400/8 = 50`);
    assert.ok(candidates.every((c) => c.gridPoint === true), 'grid points are standalone trunks');
    assert.ok(candidates.every((c) => c.source === 'overhang'));

    // Spacing between consecutive points along each axis ≈ √8 ≈ 2.83.
    const xs = [...new Set(candidates.map((c) => c.tipPos.x))].sort((a, b) => a - b);
    const spacing = xs[1] - xs[0];
    assert.ok(Math.abs(spacing - Math.sqrt(8)) < 0.01, `spacing ${spacing} ≈ 2.83`);
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

test('surface-snaps grid points onto the model face', () => {
    // Box with underside at z = 20; region baseZ = 20. Points inside the face
    // resolve tipZ ≈ 20 (sloped/offset surfaces get their real Z).
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    geometry.translate(0, 0, 25); // underside at z=20
    const mesh = new THREE.Mesh(geometry);

    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -4, 4, -4, 4, 64, 20)], settings, mesh);

    assert.ok(candidates.length > 0);
    for (const c of candidates) {
        assert.ok(Math.abs(c.tipPos.z - 20) < 0.6,
            `tip z ${c.tipPos.z.toFixed(2)} ≈ underside 20`);
    }
});

test('falls back to region baseZ without a mesh', () => {
    const settings = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8, gridAreaThresholdMm2: 25 };
    const candidates = generateGridCandidates([rectRegion('o0', -10, 10, -10, 10, 400, 6.5)], settings);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((c) => Math.abs(c.tipPos.z - 6.5) < 1e-6));
});
