import assert from 'node:assert/strict';
import test from 'node:test';

import { resetStore, setSnapshot, getSnapshot, setSelectedId, resetKickstandsInState} from '../state';
import { setKickstandSnapshot } from '../SupportTypes/Kickstand/kickstandStore';
import {
  resolveSupportCategoryFromSnapshot,
  resolveSupportOwnerFromSegmentId,
  resolveSupportOwnerFromJointId,
} from '@/features/supports/useSupportInteractionManager';
import type { KickstandState } from '../SupportTypes/Kickstand/types';

function makeKickstandState(): KickstandState {
  return {
    kickstands: {
      'kickstand-1': {
        id: 'kickstand-1',
        modelId: 'model-1',
        rootId: 'kickstand-root',
        hostKnotId: 'kickstand-host-knot',
        hostSegmentId: 'trunk-seg-1',
        hostMinT: 0,
        segments: [
          {
            id: 'kickstand-seg-1',
            diameter: 0.8,
            bottomJoint: { id: 'kickstand-j0', pos: { x: 6, y: 0, z: 1.2 }, diameter: 0.9 },
            topJoint: { id: 'kickstand-j1', pos: { x: 6, y: 0, z: 4.8 }, diameter: 0.9 },
          },
        ],
        profile: { bodyDiameterMm: 0.8, terminalStartDiameterMm: 0.8, terminalEndDiameterMm: 1.2 },
      },
    },
    roots: {
      'kickstand-root': {
        id: 'kickstand-root',
        modelId: 'model-1',
        transform: { pos: { x: 6, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 2,
        diskHeight: 0.4,
        coneHeight: 0.7,
      },
    },
    knots: {
      'kickstand-host-knot': {
        id: 'kickstand-host-knot',
        parentShaftId: 'trunk-seg-1',
        t: 0.75,
        pos: { x: 0, y: 0, z: 9 },
        diameter: 1.3,
      },
    },
    selectedId: null,
  };
}

function seed() {
  resetStore();
  resetKickstandsInState();
  setSnapshot({ ...getSnapshot() });
  setKickstandSnapshot(makeKickstandState());
}

test('a kickstand id resolves to the kickstand category, not brace', () => {
  seed();
  assert.equal(resolveSupportCategoryFromSnapshot('kickstand-1'), 'kickstand');
});

test('a kickstand segment resolves to its kickstand owner', () => {
  seed();
  assert.deepEqual(resolveSupportOwnerFromSegmentId('kickstand-seg-1'), {
    category: 'kickstand',
    id: 'kickstand-1',
  });
});

test('a kickstand joint resolves to its kickstand owner', () => {
  seed();
  assert.deepEqual(resolveSupportOwnerFromJointId('kickstand-j1'), {
    category: 'kickstand',
    id: 'kickstand-1',
  });
});

test('an unknown id resolves to nothing', () => {
  seed();
  assert.equal(resolveSupportCategoryFromSnapshot('nope'), null);
  assert.equal(resolveSupportOwnerFromSegmentId('nope'), null);
  assert.equal(resolveSupportOwnerFromJointId('nope'), null);
});

test('selecting a kickstand sets the kickstand category, not brace', () => {
  seed();
  setSelectedId('kickstand-1');
  assert.equal(getSnapshot().selectedCategory, 'kickstand');
});

test('selecting a support type sets its own category', () => {
  seed();
  setSnapshot({
    ...getSnapshot(),
    anchors: {
      'anchor-1': {
        id: 'anchor-1',
        modelId: 'model-1',
        rootPos: { x: 0, y: 0, z: 0 },
        rootBaseDiameter: 2,
      },
    } as never,
  });
  setSelectedId('anchor-1');
  assert.equal(getSnapshot().selectedCategory, 'anchor');
});

test('selecting nothing clears the category', () => {
  seed();
  setSelectedId(null);
  assert.equal(getSnapshot().selectedCategory, null);
});
