import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';

/** Footprint-mask pixels are emitted at 0.25 mm spacing; a grid point within
 *  this distance of a mask pixel counts as inside the region. */
const FOOTPRINT_TOLERANCE_MM = 0.25;

/**
 * Density-grid placement (redesign step 3 — the grid phase).
 *
 * Large flat overhang regions get a grid of supports at √areaPerSupportMm2
 * spacing across their projected footprint. Each grid point is:
 *  - contained: only points inside the region's footprint mask are emitted;
 *  - given the region's TRUE surface Z (from the classifier's per-pixel
 *    `surfaceZ`, which is interpolated on the region's own triangles — NOT a
 *    raycast against the whole model, which hits the wrong face on sloped
 *    geometry);
 *  - a standalone trunk candidate (`gridPoint: true`).
 *
 * From there the regular placement pipeline takes over unchanged:
 * `resolveSurfaceNormal` finds the real surface normal from just below the
 * true Z, `buildTrunkData` (SmartPlacementV2) pathfinds the shaft to the
 * plate with collision avoidance, and `decideGridPlacement` commits it.
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

        // Axis-aligned grid over the footprint, offset by half a cell so edge
        // points sit inside the region rather than on its boundary.
        const startX = minX + spacing / 2;
        const startY = minY + spacing / 2;
        for (let x = startX; x <= maxX; x += spacing) {
            for (let y = startY; y <= maxY; y += spacing) {
                // Containment + nearest voxel (carries the surface Z).
                const gx = Math.floor(x / cellSize);
                const gy = Math.floor(y / cellSize);
                let tipZ = minZ;
                let inside = false;
                let bestDist2 = Infinity;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const bucket = hash.get(`${gx + dx},${gy + dy}`);
                        if (!bucket) continue;
                        for (const p of bucket) {
                            const ddx = x - p.x;
                            const ddy = y - p.y;
                            const d2 = ddx * ddx + ddy * ddy;
                            if (d2 <= tolSq) {
                                inside = true;
                                if (p.z != null && d2 < bestDist2) {
                                    bestDist2 = d2;
                                    tipZ = p.z;
                                }
                            }
                        }
                    }
                }
                if (!inside) continue;

                candidates.push({
                    id: `grid-${island.id}-${x.toFixed(2)}-${y.toFixed(2)}`,
                    tipPos: { x, y, z: tipZ },
                    // The region's own face normal (world space) — the
                    // placement pipeline uses it directly instead of a
                    // whole-mesh raycast that hits the wrong face on slopes.
                    tipNormal: island.surfaceNormal ?? { x: 0, y: 0, z: -1 },
                    modelId: '', // caller fills in
                    source: 'overhang',
                    islandAreaMm2: settings.areaPerSupportMm2,
                    zHeight: tipZ,
                    priority: 0,
                    gridPoint: true,
                });
            }
        }
    }

    return candidates;
}
