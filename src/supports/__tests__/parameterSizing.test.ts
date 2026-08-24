import assert from 'node:assert/strict';
import test from 'node:test';

import { sizeParameters, presetForArea } from '../autoSupport/parameterSizing';
import { setSettings, getSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import type { CandidatePoint } from '../autoSupport/types';

function makeCandidate(over: Partial<CandidatePoint> = {}): CandidatePoint {
    return {
        id: 'c',
        tipPos: { x: 0, y: 0, z: 10 },
        tipNormal: { x: 0, y: 0, z: -1 },
        modelId: 'm',
        source: 'voxel',
        islandAreaMm2: 0.1,
        zHeight: 10,
        priority: 0,
        ...over,
    };
}

/** Apply a profile band (as a profile switch would) and restore after. */
function withBand<T>(band: { shaft: number; tip?: number; roots?: number }, fn: () => T): T {
    const prev = getSettings();
    const defaults = createDefaultSettings();
    setSettings({
        ...defaults,
        shaft: { ...defaults.shaft, diameterMm: band.shaft },
        tip: { ...defaults.tip, contactDiameterMm: band.tip ?? 0.3 },
        roots: { ...defaults.roots, diameterMm: band.roots ?? 3.0 },
    });
    try {
        return fn();
    } finally {
        setSettings(prev);
    }
}

test('presetForArea maps the empirical bands', () => {
    assert.equal(presetForArea(0.1), 'detail');
    assert.equal(presetForArea(0.15), 'detail');
    assert.equal(presetForArea(0.3), 'structure');
    assert.equal(presetForArea(0.5), 'structure');
    assert.equal(presetForArea(1), 'anchor');
    assert.equal(presetForArea(8), 'anchor');
});

test('density-grid cell sits FLAT at the active profile band', () => {
    withBand({ shaft: 1.2, tip: 0.4, roots: 2.0 }, () => {
        const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
        assert.equal(s.shaftDiameterMm, 1.2, 'a cell reads exactly the active band — not the cell area');
        assert.equal(s.rootsDiameterMm, 2.0);
        assert.equal(s.tipContactDiameterMm, 0.4, 'flat ceiling gets the full profile contact');
    });
});

test('the band follows the hardcoded profile (light < medium < heavy)', () => {
    // The regression: the old area-derived curve sized a light 16 mm² cell
    // THICKER than a heavy 5 mm² cell. The band must come from the profile.
    const shaftAt = (shaft: number) => withBand({ shaft }, () => (
        sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 })).shaftDiameterMm!
    ));
    assert.equal(shaftAt(0.8), 0.8, 'light profile band');
    assert.equal(shaftAt(1.0), 1.0, 'medium profile band');
    assert.equal(shaftAt(1.2), 1.2, 'heavy profile band');
});

test('shafts never go below the active band', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 0.001, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 1.0, 'floor = the active (default) band');
});

test('big islands extend beyond the band on the log tail', () => {
    const shaftAt = (areaMm2: number) => sizeParameters(makeCandidate({ islandAreaMm2: areaMm2, zHeight: 10 })).shaftDiameterMm!;
    assert.ok(shaftAt(100) > 1.0, `100 mm² island is thicker than the band (${shaftAt(100)})`);
    assert.ok(Math.abs(shaftAt(100) - 1.152) < 0.01, `100 mm² → ~1.152 (${shaftAt(100)})`);
    // The halved slope keeps the tail below the anchor girth at realistic sizes:
    // 0.06·ln(area/8) crosses ×1.25 only beyond ~516 mm².
    assert.ok(shaftAt(100) < 1.25, 'tail stays under the anchor girth at 100 mm²');
    assert.ok(shaftAt(10000) <= 2.0, 'tail caps at 2.0');
});

test('taller supports are mildly thicker (capped +25%)', () => {
    const low = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const high = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 90 }))!;
    assert.ok(high.shaftDiameterMm! > low.shaftDiameterMm!, 'taller → thicker');
    assert.ok(high.shaftDiameterMm! <= 1.0 * 1.25 + 1e-9, 'height cap holds');
});

test('flat ceilings get the full profile contact, steep slopes less', () => {
    withBand({ shaft: 1.2, tip: 0.4 }, () => {
        const flat = sizeParameters(makeCandidate({ islandAreaMm2: 8, tipNormal: { x: 0, y: 0, z: -1 } }))!;
        const slope = sizeParameters(makeCandidate({
            islandAreaMm2: 8,
            tipNormal: { x: 0, y: -0.5, z: -0.866 }, // 30° from straight-down
        }))!;
        assert.ok(flat.tipContactDiameterMm! > slope.tipContactDiameterMm!, 'flat > slope');
        assert.equal(flat.tipContactDiameterMm, 0.4, 'flat never exceeds the profile contact');
    });
});

test('size scale multiplies the bands', () => {
    const base = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const scaled = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }), 1.5)!;
    assert.ok(Math.abs(scaled.shaftDiameterMm! - base.shaftDiameterMm! * 1.5) < 1e-9, 'shaft scales');
    assert.ok(Math.abs(scaled.rootsDiameterMm! - base.rootsDiameterMm! * 1.5) < 1e-9, 'roots scale');
});

test('sizing is deterministic', () => {
    const a = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    const b = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    assert.deepEqual(a, b);
});
