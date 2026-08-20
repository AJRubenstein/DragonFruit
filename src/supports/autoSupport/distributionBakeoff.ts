import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';
import { generateGridCandidates } from './gridPlacement';
import { computeRegionFlatnessDeg, generatePoissonCandidates } from './poissonPlacement';
import { computeRegionCoverage, TIP_COVERAGE_RADIUS_MM, REGION_COVERAGE_TARGET } from './coverage';

/** Coverage delta below which two distributions are considered equivalent (1%). */
export const BAKEOFF_COVERAGE_EPSILON = 0.01;
/** When both sides already clear the coverage target, a win smaller than this (5%) is not worth extra pillars. */
export const BAKEOFF_EFFICIENCY_MARGIN = 0.05;

/**
 * Pure winner decision for a bake-off — extracted for testability.
 * Returns the winner given pre-computed coverages/counts and the region's
 * flatness (to preserve the shape heuristic on ties).
 */
export function decideBakeoffWinner(
    gridCoverage: number,
    poissonCoverage: number,
    gridCount: number,
    poissonCount: number,
    flatnessDeg: number,
    poissonThresholdDeg: number,
): 'grid' | 'poisson' {
    const delta = poissonCoverage - gridCoverage;
    const winnerMargin = Math.abs(delta);
    // Tie (<1%): shape heuristic so planar stays grid.
    if (winnerMargin < BAKEOFF_COVERAGE_EPSILON) {
        const organic = flatnessDeg > poissonThresholdDeg;
        if (gridCount === 0) return 'poisson';
        if (poissonCount === 0) return 'grid';
        return organic ? 'poisson' : 'grid';
    }
    // Efficiency gate: both already clear 95% and the win is small (<5%)
    // → fewer pillars wins (the 44@95.3% vs 162@100% case).
    const bothMeetTarget = gridCoverage >= REGION_COVERAGE_TARGET && poissonCoverage >= REGION_COVERAGE_TARGET;
    if (bothMeetTarget && winnerMargin < BAKEOFF_EFFICIENCY_MARGIN && gridCount !== poissonCount) {
        return gridCount < poissonCount ? 'grid' : 'poisson';
    }
    return delta > 0 ? 'poisson' : 'grid';
}

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
 * Winner selection:
 *  1. Higher coverage wins.
 *  2. Efficiency gate: if both sides already meet REGION_COVERAGE_TARGET
 *     (95%) and the margin is < BAKEOFF_EFFICIENCY_MARGIN (5%), fewer
 *     candidates wins — gap-fill would close a 4.7% hole with 2–3 clusters,
 *     not 118 extra trunks (the 44 vs 162 case).
 *  3. Tie (|Δ|<1%): fall back to shape heuristic (planar→grid, organic→poisson).
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
    const flatness = computeRegionFlatnessDeg(region);
    let winner = decideBakeoffWinner(
        gridCoverage,
        poissonCoverage,
        gridCandidates.length,
        poissonCandidates.length,
        flatness,
        settings.poissonFlatnessThresholdDeg ?? 12,
    );

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
