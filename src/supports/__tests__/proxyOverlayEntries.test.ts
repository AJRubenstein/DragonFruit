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
    selectionOpacity: 1,
    hoverOpacity: 0.35,
    ...overrides,
  };
}

describe('proxy overlay entries', () => {
  it('draws a selected model in the active colour at full opacity', () => {
    const entries = computeProxyOverlayEntries(input({ selectedModelIds: new Set(['model-a']) }));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].modelId, 'model-a');
    assert.equal(entries[0].key, 'selection:model-a');
    assert.equal(entries[0].opacity, 1);
    assert.equal(entries[0].color, entries[0].emissive);
    // A selected support is the active colour flat; only the hover tint glows.
    assert.equal(entries[0].emissiveIntensity, 0);
  });

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
    assert.equal(candidate?.opacity, 0.35 * MARQUEE_CANDIDATE_TINT_FACTOR);
  });

  it('draws a selected model once, even while it is hovered', () => {
    const entries = computeProxyOverlayEntries(input({
      selectedModelIds: new Set(['model-a']),
      hoverModelId: 'model-a',
      marqueeCandidateModelIds: ['model-a'],
    }));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'selection:model-a');
    assert.equal(entries[0].opacity, 1);
  });

  it('skips a model with no proxy geometry, and one that is not visible', () => {
    const entries = computeProxyOverlayEntries(input({
      selectedModelIds: new Set(['model-a', 'model-c']),
      hoverModelId: 'model-b',
      isModelVisible: (modelId) => modelId !== 'model-b',
    }));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].modelId, 'model-a');
  });

  it('carries the drop offset of the model it draws', () => {
    const entries = computeProxyOverlayEntries(input({
      selectedModelIds: new Set(['model-a']),
      zOffsetByModelId: { 'model-a': 4 },
    }));

    assert.equal(entries[0].zOffset, 4);
  });
});
