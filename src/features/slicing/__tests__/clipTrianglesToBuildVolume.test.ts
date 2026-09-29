import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clipTriangleToBuildVolume,
  resolveBuildVolumeFootprintMm,
  type BuildVolumeFootprintMm,
} from '../clipTrianglesToBuildVolume';

const FOOTPRINT: BuildVolumeFootprintMm = resolveBuildVolumeFootprintMm({
  buildVolumeMm: { width: 20, depth: 20 },
} as never);

type Triangle = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number };

function clip(triangle: Triangle, footprint: BuildVolumeFootprintMm = FOOTPRINT): Triangle[] {
  const out: Triangle[] = [];
  clipTriangleToBuildVolume(
    triangle.ax, triangle.ay, triangle.az,
    triangle.bx, triangle.by, triangle.bz,
    triangle.cx, triangle.cy, triangle.cz,
    footprint,
    (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      out.push({ ax, ay, az, bx, by, bz, cx, cy, cz });
    },
  );
  return out;
}

/** Twice the signed area in XY; the sign carries the winding. */
function doubleSignedArea(t: Triangle): number {
  return (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
}

function fanDoubleSignedArea(triangles: Triangle[]): number {
  return triangles.reduce((sum, t) => sum + doubleSignedArea(t), 0);
}

function assertWithinFootprint(triangles: Triangle[], footprint: BuildVolumeFootprintMm): void {
  for (const t of triangles) {
    for (const [x, y] of [[t.ax, t.ay], [t.bx, t.by], [t.cx, t.cy]] as const) {
      assert.ok(x >= footprint.minX - 1e-6 && x <= footprint.maxX + 1e-6, `x ${x} outside footprint`);
      assert.ok(y >= footprint.minY - 1e-6 && y <= footprint.maxY + 1e-6, `y ${y} outside footprint`);
    }
  }
}

test('a triangle fully inside is emitted verbatim', () => {
  const triangle: Triangle = { ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, cx: 0, cy: 1, cz: 5 };

  const emitted = clip(triangle);

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], triangle, 'in-bounds geometry must reach the collector unchanged');
});

test('a straddling triangle keeps its winding and its whole in-volume area', () => {
  // Legs along x=-20 and y=-20 with hypotenuse y = -x; the square [-10,10]^2
  // cuts it to the triangle (-10,-10), (10,-10), (-10,10): area 200.
  const triangle: Triangle = { ax: -20, ay: -20, az: 0, bx: 20, by: -20, bz: 10, cx: -20, cy: 20, cz: 20 };

  const emitted = clip(triangle);

  assert.ok(emitted.length > 0, 'a partially in-volume triangle must still be sliced');
  assert.ok(emitted.length <= 5, `a clipped triangle fans into at most 5, got ${emitted.length}`);
  assertWithinFootprint(emitted, FOOTPRINT);
  assert.equal(fanDoubleSignedArea(emitted), 400, 'clipped area must equal the intersection area (2x = 400)');
  assert.equal(
    Math.sign(fanDoubleSignedArea(emitted)),
    Math.sign(doubleSignedArea(triangle)),
    'winding must survive the cut',
  );
});

test('a cut vertex interpolates z along the edge it was cut on', () => {
  // The x = 10 cut lands 60% of the way along A -> B, from z 0 to z 10, and the
  // cut point stays inside the footprint in y, so that vertex survives.
  const triangle: Triangle = { ax: -5, ay: -5, az: 0, bx: 20, by: -5, bz: 10, cx: -5, cy: 5, cz: 20 };

  const emitted = clip(triangle);
  const zs = emitted.flatMap((t) => [t.az, t.bz, t.cz]);

  assert.ok(
    zs.some((z) => Math.abs(z - 6) < 1e-9),
    `expected an interpolated vertex at z=6, saw ${JSON.stringify(zs)}`,
  );
  for (const z of zs) {
    assert.ok(z >= 0 && z <= 20, `z ${z} left the source triangle's z range`);
  }
});

test('a triangle entirely outside the footprint emits nothing', () => {
  const triangle: Triangle = { ax: 20, ay: 20, az: 0, bx: 30, by: 20, bz: 0, cx: 25, cy: 30, cz: 0 };

  assert.deepEqual(clip(triangle), []);
});

test('a triangle touching one edge only from outside emits nothing', () => {
  const triangle: Triangle = { ax: 10, ay: 20, az: 0, bx: 30, by: 20, bz: 0, cx: 20, cy: 30, cz: 0 };

  assert.deepEqual(clip(triangle), [], 'a zero-area touch must not produce fill');
});

test('each of the four sides clips independently', () => {
  // Each case is cut halfway along its two straddling edges, leaving a
  // trapezoid with parallel sides 10 and 20 over a height of 10: area 150.
  const cases: Array<[Triangle, number]> = [
    [{ ax: -20, ay: 0, az: 0, bx: 0, by: -10, bz: 0, cx: 0, cy: 10, cz: 0 }, 300], // left edge
    [{ ax: 20, ay: 0, az: 0, bx: 0, by: -10, bz: 0, cx: 0, cy: 10, cz: 0 }, 300], // right edge
    [{ ax: 0, ay: -20, az: 0, bx: -10, by: 0, bz: 0, cx: 10, cy: 0, cz: 0 }, 300], // bottom edge
    [{ ax: 0, ay: 20, az: 0, bx: -10, by: 0, bz: 0, cx: 10, cy: 0, cz: 0 }, 300], // top edge
  ];

  for (const [triangle, expectedDoubleArea] of cases) {
    const emitted = clip(triangle);
    assertWithinFootprint(emitted, FOOTPRINT);
    assert.equal(
      Math.abs(fanDoubleSignedArea(emitted)),
      expectedDoubleArea,
      `area after clipping ${JSON.stringify(triangle)}`,
    );
  }
});

test('the footprint is centred on the origin and follows the build volume', () => {
  assert.deepEqual(FOOTPRINT, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.deepEqual(
    resolveBuildVolumeFootprintMm({ buildVolumeMm: { width: 218, depth: 123 } } as never),
    { minX: -109, minY: -61.5, maxX: 109, maxY: 61.5 },
  );
});
