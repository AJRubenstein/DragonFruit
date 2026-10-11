import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import test from 'node:test';
import { useEffect, useRef } from 'react';
import { useHollowingManager, type HollowingManagerDeps } from '@/features/hollowing/useHollowingManager';
import { useSceneCollectionManager } from '@/features/scene/useSceneCollectionManager';
import { useTransformManager } from '@/features/transform/useTransformManager';
import { clearHistory, getUndoCount, redo, undo } from '@/history/historyStore';
import { renderWithProviders, settle } from '@/utils/__tests__/helpers/renderDom';

type Scene = ReturnType<typeof useSceneCollectionManager>;
type Hollowing = ReturnType<typeof useHollowingManager>;

const CUBE_STL = `solid cube
${[
  [[0, 0, 0], [10, 0, 0], [10, 10, 0]], [[0, 0, 0], [10, 10, 0], [0, 10, 0]],
  [[0, 0, 10], [10, 10, 10], [10, 0, 10]], [[0, 0, 10], [0, 10, 10], [10, 10, 10]],
  [[0, 0, 0], [10, 0, 10], [10, 0, 0]], [[0, 0, 0], [0, 0, 10], [10, 0, 10]],
  [[0, 10, 0], [10, 10, 0], [10, 10, 10]], [[0, 10, 0], [10, 10, 10], [0, 10, 10]],
  [[0, 0, 0], [0, 10, 0], [0, 10, 10]], [[0, 0, 0], [0, 10, 10], [0, 0, 10]],
  [[10, 0, 0], [10, 10, 10], [10, 10, 0]], [[10, 0, 0], [10, 0, 10], [10, 10, 10]],
].map((tri) => `facet normal 0 0 0
outer loop
${tri.map((v) => `vertex ${v.join(' ')}`).join('\n')}
endloop
endfacet`).join('\n')}
endsolid cube
`;

// The importer reads the dropped file back through a `blob:` URL, which happy-dom's fetch
// refuses; the URL is Node's, so Node can resolve it.
const domFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const blob = url.startsWith('blob:') ? resolveObjectURL(url) : undefined;
  return blob ? new Response(await blob.arrayBuffer()) : domFetch(input, init);
}) as typeof fetch;

type Mounted = { scene: Scene; hollowing: Hollowing };

function Probe({ onRender }: { onRender: (mounted: Mounted) => void }) {
  const scene = useSceneCollectionManager();
  const transformMgr = useTransformManager({ geom: scene.geom });
  const noop = () => {};
  const deps = useRef<HollowingManagerDeps>({
    showOperationError: (message) => assert.fail(message),
    setShowDamagedModelDialog: noop,
    beginFinalizing: noop,
    clearFinalizing: noop,
    nextPaint: () => Promise.resolve(),
    persistActiveModelModifiers: noop,
    setPendingModifierResetAction: noop,
    setInteriorView: noop,
    computeAutoHolePunchDepthMmForGeometry: () => 3,
    setHolePunchState: noop,
    setHolePunchPlacements: noop,
    holePunchPlacementsRef: { current: [] },
    setPendingHolePunchAutoApplyModelId: noop,
    setPendingBlockerResetState: noop,
    setSelectedHolePunchPlacementIds: noop,
    setHoveredHolePunchPlacementId: noop,
    setHolePunchHoverPlacement: noop,
    interiorView: false,
  });
  const hollowing = useHollowingManager({ scene, transformMgr, deps });

  useEffect(() => {
    deps.current.persistActiveModelModifiers = (next, options) => {
      if (scene.activeModelId) scene.setModelMeshModifiers(scene.activeModelId, next, options);
    };
    onRender({ scene, hollowing });
  });
  return null;
}

async function waitFor(condition: () => boolean, label: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) assert.fail(`timed out waiting for ${label}`);
    await settle(20);
  }
}

test('hollowing edits land in undo history', async (t) => {
  let mounted: Mounted | null = null;
  const tree = await renderWithProviders(<Probe onRender={(next) => { mounted = next; }} />);
  const current = () => {
    assert.ok(mounted, 'hooks mounted');
    return mounted;
  };
  try {
    await current().scene.loadFiles([new File([CUBE_STL], 'cube.stl', { type: 'model/stl' })]);
    await waitFor(() => current().scene.models.length === 1, 'the cube to load');
    const modelId = current().scene.models[0].id;
    current().scene.setActiveModelId(modelId);
    await settle(50);
    const hollowingModifier = () => current().scene.getModelMeshModifiers(modelId)?.hollowing;

    await t.test('a run of settings edits is one step', async () => {
      clearHistory();
      for (const shellThicknessMm of [2.2, 2.4, 2.6]) {
        current().hollowing.handleHollowingStateChange({ ...current().hollowing.hollowingState, shellThicknessMm });
        await settle(20);
      }
      assert.equal(hollowingModifier()?.shellThicknessMm, 2.6);
      assert.equal(getUndoCount(), 1);
      undo();
      await settle(20);
      assert.equal(hollowingModifier(), undefined, 'undo returns to no hollowing draft');
      redo();
      await settle(20);
      assert.equal(hollowingModifier()?.shellThicknessMm, 2.6);
    });
  } finally {
    await tree.unmount();
  }
});
