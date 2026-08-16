import type { Vec3, SupportState } from '../types';
import type { KickstandState } from '../SupportTypes/Kickstand/types';

/** A single support placement candidate derived from island/minima detection. */
export interface CandidatePoint {
    /** Unique stable id from the source DetectedIsland. */
    id: string;
    /** Contact point on the model surface in world mm coordinates. */
    tipPos: Vec3;
    /** Surface normal at the contact point (world space, smoothed). */
    tipNormal: Vec3;
    /** The model this candidate belongs to. */
    modelId: string;
    /** Which detector produced this candidate. */
    source: 'voxel' | 'minima' | 'intersection' | 'overhang';
    /** Contact footprint area of the unsupported region (mm²). 0 for minima-only. */
    islandAreaMm2: number;
    /** Z-height above build plate (mm). */
    zHeight: number;
    /** Computed placement priority. Higher = place first. */
    priority: number;
    /** Density-grid point: must become its own standalone trunk (never merged
     *  into a nearby host) so flat regions get independent supports. */
    gridPoint?: boolean;
}

/** Why a candidate was rejected. */
export type RejectReason =
    | 'trunk_build_error'
    | 'grid_reject_collision'
    | 'grid_reject_no_attachment'
    | 'grid_reject_other'
    | 'already_supported'
    | 'exception';

/** Detailed analytics from an auto-place run. */
export interface AutoPlaceAnalytics {
    /** Number of islands that had at least one support placed near them. */
    islandsCovered: number;
    /** Number of islands that still have no nearby support. */
    islandsUncovered: number;
    /** Breakdown of candidates by assigned preset. */
    presets: { detail: number; structure: number; anchor: number };
    /** Breakdown of rejections by reason. */
    rejectionReasons: Partial<Record<RejectReason, number>>;
    /** Area coverage: sum of covered island areas / total island area (0–1). */
    areaCoverage: number;
    /** Debug sizing info from the physics calculations. */
    sizingDebug?: SizingDebugInfo;
}

/** Physics-based sizing debug data. */
export interface SizingDebugInfo {
    modelVolumeMm3: number;
    estimatedWeightG: number;
    totalCandidates: number;
    weightPerSupportG: number;
    avgIslandAreaMm2: number;
    avgPeelForceN: number;
    shaftDiameterRange: { min: number; max: number; avg: number };
    tipContactRange: { min: number; max: number; avg: number };
}

/** Result returned by the auto-place orchestrator. */
export interface AutoPlaceResult {
    placedTrunks: number;
    placedAnchors: number;
    placedBranches: number;
    placedLeaves: number;
    placedSticks: number;
    rejectedCandidates: number;
    /** Whether any supports were actually added/removed. */
    changed: boolean;
    /** Human-readable summary for UI feedback. */
    message: string;
    /** Detailed analytics (undefined for no-op runs). */
    analytics?: AutoPlaceAnalytics;
}

/**
 * A fully-computed auto-support run, ready to commit.
 *
 * The pipeline computes against a local draft (no store mutations) and
 * returns the before/after pair — one `setSnapshot` + `setKickstandSnapshot`
 * + a single undoable history entry is all the caller needs. This is the
 * worker boundary: the same object is serializable to/from a Web Worker.
 */
export interface AutoSupportPlan {
    /** Support state committed before the run (for the undo payload). */
    before: SupportState;
    /** Kickstand state committed before the run. */
    kickstandBefore: KickstandState;
    /** Final braced support state. */
    support: SupportState;
    /** Final kickstand state (bracing strips/regenerates auto kickstands). */
    kickstand: KickstandState;
    /** Placement + coverage analytics. */
    analytics: AutoPlaceAnalytics;
    /** Counts/message — what the panel reports. */
    result: AutoPlaceResult;
}
