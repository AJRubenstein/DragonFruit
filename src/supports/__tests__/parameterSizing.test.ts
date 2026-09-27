import assert from 'node:assert/strict';
import test from 'node:test';

import {
    sizeParameters,
    presetForArea,
    activeSizingBand,
    HEIGHT_MAX_FACTOR,
    HEIGHT_REFERENCE_MM,
    SHARE_MAX_FACTOR,
    SIZE_MAX_FACTOR,
} from '../autoSupport/parameterSizing';
import type { ModelSizingContext } from '../autoSupport/parameterSizing';
import { setSettings, getSettings, updateAutoSupportSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import type { CandidatePoint } from '../autoSupport/types';
import type { AutoSupportSettings } from '../autoSupport/settings';

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

/** Switch the auto-support sizing tier (as the panel quick-select would)
 *  and restore after. Sizing deliberately ignores the global shaft/tip/roots
 *  — trunk presets are for manual placement. */
function withTier<T>(tier: 'detail' | 'structure' | 'anchor', fn: () => T): T {
    const prev = getSettings().autoSupport;
    updateAutoSupportSettings({ sizingPreset: tier } as Partial<AutoSupportSettings>);
    try {
        return fn();
    } finally {
        updateAutoSupportSettings({ ...prev });
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

test('density-grid cell sits FLAT at the active sizing tier', () => {
    withTier('anchor', () => {
        const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
        assert.equal(s.shaftDiameterMm, 1.4, 'a cell reads exactly the tier band — not the cell area');
        assert.equal(s.rootsDiameterMm, 2.3);
        // The 30%-of-shaft floor binds at factory band ratios (0.4 < 1.4/3).
        assert.ok(Math.abs(s.tipContactDiameterMm! - 0.42) < 1e-9,
            `flat ceiling contact floored at 30% of shaft (${s.tipContactDiameterMm})`);
    });
});

test('the band follows the hardcoded tier (detail < structure < anchor)', () => {
    // The regression: the old area-derived curve sized a light 16 mm² cell
    // THICKER than a heavy 5 mm² cell. The band must come from the tier.
    const shaftAt = (tier: 'detail' | 'structure' | 'anchor') => withTier(tier, () => (
        sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 })).shaftDiameterMm!
    ));
    assert.equal(shaftAt('detail'), 0.8, 'detail tier band');
    assert.equal(shaftAt('structure'), 1.0, 'structure tier band');
    assert.equal(shaftAt('anchor'), 1.4, 'anchor tier band');
});

test('sizing ignores the global shaft/tip bands (trunk presets are manual-only)', () => {
    // Selecting a thin manual preset must not thin the next auto run.
    const prev = getSettings();
    const defaults = createDefaultSettings();
    setSettings({
        ...defaults,
        shaft: { ...defaults.shaft, diameterMm: 0.5 },
        tip: { ...defaults.tip, contactDiameterMm: 0.1 },
    });
    try {
        const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
        assert.equal(s.shaftDiameterMm, activeSizingBand().shaftDiameterMm,
            'sizing reads the auto-support tier, not the global preset');
    } finally {
        setSettings(prev);
    }
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

test('taller supports are thicker, floored at the band and capped', () => {
    const band = activeSizingBand().shaftDiameterMm;
    const at = (zHeight: number) => sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight })).shaftDiameterMm!;
    // At or below the reference the support is exactly at its band — a short
    // support is never thinned by the height term.
    assert.equal(at(10), band, 'below the height reference: band');
    assert.equal(at(HEIGHT_REFERENCE_MM), band, 'at the height reference: band');
    assert.ok(at(90) > at(40), 'longer → thicker');
    assert.ok(at(90) <= band * HEIGHT_MAX_FACTOR + 1e-9, 'height cap holds');
    assert.equal(at(90), at(400), 'saturates at the cap');
});

test('a bigger print gets thicker trunks than a small one', () => {
    const ctx = (modelSizeMm: number): ModelSizingContext => ({
        modelVolumeMm3: 27000, totalCandidates: 100, modelSizeMm,
    });
    const candidate = makeCandidate({ islandAreaMm2: 8, zHeight: 40 });
    const mini = sizeParameters(candidate, 1, ctx(40))!;
    const mid = sizeParameters(candidate, 1, ctx(150))!;
    const large = sizeParameters(candidate, 1, ctx(400))!;
    assert.deepEqual(mini, sizeParameters(candidate), 'a mini is the band, exactly');
    assert.ok(mid.shaftDiameterMm! > mini.shaftDiameterMm!, 'mid-size model is thicker');
    assert.ok(large.shaftDiameterMm! > mid.shaftDiameterMm!, 'larger model is thicker again');
    assert.ok(
        large.shaftDiameterMm! <= mini.shaftDiameterMm! * SIZE_MAX_FACTOR * SHARE_MAX_FACTOR + 1e-9,
        'the factors bound the growth',
    );
    assert.ok(large.rootsDiameterMm! > mini.rootsDiameterMm!, 'the pad scales with the trunk');
    assert.ok(large.tipContactDiameterMm! > mini.tipContactDiameterMm!, 'the tip floor rides the shaft');
});

test('a heavy share per support thickens, an easy one does not', () => {
    const candidate = makeCandidate({ islandAreaMm2: 8, zHeight: 10 });
    const share = (totalCandidates: number) => sizeParameters(candidate, 1, {
        modelVolumeMm3: 400000, totalCandidates, modelSizeMm: 60,
    })!;
    // 440 g over 4000 supports = 0.11 g each: below the reference, at band.
    assert.equal(share(4000).shaftDiameterMm, sizeParameters(candidate).shaftDiameterMm, 'easy share: band');
    assert.ok(share(400).shaftDiameterMm! > share(4000).shaftDiameterMm!, 'more mass each → thicker');
    assert.ok(share(20).shaftDiameterMm! <= 1.0 * SHARE_MAX_FACTOR + 1e-9, 'share cap holds');
});

test('sizing without a model context is exactly the band', () => {
    // Short support, no context: no height term, no model terms.
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
    assert.equal(s.shaftDiameterMm, activeSizingBand().shaftDiameterMm,
        'no context = no model factors: manual paths and existing callers are untouched');
    assert.equal(s.rootsDiameterMm, activeSizingBand().rootDiameterMm, 'roots too');
});

test('tip contact never drops below 30% of the shaft', () => {
    // At factory band ratios the 30% floor binds before the angle factor
    // differentiates — the floor is the guarantee that matters.
    withTier('structure', () => {
        const flat = sizeParameters(makeCandidate({ islandAreaMm2: 8, tipNormal: { x: 0, y: 0, z: -1 } }))!;
        const slope = sizeParameters(makeCandidate({
            islandAreaMm2: 8,
            tipNormal: { x: 0, y: -0.5, z: -0.866 }, // 30° from straight-down
        }))!;
        assert.ok(Math.abs(flat.tipContactDiameterMm! - 0.3) < 1e-9,
            `flat contact at the floor (${flat.tipContactDiameterMm})`);
        assert.ok(Math.abs(slope.tipContactDiameterMm! - 0.3) < 1e-9,
            `slope contact floored identically (${slope.tipContactDiameterMm})`);
        assert.ok(slope.tipContactDiameterMm! >= 1.0 * 0.3 - 1e-9, 'floor = 30% of shaft');
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

test('per-point tip override bypasses band and floor', () => {
    // Explicit 0.22 tip on a structure shaft: kept as-is even though the
    // 30%-of-shaft floor (0.3) and the band contact (0.28) both exceed it.
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10, tipDiameterMm: 0.22 }));
    assert.equal(s.tipContactDiameterMm, 0.22, 'explicit tip wins over band and floor');
    assert.equal(s.tipBodyDiameterMm, s.shaftDiameterMm, 'shaft untouched by the tip override');
});

test('absent override keeps band × angle with floor', () => {
    const s = sizeParameters(makeCandidate({ islandAreaMm2: 8, zHeight: 10 }));
    assert.ok(s.tipContactDiameterMm! >= s.shaftDiameterMm! * 0.3 - 1e-9, 'floor holds without override');
});
