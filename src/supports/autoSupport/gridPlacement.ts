import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';

/** Footprint-mask pixels are emitted at 0.25 mm spacing; a grid point within
 *  this distance of a mask pixel counts as inside the region. */
const FOOTPRINT_TOLERANCE_MM = 0.25;

/** Fraction of `spacing` used as the infill jitter amplitude. */
const INFILL_JITTER_SCALE = 0.15;
/** Infill points stay at least this far from perimeter points. */
const INFILL_PERIMETER_BAND_SCALE = 0.5;

/** Deterministic PRNG (mulberry32) — infill is stable across runs. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Jittered-grid infill: a regular lattice at `spacing` (half-cell inset),
 * each point deterministically offset by ±0.15·spacing so rows stay visible
 * but the strict alignment that caused edge-gap misses is gone. Points inside
 * the perimeter band are dropped — the perimeter owns the edges.
 */
function jitteredGridInfill(
    regionId: string,
    perimeter: Array<{ x: number; y: number; z: number }>,
    spacing: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    surfaceAt: (x: number, y: number) => { z: number } | null,
): Array<{ x: number; y: number; z: number }> {
    const rand = mulberry32(hashString(`${regionId}:infill`));
    const jitter = spacing * INFILL_JITTER_SCALE;
    const perimBandSq = (spacing * INFILL_PERIMETER_BAND_SCALE)
        * (spacing * INFILL_PERIMETER_BAND_SCALE);

    const result: Array<{ x: number; y: number; z: number }> = [];
    for (let x = minX + spacing / 2; x <= maxX; x += spacing) {
        for (let y = minY + spacing / 2; y <= maxY; y += spacing) {
            const jx = x + (rand() - 0.5) * 2 * jitter;
            const jy = y + (rand() - 0.5) * 2 * jitter;
            const s = surfaceAt(jx, jy);
            if (!s) continue;
            let nearPerim = false;
            for (const p of perimeter) {
                const dx = jx - p.x;
                const dy = jy - p.y;
                if (dx * dx + dy * dy < perimBandSq) {
                    nearPerim = true;
                    break;
                }
            }
            if (nearPerim) continue;
            result.push({ x: jx, y: jy, z: s.z });
        }
    }
    return result;
}

/**
 * Boundary voxels of a region's footprint (mask voxel with a missing
 * 8-neighbor), in deterministic loop order (sorted by angle around the
 * footprint centroid), sub-sampled at `spacing` intervals. Used by the
 * boundary-fill pass: lattice points ON the boundary already cover straight
 * edges at exactly `spacing`; fill only where the boundary curves away
 * (corners, holes, rotated edges) and no lattice point is within `spacing`.
 */
function buildBoundaryPoints(
    voxels: Array<{ x: number; y: number; z?: number }>,
    spacing: number,
    fallbackZ: number,
): Array<{ x: number; y: number; z: number }> {
    if (voxels.length === 0) return [];
    const set = new Set<string>();
    let sumX = 0;
    let sumY = 0;
    for (const v of voxels) {
        set.add(`${Math.round(v.x * 4)},${Math.round(v.y * 4)}`);
        sumX += v.x;
        sumY += v.y;
    }
    const cx = sumX / voxels.length;
    const cy = sumY / voxels.length;

    const boundary: Array<{ x: number; y: number; z?: number }> = [];
    for (const v of voxels) {
        const kx = Math.round(v.x * 4);
        const ky = Math.round(v.y * 4);
        let onEdge = false;
        for (let dx = -1; dx <= 1 && !onEdge; dx++) {
            for (let dy = -1; dy <= 1 && !onEdge; dy++) {
                if (dx === 0 && dy === 0) continue;
                if (!set.has(`${kx + dx},${ky + dy}`)) onEdge = true;
            }
        }
        if (onEdge) boundary.push(v);
    }
    if (boundary.length === 0) return [];

    boundary.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const step = Math.max(1, Math.round(spacing / 0.25));
    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < boundary.length; i += step) {
        pts.push({ x: boundary[i].x, y: boundary[i].y, z: boundary[i].z ?? fallbackZ });
    }
    return pts;
}

/**
 * Density-grid placement (redesign step 3 — the grid phase).
 *
 * Large flat overhang regions get supports in two passes:
 *  1. PERIMETER — the region's boundary loops (outer edge + holes) traced at
 *     √areaPerSupportMm2 spacing. Edges carry the most peel stress and are
 *     always covered, regardless of the region's size vs the spacing.
 *  2. INFILL — deterministic scatter (Poisson-disc style) at the same
 *     spacing, avoiding the perimeter and each other. No fixed lattice, so
 *     no alignment artifacts or edge-gap misses.
 *
 * Each point is:
 *  - contained: only points inside the region's footprint mask are emitted;
 *  - given the region's TRUE surface Z (from the classifier's per-pixel
 *    `surfaceZ`, interpolated on the region's own triangles);
 *  - a standalone trunk candidate (`gridPoint: true`).
 *
 * From there the regular placement pipeline takes over unchanged:
 * `buildTrunkData` (SmartPlacementV2) pathfinds the shaft to the plate, and
 * `decideGridPlacement` commits it.
 *
 * Regions below `gridAreaThresholdMm2` are skipped — they get a single
 * support via the regular per-island candidate path (the region phase).
 */
export function generateGridCandidates(
    overhangIslands: DetectedIsland[],
    settings: AutoSupportSettings,
): CandidatePoint[] {
    const spacing = Math.sqrt(Math.max(settings.areaPerSupportMm2, 0.5));
    if (spacing <= 0) return [];
    const threshold = settings.gridAreaThresholdMm2;

    const candidates: CandidatePoint[] = [];

    for (const island of overhangIslands) {
        if (island.source !== 'overhang') continue;
        const area = island.areaMm2 ?? 0;
        if (area < threshold) continue;

        const voxels = island.contactVoxels;
        if (!voxels || voxels.length === 0) continue;

        // Footprint bbox + spatial hash for containment / nearest-voxel Z.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const cellSize = Math.max(spacing, 1.0);
        const hash = new Map<string, Array<{ x: number; y: number; z?: number }>>();
        for (const p of voxels) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
            const cx = Math.floor(p.x / cellSize);
            const cy = Math.floor(p.y / cellSize);
            const key = `${cx},${cy}`;
            let bucket = hash.get(key);
            if (!bucket) {
                bucket = [];
                hash.set(key, bucket);
            }
            bucket.push({ x: p.x, y: p.y, z: p.z });
        }

        const minZ = island.baseZ;
        const tolSq = FOOTPRINT_TOLERANCE_MM * FOOTPRINT_TOLERANCE_MM;
        const surfaceNormal = island.surfaceNormal ?? { x: 0, y: 0, z: -1 };

        // Resolve the region surface Z at a lattice point via the nearest
        // footprint voxel. Returns null when the point is outside the region.
        const surfaceAt = (x: number, y: number): { z: number } | null => {
            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);
            let bestD2 = Infinity;
            let bestZ = minZ;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const bucket = hash.get(`${gx + dx},${gy + dy}`);
                    if (!bucket) continue;
                    for (const p of bucket) {
                        const ddx = x - p.x;
                        const ddy = y - p.y;
                        const d2 = ddx * ddx + ddy * ddy;
                        if (d2 <= tolSq && d2 < bestD2) {
                            bestD2 = d2;
                            if (p.z != null) bestZ = p.z;
                        }
                    }
                }
            }
            return bestD2 <= tolSq ? { z: bestZ } : null;
        };

        const emitPoint = (x: number, y: number, z: number, kind: 'perim' | 'infill') => {
            candidates.push({
                id: `${kind}-${island.id}-${x.toFixed(2)}-${y.toFixed(2)}`,
                tipPos: { x, y, z },
                tipNormal: surfaceNormal,
                modelId: '',
                source: 'overhang',
                islandAreaMm2: settings.areaPerSupportMm2,
                zHeight: z,
                priority: 0,
                gridPoint: true,
            });
        };

        // Pass 1: full perimeter — boundary loops at spacing intervals.
        // The outer ring covers the region edges (highest peel stress); holes
        // and rotated edges are traced too. The perimeter ALWAYS exists.
        const perimeter = buildBoundaryPoints(voxels, spacing, minZ);
        for (const p of perimeter) emitPoint(p.x, p.y, p.z, 'perim');

        // Pass 2: infill — a deterministic jittered grid at the same spacing,
        // keeping rows visible but avoiding strict alignment; the perimeter
        // owns the edges, so the infill drops its perimeter band.
        const infill = jitteredGridInfill(
            island.id,
            perimeter,
            spacing,
            minX,
            minY,
            maxX,
            maxY,
            surfaceAt,
        );
        for (const p of infill) emitPoint(p.x, p.y, p.z, 'infill');
    }

    return candidates;
}
