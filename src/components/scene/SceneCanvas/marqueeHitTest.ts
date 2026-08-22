/**
 * Screen-space hit tests for the shift+drag marquee.
 *
 * Follows the CAD convention: dragging left-to-right selects only what the
 * rectangle encloses completely ("window"), dragging right-to-left selects
 * anything the rectangle touches ("crossing").
 *
 * Everything here works on points already projected to container pixels. A
 * `null` point means the projection failed (behind the camera, outside clip
 * space): a window drag rejects the whole shape, a crossing drag ignores it.
 */

export type MarqueeMode = 'window' | 'crossing';

export type MarqueePoint = { x: number; y: number };

export type MarqueeRect = { minX: number; minY: number; maxX: number; maxY: number };

/** Endpoint index pairs into the shape's point list. */
export type MarqueeSegment = [number, number];

export function marqueeRectForDrag(
  start: MarqueePoint,
  current: MarqueePoint,
): MarqueeRect {
  return {
    minX: Math.min(start.x, current.x),
    maxX: Math.max(start.x, current.x),
    minY: Math.min(start.y, current.y),
    maxY: Math.max(start.y, current.y),
  };
}

export function marqueeModeForDrag(start: MarqueePoint, current: MarqueePoint): MarqueeMode {
  return current.x < start.x ? 'crossing' : 'window';
}

export function isPointInsideMarquee(rect: MarqueeRect, point: MarqueePoint): boolean {
  return point.x >= rect.minX
    && point.x <= rect.maxX
    && point.y >= rect.minY
    && point.y <= rect.maxY;
}

/** Liang-Barsky clip: true when any part of the segment lies inside the rect. */
function segmentIntersectsMarquee(
  rect: MarqueeRect,
  a: MarqueePoint,
  b: MarqueePoint,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edgeDistances = [-dx, dx, -dy, dy];
  const edgeOffsets = [a.x - rect.minX, rect.maxX - a.x, a.y - rect.minY, rect.maxY - a.y];

  let enter = 0;
  let exit = 1;

  for (let i = 0; i < 4; i += 1) {
    if (edgeDistances[i] === 0) {
      // Parallel to this edge: outside it means the segment can never enter.
      if (edgeOffsets[i] < 0) return false;
      continue;
    }

    const crossing = edgeOffsets[i] / edgeDistances[i];

    if (edgeDistances[i] < 0) {
      if (crossing > exit) return false;
      if (crossing > enter) enter = crossing;
    } else {
      if (crossing < enter) return false;
      if (crossing < exit) exit = crossing;
    }
  }

  return true;
}

/**
 * Hit test for a shape described by its projected points, plus the segments
 * connecting them. Exact for supports, which are chains of thin struts.
 */
export function shapeHitsMarquee(
  rect: MarqueeRect,
  points: Array<MarqueePoint | null>,
  segments: MarqueeSegment[],
  mode: MarqueeMode,
): boolean {
  if (points.length === 0) return false;

  if (mode === 'window') {
    return points.every((point) => point !== null && isPointInsideMarquee(rect, point));
  }

  for (const point of points) {
    if (point && isPointInsideMarquee(rect, point)) return true;
  }

  for (const [from, to] of segments) {
    const a = points[from];
    const b = points[to];
    if (a && b && segmentIntersectsMarquee(rect, a, b)) return true;
  }

  return false;
}

/**
 * Hit test for a model, from the eight projected corners of its world bounding
 * box. A crossing drag compares screen-space bounding boxes, so a long
 * diagonal model reports a hit slightly before the rectangle reaches its
 * surface — the box covers empty space around it.
 */
export function boxHitsMarquee(
  rect: MarqueeRect,
  corners: Array<MarqueePoint | null>,
  mode: MarqueeMode,
): boolean {
  if (corners.length === 0) return false;

  if (mode === 'window') {
    return corners.every((corner) => corner !== null && isPointInsideMarquee(rect, corner));
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    if (!corner) continue;
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  }

  if (minX > maxX || minY > maxY) return false;

  return minX <= rect.maxX && maxX >= rect.minX && minY <= rect.maxY && maxY >= rect.minY;
}
