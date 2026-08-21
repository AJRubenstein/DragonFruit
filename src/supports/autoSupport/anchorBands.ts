import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import { ANCHOR_MIN_AREA_MM2, ANCHOR_MIN_XY_MM } from './constants';

/**
 * Per-contact-patch anchor bands — densification for the first-printed
 * underside of a fully-supported print.
 *
 * A single global band anchored at the model's lowest Z is wrong on two counts:
 * a small low protrusion drags the band down and the real underside escapes it,
 * and separate contact patches at similar heights (a model on several feet)
 * must all be densified, not just the patch holding the absolute minimum.
 *
 * Rule: eligible overhang regions are sorted by baseZ and clustered by Z-gap
 * (a gap strictly greater than `bandHeightMm` starts a new cluster). Only the
 * LOWEST cluster is the anchor layer — the first-printed surface. Its members
 * within `bandHeightMm` of the cluster minimum are in-band (scale `factor`);
 * everything else — chain members beyond the band (staircase steps) and ALL
 * higher clusters (shelves, ledges, mid-model flats) — are suction surfaces
 * and keep scale 1. Anchoring every cluster was tried and over-supplied: with
 * per-patch clustering virtually every region is its own cluster min, so the
 * band stopped discriminating (log evidence: 5/5 regions anchored).
 *
 * Pure and deterministic — unit-tested in isolation.
 */

/** Spacing multiplier outside any anchor band (no densification). */
export const ANCHOR_SCALE_NONE = 1;

export interface AnchorBands {
    /** Per-island spacing multiplier: `factor` for in-band, 1 otherwise. */
    scaleById: Map<string, number>;
    /** Distinct Z-clusters found (each is a separate contact patch). */
    clusterCount: number;
    /** Ids of regions inside an anchor band. */
    inBandIds: string[];
}

/**
 * Build anchor bands over eligible overhang regions.
 *
 * @param islands  overhang regions (source 'overhang') — typically the set the
 *                 grid/poisson generators will process
 * @param bandHeightMm  anchor band height; 0 disables anchor densification
 * @param factor  spacing multiplier applied inside a band (must be < 1)
 */
export function buildAnchorBands(
    islands: DetectedIsland[],
    bandHeightMm: number,
    factor: number,
): AnchorBands {
    const scaleById = new Map<string, number>();
    const inBandIds: string[] = [];

    if (bandHeightMm <= 0 || factor >= 1 || islands.length === 0) {
        return { scaleById, clusterCount: 0, inBandIds };
    }

    const eligible = islands
        .filter((i) => i.source === 'overhang')
        .sort((a, b) => a.baseZ - b.baseZ);

    let clusterMinZ = NaN;
    let prevZ = NaN;
    let clusterCount = 0;
    for (const island of eligible) {
        if (Number.isNaN(prevZ) || island.baseZ - prevZ > bandHeightMm) {
            clusterMinZ = island.baseZ;
            clusterCount++;
        }
        const inLowestCluster = clusterCount === 1;
        const inBandZ = inLowestCluster && island.baseZ <= clusterMinZ + bandHeightMm;
        // Tiny slivers (thin rings 20×1–2 mm) hammer the first layer with
        // hundreds of pillars but are not load-bearing feet. Require both
        // XY extents and area to be above thresholds to be an anchor.
        let isTiny = false;
        if (inBandZ) {
            const area = island.areaMm2 ?? 0;
            if (area > 0 && area < ANCHOR_MIN_AREA_MM2) {
                isTiny = true;
            } else {
                const voxels = island.contactVoxels;
                if (voxels && voxels.length > 0) {
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    for (const v of voxels) {
                        if (v.x < minX) minX = v.x;
                        if (v.x > maxX) maxX = v.x;
                        if (v.y < minY) minY = v.y;
                        if (v.y > maxY) maxY = v.y;
                    }
                    const w = maxX - minX;
                    const h = maxY - minY;
                    if (w < ANCHOR_MIN_XY_MM || h < ANCHOR_MIN_XY_MM) isTiny = true;
                }
            }
        }
        if (inBandZ && !isTiny) {
            scaleById.set(island.id, factor);
            inBandIds.push(island.id);
        } else {
            scaleById.set(island.id, ANCHOR_SCALE_NONE);
        }
        prevZ = island.baseZ;
    }

    return { scaleById, clusterCount, inBandIds };
}
