import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlacementStore } from '../interaction/shared/placement/placementStore';

/**
 * The shared placement-store primitive.
 *
 * Four stores hand-rolled the same state slot, listener set, notify, subscribe
 * and getSnapshot. These hold the behaviour those four relied on, including
 * the parts `useSyncExternalStore` is strict about: a stable snapshot identity
 * between writes, and an unsubscribe that actually detaches.
 */

interface Fixture {
    active: boolean;
    target: string | null;
}

const initial: Fixture = { active: false, target: null };

test('getSnapshot is stable between writes', () => {
    // useSyncExternalStore re-renders whenever the snapshot identity changes,
    // so a store returning a fresh object each call loops forever.
    const store = createPlacementStore(initial);
    assert.equal(store.getSnapshot(), store.getSnapshot());
});

test('a write replaces the state and notifies', () => {
    const store = createPlacementStore(initial);
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    store.write({ active: true, target: 'seg-1' });

    assert.equal(notifications, 1);
    assert.deepEqual(store.getSnapshot(), { active: true, target: 'seg-1' });
});

test('a write can derive the next state from the current one', () => {
    const store = createPlacementStore(initial);
    store.write({ active: true, target: 'seg-1' });
    store.write((current) => ({ ...current, target: 'seg-2' }));

    assert.deepEqual(store.getSnapshot(), { active: true, target: 'seg-2' });
});

test('unsubscribing detaches the listener', () => {
    const store = createPlacementStore(initial);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications += 1; });

    store.write({ active: true, target: null });
    unsubscribe();
    store.write({ active: false, target: null });

    assert.equal(notifications, 1);
});

test('reset restores the initial values and notifies', () => {
    const store = createPlacementStore(initial);
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    store.write({ active: true, target: 'seg-1' });
    store.reset();

    assert.deepEqual(store.getSnapshot(), initial);
    assert.equal(notifications, 2);
});

test('resetting an idle store notifies nobody', () => {
    // A placement hotkey released without a preview resets on every keyup;
    // notifying there would re-render every subscriber for nothing.
    const store = createPlacementStore(initial);
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    store.reset();

    assert.equal(notifications, 0);
});

test('the initial state is copied, not aliased', () => {
    // Writing through one store must not change what another one resets to.
    const store = createPlacementStore(initial);
    store.write({ active: true, target: 'seg-1' });

    assert.deepEqual(initial, { active: false, target: null });
    assert.deepEqual(createPlacementStore(initial).getSnapshot(), initial);
});
