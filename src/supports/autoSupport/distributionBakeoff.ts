import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';
import { generateGridCandidates } from './gridPlacement';
import { computeRegionFlatnessDeg, generatePoissonCandidates } from './poissonPlacement';
import { computeRegionCoverage, TIP_COVERAGE_RADIUS_MM } from './coverage';

/** Coverage delta below which two distributions are considered equivalent (1%). */
export const BAKEOFF_COVERAGE_EPSILON = 0.01;

export interface BakeoffMetrics {
    gridCoverage: number;
    poissonCoverage: number;
    gridCount: number;
    poissonCount: number;
    delta: number;
    /** Absolute coverage difference. */
    winnerMargin: number;
}

export interface BakeoffResult {
    candidates: CandidatePoint[];
    winner: 'grid' | 'poisson';
    metrics: BakeoffMetrics;
}

/**
 * Competitive bake-off for one overhang region: generate BOTH grid and
 * Poisson candidate sets, score each by footprint coverage (fraction of
 * contactVoxels within TIP_COVERAGE_RADIUS_MM of a tip), and return the
 * better set.
 *
 * Intended for anchor surfaces (first-printed underside) where peel load is
 * maximal and the flatness heuristic is the worst place to gamble. Non-anchor
 * regions should keep the shape heuristic — this function is pure and
 * deterministic, safe to call per-region inside the autoPlace eligible loop.
 *
 * Tie-breaking: higher coverage wins. When |delta| < BAKEOFF_COVERAGE_EPSILON
 * the coverage is equivalent and the winner falls back to the shape heuristic
 * (planar → grid, organic → Poisson) so a flat anchor stays gridded and an
 * organic anchor stays poisson — not just "fewer points wins" which would flip
 * a planar square to Poisson on a 1-point margin. When heuristic also ties,
 * fewer candidates wins.
 */
export function pickBestDistributionForRegion(
    region: DetectedIsland,
    settings: AutoSupportSettings,
    anchorScaleById: ReadonlyMap<string, number>,
    anchorIds: ReadonlySet<string>,
    radiusMm: number = TIP_COVERAGE_RADIUS_MM,
): BakeoffResult {
    const gridCandidates = generateGridCandidates(
        [region],
        settings,
        anchorScaleById,
        anchorIds,
    );
    const poissonCandidates = generatePoissonCandidates(
        [region],
        settings,
        anchorScaleById,
        anchorIds,
    );

    const gridTips = gridCandidates.map((c) => c.tipPos);
    const poissonTips = poissonCandidates.map((c) => c.tipPos);

    const gridCoverage = gridTips.length === 0
        ? 0
        : computeRegionCoverage(region, gridTips, radiusMm);
    const poissonCoverage = poissonTips.length === 0
        ? 0
        : computeRegionCoverage(region, poissonTips, radiusMm);

    const delta = poissonCoverage - gridCoverage;
    const winnerMargin = Math.abs(delta);

    let winner: 'grid' | 'poisson';
    if (winnerMargin < BAKEOFF_COVERAGE_EPSILON) {
        const flatness = computeRegionFlatnessDeg(region);
        const organic = flatness > (settings.poissonFlatnessThresholdDeg ?? 12);
        if (gridCandidates.length === poissonCandidates.length) {
            winner = organic ? 'poisson' : 'grid';
        } else if (gridCandidates.length === 0) {
            winner = 'poisson';
        } else if (poissonCandidates.length === 0) {
            winner = 'grid';
        } else {
            // Coverages tie — defer to shape; only if still ambiguous (should not
            // happen since organic vs planar is binary) fall back to fewer.
            winner = organic ? 'poisson' : 'grid';
        }
    } else {
        winner = delta > 0 ? 'poisson' : 'grid';
    }

    // Fallback when one generator produced nothing (e.g. capped region).
    if (gridCandidates.length === 0 && poissonCandidates.length > 0) winner = 'poisson';
    if (poissonCandidates.length === 0 && gridCandidates.length > 0) winner = 'grid';

    return {
        candidates: winner === 'grid' ? gridCandidates : poissonCandidates,
        winner,
        metrics: {
            gridCoverage,
            poissonCoverage,
            gridCount: gridCandidates.length,
            poissonCount: poissonCandidates.length,
            delta,
            winnerMargin,
        },
    };
}

/** Batch helper: run the bake-off for every region in a list, collect winners. */
export function bakeoffAnchorRegions(
    regions: DetectedIsland[],
    settings: AutoSupportSettings,
    anchorScaleById: ReadonlyMap<string, number>,
    anchorIds: ReadonlySet<string>,
): { candidates: CandidatePoint[]; wins: { grid: number; poisson: number }; details: Map<string, BakeoffResult> } {
    const out: CandidatePoint[] = [];
    const wins = { grid: 0, poisson: 0 };
    const details = new Map<string, BakeoffResult>();
    for (const r of regions) {
        const result = pickBestDistributionForRegion(r, settings, anchorScaleById, anchorIds);
        out.push(...result.candidates);
        wins[result.winner]++;
        details.set(r.id, result);
    }
    return { candidates: out, wins, details };
}
