import assert from 'node:assert/strict';
import test from 'node:test';

import { DYNAMIC_PLATE_ORDERING } from '../plateCascade';
import {
  computePlateFrames,
  modelsOnPlate,
  plateLocalRect,
  plateSliceScope,
  resolveModelPlateId,
} from '../plateLayout';

// Saturn 2: the footprint the CLI's end-to-end check slices with.
const footprint = { widthMm: 218.88, depthMm: 123.12, originMode: 'center' as const };
const twoPlates = [{ id: 'p1' }, { id: 'p2' }];
const frames = computePlateFrames({ plates: twoPlates, footprint, ordering: DYNAMIC_PLATE_ORDERING });

const at = (id: string, x: number, y: number, plateId?: string) => ({
  id,
  transform: { position: { x, y } },
  ...(plateId ? { plateId } : {}),
});

test('a plate starts centred on its origin, or at it for a front-left origin', () => {
  assert.deepEqual(plateLocalRect({ widthMm: 200, depthMm: 100, originMode: 'center' }), {
    minX: -100, minY: -50, maxX: 100, maxY: 50, centerX: 0, centerY: 0,
  });
  assert.deepEqual(plateLocalRect({ widthMm: 200, depthMm: 100, originMode: 'front_left' }), {
    minX: 0, minY: 0, maxX: 200, maxY: 100, centerX: 100, centerY: 50,
  });
});

test('plates are pitched by their footprint plus the cascade gap', () => {
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], { id: 'p1', index: 0, dxMm: 0, dyMm: 0, minX: -109.44, minY: -61.56, maxX: 109.44, maxY: 61.56 });
  assert.equal(frames[1].dxMm, 242.88);
  assert.equal(frames[1].dyMm, 0);
  assert.equal(frames[1].minX, -109.44 + 242.88);
  assert.equal(frames[1].maxX, 109.44 + 242.88);
});

test('a model belongs to the plate it stands on, whatever it was stored with', () => {
  assert.equal(resolveModelPlateId(at('a', 0, 0), frames), 'p1');
  assert.equal(resolveModelPlateId(at('b', 242.88, 0), frames), 'p2');
  // Dragged back onto the first bed: the stale membership loses.
  assert.equal(resolveModelPlateId(at('c', 10, 10, 'p2'), frames), 'p1');
});

test('off every plate, the stored membership decides, then the first plate', () => {
  assert.equal(resolveModelPlateId(at('a', 1000, 1000, 'p2'), frames), 'p2');
  assert.equal(resolveModelPlateId(at('b', 1000, 1000, 'gone'), frames), 'p1');
  assert.equal(resolveModelPlateId(at('c', 1000, 1000), frames), 'p1');
  assert.equal(resolveModelPlateId(at('d', 0, 0), []), '');
});

test('models on a plate keep their order', () => {
  const models = [at('a', 0, 0), at('b', 242.88, 0), at('c', -50, 20), at('d', 300, 0)];
  assert.deepEqual(modelsOnPlate(models, 'p1', frames).map((m) => m.id), ['a', 'c']);
  assert.deepEqual(modelsOnPlate(models, 'p2', frames).map((m) => m.id), ['b', 'd']);
});

test('a slice scope carries the plate\'s models, volume and offset', () => {
  const models = [at('a', 0, 0), at('b', 242.88, 0)];
  assert.deepEqual(plateSliceScope(frames[1], models, frames), {
    plateId: 'p2',
    modelIds: ['b'],
    volumeBoundsMm: { minX: frames[1].minX, minY: frames[1].minY, maxX: frames[1].maxX, maxY: frames[1].maxY },
    offsetMm: { dxMm: 242.88, dyMm: 0 },
  });
});
