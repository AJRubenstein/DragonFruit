import assert from 'node:assert/strict';
import test from 'node:test';

import { cascadeCollectionsFor } from '../supportCascade';
import { removalShapeFor, SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Every collection a removal can reach must have a field in that type's
 * declared removal shape. An undeclared one is deleted without being recorded,
 * so undo cannot bring it back.
 */

test('each declared removal shape records every collection its cascade reaches', () => {
    let checked = 0;
    for (const descriptor of SUPPORT_TYPES) {
        const declared = new Set<unknown>(Object.keys(removalShapeFor(descriptor.id).cascade));
        for (const collection of cascadeCollectionsFor(descriptor.id)) {
            assert.ok(
                declared.has(collection),
                `${descriptor.id}: the cascade reaches ${collection}, which its removal shape does not record`,
            );
            checked += 1;
        }
    }
    assert.ok(checked > 0, 'the derivation reached at least one collection');
});
