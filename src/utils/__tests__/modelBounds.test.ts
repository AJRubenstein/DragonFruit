import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { isBoundsDisjointFromVolume, isBoundsOutsideVolume } from '../modelBounds';

const VOLUME = new THREE.Box3(
  new THREE.Vector3(-10, -10, 0),
  new THREE.Vector3(10, 10, 20),
);
const EPS = 0.01;

function box(min: [number, number, number], max: [number, number, number]): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
}

test('a model fully inside the volume is neither outside nor disjoint', () => {
  const bounds = box([-5, -5, 1], [5, 5, 10]);

  assert.equal(isBoundsOutsideVolume(bounds, VOLUME, EPS), false);
  assert.equal(isBoundsDisjointFromVolume(bounds, VOLUME, EPS), false);
});

test('a model that only straddles an edge is outside but not disjoint', () => {
  const bounds = box([8, -2, 0], [16, 2, 5]);

  assert.equal(isBoundsOutsideVolume(bounds, VOLUME, EPS), true, 'containment test rejects it');
  assert.equal(
    isBoundsDisjointFromVolume(bounds, VOLUME, EPS),
    false,
    'the overlapping part is still printable, so slicing must keep the model',
  );
});

test('a model clear of the volume on any axis is disjoint', () => {
  const beyondX = box([12, -2, 0], [20, 2, 5]);
  const beyondY = box([-2, 11, 0], [2, 20, 5]);
  const aboveZ = box([-2, -2, 25], [2, 2, 40]);

  assert.equal(isBoundsDisjointFromVolume(beyondX, VOLUME, EPS), true);
  assert.equal(isBoundsDisjointFromVolume(beyondY, VOLUME, EPS), true);
  assert.equal(isBoundsDisjointFromVolume(aboveZ, VOLUME, EPS), true);
});

test('touching the boundary counts as overlapping', () => {
  const touching = box([10, -2, 0], [20, 2, 5]);

  assert.equal(
    isBoundsDisjointFromVolume(touching, VOLUME, EPS),
    false,
    'a shared face is not a gap; the model is not dismissed on it',
  );
});

test('a gap smaller than the tolerance counts as overlapping', () => {
  const hairlineGap = box([10.005, -2, 0], [20, 2, 5]);

  assert.equal(isBoundsDisjointFromVolume(hairlineGap, VOLUME, EPS), false);
  assert.equal(
    isBoundsDisjointFromVolume(hairlineGap, VOLUME, 0.001),
    true,
    'a tighter tolerance resolves the same gap as disjoint',
  );
});

test('an off-origin volume is handled on each axis independently', () => {
  const leftAligned = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 20, 20));

  assert.equal(isBoundsDisjointFromVolume(box([-5, 5, 5], [-1, 10, 10]), leftAligned, EPS), true);
  assert.equal(isBoundsDisjointFromVolume(box([-1, 5, 5], [5, 10, 10]), leftAligned, EPS), false);
});
