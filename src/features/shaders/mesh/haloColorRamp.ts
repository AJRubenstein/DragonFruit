import * as THREE from 'three';

// OKLCH → sRGB conversion + 3-stop perceptual ramp for halo materials.
//
// Why OKLCH:
//   sRGB lerps between saturated colors muddy through grey at the midpoint.
//   OKLCH lerps stay in the chromatic plane, so a sage → amber ramp stays
//   colourful all the way through.
//
// Stops are picked from the impeccable design call sheet for this issue.

export interface OklchColor {
  l: number; // 0..1 lightness
  c: number; // 0..~0.4 chroma
  h: number; // 0..360 hue in degrees
}

export interface HaloStops {
  low: OklchColor;
  mid: OklchColor;
  high: OklchColor;
}

// Island weight ramp: sage → mustard → amber.
// Encodes severity (small island = quiet, large island = warning).
export const ISLAND_HALO_STOPS: HaloStops = {
  low: { l: 0.82, c: 0.08, h: 150 },
  mid: { l: 0.80, c: 0.14, h: 100 },
  high: { l: 0.64, c: 0.21, h: 38 },
};

// Support coverage ramp: full green family. Preserves Renato's prototype
// hue. v1 ships with weight=0.5 (constant mid stop); per-support weight
// inheritance is deferred to a v2 follow-up.
export const SUPPORT_HALO_STOPS: HaloStops = {
  low: { l: 0.82, c: 0.10, h: 145 },
  mid: { l: 0.75, c: 0.16, h: 145 },
  high: { l: 0.65, c: 0.20, h: 145 },
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// Linear-light to sRGB transfer function (IEC 61966-2-1).
function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// OKLab → linear sRGB. Matrix from
// https://bottosson.github.io/posts/oklab/ (Björn Ottosson, public domain).
function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;

  return [
    +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

export function oklchToColor(oklch: OklchColor): THREE.Color {
  const hueRad = (oklch.h * Math.PI) / 180;
  const a = oklch.c * Math.cos(hueRad);
  const b = oklch.c * Math.sin(hueRad);
  const [rLin, gLin, bLin] = oklabToLinearSrgb(oklch.l, a, b);
  // Out-of-gamut clamp in linear space — desaturates rather than producing
  // wildly wrong hues. Same approach used by every browser CSS engine.
  const r = clamp01(linearToSrgb(clamp01(rLin)));
  const g = clamp01(linearToSrgb(clamp01(gLin)));
  const bs = clamp01(linearToSrgb(clamp01(bLin)));
  return new THREE.Color(r, g, bs);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  // Hue interpolated linearly. All three halo stop sets use either a single
  // hue (support) or hues within one hemisphere (island sage → amber); no
  // shortest-arc handling needed at the current stop set scale.
  return {
    l: lerp(a.l, b.l, t),
    c: lerp(a.c, b.c, t),
    h: lerp(a.h, b.h, t),
  };
}

// Three-stop perceptual lerp. weight ∈ [0, 1]:
//   0.0   → low
//   0.5   → mid
//   1.0   → high
// Linear interpolation in OKLCH, then a single OKLCH→sRGB conversion at
// the end. CPU-side; pass the resulting THREE.Color as a shader uniform.
export function haloColorAt(weight: number, stops: HaloStops): THREE.Color {
  const w = clamp01(weight);
  if (w <= 0.5) {
    return oklchToColor(lerpOklch(stops.low, stops.mid, w * 2));
  }
  return oklchToColor(lerpOklch(stops.mid, stops.high, (w - 0.5) * 2));
}
