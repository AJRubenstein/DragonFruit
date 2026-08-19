import assert from 'node:assert/strict';
import test from 'node:test';

import { DETAIL_PRESET, STRUCTURE_PRESET, ANCHOR_PRESET, setActivePreset } from '../Settings/presets';
import { getSettings } from '../Settings/state';
import { createDefaultAutoSupportSettings } from '../autoSupport/settings';
import type { AutoSupportSettings } from '../autoSupport/settings';

test('built-in presets carry distinct auto-support density (light/medium/heavy)', () => {
    assert.equal(DETAIL_PRESET.settings.autoSupport.areaPerSupportMm2, 16, 'detail = light density');
    assert.equal(STRUCTURE_PRESET.settings.autoSupport.areaPerSupportMm2, 10, 'structure = medium density');
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
    assert.equal(getSettings().autoSupport.areaPerSupportMm2, 16, 'detail = light density');

    setActivePreset('structure');
    assert.equal(getSettings().autoSupport.areaPerSupportMm2, 10, 'structure = medium density');
});

test('preset autoSupport blocks equal defaults except the density (quick-select determinism)', () => {
    // The panel quick-select applies the FULL preset autoSupport block, so a
    // preset must differ from the defaults ONLY in areaPerSupportMm2 —
    // otherwise selecting medium after a load wouldn't reproduce the built-in
    // medium (the stale-keys bug: "default medium" ≠ round-tripped medium).
    const defaults = createDefaultAutoSupportSettings();
    const cases: Array<[typeof STRUCTURE_PRESET, number]> = [
        [DETAIL_PRESET, 16],
        [STRUCTURE_PRESET, 10],
        [ANCHOR_PRESET, 5],
    ];
    for (const [preset, area] of cases) {
        const block = preset.settings.autoSupport;
        for (const key of Object.keys(defaults) as Array<keyof AutoSupportSettings>) {
            if (key === 'areaPerSupportMm2') {
                assert.equal(block.areaPerSupportMm2, area, `${preset.id} density`);
            } else {
                assert.equal(block[key], defaults[key], `${key} matches defaults for ${preset.id}`);
            }
        }
    }
});
