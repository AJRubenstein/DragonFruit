import * as THREE from 'three';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import type { CandidatePoint } from './types';
import type { AutoSupportSettings } from './settings';

/** Footprint-mask pixels are emitted at 0.25 mm spacing; a grid point within
 *  this distance of a mask pixel counts as inside the region. */
const FOOTPRINT_TOLERANCE_MM = 0.25;
/** Upward surface-snap ray window: from 2 mm below the region's lowest Z,
 *  first surface hit within this range is the region face. */
const SURFACE_SNAP_FAR_MM = 40;

/**
 * Density-grid placement (redesign step 3 — the grid phase).
 *
 * Large flat overhang regions get a grid of supports at √areaPerSupportMm2
 * spacing across their projected footprint. Each grid point is:
 *  - contained: only points inside the region's footprint mask are emitted;
 *  - surface-snapped: the region's actual surface Z at that XY is resolved by
 *    an upward raycast against the model (the facet can be sloped, so the
 *    surface is above the region's lowest Z);
 *  - a standalone trunk candidate (`gridPoint: true`) so the grid becomes a
 *    forest of independent supports instead of merging into one bush.
 *
 * Regions below `gridAreaThresholdMm2` are skipped — they get a single
 * support via the regular per-island candidate path (the region phase).
 */
export function generateGridCandidates(
    overhangIslands: DetectedIsland[],
    settings: AutoSupportSettings,
    mesh?: THREE.Mesh | null,
): CandidatePoint[] {
    const spacing = Math.sqrt(Math.max(settings.areaPerSupportMm2, 0.5));
    if (spacing <= 0) return [];
    const threshold = settings.gridAreaThresholdMm2;

    const candidates: CandidatePoint[] = [];
    const raycaster = new THREE.Raycaster();
    const up = new THREE.Vector3(0, 0, 1);
    const snapOrigin = new THREE.Vector3();
    raycaster.far = SURFACE_SNAP_FAR_MM;

    for (const island of overhangIslands) {
        if (island.source !== 'overhang') continue;
        const area = island.areaMm2 ?? 0;
        if (area < threshold) continue;

        const voxels = island.contactVoxels;
        if (!voxels || voxels.length === 0) continue;

        // Footprint bbox + spatial hash for containment.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const cellSize = Math.max(spacing, 1.0);
        const hash = new Map<string, Array<{ x: number; y: number }>>();
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
            bucket.push({ x: p.x, y: p.y });
        }

        const minZ = island.baseZ;
        const tolSq = FOOTPRINT_TOLERANCE_MM * FOOTPRINT_TOLERANCE_MM;

        // Axis-aligned grid over the footprint, offset by half a cell so edge
        // points sit inside the region rather than on its boundary.
        const startX = minX + spacing / 2;
        const startY = minY + spacing / 2;
        for (let x = startX; x <= maxX; x += spacing) {
            for (let y = startY; y <= maxY; y += spacing) {
                // Containment: nearest footprint pixel within tolerance.
                const gx = Math.floor(x / cellSize);
                const gy = Math.floor(y / cellSize);
                let inside = false;
                for (let dx = -1; dx <= 1 && !inside; dx++) {
                    for (let dy = -1; dy <= 1 && !inside; dy++) {
                        const bucket = hash.get(`${gx + dx},${gy + dy}`);
                        if (!bucket) continue;
                        for (const p of bucket) {
                            const ddx = x - p.x;
                            const ddy = y - p.y;
                            if (ddx * ddx + ddy * ddy <= tolSq) {
                                inside = true;
                                break;
                            }
                        }
                    }
                }
                if (!inside) continue;

                // Surface snap: upward ray from below the region.
                let tipZ = minZ;
                if (mesh) {
                    snapOrigin.set(x, y, minZ - 2);
                    raycaster.set(snapOrigin, up);
                    const hits = raycaster.intersectObject(mesh, false);
                    if (hits.length > 0 && hits[0].distance < SURFACE_SNAP_FAR_MM - 2) {
                        tipZ = hits[0].point.z;
                    }
                }

                candidates.push({
                    id: `grid-${island.id}-${x.toFixed(2)}-${y.toFixed(2)}`,
                    tipPos: { x, y, z: tipZ },
                    tipNormal: { x: 0, y: 0, z: -1 }, // caller raycasts the real normal
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
