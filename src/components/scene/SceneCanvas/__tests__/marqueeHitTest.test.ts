import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boxHitsMarquee,
  marqueeModeForDrag,
  marqueeRectForDrag,
  shapeHitsMarquee,
} from '../marqueeHitTest';

/** A 100x100 rectangle with its top-left corner at (100, 100). */
const rect = marqueeRectForDrag({ x: 100, y: 100 }, { x: 200, y: 200 });

const boxCorners = (minX: number, minY: number, maxX: number, maxY: number) => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: minX, y: maxY },
  { x: maxX, y: maxY },
];

test('drag direction picks the mode, whatever the vertical direction', () => {
  assert.equal(marqueeModeForDrag({ x: 10, y: 10 }, { x: 90, y: 90 }), 'window');
  assert.equal(marqueeModeForDrag({ x: 10, y: 90 }, { x: 90, y: 10 }), 'window');
  assert.equal(marqueeModeForDrag({ x: 90, y: 10 }, { x: 10, y: 90 }), 'crossing');
  assert.equal(marqueeModeForDrag({ x: 90, y: 90 }, { x: 10, y: 10 }), 'crossing');
});

test('a straight down drag counts as a window', () => {
  assert.equal(marqueeModeForDrag({ x: 50, y: 10 }, { x: 50, y: 90 }), 'window');
});

test('the rectangle is normalised whichever way the drag went', () => {
  assert.deepEqual(
    marqueeRectForDrag({ x: 200, y: 200 }, { x: 100, y: 100 }),
    { minX: 100, minY: 100, maxX: 200, maxY: 200 },
  );
});

test('a window drag takes only a shape that fits entirely', () => {
  const inside = [{ x: 120, y: 120 }, { x: 180, y: 180 }];
  const halfOut = [{ x: 120, y: 120 }, { x: 260, y: 180 }];

  assert.equal(shapeHitsMarquee(rect, inside, [[0, 1]], 'window'), true);
  assert.equal(shapeHitsMarquee(rect, halfOut, [[0, 1]], 'window'), false);
});

test('a crossing drag takes a shape it merely touches', () => {
  const halfOut = [{ x: 120, y: 120 }, { x: 260, y: 180 }];

  assert.equal(shapeHitsMarquee(rect, halfOut, [[0, 1]], 'crossing'), true);
});

test('a crossing drag catches a strut that spans the rectangle end to end', () => {
  const spanning = [{ x: 40, y: 150 }, { x: 300, y: 150 }];

  assert.equal(shapeHitsMarquee(rect, spanning, [[0, 1]], 'crossing'), true);
  assert.equal(shapeHitsMarquee(rect, spanning, [[0, 1]], 'window'), false);
});

test('a strut that passes by without touching is left alone', () => {
  const alongside = [{ x: 40, y: 400 }, { x: 300, y: 400 }];

  assert.equal(shapeHitsMarquee(rect, alongside, [[0, 1]], 'crossing'), false);
});

test('loose points still count for a crossing drag', () => {
  const single = [{ x: 150, y: 150 }];

  assert.equal(shapeHitsMarquee(rect, single, [], 'crossing'), true);
  assert.equal(shapeHitsMarquee(rect, single, [], 'window'), true);
});

test('a shape with no points is never hit', () => {
  assert.equal(shapeHitsMarquee(rect, [], [], 'crossing'), false);
  assert.equal(shapeHitsMarquee(rect, [], [], 'window'), false);
});

test('an unprojectable point sinks a window drag but not a crossing one', () => {
  const partlyProjected = [{ x: 150, y: 150 }, null];

  assert.equal(shapeHitsMarquee(rect, partlyProjected, [[0, 1]], 'window'), false);
  assert.equal(shapeHitsMarquee(rect, partlyProjected, [[0, 1]], 'crossing'), true);
});

test('a window drag takes only a box that fits entirely', () => {
  assert.equal(boxHitsMarquee(rect, boxCorners(120, 120, 180, 180), 'window'), true);
  assert.equal(boxHitsMarquee(rect, boxCorners(120, 120, 260, 180), 'window'), false);
});

test('a crossing drag takes a box that overlaps at all', () => {
  assert.equal(boxHitsMarquee(rect, boxCorners(190, 190, 400, 400), 'crossing'), true);
  assert.equal(boxHitsMarquee(rect, boxCorners(300, 300, 400, 400), 'crossing'), false);
});

test('a crossing drag inside a large box still takes it', () => {
  assert.equal(boxHitsMarquee(rect, boxCorners(0, 0, 500, 500), 'crossing'), true);
  assert.equal(boxHitsMarquee(rect, boxCorners(0, 0, 500, 500), 'window'), false);
});

test('a box touching along one edge counts as crossed', () => {
  assert.equal(boxHitsMarquee(rect, boxCorners(200, 120, 300, 180), 'crossing'), true);
});

test('a crossing drag misses a box whose silhouette clears the corner', () => {
  // A rotated box projects to a diamond: its axis-aligned bounds reach the
  // marquee, its silhouette does not.
  const diamond = [
    { x: 150, y: 300 },
    { x: 300, y: 150 },
    { x: 450, y: 300 },
    { x: 300, y: 450 },
  ];

  assert.equal(boxHitsMarquee(rect, diamond, 'crossing'), false);
});

test('a crossing drag takes a diamond it does reach into', () => {
  const diamond = [
    { x: 100, y: 250 },
    { x: 250, y: 100 },
    { x: 400, y: 250 },
    { x: 250, y: 400 },
  ];

  assert.equal(boxHitsMarquee(rect, diamond, 'crossing'), true);
});

test('a box seen edge-on is still crossed', () => {
  const edgeOn = [{ x: 40, y: 150 }, { x: 300, y: 150 }, { x: 170, y: 150 }];

  assert.equal(boxHitsMarquee(rect, edgeOn, 'crossing'), true);
});

test('a box with no projectable corners is never hit', () => {
  assert.equal(boxHitsMarquee(rect, [null, null], 'crossing'), false);
  assert.equal(boxHitsMarquee(rect, [], 'window'), false);
});
