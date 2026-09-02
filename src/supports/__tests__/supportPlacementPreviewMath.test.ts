import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildBracePlacementPreviewBatch,
    resolvePlacementPreviewMaterial,
    PLACEMENT_PREVIEW_COLOR,
    PLACEMENT_PREVIEW_ERROR_COLOR,
    PLACEMENT_PREVIEW_ERROR_OPACITY,
    PLACEMENT_PREVIEW_OPACITY,
} from '../supportPlacementPreviewMath';
import type { SupportData } from '../rendering';

/**
 * Covers the placement-preview maths now that it is out of SupportRenderer.
 *
 * It was untestable while it lived inside a 4,900-line component: reaching it
 * meant mounting React and three.js. These call the functions directly.
 */

function previewData(over: Partial<SupportData> = {}): SupportData {
    return { id: 'p1', segments: [], ...over } as SupportData;
}

test('an errored preview renders red at the error opacity', () => {
    const material = resolvePlacementPreviewMaterial(previewData({ error: 'COLLISION_WITH_MODEL' } as Partial<SupportData>));
    assert.equal(material.color, PLACEMENT_PREVIEW_ERROR_COLOR);
    assert.equal(material.opacity, PLACEMENT_PREVIEW_ERROR_OPACITY);
});

test('error wins over a would-be-valid angle', () => {
    const material = resolvePlacementPreviewMaterial(
        previewData({ error: 'COLLISION_WITH_MODEL', angle: 180 } as Partial<SupportData>),
    );
    assert.equal(material.color, PLACEMENT_PREVIEW_ERROR_COLOR);
});

test('a flat overhang (180deg) renders the fully-valid green', () => {
    const material = resolvePlacementPreviewMaterial(previewData({ angle: 180 } as Partial<SupportData>));
    assert.equal(material.color, PLACEMENT_PREVIEW_COLOR);
    assert.equal(material.opacity, PLACEMENT_PREVIEW_OPACITY);
});

test('the steepness gradient is monotonic from steep to flat', () => {
    // Steeper angles must never read "safer" than flatter ones: the green
    // channel rises as the surface flattens out.
    const green = (angle: number) => {
        const hex = resolvePlacementPreviewMaterial(previewData({ angle } as Partial<SupportData>)).color;
        return parseInt(hex.slice(3, 5), 16);
    };
    const samples = [91, 100, 110, 120, 140, 160, 180].map(green);
    for (let i = 1; i < samples.length; i++) {
        assert.ok(samples[i] >= samples[i - 1], `green fell from ${samples[i - 1]} to ${samples[i]}`);
    }
});

test('an angle below the gradient floor clamps rather than extrapolating', () => {
    // (angle - 91) goes negative below 91deg; without the clamp the lerp would
    // run backwards past the orange endpoint.
    const below = resolvePlacementPreviewMaterial(previewData({ angle: 45 } as Partial<SupportData>));
    const floor = resolvePlacementPreviewMaterial(previewData({ angle: 91 } as Partial<SupportData>));
    assert.equal(below.color, floor.color);
});

test('a zero-length brace still emits its start joint but no shaft', () => {
    // Degenerate while the user is still dragging: both ends at one point. The
    // shaft is skipped (lenSq below epsilon) rather than emitted with NaN axes.
    const at = { x: 1, y: 2, z: 3 };
    const batch = buildBracePlacementPreviewBatch('b1', {
        start: at,
        end: { ...at },
        startDiameterMm: 1,
        endDiameterMm: 1,
    } as never);

    assert.ok(batch, 'a degenerate brace should still produce a batch');
    assert.equal(batch.shafts.length, 0);
    assert.equal(batch.taperedShafts.length, 0);
    assert.equal(batch.joints.length, 1);
    assert.deepEqual(batch.joints[0].pos, at);
});

test('a real brace emits shaft geometry between its ends', () => {
    const batch = buildBracePlacementPreviewBatch('b2', {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: 0, z: 10 },
        startDiameterMm: 1,
        endDiameterMm: 1,
    } as never);

    assert.ok(batch);
    assert.ok(batch.shafts.length + batch.taperedShafts.length > 0, 'expected shaft geometry');
});
