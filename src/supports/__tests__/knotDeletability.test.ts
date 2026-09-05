import assert from 'node:assert/strict';
import test from 'node:test';

import { knotFields } from '../interaction/shared/selection/selectedIdsByType';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Which types can hang off a knot.
 *
 * `canDeleteSelection` asked this with four hand-written blocks — leaf,
 * branch, brace, kickstand — each naming its own host field. The declared
 * `hostedBy knots` edges answer it for every type.
 */

test('exactly the knot-hosted types declare a knot field', () => {
    const hosted = SUPPORT_TYPES.filter((d) => knotFields(d).length > 0).map((d) => d.id).sort();
    assert.deepEqual(hosted, ['brace', 'branch', 'kickstand', 'leaf']);
});

test('each type names the field it actually hangs from', () => {
    const byId = Object.fromEntries(SUPPORT_TYPES.map((d) => [d.id, knotFields(d)]));
    assert.deepEqual(byId.branch, ['parentKnotId']);
    assert.deepEqual(byId.leaf, ['parentKnotId']);
    assert.deepEqual(byId.kickstand, ['hostKnotId']);
    // A brace hangs from both ends, so a knot at either end holds it up.
    assert.deepEqual(byId.brace, ['startKnotId', 'endKnotId']);
});

test('a type with no knot edge contributes no field', () => {
    for (const id of ['trunk', 'twig', 'stick', 'anchor'] as const) {
        const descriptor = SUPPORT_TYPES.find((d) => d.id === id)!;
        assert.deepEqual(knotFields(descriptor), [], id);
    }
});
