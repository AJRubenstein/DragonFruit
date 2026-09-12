import assert from 'node:assert/strict';
import test from 'node:test';

import { bracePlacementStore } from '../SupportTypes/Brace/bracePlacementState';
import { branchPlacementStore } from '../SupportTypes/Branch/branchPlacementState';
import { leafPlacementStore } from '../SupportTypes/Leaf/leafPlacementState';
import { kickstandPlacementStore } from '../SupportTypes/Kickstand/kickstandPlacementState';

/**
 * What each placement store's mode key does to the rest of its state.
 *
 * All four now share the store primitive, and the temptation on seeing four
 * `setAltActive`-shaped methods is to unify them. They are NOT unifiable: the
 * three below genuinely differ, and the difference is load-bearing. These pin
 * the observable outcome of each so a tidy-up has to argue with a test.
 *
 * The shared primitive covers subscribe/getSnapshot/reset-preserving. The
 * per-type flow lives in the setters, where it belongs.
 */

const hover = { x: 1, y: 2, z: 3 };

test('releasing the branch Alt key clears the whole flow', () => {
    const store = branchPlacementStore;
    store.reset();
    store.setAltActive(true);
    store.setTip(hover, hover, 'model-a');
    store.setHoverPosition(hover);
    assert.equal(store.getSnapshot().stage, 'awaitingBase', 'a tip starts the flow');

    store.setAltActive(false);
    const state = store.getSnapshot();
    assert.equal(state.stage, 'idle', 'the flow is cancelled');
    assert.equal(state.tipPosition, null, 'and the tip goes with it');
    assert.equal(state.hoverPosition, null, 'and the hover point');
});

test('pressing the branch Alt key also starts from nothing', () => {
    // Stale state must not survive into the next attempt, which is why this
    // resets on press as well as release.
    const store = branchPlacementStore;
    store.reset();
    store.setAltActive(true);
    store.setTip(hover, hover, 'model-a');

    store.setAltActive(false);
    store.setAltActive(true);
    assert.equal(store.getSnapshot().stage, 'idle', 'pressing again starts clean');
});

test('the brace Alt key leaves the first endpoint alone', () => {
    // Opposite of branch on purpose: a brace is two clicks, and Alt is held
    // across both, so the first endpoint has to survive the key.
    const store = bracePlacementStore;
    store.reset();
    store.setAltActive(false);
    store.setStart({ kind: 'shaft', snappedPos: hover, segmentId: 'seg-1', t: 0.5 });

    store.setAltActive(true);
    const state = store.getSnapshot();
    assert.equal(state.stage, 'awaitingEnd', 'the brace is still mid-placement');
    assert.ok(state.start, 'the first endpoint survived');
});

test('the leaf hotkey release clears the flow but keeps the flag semantics', () => {
    const store = leafPlacementStore;
    store.reset();
    store.setHotkeyActive(true);
    store.setTip(hover, hover, 'model-a');

    store.setHotkeyActive(false);
    const state = store.getSnapshot();
    assert.equal(state.stage, 'idle');
    assert.equal(state.tipPosition, null);
});

test('an idle leaf store is left alone by a hotkey release', () => {
    // Leaf is the only one with this guard, and it fires from a hotkey handler
    // that runs on every key event.
    const store = leafPlacementStore;
    store.reset();
    store.setHotkeyActive(false);
    assert.equal(store.getSnapshot().stage, 'idle');
});

test('the kickstand hotkey keeps an existing preview on press', () => {
    // Third distinct behaviour: kickstand's press preserves whatever it was
    // previewing, where branch and leaf clear everything.
    const store = kickstandPlacementStore;
    store.reset();
    store.clearPreview();
    store.setPreview(
        { segmentId: 'seg-1', supportKind: 'trunk', modelId: 'm', t: 0.5, pos: hover, diameterMm: 1, minT: 0, rootPos: hover },
        {} as never,
        {} as never,
    );
    assert.ok(store.getSnapshot().snapTarget, 'a preview is armed');

    store.setHotkeyActive(true);
    assert.ok(store.getSnapshot().snapTarget, 'pressing the hotkey kept it');
});

test('releasing the kickstand hotkey drops the preview but stays reachable', () => {
    const store = kickstandPlacementStore;
    store.reset();
    store.setPreview(
        { segmentId: 'seg-1', supportKind: 'trunk', modelId: 'm', t: 0.5, pos: hover, diameterMm: 1, minT: 0, rootPos: hover },
        {} as never,
        {} as never,
    );

    store.setHotkeyActive(false);
    const state = store.getSnapshot();
    assert.equal(state.snapTarget, null, 'the preview is released');
    assert.equal(state.hotkeyActive, false);
});

test('every store keeps its mode flag through a reset', () => {
    // The one thing all four agree on, and the reason the primitive's reset
    // takes the fields to preserve rather than resetting outright.
    branchPlacementStore.reset();
    branchPlacementStore.setAltActive(true);
    branchPlacementStore.reset();
    assert.equal(branchPlacementStore.getSnapshot().altActive, true, 'branch keeps altActive');

    bracePlacementStore.reset();
    bracePlacementStore.setAltActive(true);
    bracePlacementStore.reset();
    assert.equal(bracePlacementStore.getSnapshot().altActive, true, 'brace keeps altActive');

    leafPlacementStore.reset();
    leafPlacementStore.setHotkeyActive(true);
    leafPlacementStore.reset();
    assert.equal(leafPlacementStore.getSnapshot().hotkeyActive, true, 'leaf keeps hotkeyActive');

    kickstandPlacementStore.reset();
    kickstandPlacementStore.setHotkeyActive(true);
    kickstandPlacementStore.reset();
    assert.equal(kickstandPlacementStore.getSnapshot().hotkeyActive, true, 'kickstand keeps hotkeyActive');

    // Leave the stores idle for whatever test runs next.
    branchPlacementStore.reset();
    bracePlacementStore.reset();
    leafPlacementStore.reset();
    kickstandPlacementStore.reset();
});

test('finalize blocks a preview until the next placement starts', () => {
    // The observable point of the flag: the frame loop keeps offering a preview
    // of the support that was just created, and it must be ignored or the scene
    // shows a ghost of something that already exists.
    branchPlacementStore.reset();
    branchPlacementStore.finalize();
    branchPlacementStore.setPreviewData({ id: 'ghost' } as never);
    assert.equal(branchPlacementStore.getSnapshot().previewData, null, 'branch ignores it');

    // ...and a new placement lifts the block, or previews would never return.
    branchPlacementStore.setTip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 'model-a');
    branchPlacementStore.setPreviewData({ id: 'live' } as never);
    assert.deepEqual(
        branchPlacementStore.getSnapshot().previewData,
        { id: 'live' },
        'branch accepts a preview once a new placement starts',
    );

    leafPlacementStore.reset();
    leafPlacementStore.finalize();
    leafPlacementStore.setPreviewData({ id: 'ghost' } as never);
    assert.equal(leafPlacementStore.getSnapshot().previewData, null, 'leaf ignores it');

    bracePlacementStore.reset();
    bracePlacementStore.finalize();
    bracePlacementStore.setPreview({
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: 0, z: 1 },
        startDiameterMm: 1,
        endDiameterMm: 1,
    });
    assert.equal(bracePlacementStore.getSnapshot().preview, null, 'brace ignores it');

    // Leave the stores idle for whatever test runs next.
    branchPlacementStore.reset();
    leafPlacementStore.reset();
    bracePlacementStore.reset();
});
