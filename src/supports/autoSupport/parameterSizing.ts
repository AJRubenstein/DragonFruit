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
// tiny cells). The bands are read directly from the preset definitions, so
// retuning the presets retunes auto supports:
//
//   detail    — tiny point islands (< 0.15 mm²): shaft 0.8, tip 0.22
//   structure — small regions (< 0.5 mm²):        shaft 1.0, tip 0.28
//   anchor    — density-grid cells + large flats: shaft 1.2, tip 0.4
//
// Placement time stays flat and predictable: shaft = band × height × carried
// area (both mild), tip = band × underside angle (flat ceilings get the full
// band, steeper slopes a smaller contact), root = band. The forest resize
// pass (post-placement, before commit) thickens trunks that actually carry
// branches — a trunk with four branches gets thicker, a lone trunk stays at
// its placed diameter.

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

/** The preset band for a supported area (mm²). */
export function presetForArea(areaMm2: number): SizingPreset {
    if (areaMm2 <= 0.15) return 'detail';
    if (areaMm2 <= 0.5) return 'structure';
    return 'anchor';
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
 * - Shaft: preset band × height factor (taller supports flex more under peel,
 *   up to +25% at ≥ 70 mm) × carried-area factor (a trunk merging several
 *   islands gets a small bump, capped at +20%).
 * - Tip contact: preset band × angle factor — a flat ceiling (normal straight
 *   down, |z| ≈ 1) gets the full preset contact; a steep slope is closer to
 *   self-supporting and gets a smaller one (down to 60%).
 * - Roots / tip length / penetration: preset band, flat.
 *
 * Grid cells pass their own cell area (each grid point is a standalone trunk
 * carrying one cell); merged clusters pass their summed area.
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

    const zHeight = Math.max(candidate.zHeight, 1);
    // Taller supports flex more under peel force — up to +25% at ≥ 70 mm.
    const heightFactor = 1 + clamp((zHeight - 20) / 200, 0, 0.25);

    // A trunk merging several islands carries their combined area; grid cells
    // stay at 1.0 (own area). Capped so a merged cluster never balloons.
    const carriedArea = Math.max(totalSupportedAreaMm2 ?? candidate.islandAreaMm2, 0.5);
    const carriedFactor = clamp(Math.sqrt(carriedArea / 8), 1.0, 1.2);

    const shaftDiameterMm = round(band.shaftDiameterMm * heightFactor * carriedFactor, 3);

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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
}
