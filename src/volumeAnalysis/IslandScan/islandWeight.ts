import type { Island } from './types';

export const ISLAND_AREA_LOW_MM2 = 0.1;
export const ISLAND_AREA_HIGH_MM2 = 10.0;
export const ISLAND_VOLUME_LOW_MM3 = 0.05;
export const ISLAND_VOLUME_HIGH_MM3 = 5.0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface WeightInput {
  areaMm2: number;
  volumeMm3?: number;
}

export function computeWeightForIsland(input: WeightInput): number {
  if (input.volumeMm3 !== undefined) {
    return smoothstep(ISLAND_VOLUME_LOW_MM3, ISLAND_VOLUME_HIGH_MM3, input.volumeMm3);
  }
  return smoothstep(ISLAND_AREA_LOW_MM2, ISLAND_AREA_HIGH_MM2, input.areaMm2);
}

let lastLoggedMetric: 'volume' | 'area' | null = null;

export function computeIslandWeights(islands: readonly Island[]): Map<number, number> {
  const out = new Map<number, number>();
  if (islands.length === 0) return out;

  const useVolume = islands.every((i) => i.volumeMm3 !== undefined);
  const metric: 'volume' | 'area' = useVolume ? 'volume' : 'area';
  if (metric !== lastLoggedMetric) {
    console.debug(`[islandWeight] scan metric=${metric} for ${islands.length} islands`);
    lastLoggedMetric = metric;
  }

  for (const island of islands) {
    const input: WeightInput = useVolume
      ? { areaMm2: island.totalAreaMm2, volumeMm3: island.volumeMm3 }
      : { areaMm2: island.totalAreaMm2 };
    out.set(island.id, computeWeightForIsland(input));
  }

  return out;
}
