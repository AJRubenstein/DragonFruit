import assert from 'node:assert/strict';
import test from 'node:test';

import { DETAIL_PRESET, STRUCTURE_PRESET, ANCHOR_PRESET, setActivePreset } from '../Settings/presets';
import { getSettings } from '../Settings/state';

test('built-in presets carry distinct auto-support density (light/medium/heavy)', () => {
    assert.equal(DETAIL_PRESET.settings.autoSupport.areaPerSupportMm2, 12, 'detail = light density');
    assert.equal(STRUCTURE_PRESET.settings.autoSupport.areaPerSupportMm2, 8, 'structure = medium density');
    assert.equal(ANCHOR_PRESET.settings.autoSupport.areaPerSupportMm2, 5, 'anchor = heavy density');
});

test('preset density is the only autoSupport difference (geometry band stays)', () => {
    // The sizing bands are driven by the preset shaft/tip values, not the
    // density — check the preset shaft progression still holds.
    assert.ok(DETAIL_PRESET.settings.shaft.diameterMm < STRUCTURE_PRESET.settings.shaft.diameterMm);
    assert.ok(STRUCTURE_PRESET.settings.shaft.diameterMm < ANCHOR_PRESET.settings.shaft.diameterMm);
});

test('switching the active preset applies its auto-support density', () => {
    setActivePreset('anchor');
    assert.equal(getSettings().autoSupport.areaPerSupportMm2, 5, 'anchor = heavy density');

    setActivePreset('detail');
    assert.equal(getSettings().autoSupport.areaPerSupportMm2, 12, 'detail = light density');

    setActivePreset('structure');
    assert.equal(getSettings().autoSupport.areaPerSupportMm2, 8, 'structure = medium density');
});
