import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  oklchToColor,
  haloColorAt,
  ISLAND_HALO_STOPS,
  SUPPORT_HALO_STOPS,
} from '../haloColorRamp';

// 3/255 ≈ 0.0118 per channel — tolerates OKLCH→sRGB float drift across platforms.
const TOLERANCE = 3 / 255;

function assertColorClose(actual: THREE.Color, expected: THREE.Color, msg: string): void {
  for (const channel of ['r', 'g', 'b'] as const) {
    const diff = Math.abs(actual[channel] - expected[channel]);
    assert.ok(
      diff <= TOLERANCE,
      `${msg}: channel ${channel} expected ${expected[channel].toFixed(4)} got ${actual[channel].toFixed(4)} (diff ${diff.toFixed(4)} > ${TOLERANCE.toFixed(4)})`,
    );
  }
}

describe('oklchToColor — OKLCH → sRGB THREE.Color', () => {
  it('produces clamped sRGB values in [0, 1] for in-gamut inputs', () => {
    const c = oklchToColor({ l: 0.65, c: 0.21, h: 38 });
    assert.ok(c.r >= 0 && c.r <= 1, 'r in range');
    assert.ok(c.g >= 0 && c.g <= 1, 'g in range');
    assert.ok(c.b >= 0 && c.b <= 1, 'b in range');
  });

  it('returns a neutral grey for chroma=0 regardless of hue', () => {
    const a = oklchToColor({ l: 0.5, c: 0, h: 50 });
    const b = oklchToColor({ l: 0.5, c: 0, h: 250 });
    assertColorClose(a, b, 'chroma=0 hue-invariance');
  });

  it('clamps out-of-gamut chroma without producing negative or >1 channels', () => {
    const c = oklchToColor({ l: 0.5, c: 0.5, h: 0 }); // very saturated, likely OOG
    assert.ok(c.r >= 0 && c.r <= 1);
    assert.ok(c.g >= 0 && c.g <= 1);
    assert.ok(c.b >= 0 && c.b <= 1);
  });
});

describe('haloColorAt — 3-stop perceptual lerp', () => {
  it('returns the LOW stop color at weight = 0', () => {
    const actual = haloColorAt(0, ISLAND_HALO_STOPS);
    const expected = oklchToColor(ISLAND_HALO_STOPS.low);
    assertColorClose(actual, expected, 'low boundary');
  });

  it('returns the MID stop color at weight = 0.5', () => {
    const actual = haloColorAt(0.5, ISLAND_HALO_STOPS);
    const expected = oklchToColor(ISLAND_HALO_STOPS.mid);
    assertColorClose(actual, expected, 'mid boundary');
  });

  it('returns the HIGH stop color at weight = 1', () => {
    const actual = haloColorAt(1, ISLAND_HALO_STOPS);
    const expected = oklchToColor(ISLAND_HALO_STOPS.high);
    assertColorClose(actual, expected, 'high boundary');
  });

  it('clamps weights outside [0, 1]', () => {
    const below = haloColorAt(-0.5, ISLAND_HALO_STOPS);
    const above = haloColorAt(1.5, ISLAND_HALO_STOPS);
    assertColorClose(below, oklchToColor(ISLAND_HALO_STOPS.low), 'below 0 clamps to low');
    assertColorClose(above, oklchToColor(ISLAND_HALO_STOPS.high), 'above 1 clamps to high');
  });

  it('midpoint between low and mid is not equal to either endpoint', () => {
    const stop = haloColorAt(0.25, ISLAND_HALO_STOPS);
    const low = oklchToColor(ISLAND_HALO_STOPS.low);
    const mid = oklchToColor(ISLAND_HALO_STOPS.mid);
    const lowDist =
      Math.abs(stop.r - low.r) + Math.abs(stop.g - low.g) + Math.abs(stop.b - low.b);
    const midDist =
      Math.abs(stop.r - mid.r) + Math.abs(stop.g - mid.g) + Math.abs(stop.b - mid.b);
    assert.ok(lowDist > 0.001, 'distinct from low');
    assert.ok(midDist > 0.001, 'distinct from mid');
  });
});

describe('Predefined stop sets', () => {
  it('ISLAND_HALO_STOPS span low → high lightness within OKLCH gamut conventions', () => {
    assert.ok(ISLAND_HALO_STOPS.low.l > 0 && ISLAND_HALO_STOPS.low.l <= 1);
    assert.ok(ISLAND_HALO_STOPS.mid.l > 0 && ISLAND_HALO_STOPS.mid.l <= 1);
    assert.ok(ISLAND_HALO_STOPS.high.l > 0 && ISLAND_HALO_STOPS.high.l <= 1);
  });

  it('SUPPORT_HALO_STOPS all share green hue family (h ≈ 145 ± 15)', () => {
    for (const stop of [SUPPORT_HALO_STOPS.low, SUPPORT_HALO_STOPS.mid, SUPPORT_HALO_STOPS.high]) {
      assert.ok(
        Math.abs(stop.h - 145) <= 15,
        `expected green hue ~145, got ${stop.h}`,
      );
    }
  });
});
