import assert from 'node:assert/strict';
import test from 'node:test';

import '../state';
import '../detailRenderer/registerBuiltinDetailRenderers';
import { detailRenderersFor } from '../detailRenderer/seam';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import { supportIsDrawnSelected, typeHasBatchedMarqueeOverlay } from '../SupportRenderer';

/**
 * A support marked selected by ANY route is drawn as selected.
 *
 * `supportIsDrawnSelected` is the single place that decides this, because every
 * type's detail renderer dims a support it does not consider selected --
 * `dimNonSelected && !isSelected` -- which OVERWRITES whatever colour it was
 * handed. A support marked only by the bulk colour was therefore dimmed instead
 * of highlighted, and a type whose only draw path is its detail renderer went
 * grey: brace and stump, whose marquee selection looked like it had not
 * registered while a click worked (a click selects one, under the threshold).
 */

test('a bulk-selected support is drawn as selected', () => {
    // The regression: past MULTI_SELECTION_DETAIL_THRESHOLD the per-type sets are
    // empty by design, so the set is what CANNOT say. Miss this and the bulk
    // colour is overwritten by the dim in every renderer.
    assert.equal(
        supportIsDrawnSelected({ inSelectedSet: false, bulkSelected: true, marqueePreview: false }),
        true,
    );
});

test('a support marked by no route is not drawn as selected', () => {
    assert.equal(
        supportIsDrawnSelected({ inSelectedSet: false, bulkSelected: false, marqueePreview: false }),
        false,
        'an unmarked support must stay dimmable',
    );
});

test('each route on its own is enough to be drawn as selected', () => {
    // The three routes are independent: a small selection, a bulk selection, and
    // a live drag. Any one of them marks the support selected.
    for (const route of ['inSelectedSet', 'bulkSelected', 'marqueePreview'] as const) {
        const input = { inSelectedSet: false, bulkSelected: false, marqueePreview: false, [route]: true };
        assert.equal(
            supportIsDrawnSelected(input),
            true,
            `${route} alone should mark the support selected`,
        );
    }
});

/**
 * Every type can show that a marquee drag has caught it.
 *
 * While a drag is in progress the caught supports are previewed in the selection
 * colour, and there are two routes that can draw it:
 *
 * - a batched instanced overlay, which between its four sources (shafts, cones,
 *   joints, roots) reaches any type declaring `batchesShaft`,
 *   `batchesContactCones` or `ownsRoot`;
 * - the type's own detail renderer, which `sharedRenderProps` flags as selected
 *   for a caught entity, and which is the ONLY route a type without any of those
 *   three has.
 *
 * A type with neither route is invisible to the user while a drag sweeps over
 * it, while still being caught and selected -- which is what brace and stump did
 * before the second route existed. Neither route is a name, so a type added to
 * the registry cannot quietly miss both.
 */

const EMPTY_CONTEXT = {
    roots: {},
    renderKnotsById: {},
    braceRenderKnotsById: {},
    simpleRender: false,
    hideUnselectedKnots: false,
    hidePlateContactPrimitivesEffective: false,
    ghostedBraceIdSet: new Set<string>(),
    ghostOpacityClamped: 1,
    suppressHover: false,
    isInteractable: false,
    debugSectionColorsEnabled: false,
    braceShaftsBySupport: new Map(),
} as never;

test('every type is previewed by a batched overlay or by its own detail renderer', () => {
    const entries = detailRenderersFor(EMPTY_CONTEXT);

    for (const descriptor of SUPPORT_TYPES) {
        const hasOverlay = typeHasBatchedMarqueeOverlay(descriptor.id);
        const hasDetailRenderer = Boolean(entries[descriptor.id]);

        assert.ok(
            hasOverlay || hasDetailRenderer,
            `${descriptor.id} has no batched overlay and no detail renderer, `
            + 'so nothing would show that a marquee drag caught it',
        );
    }
});

test('the types with no batched overlay are exactly the ones the detail route serves', () => {
    // Pins the measured partition, so a type that LOSES its batching flags is
    // noticed: it moves into this list and starts relying on the detail route.
    const withoutOverlay = SUPPORT_TYPES
        .filter((descriptor) => !typeHasBatchedMarqueeOverlay(descriptor.id))
        .map((descriptor) => descriptor.id)
        .sort();

    assert.deepEqual(
        withoutOverlay,
        ['brace', 'stump'],
        'the set of types relying on the detail route changed',
    );
});
