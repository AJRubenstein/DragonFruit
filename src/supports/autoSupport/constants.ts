/**
 * Shared auto-support placement constants — single source of truth for the
 * radii and spans that previously existed in several inconsistent copies
 * (autoPlace.ts locals, gridPlacement.ts locals, the removed
 * AUTO_SUPPORT_HARD_RULES).
 */

/** Near-plate tips (< this Z, mm) get a minimal anchor support instead of a trunk. */
export const ANCHOR_HEIGHT_THRESHOLD_MM = 5.0;

/** Max span (mm) for a leaf cone attached to a host knot (grid path). */
export const MAX_AUTO_LEAF_SPAN_MM = 2.5;

/** Distance (mm) within which an existing support tip counts a candidate as already supported. */
export const ALREADY_SUPPORTED_RADIUS_MM = 3.0;

/** Gridless mode: merge candidates within this 3D distance of an existing trunk. */
export const GRIDLESS_MERGE_RADIUS_MM = 4.0;

/** Leaf fanning: max distance from a trunk shaft sample to an uncovered island (mm). */
export const LEAF_FAN_RADIUS_MM = 5.0;

/** Leaf fanning: max angle from vertical for a fan leaf (deg). */
export const LEAF_FAN_MAX_ANGLE_DEG = 60;
