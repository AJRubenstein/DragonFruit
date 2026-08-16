import assert from 'node:assert/strict';
import test from 'node:test';

import { sizeParameters, presetForArea } from '../autoSupport/parameterSizing';
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

test('presetForArea maps the empirical bands', () => {
    assert.equal(presetForArea(0.1), 'detail');
    assert.equal(presetForArea(0.15), 'detail');
    assert.equal(presetForArea(0.3), 'structure');
    assert.equal(presetForArea(0.5), 'structure');
    assert.equal(presetForArea(1), 'anchor');
    assert.equal(presetForArea(8), 'anchor');
});

test('density-grid cell sizes an anchor-band trunk (preset-guided)', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 1.2, 'anchor preset shaft — not physics-fat, not too light');
    assert.equal(s.rootsDiameterMm, 2.0);
    assert.equal(s.tipContactDiameterMm, 0.4, 'flat ceiling gets the full anchor contact');
});

test('detail islands get the detail band', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 0.1, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 0.8);
    assert.equal(s.rootsDiameterMm, 2.0);
    assert.ok(s.tipContactDiameterMm! >= 0.22, 'detail contact (floored at shaft × 0.3)');
});

test('bands track the built-in detail/structure/anchor presets', () => {
    const band = (areaMm2: number) => sizeParameters(makeCandidate({ islandAreaMm2: areaMm2, zHeight: 10 }));
    assert.equal(band(0.1).shaftDiameterMm, 0.8);
    assert.equal(band(0.3).shaftDiameterMm, 1.0);
    assert.equal(band(1).shaftDiameterMm, 1.2);
});

test('taller supports are mildly thicker (capped +25%)', () => {
    const low = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const high = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 90 }))!;
    assert.ok(high.shaftDiameterMm! > low.shaftDiameterMm!, 'taller → thicker');
    assert.ok(high.shaftDiameterMm! <= 1.2 * 1.25 + 1e-9, 'height cap holds');
});

test('a trunk merging several islands gets a capped bump', () => {
    const single = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const merged = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }), 40)!;
    assert.ok(merged.shaftDiameterMm! > single.shaftDiameterMm!, 'cluster → thicker');
    assert.ok(merged.shaftDiameterMm! <= 1.2 * 1.2 + 1e-9, 'carried-area cap holds');
});

test('flat ceilings get the full preset contact, steep slopes less', () => {
    const flat = sizeParameters(makeCandidate({ islandAreaMm2: 8, tipNormal: { x: 0, y: 0, z: -1 } }))!;
    const slope = sizeParameters(makeCandidate({
        islandAreaMm2: 8,
        tipNormal: { x: 0, y: -0.5, z: -0.866 }, // 30° from straight-down
    }))!;
    assert.ok(flat.tipContactDiameterMm! > slope.tipContactDiameterMm!, 'flat > slope');
    assert.equal(flat.tipContactDiameterMm, 0.4, 'flat never exceeds the preset contact');
});

test('sizing is deterministic', () => {
    const a = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    const b = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    assert.deepEqual(a, b);
});
