import type { CandidatePoint } from './types';
import { getSettings } from '../Settings/state';

// ---------------------------------------------------------------------------
// Empirical sizing (locked: no physics pretense)
// ---------------------------------------------------------------------------
//
// Light / Medium / Heavy are HARDCODED profiles: switching a profile loads
// the hardcoded settings block, and the sizing follows that block. The old
// area-derived shaft curve inverted the profiles — a light 16 mm² cell sized
// THICKER (1.28 mm) than a heavy 5 mm² cell (1.12 mm) because the curve
// rose with the cell area. The band now comes from the active settings
// (detail ≈ 0.8 / structure ≈ 1.0 / anchor ≈ 1.2 shafts); session overrides
// apply until the next profile switch; the merged-cluster tail and the
// height factor ride on top of the profile band.
//
// Tip contact: profile band × underside angle (flat ceilings get the full
// contact, steeper slopes less), floored at 30% of the shaft so a thick
// shaft keeps a proportional tip. Roots / tip length / penetration: profile
// band, flat.
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

/** The active profile's band — read from the current settings, which carry
 *  the hardcoded profile when one is active (plus any session overrides). */
function bandFromCurrentSettings(): SizingBand {
    const s = getSettings();
    return {
        shaftDiameterMm: s.shaft.diameterMm,
        tipContactDiameterMm: s.tip.contactDiameterMm,
        tipLengthMm: s.tip.lengthMm,
        tipPenetrationMm: s.tip.penetrationMm ?? 0,
        rootDiameterMm: s.roots.diameterMm,
        rootDiskHeightMm: s.roots.diskHeightMm,
        rootConeHeightMm: s.roots.coneHeightMm,
    };
}

/** Area a merged cluster must exceed before the shaft tail engages (mm²).
 *  Grid cells sit FLAT at the profile band — the lattice reads exactly the
 *  profile, whatever its density. */
const CELL_REFERENCE_AREA_MM2 = 8;

/** Maximum shaft diameter (mm) for very large single supports. */
const MAX_SHAFT_DIAMETER_MM = 2.0;

/** The preset band for a supported area (mm²) — tip/root band + analytics. */
export function presetForArea(areaMm2: number): SizingPreset {
    if (areaMm2 <= 0.15) return 'detail';
    if (areaMm2 <= 0.5) return 'structure';
    return 'anchor';
}

/** Shaft diameter: the profile band, then a gentle log tail beyond the cell
 *  reference for merged clusters (sub-linear — strength grows with the
 *  cross-section, not the area). A grid cell is FLAT at the profile band —
 *  the lattice reads exactly the profile, whatever its density. */
function shaftDiameterForArea(baseDiameterMm: number, areaMm2: number): number {
    const a = Math.max(areaMm2, 0.01);
    const tail = a > CELL_REFERENCE_AREA_MM2
        ? 0.12 * Math.log(a / CELL_REFERENCE_AREA_MM2)
        : 0;
    return Math.min(MAX_SHAFT_DIAMETER_MM, baseDiameterMm + tail);
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
 * - Shaft: the ACTIVE PROFILE's band (hardcoded profile / session override)
 *   × height factor (taller supports flex more under peel, up to +25% at
 *   ≥ 70 mm). Grid cells sit flat at the band — the lattice reads exactly
 *   the profile; merged trunks pass their summed area, which rides a gentle
 *   tail above the band.
 * - Tip contact: profile band × angle factor — a flat ceiling (normal
 *   straight down, |z| ≈ 1) gets the full preset contact; a steep slope is
 *   closer to self-supporting and gets a smaller one (down to 60%). Floored
 *   at 30% of the shaft.
 * - Roots / tip length / penetration: profile band, flat.
 *
 * @param candidate - The island to size supports for.
 * @param totalSupportedAreaMm2 - For core trunks: total area of all
 *                       candidates this trunk supports. For standalone
 *                       trunks: own area.
 */
export function sizeParameters(
    candidate: CandidatePoint,
    totalSupportedAreaMm2?: number,
    sizeScale = 1,
): SizeOverrides {
    const band = bandFromCurrentSettings();

    // The area that drives thickness: merged trunks carry their cluster
    // total; standalone/grid trunks carry their own supported area.
    const areaInput = Math.max(totalSupportedAreaMm2 ?? candidate.islandAreaMm2, 0.01);

    const zHeight = Math.max(candidate.zHeight, 1);
    // Empirical height band: taller supports get a modestly thicker shaft.
    // Direction is physical (longer columns flex/buckle more — Euler ∝ L²), but
    // this is a calibration curve, not a load calculation: linear +25% cap at
    // ≥ 70 mm. No force inputs, no strength model.
    const heightFactor = 1 + clamp((zHeight - 20) / 200, 0, 0.25);

    const shaftDiameterMm = round(
        clamp(shaftDiameterForArea(band.shaftDiameterMm, areaInput) * heightFactor, 0.001, MAX_SHAFT_DIAMETER_MM)
        * sizeScale,
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
        rootsDiameterMm: round(band.rootDiameterMm * sizeScale, 3),
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
