import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Which types can mount a detail renderer while unselected.
 *
 * Past `MULTI_SELECTION_DETAIL_THRESHOLD` the per-type selected sets are left
 * empty, so `isSelected` never reaches a detail renderer and the bulk colour
 * is the only thing marking a selection. `resolveDetailSupportColor` adds that
 * colour; `resolveBaseColor` does not.
 *
 * A type only reaches a detail renderer while unselected if it can leave the
 * shaft batch, and only a declared taper does that. Kickstand called
 * `resolveBaseColor` directly, so a tapered kickstand in a large marquee never
 * took the bulk-selected colour -- the same shape as the open anchor
 * highlight bug.
 */

test('exactly the tapering types can leave the shaft batch', () => {
    // A shaft whose ends differ cannot be instanced, so a declared taper is
    // the only way a batching type falls back to its detail renderer.
    const tapering = SUPPORT_TYPES
        .filter((d) => d.batchesPlainShafts && d.shaftTaper)
        .map((d) => d.id)
        .sort();

    assert.deepEqual(tapering, ['kickstand', 'twig']);
});

test('a tapering type tapers on segments it actually has', () => {
    // `segments: 'last'` reads the final segment, `'all'` every one; either
    // way the type needs a shaft for the rule to mean anything.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.shaftTaper) continue;

        assert.equal(descriptor.hasSegments, true, `${descriptor.id}: tapers, so it has a shaft`);
        assert.ok(
            descriptor.shaftTaper.segments === 'all' || descriptor.shaftTaper.segments === 'last',
            `${descriptor.id}: declares which segments taper`,
        );
        assert.equal(
            descriptor.shaftTaper.from.length,
            2,
            `${descriptor.id}: a taper compares two diameters`,
        );
    }
});

test('the bulk-selection threshold is above one', () => {
    // The whole hazard is that a large selection empties the per-type sets.
    // A threshold of one would mean every multi-selection took the bulk path
    // and the detail colour would never matter.
    const source = fs.readFileSync(
        new URL('../SupportRenderer.tsx', import.meta.url),
        'utf8',
    );

    const match = source.match(/MULTI_SELECTION_DETAIL_THRESHOLD = (\d+)/);
    assert.ok(match, 'the threshold is declared');
    assert.ok(Number(match[1]) > 1, 'a selection can stay detailed');

    // Kickstand must not reach for the base resolver: it is one of the two
    // types that can mount detail while unselected.
    assert.ok(
        !/baseColor=\{resolveBaseColor\(kickstand\.modelId\)\}/.test(source),
        'kickstand takes its colour from resolveDetailSupportColor',
    );
});
