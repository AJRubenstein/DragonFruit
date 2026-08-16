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

test('density-grid cell sizes a slim anchor trunk (not physics-fat)', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 0.8, '8mm² cell → 0.8mm shaft, not ~1.5mm');
    assert.equal(s.rootsDiameterMm, 1.6);
    assert.ok(s.tipContactDiameterMm! >= 0.38, 'flat ceiling keeps a full contact');
});

test('detail islands get the thin band', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 0.1, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 0.6);
    assert.equal(s.rootsDiameterMm, 1.2);
});

test('taller supports are mildly thicker (capped +25%)', () => {
    const low = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const high = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 90 }))!;
    assert.ok(high.shaftDiameterMm! > low.shaftDiameterMm!, 'taller → thicker');
    assert.ok(high.shaftDiameterMm! <= 0.8 * 1.25 + 1e-9, 'height cap holds');
});

test('a trunk merging several islands gets a capped bump', () => {
    const single = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const merged = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }), undefined, 40)!;
    assert.ok(merged.shaftDiameterMm! > single.shaftDiameterMm!, 'cluster → thicker');
    assert.ok(merged.shaftDiameterMm! <= 0.8 * 1.2 + 1e-9, 'carried-area cap holds');
});

test('flat ceilings get bigger tips than steep slopes', () => {
    const flat = sizeParameters(makeCandidate({ islandAreaMm2: 8, tipNormal: { x: 0, y: 0, z: -1 } }))!;
    const slope = sizeParameters(makeCandidate({
        islandAreaMm2: 8,
        tipNormal: { x: 0, y: -0.5, z: -0.866 }, // 30° from straight-down
    }))!;
    assert.ok(flat.tipContactDiameterMm! > slope.tipContactDiameterMm!);
});

test('sizing is deterministic', () => {
    const a = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    const b = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    assert.deepEqual(a, b);
});
