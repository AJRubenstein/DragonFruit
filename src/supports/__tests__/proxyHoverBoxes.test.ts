import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getSnapshot, resetStore, setSnapshot } from '../state';
import {
  collectProxyPrimitives,
  computeProxyHoverBoxes,
  computeProxyModelBounds,
  type ProxyModelGeometry,
} from '../SupportProxyMeshLayer';
import type { Knot, Roots, SupportState, Trunk } from '../types';

const MODEL_IDS = ['model-a', 'model-b'] as const;

function buildState(): SupportState {
  const roots: Record<string, Roots> = {};
  const knots: Record<string, Knot> = {};
  const trunks: Record<string, Trunk> = {};

  MODEL_IDS.forEach((modelId, modelIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const id = `${modelId}-trunk-${i}`;
      const segmentId = `${id}-s`;
      const x = modelIndex * 40 + i * 4;
      const y = modelIndex * 25;

      roots[`${id}-root`] = {
        id: `${id}-root`,
        modelId,
        transform: { pos: { x, y, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3,
        diskHeight: 0.8,
        coneHeight: 1.2,
      };

      trunks[id] = {
        id,
        modelId,
        rootId: `${id}-root`,
        segments: [{
          id: segmentId,
          type: 'straight',
          diameter: 1,
          bottomJoint: { id: `${segmentId}-b`, pos: { x, y, z: 1 }, diameter: 1.1 },
          topJoint: { id: `${segmentId}-t`, pos: { x, y, z: 9 }, diameter: 1.1 },
        }],
        contactCone: {
          id: `${id}-cone`,
          pos: { x, y, z: 12 },
          normal: { x: 0, y: 0, z: 1 },
          surfaceNormal: { x: 0, y: 0, z: 1 },
          socketJointId: `${segmentId}-t`,
          profile: { contactDiameterMm: 0.4, bodyDiameterMm: 0.8, lengthMm: 3, penetrationMm: 0.05 },
        },
      };

      knots[`${id}-knot`] = {
        id: `${id}-knot`,
        parentShaftId: segmentId,
        t: 0.5,
        pos: { x, y, z: 5 },
        diameter: 1.1,
      };
    }
  });

  return { roots, knots, trunks } as unknown as SupportState;
}

type Vec = { x: number; y: number; z: number };

function boxContains(box: { position: [number, number, number]; size: [number, number, number] }, point: Vec) {
  return Math.abs(point.x - box.position[0]) <= box.size[0] / 2 + 1e-6
    && Math.abs(point.y - box.position[1]) <= box.size[1] / 2 + 1e-6
    && Math.abs(point.z - box.position[2]) <= box.size[2] / 2 + 1e-6;
}

function geometryPoints(geometry: ProxyModelGeometry): Vec[] {
  const points: Vec[] = [];
  for (const shaft of geometry.shafts) {
    points.push(shaft.start, shaft.end);
    if (shaft.controlPoint1) points.push(shaft.controlPoint1);
    if (shaft.controlPoint2) points.push(shaft.controlPoint2);
  }
  for (const root of geometry.roots) points.push(root.basePos);
  for (const joint of geometry.joints) points.push(joint.pos);
  for (const cone of geometry.cones) points.push(cone.pos);
  return points;
}

describe('proxy hover boxes', () => {
  beforeEach(() => {
    resetStore();
  });

  it('holds every primitive its model draws', () => {
    setSnapshot(buildState());

    const byModel = collectProxyPrimitives(getSnapshot(), {
      includeDetailedPrimitives: true,
      interiorSupportIdSet: null,
    });
    const bounds = computeProxyModelBounds(byModel);
    const boxes = computeProxyHoverBoxes([...byModel.entries()].map(([modelKey, geometry]) => ({
      modelKey,
      modelId: geometry.modelId,
      zOffset: 0,
    })), bounds);

    assert.equal(boxes.length, MODEL_IDS.length, 'one box per model with supports');

    for (const [modelKey, geometry] of byModel.entries()) {
      const box = boxes.find((candidate) => candidate.modelKey === modelKey);
      assert.ok(box, `${modelKey}: no hover box`);
      const points = geometryPoints(geometry);
      assert.ok(points.length > 0, `${modelKey}: no primitives to cover`);
      for (const point of points) {
        assert.ok(boxContains(box, point), `${modelKey}: ${JSON.stringify(point)} outside its hover box`);
      }
    }
  });

  it('shifts the box with the model drop offset', () => {
    setSnapshot(buildState());
    const byModel = collectProxyPrimitives(getSnapshot(), {
      includeDetailedPrimitives: true,
      interiorSupportIdSet: null,
    });
    const bounds = computeProxyModelBounds(byModel);
    const [entry] = [...byModel.entries()].map(([modelKey, geometry]) => ({
      modelKey,
      modelId: geometry.modelId,
      zOffset: 0,
    }));
    const dropped = computeProxyHoverBoxes([{ ...entry, zOffset: 7 }], bounds)[0];
    const flat = computeProxyHoverBoxes([entry], bounds)[0];

    assert.equal(dropped.position[2] - flat.position[2], 7);
    assert.deepEqual(dropped.size, flat.size);
  });
});
