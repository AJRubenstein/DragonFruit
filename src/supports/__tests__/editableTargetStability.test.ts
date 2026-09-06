import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
    addKnot, addLeaf, addRoot, addSupportEntity, getSnapshot,
    resolveEditableSupportTarget, resetStore, setHoveredState,
} from '../state';

/**
 * `resolveEditableSupportTarget` returns a fresh object each call, so anything
 * memoising it on the whole snapshot hands a new value to every dependent on
 * every store write. The sidebar did, and its settings effect re-applied,
 * notified, and re-ran until React cut it off.
 */

beforeEach(() => {
    resetStore();
    addRoot({
        id: 'r1', modelId: 'm',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('trunk', { id: 't1', modelId: 'm', rootId: 'r1', segments: [{ id: 's1', diameter: 1 }] } as never);
    addKnot({ id: 'k1', parentShaftId: 's1', pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);
    addLeaf({
        id: 'l1', modelId: 'm', parentKnotId: 'k1',
        contactCone: {
            id: 'c1', pos: { x: 0, y: 0, z: 4 },
            normal: { x: 0, y: 0, z: 1 }, surfaceNormal: { x: 0, y: 0, z: 1 },
            profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
        },
    } as never);
});

test('the resolved target is a new object each call', () => {
    // The fact a caller has to memoise around, rather than assume away.
    const state = getSnapshot();
    const a = resolveEditableSupportTarget('t1', 'trunk');
    const b = resolveEditableSupportTarget('t1', 'trunk');

    assert.notEqual(a, b, 'two calls should not share an object');
    assert.deepEqual(a, b, 'but they must describe the same target');
    void state;
});

test('a write that changes nothing relevant still yields the same target value', () => {
    const before = resolveEditableSupportTarget('t1', 'trunk');
    setHoveredState('knot', 'k1');
    const after = resolveEditableSupportTarget('t1', 'trunk');

    assert.deepEqual(after, before, 'hovering must not change which support is editable');
});

test('the target key is stable across unrelated writes', () => {
    // What the sidebar memoises on: a string, so an unrelated write cannot
    // hand the settings effect a new dependency.
    const keyOf = (id: string | null, category?: string) => {
        const target = resolveEditableSupportTarget(id, category as never);
        return target ? `${target.kind}:${target.id}` : null;
    };

    const before = keyOf('t1', 'trunk');
    setHoveredState('support', 't1');
    setHoveredState('none', null);

    assert.equal(keyOf('t1', 'trunk'), before);
});
