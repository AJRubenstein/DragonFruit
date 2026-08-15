import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createDefaultAutoSupportSettings,
    normalizeAutoSupportSettings,
    applyAutoSupportSettingsPatch,
    AUTO_SUPPORT_CONSTRAINTS,
} from '../autoSupport/settings';

test('defaults match constraints', () => {
    const defaults = createDefaultAutoSupportSettings();

    assert.equal(defaults.enabled, true);
    assert.equal(defaults.minIslandAreaMm2, AUTO_SUPPORT_CONSTRAINTS.minIslandAreaMm2.defaultValue);
    assert.equal(defaults.tipInfluenceRadiusMm, AUTO_SUPPORT_CONSTRAINTS.tipInfluenceRadiusMm.defaultValue);
    assert.equal(defaults.prioritizeIntersection, false);
    assert.equal(defaults.maxAttachmentsPerTrunk, AUTO_SUPPORT_CONSTRAINTS.maxAttachmentsPerTrunk.defaultValue);
    assert.equal(defaults.debugSkipAutoBracing, false);
});

test('normalize clamps high values', () => {
    const normalized = normalizeAutoSupportSettings({
        minIslandAreaMm2: 999,
        maxAttachmentsPerTrunk: 999,
    });

    assert.equal(normalized.minIslandAreaMm2, AUTO_SUPPORT_CONSTRAINTS.minIslandAreaMm2.max);
    assert.equal(normalized.maxAttachmentsPerTrunk, AUTO_SUPPORT_CONSTRAINTS.maxAttachmentsPerTrunk.max);
});

test('normalize fills missing fields', () => {
    const normalized = normalizeAutoSupportSettings({});
    const defaults = createDefaultAutoSupportSettings();

    assert.equal(normalized.enabled, defaults.enabled);
    assert.equal(normalized.minIslandAreaMm2, defaults.minIslandAreaMm2);
    assert.equal(normalized.tipInfluenceRadiusMm, defaults.tipInfluenceRadiusMm);
    assert.equal(normalized.prioritizeIntersection, defaults.prioritizeIntersection);
    assert.equal(normalized.maxAttachmentsPerTrunk, defaults.maxAttachmentsPerTrunk);
    assert.equal(normalized.debugSkipAutoBracing, defaults.debugSkipAutoBracing);
});

test('normalize drops legacy dead keys', () => {
    // Settings saved before the dead-knob removal (clusterRadiusMm and friends)
    // must normalize cleanly to the live shape without errors.
    const normalized = normalizeAutoSupportSettings({
        // @ts-expect-error legacy key no longer in the type
        clusterRadiusMm: 30,
        // @ts-expect-error legacy key no longer in the type
        debugClusterColorsEnabled: true,
        minIslandAreaMm2: 0.1,
    });

    assert.equal(normalized.minIslandAreaMm2, 0.1);
    assert.equal(normalized.tipInfluenceRadiusMm, AUTO_SUPPORT_CONSTRAINTS.tipInfluenceRadiusMm.defaultValue);
});

test('patch merges partially', () => {
    const base = createDefaultAutoSupportSettings();
    const patched = applyAutoSupportSettingsPatch(base, {
        enabled: false,
        maxAttachmentsPerTrunk: 30,
    });

    assert.equal(patched.enabled, false);
    assert.equal(patched.maxAttachmentsPerTrunk, 30);
    assert.equal(patched.minIslandAreaMm2, base.minIslandAreaMm2);
    assert.equal(patched.tipInfluenceRadiusMm, base.tipInfluenceRadiusMm);
    assert.equal(patched.prioritizeIntersection, base.prioritizeIntersection);
    assert.equal(patched.debugSkipAutoBracing, base.debugSkipAutoBracing);
});
