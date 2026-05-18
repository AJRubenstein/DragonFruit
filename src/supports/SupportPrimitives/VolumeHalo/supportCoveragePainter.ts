import * as THREE from 'three';

// Per-vertex support-coverage painter (vertex-colour path).
//
// Writes the geometry's `color` (vec3) BufferAttribute — the same channel
// meshStandardMaterial reads when `vertexColors: true`. Vertices in the
// brush radius blend toward `opts.tint`; vertices outside stay at
// `opts.baseColor` (the multiplication identity if set to white).
//
// We chose this instead of a custom attribute + onBeforeCompile shader
// patch because Three.js's shader program cache + R3F reconciliation make
// patched shaders fragile under HMR (programs stay cached after code
// changes; customProgramCacheKey workarounds are easy to misconfigure).
// Vertex colours are bog-standard and always render correctly.

export interface SupportCoverageTip {
  x: number;
  y: number;
  z: number;
  diameter: number;
}

export interface SupportCoveragePaintOptions {
  tips: readonly SupportCoverageTip[];
  // "No paint" colour. White (1,1,1) for the multiplication identity so
  // unpainted vertices render the model's natural lit colour unchanged.
  baseColor: THREE.Color;
  // Colour applied at brush centre. Multiplies through the material, so
  // very saturated tints come out more visibly on coloured models.
  tint: THREE.Color;
  // Brush radius for a single tip = `tip.diameter * radiusFactor`.
  radiusFactor: number;
  // Strength at brush centre, 0..1.
  maxStrength: number;
}

interface TipBuckets {
  cellSize: number;
  minX: number;
  minY: number;
  minZ: number;
  nx: number;
  ny: number;
  nz: number;
  buckets: number[][];
}

function buildTipBuckets(
  tips: readonly SupportCoverageTip[],
  radiusFactor: number,
): TipBuckets | null {
  if (tips.length === 0) return null;

  let maxRadius = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const tip of tips) {
    const r = tip.diameter * radiusFactor;
    if (r > maxRadius) maxRadius = r;
    if (tip.x < minX) minX = tip.x;
    if (tip.y < minY) minY = tip.y;
    if (tip.z < minZ) minZ = tip.z;
    if (tip.x > maxX) maxX = tip.x;
    if (tip.y > maxY) maxY = tip.y;
    if (tip.z > maxZ) maxZ = tip.z;
  }

  const cellSize = Math.max(maxRadius, 0.5);
  const nx = Math.max(1, Math.ceil((maxX - minX) / cellSize) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / cellSize) + 1);
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cellSize) + 1);

  const buckets: number[][] = new Array(nx * ny * nz);

  for (let i = 0; i < tips.length; i += 1) {
    const tip = tips[i];
    const bx = Math.floor((tip.x - minX) / cellSize);
    const by = Math.floor((tip.y - minY) / cellSize);
    const bz = Math.floor((tip.z - minZ) / cellSize);
    const idx = bz * nx * ny + by * nx + bx;
    const bucket = buckets[idx] ?? (buckets[idx] = []);
    bucket.push(i);
  }

  return { cellSize, minX, minY, minZ, nx, ny, nz, buckets };
}

function* neighborhoodCells(
  buckets: TipBuckets,
  x: number,
  y: number,
  z: number,
): Generator<number[]> {
  const bx = Math.floor((x - buckets.minX) / buckets.cellSize);
  const by = Math.floor((y - buckets.minY) / buckets.cellSize);
  const bz = Math.floor((z - buckets.minZ) / buckets.cellSize);
  for (let dz = -1; dz <= 1; dz += 1) {
    const zi = bz + dz;
    if (zi < 0 || zi >= buckets.nz) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      const yi = by + dy;
      if (yi < 0 || yi >= buckets.ny) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const xi = bx + dx;
        if (xi < 0 || xi >= buckets.nx) continue;
        const idx = zi * buckets.nx * buckets.ny + yi * buckets.nx + xi;
        const cell = buckets.buckets[idx];
        if (cell) yield cell;
      }
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function ensureColorAttribute(
  geometry: THREE.BufferGeometry,
  base: THREE.Color,
): THREE.BufferAttribute | null {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return null;
  const n = pos.count;
  let color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!color || color.count !== n) {
    const arr = new Uint8Array(n * 3);
    color = new THREE.BufferAttribute(arr, 3, true);
    geometry.setAttribute('color', color);
    const buf = color.array as Uint8Array;
    const r = Math.round(base.r * 255);
    const g = Math.round(base.g * 255);
    const b = Math.round(base.b * 255);
    for (let i = 0; i < n; i += 1) {
      buf[i * 3 + 0] = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
    color.needsUpdate = true;
  }
  return color;
}

// Reset all per-vertex colours to baseColor. Used when the toggle goes off.
export function clearSupportCoveragePaint(
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
): void {
  const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!color) return;
  const isByte = color.array instanceof Uint8Array || color.array instanceof Uint8ClampedArray;
  const buf = color.array as Uint8Array | Float32Array;
  const n = color.count;
  const r = isByte ? Math.round(baseColor.r * 255) : baseColor.r;
  const g = isByte ? Math.round(baseColor.g * 255) : baseColor.g;
  const b = isByte ? Math.round(baseColor.b * 255) : baseColor.b;
  for (let i = 0; i < n; i += 1) {
    buf[i * 3 + 0] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  color.needsUpdate = true;
}

// Paint each vertex with a soft brush from baseColor toward tint based on
// proximity to the nearest support tip. Returns the number of vertices
// with non-zero contribution.
export function paintSupportCoverage(
  geometry: THREE.BufferGeometry,
  opts: SupportCoveragePaintOptions,
): number {
  const color = ensureColorAttribute(geometry, opts.baseColor);
  if (!color) return 0;
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const arrPos = pos.array as Float32Array;
  const isByte = color.array instanceof Uint8Array || color.array instanceof Uint8ClampedArray;
  const arrCol = color.array as Uint8Array | Float32Array;
  const n = pos.count;

  const baseR = opts.baseColor.r;
  const baseG = opts.baseColor.g;
  const baseB = opts.baseColor.b;
  const tintR = opts.tint.r;
  const tintG = opts.tint.g;
  const tintB = opts.tint.b;

  const buckets = buildTipBuckets(opts.tips, opts.radiusFactor);
  if (!buckets) {
    clearSupportCoveragePaint(geometry, opts.baseColor);
    return 0;
  }

  let painted = 0;
  for (let v = 0; v < n; v += 1) {
    const px = arrPos[v * 3 + 0];
    const py = arrPos[v * 3 + 1];
    const pz = arrPos[v * 3 + 2];

    let bestStrength = 0;
    for (const cell of neighborhoodCells(buckets, px, py, pz)) {
      for (let i = 0; i < cell.length; i += 1) {
        const tip = opts.tips[cell[i]];
        const dx = px - tip.x;
        const dy = py - tip.y;
        const dz = pz - tip.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const radius = tip.diameter * opts.radiusFactor;
        if (dist >= radius) continue;
        const s = 1 - smoothstep(0, radius, dist);
        if (s > bestStrength) bestStrength = s;
      }
    }

    const strength = bestStrength * opts.maxStrength;
    const r = baseR + (tintR - baseR) * strength;
    const g = baseG + (tintG - baseG) * strength;
    const b = baseB + (tintB - baseB) * strength;

    if (isByte) {
      arrCol[v * 3 + 0] = Math.round(r * 255);
      arrCol[v * 3 + 1] = Math.round(g * 255);
      arrCol[v * 3 + 2] = Math.round(b * 255);
    } else {
      arrCol[v * 3 + 0] = r;
      arrCol[v * 3 + 1] = g;
      arrCol[v * 3 + 2] = b;
    }
    if (strength > 0) painted += 1;
  }

  color.needsUpdate = true;
  return painted;
}
