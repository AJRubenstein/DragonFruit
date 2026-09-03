import assert from 'node:assert/strict';
import test from 'node:test';

import '../state';
import {
    collectionsMissingRestore,
    inferSupportSettings,
    resolveKnotDiameter,
    SUPPORT_TYPES,
    updateSupportEntity,
} from '../supportTypeRegistry';

/**
 * The registry's slots are filled by side effect at load. Nothing else checks
 * they were actually filled: deleting a whole registration left all 799 other
 * tests passing, because a missing slot falls through to a default.
 */

test('every type registers an updater', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            updateSupportEntity(descriptor.id, { id: 'nonexistent' }),
            true,
            `${descriptor.id} has no updater registered`,
        );
    }
});

test('every collection registers a restore', () => {
    assert.deepEqual(collectionsMissingRestore(), []);
});

test('twig knot diameters come from the taper', () => {
    // Registered from SupportTypes/Twig/. A knot halfway along a 2mm->1mm taper
    // sits at 1.5mm, scaled by the joint-disk multiplier.
    const twig = {
        id: 'twig-a',
        modelId: 'model-a',
        segments: [{
            id: 'seg-a',
            diameter: 2,
            bottomJoint: { id: 'bj', pos: { x: 0, y: 0, z: 0 }, diameter: 2 },
            topJoint: { id: 'tj', pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
        }],
        contactDiskA: { id: 'disk-a', socketJointId: 'bj', pos: { x: 0, y: 0, z: 0 }, contactDiameterMm: 2 },
        contactDiskB: { id: 'disk-b', socketJointId: 'tj', pos: { x: 0, y: 0, z: 10 }, contactDiameterMm: 1 },
    };

    const midpoint = resolveKnotDiameter('twig', twig as never, 'seg-a', 0.5);
    assert.ok(midpoint !== null, 'the twig knot rule is not registered');
    assert.ok(Math.abs(midpoint - 1.65) < 1e-9, `expected 1.65, got ${midpoint}`);

    // A segment the twig does not own has no taper position.
    assert.equal(resolveKnotDiameter('twig', twig as never, 'not-mine', 0.5), null);
});

test('types declaring editable settings register an inference', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasEditableSettings) continue;
        const inferred = inferSupportSettings(descriptor.id, { id: 'x', segments: [] });
        assert.ok(inferred, `${descriptor.id} declares editable settings but registers no inference`);
    }
});
