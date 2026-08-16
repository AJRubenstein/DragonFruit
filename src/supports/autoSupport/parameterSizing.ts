import type { CandidatePoint } from './types';
import { DETAIL_PRESET, STRUCTURE_PRESET, ANCHOR_PRESET } from '../Settings/presets';
import type { SupportPreset } from '../Settings/types';

// ---------------------------------------------------------------------------
// Empirical sizing presets (locked: no physics pretense)
// ---------------------------------------------------------------------------
//
// Auto-supports are sized from the app's built-in detail/structure/anchor
// support presets — the curated "settings that work" — not load calculations.
// A density-grid cell (8 mm²) does not carry meaningful weight or peel force,
// and the physics-derived numbers were visibly oversized (~1.5 mm shafts for
// tiny cells).
//
// Shaft thickness is a continuous curve through the three preset values:
//
//   (0.15 mm², detail 0.8) → (0.5 mm², structure 1.0) → (8 mm², anchor 1.2)
//
// The anchor value is anchored at the density-cell area — the region each
// grid support serves — so the lattice reads exactly anchor. Larger single
// supports (a merged cluster, a big region carried by one trunk) extend
// beyond anchor on a gentle log tail (100 mm² → ~1.5 mm, capped at 2.0).
// Nothing ever goes below the detail value: the floor is 0.8 mm.
//
// Tip contact stays banded (detail 0.22 / structure 0.28 / anchor 0.4) ×
// underside angle (flat ceilings get the full contact, steeper slopes less),
// floored at 30% of the shaft so a thick shaft keeps a proportional tip.
// Roots are the preset band (all three built-ins use 2.0).
//
// The forest resize pass (post-placement, before commit) thickens trunks
// that actually carry branches — a trunk with four branches gets thicker, a
// lone trunk stays at its placed diameter.

export type SizingPreset = 'detail' | 'structure' | 'anchor';

interface SizingBand {
    shaftDiameterMm: number;
    tipContactDiameterMm: number;
    tipLengthMm: number;
    tipPenetrationMm: number;
    rootDiameterMm: number;
    rootDiskHeightMm: number;
    rootConeHeightMm: number;
}

function bandFromPreset(preset: SupportPreset): SizingBand {
    const tip = preset.settings.tip;
    const shaft = preset.settings.shaft;
    const roots = preset.settings.roots;
    return {
        shaftDiameterMm: shaft.diameterMm,
        tipContactDiameterMm: tip.contactDiameterMm,
        tipLengthMm: tip.lengthMm,
        tipPenetrationMm: tip.penetrationMm ?? 0,
        rootDiameterMm: roots.diameterMm,
        rootDiskHeightMm: roots.diskHeightMm,
        rootConeHeightMm: roots.coneHeightMm,
    };
}

const SIZING_BANDS: Record<SizingPreset, SizingBand> = {
    detail: bandFromPreset(DETAIL_PRESET),
    structure: bandFromPreset(STRUCTURE_PRESET),
    anchor: bandFromPreset(ANCHOR_PRESET),
};

/** Area a density-grid cell assigns to each support (mm²). The shaft curve's
 *  anchor value applies at this area — the reference point for the "one
 *  support serves one cell" case. Matches the areaPerSupportMm2 default. */
const CELL_REFERENCE_AREA_MM2 = 8;

/** Maximum shaft diameter (mm) for very large single supports. */
const MAX_SHAFT_DIAMETER_MM = 2.0;

/** The preset band for a supported area (mm²) — tip/root band + analytics. */
export function presetForArea(areaMm2: number): SizingPreset {
    if (areaMm2 <= 0.15) return 'detail';
    if (areaMm2 <= 0.5) return 'structure';
    return 'anchor';
}

/** Piecewise shaft curve: lerp through the preset values, then a gentle log
 *  tail beyond the cell reference (sub-linear — strength grows with the
 *  cross-section, not the area). Floored at the detail value. */
function shaftDiameterForArea(areaMm2: number): number {
    const a = Math.max(areaMm2, 0.01);
    const d = SIZING_BANDS.detail.shaftDiameterMm;
    const s = SIZING_BANDS.structure.shaftDiameterMm;
    const an = SIZING_BANDS.anchor.shaftDiameterMm;

    if (a <= 0.15) return d;
    if (a <= 0.5) return lerp(0.15, 0.5, d, s, a);
    if (a <= CELL_REFERENCE_AREA_MM2) return lerp(0.5, CELL_REFERENCE_AREA_MM2, s, an, a);
    return Math.min(MAX_SHAFT_DIAMETER_MM, an + 0.12 * Math.log(a / CELL_REFERENCE_AREA_MM2));
}

// ---------------------------------------------------------------------------
// Override type
// ---------------------------------------------------------------------------

export interface SizeOverrides {
    shaftDiameterMm?: number;
    tipContactDiameterMm?: number;
    tipBodyDiameterMm?: number;
    tipLengthMm?: number;
    tipPenetrationMm?: number;
    rootsDiameterMm?: number;
    rootsDiskHeightMm?: number;
    rootsConeHeightMm?: number;
}

/** Context passed from the orchestrator for model-level sizing. */
export interface ModelSizingContext {
    /** Estimated model volume in mm³ (from the mesh — exact tetrahedron sum). */
    modelVolumeMm3: number;
    /** Model top Z (world mm). */
    modelZMaxMm?: number;
    /** Total number of candidates being placed. */
    totalCandidates: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Empirical sizing for an auto-support candidate.
 *
 * - Shaft: the preset curve at the supported area × height factor (taller
 *   supports flex more under peel, up to +25% at ≥ 70 mm). Grid cells use
 *   their own cell area (exactly anchor); merged trunks pass their summed
 *   area, which rides the tail above anchor.
 * - Tip contact: preset band × angle factor — a flat ceiling (normal straight
 *   down, |z| ≈ 1) gets the full preset contact; a steep slope is closer to
 *   self-supporting and gets a smaller one (down to 60%). Floored at 30% of
 *   the shaft.
 * - Roots / tip length / penetration: preset band, flat.
 *
 * @param candidate - The island to size supports for.
 * @param totalSupportedAreaMm2 - For core trunks: total area of all
 *                       candidates this trunk supports. For standalone
 *                       trunks: own area.
 */
export function sizeParameters(
    candidate: CandidatePoint,
    totalSupportedAreaMm2?: number,
): SizeOverrides {
    const band = SIZING_BANDS[presetForArea(candidate.islandAreaMm2)];

    // The area that drives thickness: merged trunks carry their cluster
    // total; standalone/grid trunks carry their own supported area.
    const areaInput = Math.max(totalSupportedAreaMm2 ?? candidate.islandAreaMm2, 0.01);

    const zHeight = Math.max(candidate.zHeight, 1);
    // Taller supports flex more under peel force — up to +25% at ≥ 70 mm.
    const heightFactor = 1 + clamp((zHeight - 20) / 200, 0, 0.25);

    const shaftDiameterMm = round(
        clamp(shaftDiameterForArea(areaInput) * heightFactor, 0.001, MAX_SHAFT_DIAMETER_MM),
    3);

    // Underside normal z = cos(angle from straight-down). Flat ceilings
    // (|nz| ≈ 1) peel hardest → full preset contact; steep slopes are closer
    // to self-supporting → smaller contact. Bounded to [0.6, 1.0]× band.
    const nz = Math.abs(candidate.tipNormal?.z ?? -1);
    const angleFactor = clamp(0.6 + 0.4 * nz, 0.6, 1.0);
    const tipContactDiameterMm = round(
        Math.max(band.tipContactDiameterMm * angleFactor, shaftDiameterMm * 0.3),
    3);

    return {
        shaftDiameterMm,
        tipContactDiameterMm,
        tipBodyDiameterMm: shaftDiameterMm,
        tipLengthMm: round(band.tipLengthMm, 3),
        tipPenetrationMm: round(band.tipPenetrationMm, 3),
        rootsDiameterMm: round(band.rootDiameterMm, 3),
        rootsDiskHeightMm: band.rootDiskHeightMm,
        rootsConeHeightMm: band.rootConeHeightMm,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
}
