import assert from 'node:assert/strict';
import test from 'node:test';

import '../state';
import {
    buildContactBridge,
    contactBridgeTypes,
    typesForPlacementMetric,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';

/**
 * The bridge builders types register for themselves.
 *
 * `buildCavityBridge` used to ask the registry which type a span called for,
 * then branch on that answer to call `buildTwig` or `buildStick` by name. Now
 * each type registers how to build its own bridge and the caller only passes
 * the id along.
 *
 * Registration is a side effect of importing the type's folder, so a type that
 * declares a contactSpan rule but is never imported would return null at
 * runtime with nothing to catch it. These hold that correspondence.
 */

test('every type that claims a contact span registers a builder', () => {
    // A type declaring `contactSpan` is one `selectTypeForPlacement` can
    // return for a bridge, so it must know how to build one.
    const claimsSpan = typesForPlacementMetric('contactSpan').map((d) => d.id).sort();
    const registered = [...contactBridgeTypes()].sort();

    assert.deepEqual(registered, claimsSpan);
});

test('no type registers a builder it cannot be chosen for', () => {
    const claimsSpan = new Set(typesForPlacementMetric('contactSpan').map((d) => d.id));
    for (const typeId of contactBridgeTypes()) {
        assert.ok(claimsSpan.has(typeId), `${typeId} registered a builder but claims no span`);
    }
});

test('a registered builder returns an entity with a shaft', () => {
    // A 10mm vertical span: long enough for the stick side of the cutoff,
    // and vertical, so the stick's own gate passes it.
    const request = {
        modelId: 'm',
        aPos: { x: 0, y: 0, z: 10 },
        aNormal: { x: 0, y: 0, z: -1 },
        bPos: { x: 0, y: 0, z: 0 },
        bNormal: { x: 0, y: 0, z: 1 },
    };

    for (const typeId of contactBridgeTypes()) {
        const built = buildContactBridge(typeId, request);
        assert.ok(built, `${typeId} built a bridge`);
        const entity = built.entity as { id: string; segments?: unknown[] };
        assert.ok(entity.id, `${typeId} bridge has an id`);
        assert.ok(entity.segments?.length, `${typeId} bridge has a shaft`);
    }
});

test('an unregistered type builds nothing rather than throwing', () => {
    // The caller passes whatever the registry chose; a type with no builder
    // must decline, not crash the placement path.
    const unregistered = SUPPORT_TYPES
        .map((d) => d.id)
        .filter((id) => !contactBridgeTypes().includes(id));

    assert.ok(unregistered.length > 0, 'some type registers no bridge builder');
    for (const typeId of unregistered) {
        assert.equal(
            buildContactBridge(typeId, {
                modelId: 'm',
                aPos: { x: 0, y: 0, z: 10 },
                aNormal: { x: 0, y: 0, z: -1 },
                bPos: { x: 0, y: 0, z: 0 },
                bNormal: { x: 0, y: 0, z: 1 },
            }),
            null,
            `${typeId} declines`,
        );
    }
});

test('the stick gate refuses a bridge that cants too far from vertical', () => {
    // The verticality rule moved into the stick's own builder. A near-
    // horizontal span is long enough to be a stick but not a bridge.
    const canted = buildContactBridge('stick', {
        modelId: 'm',
        aPos: { x: 0, y: 0, z: 10 },
        aNormal: { x: 0, y: 0, z: -1 },
        bPos: { x: 20, y: 0, z: 9.9 },
        bNormal: { x: 0, y: 0, z: 1 },
    });

    assert.equal(canted, null, 'a near-horizontal stick is refused');
});
