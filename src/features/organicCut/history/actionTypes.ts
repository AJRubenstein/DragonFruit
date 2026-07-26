import type { OrganicCutLoopPoint } from '../types';
import type { LoopKeySettings } from '../useOrganicCutSession';

export const ORGANIC_CUT_EDIT = 'organic-cut:edit' as const;

/**
 * One loop as the history stores it: the editable waypoints plus that loop's key
 * settings. The cached dense seam polyline is deliberately NOT kept — it is
 * derived from the points and recomputed on restore, so storing it would bloat
 * every entry with a Float32Array for no gain.
 */
export type OrganicCutLoopSnapshot = {
  points: OrganicCutLoopPoint[];
  key: LoopKeySettings;
};

/**
 * Every Cut-tool edit is one action type carrying a before/after snapshot of the
 * whole loop set.
 *
 * A snapshot rather than a per-action delta because the tool has many small
 * mutations — place, move, delete, lock, snap-to-edges, add/remove loop, retarget
 * the key — and each one needs its own inverse. Wiring them individually is how
 * they came to be missing from undo one at a time. With a snapshot the inverse is
 * the same code for all of them, and an edit added later is covered by
 * construction rather than by remembering.
 */
export type OrganicCutEditPayload = {
  /** Model the edit belongs to; an edit never applies to a different model. */
  modelId: string;
  before: OrganicCutLoopSnapshot[];
  beforeActive: number;
  after: OrganicCutLoopSnapshot[];
  afterActive: number;
};

/** Action→payload map for the organic-cut history domain. */
export type OrganicCutHistoryPayloadMap = {
  [ORGANIC_CUT_EDIT]: OrganicCutEditPayload;
};
