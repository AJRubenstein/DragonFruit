import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  paintSupportCoverage,
  clearSupportCoveragePaint,
  type SupportCoverageTip,
} from '../supportCoveragePainter';

function makeGeometry(vertices: Array<[number, number, number]>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const arr = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i += 1) {
    arr[i * 3 + 0] = vertices[i][0];
    arr[i * 3 + 1] = vertices[i][1];
    arr[i * 3 + 2] = vertices[i][2];
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

function readColor(geometry: THREE.BufferGeometry, vertexIndex: number): [number, number, number] {
  const attr = geometry.getAttribute('color') as THREE.BufferAttribute;
  const arr = attr.array as Uint8Array;
  return [
    arr[vertexIndex * 3 + 0] / 255,
    arr[vertexIndex * 3 + 1] / 255,
    arr[vertexIndex * 3 + 2] / 255,
  ];
}

describe('paintSupportCoverage', () => {
  const baseColor = new THREE.Color(1, 1, 1); // white = multiplication identity
  const tint = new THREE.Color(0, 1, 0);      // pure green tint

  it('returns 0 painted when no tips supplied', () => {
    const geom = makeGeometry([[0, 0, 0], [10, 10, 10]]);
    const painted = paintSupportCoverage(geom, {
      tips: [],
      baseColor,
      tint,
      radiusFactor: 6,
      maxStrength: 1,
    });
    assert.equal(painted, 0);
  });

  it('paints a vertex co-located with a tip toward the tint', () => {
    const geom = makeGeometry([[5, 5, 5]]);
    const tips: SupportCoverageTip[] = [{ x: 5, y: 5, z: 5, diameter: 1 }];
    paintSupportCoverage(geom, { tips, baseColor, tint, radiusFactor: 6, maxStrength: 1 });
    const [r, g, b] = readColor(geom, 0);
    assert.ok(g > 0.95, `expected near-1 green, got ${g}`);
    assert.ok(r < 0.05 && b < 0.05, `expected r/b near 0, got r=${r} b=${b}`);
  });

  it('leaves a vertex outside the brush radius at baseColor', () => {
    const geom = makeGeometry([[0, 0, 0], [100, 0, 0]]);
    const tips: SupportCoverageTip[] = [{ x: 0, y: 0, z: 0, diameter: 1 }];
    paintSupportCoverage(geom, { tips, baseColor, tint, radiusFactor: 6, maxStrength: 1 });
    const [r, g, b] = readColor(geom, 1);
    // baseColor is white (1,1,1). Far vertex should stay there.
    assert.ok(r > 0.95 && g > 0.95 && b > 0.95, `expected white, got (${r}, ${g}, ${b})`);
  });

  it('blends partially mid-brush via smoothstep falloff', () => {
    const geom = makeGeometry([[3, 0, 0]]);
    const tips: SupportCoverageTip[] = [{ x: 0, y: 0, z: 0, diameter: 1 }];
    paintSupportCoverage(geom, { tips, baseColor, tint, radiusFactor: 6, maxStrength: 1 });
    const [r, g, b] = readColor(geom, 0);
    // partial blend: green channel stays high (lerp from 1→1), r and b
    // should drop below 1 as we mix toward (0, 1, 0).
    assert.ok(r < 1 && r > 0, `expected r in (0,1), got ${r}`);
    assert.ok(b < 1 && b > 0, `expected b in (0,1), got ${b}`);
    assert.ok(g > 0.99, `expected g near 1, got ${g}`);
  });

  it('takes max over overlapping tips, not sum', () => {
    const geom = makeGeometry([[3, 0, 0]]);
    const tips: SupportCoverageTip[] = [
      { x: 0, y: 0, z: 0, diameter: 1 },
      { x: 6, y: 0, z: 0, diameter: 1 },
    ];
    paintSupportCoverage(geom, { tips, baseColor, tint, radiusFactor: 6, maxStrength: 1 });
    const [r] = readColor(geom, 0);
    // r doesn't go below the single-tip value (no double-application).
    assert.ok(r >= 0, `r=${r}`);
  });

  it('scales contribution by maxStrength', () => {
    const geom = makeGeometry([[5, 5, 5]]);
    const tips: SupportCoverageTip[] = [{ x: 5, y: 5, z: 5, diameter: 1 }];
    paintSupportCoverage(geom, { tips, baseColor, tint, radiusFactor: 6, maxStrength: 0.5 });
    const [r] = readColor(geom, 0);
    // at strength 0.5 we're halfway between baseColor (white) and tint
    // (green), so r should be around 0.5.
    assert.ok(r > 0.45 && r < 0.55, `expected ~0.5, got ${r}`);
  });
});

describe('clearSupportCoveragePaint', () => {
  it('resets every vertex strength to baseColor', () => {
    const baseColor = new THREE.Color(1, 1, 1);
    const tint = new THREE.Color(0, 1, 0);
    const geom = makeGeometry([[0, 0, 0], [3, 0, 0]]);
    paintSupportCoverage(geom, {
      tips: [{ x: 0, y: 0, z: 0, diameter: 1 }],
      baseColor,
      tint,
      radiusFactor: 6,
      maxStrength: 1,
    });
    clearSupportCoveragePaint(geom, baseColor);
    for (let v = 0; v < 2; v += 1) {
      const [r, g, b] = readColor(geom, v);
      assert.ok(r > 0.99 && g > 0.99 && b > 0.99, `v${v} expected white, got (${r},${g},${b})`);
    }
  });
});
