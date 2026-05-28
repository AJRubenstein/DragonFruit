import {
  type ROIRegion,
  type VoxlROIExtension,
  type VoxlROIRunLength,
  type VoxlROIRegion,
} from './supportPainterTypes';

// ─── RLE Codec for Persistent ROIs [RLE_CODEC] ───
// [AGENT_NOTE] Compresses a sorted index list into alternating [start, count] run-length segments.
// Extremely fast, reliable fallback for all geometric selections including isolated and non-manifold triangles.

/**
 * Compresses an array of numbers (triangle IDs) into RLE spans.
 */
export function compressRLE(triangleIds: number[]): VoxlROIRunLength[] {
  if (triangleIds.length === 0) return [];
  const sorted = [...triangleIds].sort((a, b) => a - b);
  const spans: VoxlROIRunLength[] = [];
  let start = sorted[0];
  let count = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === start + count) {
      count++;
    } else {
      spans.push({ start, count });
      start = sorted[i];
      count = 1;
    }
  }
  spans.push({ start, count });
  return spans;
}

/**
 * Decompresses RLE spans back into an array of triangle IDs.
 */
export function decompressRLE(spans: VoxlROIRunLength[]): number[] {
  const ids: number[] = [];
  for (const span of spans) {
    for (let i = 0; i < span.count; i++) {
      ids.push(span.start + i);
    }
  }
  return ids;
}

/**
 * Converts in-memory ROIRegion map into a JSON-safe VoxlROIExtension object.
 * Supports Version 2 boundary-loops and RLE fallback.
 */
export function serializeROIsForVoxl(
  regions: Map<string, ROIRegion>,
  modelId: string
): VoxlROIExtension {
  const list: VoxlROIRegion[] = Array.from(regions.values()).map((r) => {
    // RLE is always saved as a reliable, fast fallback.
    const rleSpans = r.rleSpans || compressRLE(Array.from(r.triangleIds));
    return {
      id: r.id,
      brushType: r.brushType,
      seedTriangleId: r.seedTriangleId,
      color: r.color,
      createdAt: r.createdAt,
      loops: r.loops,
      rleSpans,
      brush: r.brush,
      support: r.support,
    };
  });

  return {
    kind: 'support-painter-rois',
    version: 2, // Upgraded version supporting persistent RLE & Loops
    modelId,
    regions: list,
  };
}

/**
 * Converts VoxlROIExtension back into a Map<string, ROIRegion>.
 * Reconstructs triangle sets from RLE or loops.
 */
export function deserializeROIsFromVoxl(
  ext: VoxlROIExtension
): Map<string, ROIRegion> {
  const map = new Map<string, ROIRegion>();
  for (const r of ext.regions) {
    // Reconstruct triangle IDs using either RLE spans or triangleIds (fallback for legacy files)
    let triangleIdsList: number[] = [];
    if (r.rleSpans && r.rleSpans.length > 0) {
      triangleIdsList = decompressRLE(r.rleSpans);
    } else if (r.triangleIds) {
      triangleIdsList = r.triangleIds;
    }

    map.set(r.id, {
      id: r.id,
      brushType: r.brushType,
      seedTriangleId: r.seedTriangleId,
      triangleIds: new Set(triangleIdsList),
      color: r.color,
      proposedOnly: false,
      createdAt: r.createdAt,
      loops: r.loops,
      rleSpans: r.rleSpans,
      brush: r.brush,
      support: r.support,
    });
  }
  return map;
}

/**
 * Type guard to validate whether an unknown value is a valid VoxlROIExtension.
 * Supports both Version 1 and Version 2 formats.
 */
export function isVoxlROIExtension(v: unknown): v is VoxlROIExtension {
  if (typeof v !== 'object' || v === null) return false;
  const candidate = v as Partial<VoxlROIExtension>;
  return (
    candidate.kind === 'support-painter-rois' &&
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.modelId === 'string' &&
    Array.isArray(candidate.regions)
  );
}
