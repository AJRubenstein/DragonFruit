import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeIslandWeights,
  computeWeightForIsland,
  ISLAND_AREA_LOW_MM2,
  ISLAND_AREA_HIGH_MM2,
  ISLAND_VOLUME_LOW_MM3,
  ISLAND_VOLUME_HIGH_MM3,
} from '../islandWeight';
import type { Island } from '../types';

function makeIsland(overrides: Partial<Island> & { id: number; totalAreaMm2: number }): Island {
  return {
    firstLayer: 0,
    lastLayer: 0,
    status: 'complete',
    perLayerAreaMm2: new Map(),
    childIds: [],
    centroidSumX: 0,
    centroidSumY: 0,
    centroidSumZ: 0,
    centroidCount: 0,
    ...overrides,
  };
}

describe('computeWeightForIsland — pure scalar at boundary thresholds', () => {
  it('returns 0 at and below ISLAND_AREA_LOW_MM2', () => {
    assert.equal(computeWeightForIsland({ areaMm2: 0 }), 0);
    assert.equal(computeWeightForIsland({ areaMm2: ISLAND_AREA_LOW_MM2 }), 0);
  });

  it('returns 1 at and above ISLAND_AREA_HIGH_MM2', () => {
    assert.equal(computeWeightForIsland({ areaMm2: ISLAND_AREA_HIGH_MM2 }), 1);
    assert.equal(computeWeightForIsland({ areaMm2: ISLAND_AREA_HIGH_MM2 * 10 }), 1);
  });

  it('returns ~0.5 at the geometric midpoint of low/high thresholds', () => {
    const mid = (ISLAND_AREA_LOW_MM2 + ISLAND_AREA_HIGH_MM2) / 2;
    const w = computeWeightForIsland({ areaMm2: mid });
    assert.ok(w > 0.3 && w < 0.7, `expected mid range, got ${w}`);
  });

  it('uses volume thresholds when volumeMm3 is provided', () => {
    assert.equal(computeWeightForIsland({ areaMm2: 999, volumeMm3: 0 }), 0);
    assert.equal(
      computeWeightForIsland({ areaMm2: 0, volumeMm3: ISLAND_VOLUME_HIGH_MM3 }),
      1,
    );
  });
});

describe('computeIslandWeights — scan-wide metric selection', () => {
  it('returns an empty Map when no islands present', () => {
    const out = computeIslandWeights([]);
    assert.equal(out.size, 0);
  });

  it('uses volume thresholds when EVERY island has volumeMm3', () => {
    const islands = [
      makeIsland({ id: 1, totalAreaMm2: 0.001, volumeMm3: ISLAND_VOLUME_LOW_MM3 }),
      makeIsland({ id: 2, totalAreaMm2: 0.001, volumeMm3: ISLAND_VOLUME_HIGH_MM3 }),
    ];
    const out = computeIslandWeights(islands);
    assert.equal(out.get(1), 0);
    assert.equal(out.get(2), 1);
  });

  it('falls back to area thresholds when ANY island is missing volumeMm3', () => {
    const islands = [
      makeIsland({ id: 1, totalAreaMm2: ISLAND_AREA_LOW_MM2, volumeMm3: ISLAND_VOLUME_HIGH_MM3 }),
      makeIsland({ id: 2, totalAreaMm2: ISLAND_AREA_HIGH_MM2 }),
    ];
    const out = computeIslandWeights(islands);
    assert.equal(out.get(1), 0);
    assert.equal(out.get(2), 1);
  });

  it('keys output by island.id', () => {
    const islands = [
      makeIsland({ id: 42, totalAreaMm2: ISLAND_AREA_LOW_MM2 }),
      makeIsland({ id: 99, totalAreaMm2: ISLAND_AREA_HIGH_MM2 }),
    ];
    const out = computeIslandWeights(islands);
    assert.ok(out.has(42));
    assert.ok(out.has(99));
    assert.equal(out.size, 2);
  });

  it('handles single-island case without divide-by-zero', () => {
    const islands = [makeIsland({ id: 1, totalAreaMm2: 1 })];
    const out = computeIslandWeights(islands);
    const w = out.get(1);
    assert.ok(typeof w === 'number' && w >= 0 && w <= 1);
  });
});
