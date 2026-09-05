import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Which types taper, where they read the two diameters, and on which segment.
 *
 * Twig and kickstand each had their own shaft builder for this. The shapes
 * matched: read two diameters, compare them, drop the support from the batched
 * pass when they differ.
 */

test('exactly twig and kickstand declare a taper', () => {
    const tapering = SUPPORT_TYPES.filter((d) => d.shaftTaper).map((d) => d.id).sort();
    assert.deepEqual(tapering, ['kickstand', 'twig']);
});

test('a twig tapers along its whole shaft, between its contact disks', () => {
    const taper = getSupportTypeDescriptor('twig').shaftTaper!;
    assert.equal(taper.segments, 'all');
    assert.deepEqual([...taper.from], [
        'contactDiskA.contactDiameterMm',
        'contactDiskB.contactDiameterMm',
    ]);
});

test('a kickstand tapers only its terminal segment, from its profile', () => {
    const taper = getSupportTypeDescriptor('kickstand').shaftTaper!;
    assert.equal(taper.segments, 'last');
    assert.deepEqual([...taper.from], [
        'profile.terminalStartDiameterMm',
        'profile.terminalEndDiameterMm',
    ]);
});

test('a declared taper names exactly two diameter sources', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.shaftTaper) continue;
        assert.equal(descriptor.shaftTaper.from.length, 2, descriptor.id);
        for (const path of descriptor.shaftTaper.from) {
            assert.match(path, /^\w+(\.\w+)+$/, `${descriptor.id}: ${path} should be a dotted path`);
        }
    }
});

test('a tapering type has a shaft to taper', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.shaftTaper) assert.equal(descriptor.hasSegments, true, descriptor.id);
    }
});

test('exactly the placeable types declare a preview', () => {
    // Twig, stick and anchor are chosen automatically by threshold rather than
    // placed, so they have no placement hook and no preview.
    const placeable = SUPPORT_TYPES.filter((d) => d.hasPlacementPreview).map((d) => d.id).sort();
    assert.deepEqual(placeable, ['brace', 'branch', 'kickstand', 'leaf', 'trunk']);
});

test('the default placement tool is the one that yields', () => {
    const yielding = SUPPORT_TYPES.filter((d) => d.previewYieldsToOtherModes).map((d) => d.id);
    assert.deepEqual(yielding, ['trunk']);
});

test('a mode-scoped preview needs its own mode active', () => {
    const scoped = SUPPORT_TYPES.filter((d) => d.previewRequiresOwnMode).map((d) => d.id);
    assert.deepEqual(scoped, ['branch']);
});

test('brace placement does not displace the default preview', () => {
    // A brace places between two existing supports rather than against the
    // model, so a trunk preview may sit under it.
    const displacing = SUPPORT_TYPES.filter((d) => d.placementModeDisplacesDefault).map((d) => d.id).sort();
    assert.deepEqual(displacing, ['branch', 'kickstand', 'leaf']);
    assert.equal(SUPPORT_TYPES.find((d) => d.id === 'brace')!.placementModeDisplacesDefault, undefined);
});
