import assert from 'node:assert/strict';
import test from 'node:test';

import '../state';
import '../detailRenderer/registerBuiltinDetailRenderers';
import { detailRenderersFor } from '../detailRenderer/seam';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import { typeHasBatchedMarqueeOverlay } from '../SupportRenderer';

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
