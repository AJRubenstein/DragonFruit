import type { CandidatePoint } from './types';
import type { SupportSettings } from '../Settings/types';

// ---------------------------------------------------------------------------
// Empirical sizing presets (locked: no physics pretense)
// ---------------------------------------------------------------------------
//
// Auto-supports are sized from a small table of empirical bands, not load
// calculations. A density-grid cell (8 mm²) does not carry meaningful weight
// or peel force — resin-print practice sizes such supports by feel, and the
// physics-derived numbers were visibly oversized (~1.5 mm shafts for tiny
// cells). The bands reuse the existing detail/structure/anchor vocabulary:
//
//   detail    — tiny point islands (< 0.15 mm²)
//   structure — small regions (< 0.5 mm²)
//   anchor    — density-grid cells + large flats
//
// Placement time stays flat and predictable: shaft = band × height × carried
// area (both mild), tip = band × underside angle, root = band. The forest
// resize pass (post-placement, before commit) thickens trunks that actually
// carry branches — a trunk with four branches gets thicker, a lone trunk
// stays at its placed diameter.

export type SizingPreset = 'detail' | 'structure' | 'anchor';

interface SizingBand {
    shaftDiameterMm: number;
    tipContactDiameterMm: number;
    rootDiameterMm: number;
}

const SIZING_BANDS: Record<SizingPreset, SizingBand> = {
    detail:    { shaftDiameterMm: 0.60, tipContactDiameterMm: 0.28, rootDiameterMm: 1.2 },
    structure: { shaftDiameterMm: 0.70, tipContactDiameterMm: 0.32, rootDiameterMm: 1.4 },
    anchor:    { shaftDiameterMm: 0.80, tipContactDiameterMm: 0.38, rootDiameterMm: 1.6 },
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
 *   down, |z| ≈ 1) peels hardest and gets the largest contact; a steep slope
 *   is closer to self-supporting and gets a smaller one.
 * - Roots: preset band, flat.
 *
 * Grid cells pass their own cell area (each grid point is a standalone trunk
 * carrying one cell); merged clusters pass their summed area.
 *
 * @param candidate - The island to size supports for.
 * @param baseSettings - The user's current support settings (tip length,
 *                       penetration, root disk/cone heights).
 * @param totalSupportedAreaMm2 - For core trunks: total area of all
 *                       candidates this trunk supports. For standalone
 *                       trunks: own area.
 */
export function sizeParameters(
    candidate: CandidatePoint,
    baseSettings?: SupportSettings,
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
    // (|nz| ≈ 1) peel hardest → biggest contact; steep slopes are closer to
    // self-supporting → smaller contact. Bounded to [0.7, 1.2]× band.
    const nz = Math.abs(candidate.tipNormal?.z ?? -1);
    const angleFactor = clamp(0.7 + 0.5 * nz, 0.7, 1.2);
    const tipContactDiameterMm = round(
        Math.max(band.tipContactDiameterMm * angleFactor, shaftDiameterMm * 0.3),
    3);

    return {
        shaftDiameterMm,
        tipContactDiameterMm,
        tipBodyDiameterMm: shaftDiameterMm,
        tipLengthMm: round(baseSettings?.tip?.lengthMm ?? 2.5, 3),
        tipPenetrationMm: round(baseSettings?.tip?.penetrationMm ?? 0.1, 3),
        rootsDiameterMm: round(band.rootDiameterMm, 3),
        rootsDiskHeightMm: baseSettings?.roots?.diskHeightMm ?? 0.5,
        rootsConeHeightMm: baseSettings?.roots?.coneHeightMm ?? 1.0,
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
