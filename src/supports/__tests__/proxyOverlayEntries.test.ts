import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeProxyOverlayEntries,
  type ProxyModelGeometry,
} from '../SupportProxyMeshLayer';
import { MARQUEE_CANDIDATE_TINT_FACTOR } from '@/utils/marqueeCandidateTint';

const EMPTY_GEOMETRY: ProxyModelGeometry = { shafts: [], roots: [], joints: [], cones: [] };

function geometryByModel(...modelIds: string[]) {
  return new Map(modelIds.map((modelId) => [modelId, EMPTY_GEOMETRY]));
}

function input(overrides: Partial<Parameters<typeof computeProxyOverlayEntries>[0]> = {}) {
  return {
    selectedModelIds: new Set<string>(),
    hoverModelId: null,
    marqueeCandidateModelIds: [],
    geometryByModel: geometryByModel('model-a', 'model-b'),
    isModelVisible: () => true,
    hoverOpacity: 0.35,
    ...overrides,
  };
}

describe('proxy overlay entries', () => {
  it('tints a hovered model, and a marquee candidate lighter still', () => {
    const entries = computeProxyOverlayEntries(input({
      hoverModelId: 'model-a',
      marqueeCandidateModelIds: ['model-b'],
    }));

    assert.equal(entries.length, 2);
    const hovered = entries.find((entry) => entry.modelId === 'model-a');
    const candidate = entries.find((entry) => entry.modelId === 'model-b');
    assert.equal(hovered?.key, 'hover:model-a');
    assert.equal(hovered?.opacity, 0.35);
    assert.equal(hovered?.color, hovered?.emissive);
    assert.ok((hovered?.emissiveIntensity ?? 0) > 0, 'the hover tint glows');
    assert.equal(candidate?.opacity, 0.35 * MARQUEE_CANDIDATE_TINT_FACTOR);
  });

  it('draws a model once when it is hovered and taken by the marquee', () => {
    const entries = computeProxyOverlayEntries(input({
      hoverModelId: 'model-a',
      marqueeCandidateModelIds: ['model-a'],
    }));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'hover:model-a');
    assert.equal(entries[0].opacity, 0.35, 'the hover wins over the lighter candidate tint');
  });

  it('does not tint a selected model, which already carries the active colour', () => {
    const entries = computeProxyOverlayEntries(input({
      selectedModelIds: new Set(['model-a']),
      hoverModelId: 'model-a',
      marqueeCandidateModelIds: ['model-a'],
    }));

    assert.equal(entries.length, 0, 'a selected model is not lightened by its own hover');
  });

  it('skips a model with no proxy geometry, and one that is not visible', () => {
    const entries = computeProxyOverlayEntries(input({
      hoverModelId: 'model-b',
      marqueeCandidateModelIds: ['model-c'],
      isModelVisible: (modelId) => modelId !== 'model-b',
    }));

    assert.equal(entries.length, 0, 'model-b is hidden and model-c has no geometry');
  });

  it('carries the drop offset of the model it draws', () => {
    const entries = computeProxyOverlayEntries(input({
      hoverModelId: 'model-a',
      zOffsetByModelId: { 'model-a': 4 },
    }));

    assert.equal(entries[0].zOffset, 4);
  });
});
