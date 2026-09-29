import type { PrinterProfile } from '@/features/profiles/profileStore';

/**
 * XY clipping of staged geometry to the build volume footprint.
 *
 * The native slicer rasterizes the staged buffer against the build volume:
 * `quantizeMeshChunkToUint16` saturates every coordinate onto that box, so a
 * model hanging past the plate edge used to arrive as geometry squashed onto
 * the boundary — the out-of-volume part was not ignored, it was projected onto
 * the edge and rasterized there. Excluding the whole model was the only
 * defence, which also dropped the part that *was* printable.
 *
 * Clipping each triangle to the footprint in scene millimetres before staging
 * leaves only the in-volume part, so saturation becomes a no-op for XY and the
 * raster only ever sees in-volume pixels. A model that merely straddles the
 * edge keeps printing its overlapping part; only a model with no overlap at all
 * is excluded upstream (see `isBoundsDisjointFromVolume`).
 *
 * Z is carried through untouched: build height is bounded by the layer count,
 * not by the raster footprint.
 */

export type BuildVolumeFootprintMm = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** A triangle cut by four planes has at most seven vertices. */
const MAX_CLIPPED_VERTICES = 7;

/** Receives one triangle of the clipped fan. */
export type ClippedTriangleSink = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) => void;

/**
 * Plate footprint in scene millimetres, centred on the origin like the slicer's
 * own mm-to-pixel mapping (`project_triangles_inplace`) and the mesh transport
 * quantization bounds it has to agree with.
 */
export function resolveBuildVolumeFootprintMm(
  printerProfile: Pick<PrinterProfile, 'buildVolumeMm'>,
): BuildVolumeFootprintMm {
  const widthMm = Math.max(1, Number(printerProfile.buildVolumeMm.width) || 1);
  const depthMm = Math.max(1, Number(printerProfile.buildVolumeMm.depth) || 1);
  return {
    minX: -widthMm * 0.5,
    minY: -depthMm * 0.5,
    maxX: widthMm * 0.5,
    maxY: depthMm * 0.5,
  };
}

// Scratch for the clip pass. Staging is single-threaded and `emit` only appends
// to a collector, so the pass cannot re-enter itself and one set of buffers
// keeps every clipped triangle allocation-free.
const polygonBufferX = [
  new Float64Array(MAX_CLIPPED_VERTICES),
  new Float64Array(MAX_CLIPPED_VERTICES),
];
const polygonBufferY = [
  new Float64Array(MAX_CLIPPED_VERTICES),
  new Float64Array(MAX_CLIPPED_VERTICES),
];
const polygonBufferZ = [
  new Float64Array(MAX_CLIPPED_VERTICES),
  new Float64Array(MAX_CLIPPED_VERTICES),
];

/**
 * Sutherland–Hodgman pass against one axis-aligned plane.
 *
 * Reads the polygon in `polygonBuffer*[src]`, writes it to `polygonBuffer*[dst]`
 * and returns the new vertex count.
 */
function clipAgainstPlane(
  vertexCount: number,
  src: number,
  dst: number,
  axis: 0 | 1,
  bound: number,
  keepAbove: boolean,
): number {
  const srcX = polygonBufferX[src];
  const srcY = polygonBufferY[src];
  const srcZ = polygonBufferZ[src];
  const dstX = polygonBufferX[dst];
  const dstY = polygonBufferY[dst];
  const dstZ = polygonBufferZ[dst];
  let outCount = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    const j = i + 1 === vertexCount ? 0 : i + 1;
    const coordI = axis === 0 ? srcX[i] : srcY[i];
    const coordJ = axis === 0 ? srcX[j] : srcY[j];
    const insideI = keepAbove ? coordI >= bound : coordI <= bound;
    const insideJ = keepAbove ? coordJ >= bound : coordJ <= bound;
    if (insideI) {
      dstX[outCount] = srcX[i];
      dstY[outCount] = srcY[i];
      dstZ[outCount] = srcZ[i];
      outCount += 1;
    }
    if (insideI === insideJ) continue;
    // An edge parallel to the plane cannot cross it, so `coordJ - coordI` is
    // non-zero here; the guard only stops a corrupt coordinate becoming NaN.
    const delta = coordJ - coordI;
    if (delta === 0) continue;
    const t = (bound - coordI) / delta;
    dstX[outCount] = srcX[i] + (srcX[j] - srcX[i]) * t;
    dstY[outCount] = srcY[i] + (srcY[j] - srcY[i]) * t;
    dstZ[outCount] = srcZ[i] + (srcZ[j] - srcZ[i]) * t;
    outCount += 1;
  }
  return outCount;
}

/**
 * Clips one triangle to the footprint and emits the kept part as a triangle fan.
 *
 * The fan preserves the input winding, so the rasterizer's winding and its
 * front/back decision (derived from the triangle normal) are unchanged for the
 * retained geometry. A triangle entirely inside is emitted verbatim, so
 * in-bounds geometry stays bit-identical to not clipping at all. Zero-area fan
 * triangles — the seam cases where a cut lands exactly on a vertex — are
 * dropped, since they carry no fill.
 */
export function clipTriangleToBuildVolume(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  footprint: BuildVolumeFootprintMm,
  emit: ClippedTriangleSink,
): void {
  const { minX, minY, maxX, maxY } = footprint;
  const inside = (x: number, y: number): boolean =>
    x >= minX && x <= maxX && y >= minY && y <= maxY;
  if (inside(ax, ay) && inside(bx, by) && inside(cx, cy)) {
    emit(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  polygonBufferX[0][0] = ax;
  polygonBufferY[0][0] = ay;
  polygonBufferZ[0][0] = az;
  polygonBufferX[0][1] = bx;
  polygonBufferY[0][1] = by;
  polygonBufferZ[0][1] = bz;
  polygonBufferX[0][2] = cx;
  polygonBufferY[0][2] = cy;
  polygonBufferZ[0][2] = cz;

  let count = 3;
  count = clipAgainstPlane(count, 0, 1, 0, minX, true);
  if (count < 3) return;
  count = clipAgainstPlane(count, 1, 0, 0, maxX, false);
  if (count < 3) return;
  count = clipAgainstPlane(count, 0, 1, 1, minY, true);
  if (count < 3) return;
  count = clipAgainstPlane(count, 1, 0, 1, maxY, false);
  if (count < 3) return;

  // The last pass writes to buffer 0.
  const resultX = polygonBufferX[0];
  const resultY = polygonBufferY[0];
  const resultZ = polygonBufferZ[0];
  const x0 = resultX[0];
  const y0 = resultY[0];
  const z0 = resultZ[0];
  for (let i = 1; i + 1 < count; i += 1) {
    const x1 = resultX[i];
    const y1 = resultY[i];
    const z1 = resultZ[i];
    const x2 = resultX[i + 1];
    const y2 = resultY[i + 1];
    const z2 = resultZ[i + 1];
    if ((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0) === 0) continue;
    emit(x0, y0, z0, x1, y1, z1, x2, y2, z2);
  }
}
