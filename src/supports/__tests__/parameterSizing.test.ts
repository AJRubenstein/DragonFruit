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
    assert.equal(s.shaftDiameterMm, 1.2, 'a cell (8 mm²) sits exactly at the anchor value');
    assert.equal(s.rootsDiameterMm, 2.0);
    assert.equal(s.tipContactDiameterMm, 0.4, 'flat ceiling gets the full anchor contact');
});

test('detail islands get the detail band', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 0.1, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 0.8);
    assert.equal(s.rootsDiameterMm, 2.0);
    assert.ok(s.tipContactDiameterMm! >= 0.22, 'detail contact (floored at shaft × 0.3)');
});

test('shafts never go below the detail value', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 0.001, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, 0.8, 'floor = detail preset');
});

test('the shaft curve tracks the preset values at the band points', () => {
    const shaftAt = (areaMm2: number) => sizeParameters(makeCandidate({ islandAreaMm2: areaMm2, zHeight: 10 })).shaftDiameterMm!;
    assert.equal(shaftAt(0.1), 0.8, 'detail point');
    assert.ok(Math.abs(shaftAt(0.3) - 0.886) < 0.01, `structure lerp (${shaftAt(0.3)})`);
    assert.ok(Math.abs(shaftAt(1) - 1.013) < 0.01, `toward anchor (${shaftAt(1)})`);
    assert.equal(shaftAt(8), 1.2, 'anchor at the cell reference area');
});

test('large supported areas extend beyond anchor on the log tail', () => {
    const shaftAt = (areaMm2: number) => sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }), areaMm2).shaftDiameterMm!;
    assert.ok(shaftAt(100) > 1.2, `100 mm² trunk is thicker than anchor (${shaftAt(100)})`);
    assert.ok(Math.abs(shaftAt(100) - 1.503) < 0.01, `100 mm² → ~1.5 (${shaftAt(100)})`);
    assert.ok(shaftAt(10000) <= 2.0, 'tail caps at 2.0');
});

test('taller supports are mildly thicker (capped +25%)', () => {
    const low = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const high = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 90 }))!;
    assert.ok(high.shaftDiameterMm! > low.shaftDiameterMm!, 'taller → thicker');
    assert.ok(high.shaftDiameterMm! <= 1.2 * 1.25 + 1e-9, 'height cap holds');
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

test('size scale multiplies the bands', () => {
    const base = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }))!;
    const scaled = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }), undefined, 1.5)!;
    assert.ok(Math.abs(scaled.shaftDiameterMm! - base.shaftDiameterMm! * 1.5) < 1e-9, 'shaft scales');
    assert.ok(Math.abs(scaled.rootsDiameterMm! - base.rootsDiameterMm! * 1.5) < 1e-9, 'roots scale');
});

test('sizing is deterministic', () => {
    const a = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    const b = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 25, tipNormal: { x: 0.2, y: 0.3, z: -0.93 } }));
    assert.deepEqual(a, b);
});
