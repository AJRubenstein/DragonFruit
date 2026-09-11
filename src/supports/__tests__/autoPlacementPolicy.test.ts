import assert from 'node:assert/strict';
import test from 'node:test';

import { autoPlacementFor, getSupportTypeDescriptor, typesWithAutoPlacement } from '../supportTypeRegistry';

/**
 * Auto-placement policy per type.
 *
 * These were `ANCHOR_*` constants in `autoSupport/` with no readers, so they
 * were deletable without a test failing anywhere. Pinned here so the values
 * survive until the placement code reads them.
 */

test('anchor declares the density and sizing policy', () => {
    const policy = autoPlacementFor('anchor');
    assert.equal(policy.minSpacingMm, 1.8);
    assert.equal(policy.minXyMm, 4.0);
    assert.equal(policy.minAreaMm2, 12.0);
    assert.equal(policy.shaftMultiplier, 1.25);
});

test('anchor is the only type declaring one today', () => {
    assert.deepEqual([...typesWithAutoPlacement()], ['anchor']);
});

test('a type without a policy reads as empty, not a throw', () => {
    // What lets a caller read a field and fall back without naming a type.
    assert.deepEqual(autoPlacementFor('trunk'), {});
    assert.equal(autoPlacementFor('trunk').minSpacingMm, undefined);
});

test('the policy sits beside the placement rule it qualifies', () => {
    // The rule picks anchor for a candidate; the policy governs placing it.
    const anchor = getSupportTypeDescriptor('anchor');
    assert.equal(anchor.placementRule?.metric, 'tipHeight');
    assert.ok(anchor.autoPlacement, 'anchor lost its auto-placement policy');
});
