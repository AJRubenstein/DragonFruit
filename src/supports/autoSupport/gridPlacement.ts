import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';
import {
    OVERHANG_SELF_SUPPORT_ANGLE_DEG,
    GRID_SPACING_MIN_FACTOR,
    GRID_SPACING_MAX_FACTOR,
} from './constants';

/** Footprint-mask pixels are emitted at 0.25 mm spacing; a grid point within
 *  this distance of a mask pixel counts as inside the region. */
const FOOTPRINT_TOLERANCE_MM = 0.25;

/**
 * Boundary voxels of a region's footprint (mask voxel with a missing
 * 8-neighbor), in deterministic loop order (sorted by angle around the
 * footprint centroid), sub-sampled at `spacing` intervals. Used by the
 * boundary-fill pass: the dynamic grid's outer ring covers straight edges
 * exactly; fill only where the boundary curves away from the lattice
 * (corners, holes, rotated edges) and no grid point is within `spacing`.
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
 * Large flat overhang regions get a DYNAMIC-SPACING grid: the target spacing
 * (√areaPerSupportMm2 × an angle factor) is adjusted per axis so the grid
 * spans the region's full footprint with integer rows/columns — never cut off
 * by a leftover margin. The spacing factor is angle-aware: flat anchor
 * surfaces (0° — a model's feet/underside) grid at 0.7× spacing (≈2× the
 * supports), slopes at the self-support threshold (45°) at 1.3× (≈0.6×). The
 * outer ring lands exactly on the region bbox boundary, so straight edges are
 * supported by the grid itself; a boundary-fill pass adds supports only where
 * the boundary curves away from the lattice (corners, holes, rotated edges)
 * and no grid point is within `spacing`.
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
    const baseSpacing = Math.sqrt(Math.max(settings.areaPerSupportMm2, 0.5));
    if (baseSpacing <= 0) return [];
    const threshold = settings.gridAreaThresholdMm2;

    const candidates: CandidatePoint[] = [];

    for (const island of overhangIslands) {
        if (island.source !== 'overhang') continue;
        const area = island.areaMm2 ?? 0;
        if (area < threshold) continue;

        // Angle-aware density: anchor surfaces (flat ceilings — a model's
        // feet / underside) are the densest; slopes near the self-support
        // threshold are the sparsest. Spacing = √areaPerSupport × factor.
        const selfSupportAngleDeg = settings.overhangSelfSupportAngleDeg
            ?? OVERHANG_SELF_SUPPORT_ANGLE_DEG;
        const angleT = Math.min(1, Math.max(0,
            (island.overhangAngleDeg ?? 0) / selfSupportAngleDeg));
        const minFactor = settings.flatDensityBoost ?? GRID_SPACING_MIN_FACTOR;
        const maxFactor = settings.slopeRelaxFactor ?? GRID_SPACING_MAX_FACTOR;
        const spacing = baseSpacing
            * (minFactor + angleT * (maxFactor - minFactor));

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

        // Resolve the region surface Z at a point via the nearest footprint
        // voxel. Returns null when the point is outside the region.
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

        const emitPoint = (x: number, y: number, z: number, kind: 'grid' | 'fill') => {
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

        // Dynamic spacing: adjust per axis so the grid spans the full region
        // with integer rows/columns — never cut off by a leftover margin.
        const width = maxX - minX;
        const height = maxY - minY;
        const nx = Math.max(1, Math.round(width / spacing));
        const ny = Math.max(1, Math.round(height / spacing));
        const spacingX = width / nx;
        const spacingY = height / ny;
        const gridSpacing = Math.max(spacingX, spacingY);

        const lattice: Array<{ x: number; y: number; z: number }> = [];
        for (let i = 0; i <= nx; i++) {
            for (let j = 0; j <= ny; j++) {
                const x = minX + i * spacingX;
                const y = minY + j * spacingY;
                const s = surfaceAt(x, y);
                if (s) {
                    const pt = { x, y, z: s.z };
                    lattice.push(pt);
                    emitPoint(x, y, s.z, 'grid');
                }
            }
        }

        // Boundary-fill: where the boundary curves away from the lattice
        // (corners, holes, rotated edges) and no grid point is within
        // `gridSpacing`, add a support on the boundary itself.
        const spacingSq = gridSpacing * gridSpacing;
        const boundary = buildBoundaryPoints(voxels, spacing, minZ);
        for (const b of boundary) {
            let covered = false;
            for (const p of lattice) {
                const dx = b.x - p.x;
                const dy = b.y - p.y;
                if (dx * dx + dy * dy <= spacingSq) {
                    covered = true;
                    break;
                }
            }
            if (!covered) emitPoint(b.x, b.y, b.z, 'fill');
        }
    }

    return candidates;
}
