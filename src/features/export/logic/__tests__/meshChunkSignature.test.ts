import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ExportManager } from '../ExportManager';
import type { LoadedModel } from '@/features/scene/useSceneCollectionManager';

/**
 * The chunk store keys each model's mesh bytes on `computeModelGeometrySignature`,
 * and the VOXL writer stamps the model's classification beside those bytes. The two
 * have to describe the same triangle order, and the signature is the only thing that
 * can notice when they do not: a classify pass replaces the position attribute with a
 * reordered soup of exactly the same length, on the same `BufferGeometry`.
 */

function modelWith(geometry: THREE.BufferGeometry): LoadedModel {
  // The signature reads nothing but the geometry, so the rest of the model is not
  // part of this test.
  return { geometry: { geometry } } as unknown as LoadedModel;
}

const quadSoup = (): Float32Array => new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 0, 1, 1,
]);

test('a replaced position array is a different signature, at the same corner count', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(quadSoup(), 3));
  const before = ExportManager.computeModelGeometrySignature(modelWith(geometry));
  assert.equal(ExportManager.computeModelGeometrySignature(modelWith(geometry)), before);

  // What `applyRepairedPositions` does when the classifier reorders the soup: a new
  // attribute, the same number of corners, version 0.
  const reordered = quadSoup();
  reordered.set(reordered.subarray(0, 9), 9);
  reordered.set(reordered.subarray(9, 18), 0);
  geometry.setAttribute('position', new THREE.BufferAttribute(reordered, 3));

  assert.notEqual(
    ExportManager.computeModelGeometrySignature(modelWith(geometry)),
    before,
    'bytes baked before the classifier ran must not be offered as this geometry\'s',
  );
});

test('an in-place edit keeps its own signature change', () => {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(quadSoup(), 3);
  geometry.setAttribute('position', position);
  const before = ExportManager.computeModelGeometrySignature(modelWith(geometry));

  position.needsUpdate = true;
  assert.notEqual(ExportManager.computeModelGeometrySignature(modelWith(geometry)), before);
});
