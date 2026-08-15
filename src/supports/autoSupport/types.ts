import type { Vec3 } from '../types';

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
    source: 'voxel' | 'minima' | 'intersection';
    /** Contact footprint area of the unsupported region (mm²). 0 for minima-only. */
    islandAreaMm2: number;
    /** Z-height above build plate (mm). */
    zHeight: number;
    /** Computed placement priority. Higher = place first. */
    priority: number;
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
