import assert from 'node:assert/strict';
import test from 'node:test';

import '../state';
import { generateLateralStabilisers, lateralStabiliserTypes } from '../supportTypeRegistry';

/**
 * Who can stand a shaft up without a partner.
 *
 * Auto-bracing wants two bracing axes on a tall shaft. When no neighbouring
 * shaft is in reach there is nothing to brace against, so it asks the registry
 * instead of importing one type's generator.
 *
 * The registration is a side-effect import, so a missing one would silently
 * generate nothing rather than fail to build.
 */

test('a stabiliser is registered', () => {
    assert.deepEqual(lateralStabiliserTypes(), ['kickstand']);
});

test('an unregistered type generates nothing rather than throwing', () => {
    const request = {
        snapshot: {}, existing: {}, settings: {},
        existingEdges: [], gridSettings: { enabled: false, spacingMm: 0 },
    };
    assert.deepEqual(generateLateralStabilisers('trunk', request), []);
});
