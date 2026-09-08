import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupportPlacementRouting } from '../interaction/shared/placement/hotkeys/supportPlacementRouting';
import { MODEL_SURFACE_GESTURE_BY_TYPE, SUPPORT_TYPES } from '../supportTypeRegistry';
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
