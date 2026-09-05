import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addKnot,
    addRoot,
    addSupportEntity,
    getSnapshot,
    loadFromImportFormat,
    resetStore,
} from '../state';
import { buildSupportExportFromStores } from '@/features/scene/voxl/codec';
import { SUPPORT_TYPES, SUPPORT_COLLECTION_KEYS } from '../supportTypeRegistry';

/**
 * Saving the store and loading it back gives the same store.
 *
 * `supportExportReconstruction.test.ts` covers the STL geometry path; nothing
 * covered this one. The VOXL codec stores the payload as an opaque JSON blob,
 * so the whole contract is `buildSupportExportFromStores` out and
 * `loadFromImportFormat` in -- and the two are hand-written mirrors of each
 * other, ten collections each.
 *
 * That makes the round trip the real test of the wire format, and the safety
 * net for anything that changes how entities are stored.
 */

const seg = (id: string, z0 = 0, z1 = 4) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: z0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: z1 }, diameter: 1 },
});

const root = (id: string, x: number) => ({
    id, modelId: 'model-a',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

const cone = (z = 4) => ({
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

const disk = (x: number) => ({
    id: `disk-${x}`,
    pos: { x, y: 0, z: 4 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.4,
    profile: { type: 'disk', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

/** One of every type, with the hosting relationships that make them real. */
function populatedScene() {
    resetStore();

    addRoot(root('root-a', 0) as never);
    addSupportEntity('trunk', {
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
        segments: [seg('seg-ta')], contactCone: cone(),
    } as never);

    addKnot({ id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);
    addSupportEntity('branch', {
        id: 'branch-a', modelId: 'model-a', parentKnotId: 'knot-a',
        segments: [seg('seg-ba', 2, 6)], contactCone: cone(6),
    } as never);

    addKnot({ id: 'knot-b', parentShaftId: 'seg-ba', t: 0.5, pos: { x: 0, y: 0, z: 4 }, diameter: 1 } as never);
    addSupportEntity('leaf', {
        id: 'leaf-a', modelId: 'model-a', parentKnotId: 'knot-b', contactCone: cone(),
    } as never);

    addSupportEntity('twig', {
        id: 'twig-a', modelId: 'model-a',
        segments: [seg('seg-wa')], contactDiskA: disk(1), contactDiskB: disk(2),
    } as never);

    addSupportEntity('stick', {
        id: 'stick-a', modelId: 'model-a',
        segments: [seg('seg-sa')], contactConeA: cone(), contactConeB: cone(),
    } as never);

    addSupportEntity('brace', {
        id: 'brace-a', modelId: 'model-a', startKnotId: 'knot-a', endKnotId: 'knot-b',
    } as never);

    addSupportEntity('anchor', {
        id: 'anchor-a', modelId: 'model-a',
        segments: [seg('seg-aa')], contactCone: cone(),
    } as never);

    // A kickstand is three entities: itself, its root, and the knot it hangs from.
    addRoot(root('ks-root', 3) as never);
    addKnot({ id: 'ks-host', parentShaftId: 'seg-ta', t: 0.3, pos: { x: 0, y: 0, z: 1.2 }, diameter: 1 } as never);
    addSupportEntity('kickstand', {
        id: 'ks-a', modelId: 'model-a', rootId: 'ks-root', hostKnotId: 'ks-host',
        hostSegmentId: 'seg-ta', hostMinT: 0.2, segments: [seg('seg-ka')],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 0.8 },
    } as never);
}

/** The store minus the transient interaction fields, which do not serialise. */
function persistentState() {
    const snapshot = getSnapshot();
    const out: Record<string, unknown> = {};
    for (const key of SUPPORT_COLLECTION_KEYS) out[key] = snapshot[key];
    return out;
}

const save = () => buildSupportExportFromStores(getSnapshot(), getSnapshot() as never);

test('the fixture populates every collection, or the round trip proves nothing', () => {
    populatedScene();
    const state = getSnapshot();

    for (const key of SUPPORT_COLLECTION_KEYS) {
        const count = Object.keys(state[key] ?? {}).length;
        assert.ok(count > 0, `${key} is empty, so the round trip does not exercise it`);
    }
});

test('save then load gives back the same store, once normalised', () => {
    // `loadFromImportFormat` normalises knot geometry: a knot on a leaf cone
    // has its `t`, position and diameter recomputed from the host cone, so a
    // hand-built store is not byte-identical after one trip. That is the load
    // correcting derived data, not the round trip losing it -- which is why
    // the fixed point is taken from the first load, and the assertion is that
    // saving it again changes nothing.
    populatedScene();
    const collectionSizes = Object.fromEntries(
        SUPPORT_COLLECTION_KEYS.map((key) => [key, Object.keys(getSnapshot()[key] ?? {}).length]),
    );

    const payload = save();
    resetStore();
    loadFromImportFormat(payload);
    const normalised = persistentState();

    // Compared against the pre-save store, so a collection dropped by BOTH
    // save and load cannot cancel itself out and pass.
    for (const key of SUPPORT_COLLECTION_KEYS) {
        assert.equal(
            Object.keys(getSnapshot()[key] ?? {}).length,
            collectionSizes[key],
            `${key} changed size across the round trip`,
        );
    }

    // Save the normalised store, then load that. Order matters: `save()` reads
    // the live store, so it has to run before the reset.
    const resaved = save();
    resetStore();
    loadFromImportFormat(resaved);

    assert.deepEqual(persistentState(), normalised);
});

test('a second round trip changes nothing further', () => {
    // A load that normalises geometry could be stable only from the second
    // pass onward; that would still be a silent change to a saved file.
    populatedScene();

    const first = save();
    resetStore();
    loadFromImportFormat(first);
    const afterOne = persistentState();

    const second = save();
    resetStore();
    loadFromImportFormat(second);

    assert.deepEqual(persistentState(), afterOne);
});

test('every type survives the trip with its own identity', () => {
    populatedScene();
    const payload = save();
    resetStore();
    loadFromImportFormat(payload);

    const state = getSnapshot();
    for (const descriptor of SUPPORT_TYPES) {
        const collection = state[descriptor.location.key] as Record<string, unknown>;
        assert.equal(
            Object.keys(collection).length,
            1,
            `${descriptor.id} did not survive the round trip`,
        );
    }
});

test('the payload carries every collection the store holds', () => {
    // A type added to the registry but not to the export builder would be
    // silently dropped on save -- the loudest possible data loss, and nothing
    // else checks for it.
    populatedScene();
    const payload = save() as unknown as Record<string, unknown[]>;

    for (const descriptor of SUPPORT_TYPES) {
        const key = descriptor.location.key;
        assert.ok(Array.isArray(payload[key]), `payload has no ${key} array`);
        assert.equal(payload[key].length, 1, `${descriptor.id} is missing from the saved payload`);
    }

    assert.equal((payload.roots as unknown[]).length, 2, 'trunk root and kickstand root');
    assert.equal((payload.knots as unknown[]).length, 3, 'branch, leaf and kickstand hosts');
});

test('an empty store round trips to an empty store', () => {
    resetStore();
    const payload = save();
    loadFromImportFormat(payload);

    for (const key of SUPPORT_COLLECTION_KEYS) {
        assert.equal(Object.keys(getSnapshot()[key] ?? {}).length, 0, key);
    }
});
