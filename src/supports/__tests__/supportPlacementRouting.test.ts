import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupportPlacementRouting, routeModelPlacementHit } from '../interaction/shared/placement/hotkeys/supportPlacementRouting';
import { MODEL_SURFACE_GESTURE_BY_TYPE, MODEL_SURFACE_GESTURE_TYPES, SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportPlacementHotkeyBindings, SupportPlacementModifierState, SupportPlacementRoutingState } from '../interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes';

const defaultBindings: SupportPlacementHotkeyBindings = {
    branchFamily: { key: 'Alt', description: '' },
    leaf: { key: 'Alt', modifier: 'ctrl', description: '' },
    kickstand: { key: 'Control', description: '' }
};

const defaultModifierState: SupportPlacementModifierState = {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false
};

const defaultRoutingState: SupportPlacementRoutingState = {
    branchHotkeyActive: false,
    braceHotkeyActive: false,
    leafHotkeyActive: false,
    kickstandHotkeyActive: false,
    braceAwaitingEnd: false,
    leafAwaitingBase: false,
    branchAwaitingBase: false
};

test('resolveSupportPlacementRouting behaviour', () => {
    // 1. Idle state
    const resIdle = resolveSupportPlacementRouting({
        bindings: defaultBindings,
        modifierState: defaultModifierState,
        state: defaultRoutingState
    });
    assert.equal(resIdle.blocksDefaultModelPlacement, false);
    assert.equal(resIdle.blocksDefaultSupportPlacement, false);
    assert.equal(resIdle.owner, 'none');

    // 2. Leaf active via hotkey
    const resLeafHotkey = resolveSupportPlacementRouting({
        bindings: defaultBindings,
        modifierState: defaultModifierState,
        state: { ...defaultRoutingState, leafHotkeyActive: true }
    });
    assert.equal(resLeafHotkey.blocksDefaultModelPlacement, true);
    assert.equal(resLeafHotkey.blocksDefaultSupportPlacement, true);
    assert.equal(resLeafHotkey.owner, 'leaf');

    // 3. Kickstand active via Ctrl key modifier
    const resKickstand = resolveSupportPlacementRouting({
        bindings: defaultBindings,
        modifierState: { ...defaultModifierState, ctrlKey: true },
        state: defaultRoutingState
    });
    assert.equal(resKickstand.blocksDefaultModelPlacement, true);
    assert.equal(resKickstand.blocksDefaultSupportPlacement, true);
    assert.equal(resKickstand.owner, 'kickstand');
    assert.equal(resKickstand.supportClickOwner, 'kickstand');
});

/**
 * The narrow owner union is derived from MODEL_SURFACE_GESTURE_BY_TYPE, which
 * restates each descriptor's flag with the literals kept. Types cannot check
 * that the two agree, so this does.
 */
test('the model-surface gesture table matches the descriptors', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            MODEL_SURFACE_GESTURE_BY_TYPE[descriptor.id],
            descriptor.claimsModelSurfaceGestures,
            `${descriptor.id} disagrees between the table and its descriptor`,
        );
    }

    const tableKeys = Object.keys(MODEL_SURFACE_GESTURE_BY_TYPE).sort();
    const registryIds = SUPPORT_TYPES.map((d) => d.id).sort();
    assert.deepEqual(tableKeys, registryIds, 'the table and the registry cover different types');
});

/**
 * The manager's model-face dispatch. Inverting it (every gesture delivered to
 * the wrong hook) left the whole suite green before these tests existed.
 */
test('a model-face gesture reaches only the named owner', () => {
    const hit = { id: 'hit' };

    for (const owner of MODEL_SURFACE_GESTURE_TYPES) {
        const routed = routeModelPlacementHit(MODEL_SURFACE_GESTURE_TYPES, owner, hit);

        assert.equal(routed[owner], hit, `${owner} should receive the hit`);
        for (const other of MODEL_SURFACE_GESTURE_TYPES) {
            if (other === owner) continue;
            assert.equal(routed[other], null, `${other} should be cleared while ${owner} owns the gesture`);
        }
    }
});

test('an unowned gesture clears every model-face placement', () => {
    const routed = routeModelPlacementHit(MODEL_SURFACE_GESTURE_TYPES, 'none', { id: 'hit' });

    for (const id of MODEL_SURFACE_GESTURE_TYPES) {
        assert.equal(routed[id], null, `${id} should be cleared when no owner claims the gesture`);
    }
});

test('the derived owner list covers exactly the flagged types', () => {
    assert.deepEqual(
        [...MODEL_SURFACE_GESTURE_TYPES].sort(),
        SUPPORT_TYPES.filter((d) => d.claimsModelSurfaceGestures).map((d) => d.id).sort(),
    );
});
