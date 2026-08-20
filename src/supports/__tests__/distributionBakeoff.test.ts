import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { pickBestDistributionForRegion, bakeoffAnchorRegions, BAKEOFF_COVERAGE_EPSILON, decideBakeoffWinner, BAKEOFF_EFFICIENCY_MARGIN } from '../autoSupport/distributionBakeoff';
import { createDefaultAutoSupportSettings } from '../autoSupport/settings';
import { computeRegionFlatnessDeg } from '../autoSupport/poissonPlacement';
import { forestReportToText } from '../autoSupport/autoPlace';
import { resetStore } from '../state';
import { resetKickstandStore } from '../SupportTypes/Kickstand/kickstandStore';
import { clearHistory } from '../../history/historyStore';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { runAutoPlace } from '../autoSupport/autoPlace';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';

function rectRegion(
    id: string,
    minX: number, maxX: number, minY: number, maxY: number,
    areaMm2: number,
    baseZ = 6.5,
    angleDeg = 0,
): DetectedIsland {
    const contactVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = minX; x <= maxX; x += 0.25) {
        for (let y = minY; y <= maxY; y += 0.25) {
            contactVoxels.push({ x, y, z: baseZ });
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
    } as DetectedIsland;
}

function ringRegion(id: string, areaMm2: number): DetectedIsland {
    const contactVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            const inHole = Math.abs(x) < 3 && Math.abs(y) < 3;
            if (!inHole) contactVoxels.push({ x, y, z: 6.5 });
        }
    }
    return {
        id,
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 6.5),
        baseZ: 6.5,
        areaMm2,
        contactVoxels,
    } as DetectedIsland;
}

test('bakeoff picks higher-coverage distribution for an anchor region', () => {
    const settings = createDefaultAutoSupportSettings();
    const region = rectRegion('anchor-1', -10, 10, -10, 10, 400, 2.0, 0);
    const anchorScale = new Map([['anchor-1', 0.7]]);
    const anchorIds = new Set(['anchor-1']);

    const result = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);

    const { gridCoverage, poissonCoverage } = result.metrics;
    if (Math.abs(gridCoverage - poissonCoverage) >= BAKEOFF_COVERAGE_EPSILON) {
        const higher = gridCoverage > poissonCoverage ? 'grid' : 'poisson';
        assert.equal(result.winner, higher, `winner should be ${higher} (grid ${gridCoverage.toFixed(3)} vs poisson ${poissonCoverage.toFixed(3)})`);
    } else {
        const flatness = computeRegionFlatnessDeg(region);
        const organic = flatness > settings.poissonFlatnessThresholdDeg;
        const expected = organic ? 'poisson' : 'grid';
        assert.equal(result.winner, expected);
    }

    assert.ok(result.candidates.length > 0, 'winner must have candidates');
    assert.ok(result.candidates.every((c) => c.gridPoint === true), 'candidates are density points');
});

test('bakeoff is deterministic for identical anchor input', () => {
    const settings = createDefaultAutoSupportSettings();
    const region = rectRegion('anchor-det', -8, 8, -8, 8, 256, 2.5, 5);
    const anchorScale = new Map([['anchor-det', 0.7]]);
    const anchorIds = new Set(['anchor-det']);

    const a = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);
    const b = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);

    assert.equal(a.winner, b.winner);
    assert.equal(a.metrics.gridCoverage, b.metrics.gridCoverage);
    assert.equal(a.metrics.poissonCoverage, b.metrics.poissonCoverage);
    assert.equal(a.candidates.length, b.candidates.length);
    assert.deepEqual(a.candidates.map((c) => c.tipPos), b.candidates.map((c) => c.tipPos));
});

test('bakeoff fallback: anchor small foot below threshold still generates both and picks one', () => {
    const settings = createDefaultAutoSupportSettings();
    const region = rectRegion('anchor-small', -1, 1, -1, 1, 4, 1.5, 0);
    const anchorScale = new Map([['anchor-small', 0.7]]);
    const anchorIds = new Set(['anchor-small']);

    const result = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);

    assert.ok(result.metrics.gridCount > 0 || result.metrics.poissonCount > 0, 'at least one generator must produce candidates for an anchor bypass');
    assert.ok(result.candidates.length > 0);
});

test('bakeoff ring region: coverage judged on eroded footprint with hole', () => {
    const settings = createDefaultAutoSupportSettings();
    const region = ringRegion('anchor-ring', 300);
    const anchorScale = new Map([['anchor-ring', 0.7]]);
    const anchorIds = new Set(['anchor-ring']);

    const result = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);

    for (const c of result.candidates) {
        const inHole = Math.abs(c.tipPos.x) < 3 && Math.abs(c.tipPos.y) < 3;
        assert.equal(inHole, false, `candidate ${c.id} at ${c.tipPos.x},${c.tipPos.y} must not be inside the ring hole`);
    }

    const gridFromMetrics = result.metrics.gridCoverage;
    const poissonFromMetrics = result.metrics.poissonCoverage;
    assert.ok(gridFromMetrics >= 0 && gridFromMetrics <= 1);
    assert.ok(poissonFromMetrics >= 0 && poissonFromMetrics <= 1);
});

test('bakeoffAnchorRegions batch aggregates wins correctly', () => {
    const settings = createDefaultAutoSupportSettings();
    const r1 = rectRegion('a1', -10, 10, -10, 10, 400, 2.0, 0);
    const r2 = rectRegion('a2', -8, 8, -8, 8, 256, 2.2, 0);
    const anchorScale = new Map([['a1', 0.7], ['a2', 0.7]]);
    const anchorIds = new Set(['a1', 'a2']);

    const batch = bakeoffAnchorRegions([r1, r2], settings, anchorScale, anchorIds);

    assert.equal(batch.wins.grid + batch.wins.poisson, 2);
    assert.equal(batch.details.size, 2);
    assert.ok(batch.candidates.length > 0);
    for (const [, detail] of batch.details) {
        if (Math.abs(detail.metrics.delta) >= BAKEOFF_COVERAGE_EPSILON) {
            const expected = detail.metrics.delta > 0 ? 'poisson' : 'grid';
            assert.equal(detail.winner, expected);
        }
    }
});

test('bakeoff tie-break: within epsilon winner follows shape heuristic (planar→grid)', () => {
    const settings = createDefaultAutoSupportSettings();
    const region = rectRegion('tie-region', -1, 1, -1, 1, 4, 2.0, 0);
    const anchorScale = new Map([['tie-region', 0.7]]);
    const anchorIds = new Set(['tie-region']);

    const result = pickBestDistributionForRegion(region, settings, anchorScale, anchorIds);
    const delta = Math.abs(result.metrics.delta);
    if (delta < BAKEOFF_COVERAGE_EPSILON) {
        const flatness = computeRegionFlatnessDeg(region);
        const organic = flatness > settings.poissonFlatnessThresholdDeg;
        const expected = organic ? 'poisson' : 'grid';
        assert.equal(result.winner, expected, `tie within epsilon: shape heuristic (${expected}) should win (grid ${result.metrics.gridCount} vs poisson ${result.metrics.poissonCount}, flatness ${flatness.toFixed(1)}°)`);
    }
    assert.ok(true);
});

test('bakeoff efficiency gate: 44@95.3% vs 162@100% picks fewer (grid) despite 4.7% win', () => {
    // Synthetic: the exact 44 vs 162 case from the pasted forest report.
    // Both clear 95%, margin 4.7% <5% → efficiency gate chooses fewer (grid).
    const gridCoverage = 0.953;
    const poissonCoverage = 1.0;
    const gridCount = 44;
    const poissonCount = 162;
    const flatness = 0; // planar
    const threshold = 12;
    const winner = decideBakeoffWinner(gridCoverage, poissonCoverage, gridCount, poissonCount, flatness, threshold);
    assert.equal(winner, 'grid', `fewer should win when both >=95% and margin ${((poissonCoverage-gridCoverage)*100).toFixed(1)}% <5% (grid ${gridCount} vs poisson ${poissonCount})`);
    // Pure coverage would have picked poisson — verify the gate flips it.
    assert.ok(poissonCoverage > gridCoverage, 'poisson higher coverage');
    assert.ok(Math.abs(poissonCoverage - gridCoverage) < BAKEOFF_EFFICIENCY_MARGIN, 'within efficiency margin');
    // When margin exceeds 5%, higher coverage should still win even if many more points.
    const winnerBigMargin = decideBakeoffWinner(0.90, 1.0, 44, 162, 0, 12);
    assert.equal(winnerBigMargin, 'poisson', 'poisson should win when margin 10% >5% despite count');
});

test('computeAutoSupportPlan surfaces bake-off in analytics and forest report for anchors', () => {
    resetStore();
    resetKickstandStore();
    clearHistory();
    const dispose = registerSupportHistoryHandlers();

    const planar = rectRegion('anchor-planar', -10, 10, -10, 10, 400, 2.0, 0);
    const curvedVoxels: { x: number; y: number; z?: number }[] = [];
    for (let x = -10; x <= 10; x += 0.25) {
        for (let y = -10; y <= 10; y += 0.25) {
            curvedVoxels.push({ x, y, z: 2.0 + ((x * x) / 40) });
        }
    }
    const organic: DetectedIsland = {
        id: 'anchor-organic',
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, 2.2),
        baseZ: 2.2,
        areaMm2: 380,
        contactVoxels: curvedVoxels,
    } as DetectedIsland;

    const result = runAutoPlace([planar, organic], 'model-bakeoff-test', { debugSkipAutoBracing: true });
    assert.ok(result.analytics?.competitive, 'analytics.competitive present');
    assert.equal(result.analytics.competitive!.anchorRegions, 2);
    assert.equal(result.analytics.competitive!.gridWins + result.analytics.competitive!.poissonWins, 2);
    const fr = result.analytics.forestReport;
    assert.ok(fr?.bakeoff, 'forestReport.bakeoff present');
    assert.equal(fr!.bakeoff!.details.length, 2);
    assert.ok(fr!.bakeoff!.details.some((d) => d.regionId === 'anchor-planar'));
    assert.ok(fr!.bakeoff!.details.some((d) => d.regionId === 'anchor-organic'));
    const text = fr ? forestReportToText(fr) : '';
    assert.ok(text.includes('DISTRIBUTION BAKE-OFF'), 'text contains bake-off');
    assert.ok(text.includes('anchor-planar'), 'planar detail in text');

    dispose();
});
