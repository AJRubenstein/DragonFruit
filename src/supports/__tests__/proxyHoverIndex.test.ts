import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  buildProxyHoverIndex,
  raycastProxyHoverIndex,
  type ProxyHoverTarget,
} from '../proxyHoverIndex';

function shaft(id: string, x: number, y: number, modelId: string, radius = 0.5): ProxyHoverTarget {
  return {
    modelId,
    index: Number(id),
    start: { x, y, z: 0 },
    end: { x, y, z: 15 },
    radius,
  };
}

function rayAt(x: number, y: number, from: [number, number, number] = [x, y, 80]): THREE.Ray {
  return new THREE.Ray(new THREE.Vector3(...from), new THREE.Vector3(0, 0, -1).normalize());
}

const noTolerance = () => 0;
const tolerant = () => 1;

describe('proxy hover index', () => {
  it('is null without targets', () => {
    assert.strictEqual(buildProxyHoverIndex([]), null);
  });

  it('hits the support the ray points at, and only that one', () => {
    const index = buildProxyHoverIndex([shaft('0', 0, 0, 'model-a'), shaft('1', 20, 0, 'model-b')])!;

    const hits = raycastProxyHoverIndex(index, rayAt(0, 0), noTolerance);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].target.modelId, 'model-a');
    assert.strictEqual(hits[0].target.index, 0);
  });

  it('misses a support the ray passes beside, and hits it inside the grab tolerance', () => {
    const index = buildProxyHoverIndex([shaft('0', 0, 0, 'model-a', 0.5)])!;

    // 3 mm off a 0.5 mm shaft, with no tolerance: a miss. Within 1 mm: a hit.
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(3, 0), noTolerance).length, 0);
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(3, 0), tolerant).length, 0);
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(1, 0), noTolerance).length, 0);
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(1, 0), tolerant).length, 1);
  });

  it('orders hits by distance, so the nearest support wins', () => {
    const index = buildProxyHoverIndex([
      shaft('0', 0, 0, 'far'),
      shaft('1', 0, 0, 'near'),
    ])!;
    // The same place twice: both are candidates, and the caller takes the first.
    const hits = raycastProxyHoverIndex(index, rayAt(0, 0), noTolerance);
    assert.strictEqual(hits.length, 2);
    assert.ok(hits[0].distance <= hits[1].distance);
  });

  it('finds a support whose shaft crosses several cells', () => {
    const slanted: ProxyHoverTarget = {
      modelId: 'model-a',
      index: 0,
      start: { x: -30, y: -30, z: 0 },
      end: { x: 30, y: 30, z: 15 },
      radius: 0.5,
    };
    const index = buildProxyHoverIndex([slanted])!;

    // Pointing down onto a spot only the segment's middle passes through.
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(0, 0), noTolerance).length, 1);
    // And onto a spot well off it.
    assert.strictEqual(raycastProxyHoverIndex(index, rayAt(20, -20), tolerant).length, 0);
  });

  it('misses when the ray points away from the plate', () => {
    const index = buildProxyHoverIndex([shaft('0', 0, 0, 'model-a')])!;
    const away = new THREE.Ray(new THREE.Vector3(0, 0, 80), new THREE.Vector3(0, 0, 1).normalize());
    assert.strictEqual(raycastProxyHoverIndex(index, away, tolerant).length, 0);
  });

  it('reports a support once, however many cells it touches', () => {
    const long: ProxyHoverTarget = {
      modelId: 'model-a',
      index: 0,
      start: { x: -40, y: 0, z: 0 },
      end: { x: 40, y: 0, z: 15 },
      radius: 0.5,
    };
    const index = buildProxyHoverIndex([long])!;
    const across = new THREE.Ray(new THREE.Vector3(-60, 0, 7), new THREE.Vector3(1, 0, 0).normalize());
    const hits = raycastProxyHoverIndex(index, across, noTolerance);
    assert.strictEqual(hits.length, 1);
  });
});
