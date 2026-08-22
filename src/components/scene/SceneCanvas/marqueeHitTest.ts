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

/** Andrew's monotone chain, counter-clockwise, without collinear points. */
function convexHull(points: MarqueePoint[]): MarqueePoint[] {
  if (points.length < 3) return points.slice();

  const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const turn = (o: MarqueePoint, a: MarqueePoint, b: MarqueePoint) => (
    ((a.x - o.x) * (b.y - o.y)) - ((a.y - o.y) * (b.x - o.x))
  );

  const half = (ordered: MarqueePoint[]) => {
    const chain: MarqueePoint[] = [];
    for (const point of ordered) {
      while (chain.length >= 2 && turn(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };

  return half(sorted).concat(half(sorted.slice().reverse()));
}

/** Separating axis test between a convex polygon and the marquee rectangle. */
function convexHullIntersectsMarquee(rect: MarqueeRect, hull: MarqueePoint[]): boolean {
  const rectCorners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];

  const axes: MarqueePoint[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < hull.length; i += 1) {
    const from = hull[i];
    const to = hull[(i + 1) % hull.length];
    axes.push({ x: -(to.y - from.y), y: to.x - from.x });
  }

  for (const axis of axes) {
    let hullMin = Infinity;
    let hullMax = -Infinity;
    for (const point of hull) {
      const distance = (point.x * axis.x) + (point.y * axis.y);
      hullMin = Math.min(hullMin, distance);
      hullMax = Math.max(hullMax, distance);
    }

    let rectMin = Infinity;
    let rectMax = -Infinity;
    for (const corner of rectCorners) {
      const distance = (corner.x * axis.x) + (corner.y * axis.y);
      rectMin = Math.min(rectMin, distance);
      rectMax = Math.max(rectMax, distance);
    }

    if (hullMax < rectMin || rectMax < hullMin) return false;
  }

  return true;
}

/**
 * Hit test for a model, from the eight projected corners of the bounding box
 * that its own mesh occupies in world space.
 *
 * A crossing drag tests the silhouette of that box — the convex hull of the
 * projected corners — not the axis-aligned rectangle around it, which for a
 * model seen at an angle covers a great deal of empty canvas. The box is still
 * a box: a drag can catch a corner of it that the model itself does not fill.
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

  const projectedCorners = corners.filter((corner): corner is MarqueePoint => corner !== null);
  if (projectedCorners.length === 0) return false;

  const hull = convexHull(projectedCorners);

  // A box seen edge-on projects to a segment, and a single corner to a point.
  if (hull.length === 1) return isPointInsideMarquee(rect, hull[0]);
  if (hull.length === 2) return segmentIntersectsMarquee(rect, hull[0], hull[1]);

  return convexHullIntersectsMarquee(rect, hull);
}
