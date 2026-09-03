import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, redo, undo } from '@/history/historyStore';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { pushSupportHistory } from '../history/supportHistory';
import {
    getSnapshot,
    loadFromImportFormat,
    removeSupportEntity,
    resetStore,
} from '../state';
import {
    SUPPORT_COLLECTION_KEYS,
    SUPPORT_REMOVAL_SHAPES,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';
import { DEFAULT_TIP_PROFILE } from '../SupportPrimitives/ContactCone/types';
import type { DragonfruitImportFormat } from '../types';

/**
 * Undo and redo driven through the real registered handlers.
 *
 * `removalRoundTrip` replays a remover's snapshot by calling addX itself, so it
 * proves the snapshot is sufficient but never exercises a handler. The goldens
 * pin what a removal DELETES and do not touch history at all. Between them a
 * handler could invert the wrong way and nothing would fail.
 *
 * Everything here is derived from the registry, so a ninth type is covered by
 * declaring it.
 */

const MODEL_A = 'model-a';
const MODEL_B = 'model-b';

const seg = (id: string, topZ: number) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: topZ - 2 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: topZ }, diameter: 1 },
});
const cone = (id: string, z: number) => ({
    id,
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1,
    height: 1,
    profile: DEFAULT_TIP_PROFILE,
});
const root = (id: string, modelId: string, x: number) => ({
    id, modelId,
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});
const knotOn = (id: string, shaftId: string, z: number) => ({
    id, parentShaftId: shaftId, t: 0.5, pos: { x: 0, y: 0, z }, diameter: 1,
});

/** One of every type, with hosts and dependents so cascades have something to take. */
function fixture(): DragonfruitImportFormat {
    return {
        version: 1,
        meta: { source: 'history-round-trip', objectCenter: { x: 0, y: 0, z: 0 } },
        roots: [root('root-a', MODEL_A, 0), root('root-b', MODEL_B, 20), root('ks-root-a', MODEL_A, 3)],
        trunks: [
            { id: 'trunk-a', modelId: MODEL_A, rootId: 'root-a', segments: [seg('seg-ta', 4)], contactCone: cone('cone-ta', 12) },
            { id: 'trunk-b', modelId: MODEL_B, rootId: 'root-b', segments: [seg('seg-tb', 4)], contactCone: cone('cone-tb', 12) },
        ],
        branches: [
            { id: 'branch-a', modelId: MODEL_A, parentKnotId: 'knot-a', segments: [seg('seg-ba', 6)], contactCone: cone('cone-ba', 16) },
        ],
        leaves: [
            { id: 'leaf-a', modelId: MODEL_A, parentKnotId: 'knot-a', contactCone: cone('cone-la', 14) },
            { id: 'leaf-on-twig', modelId: MODEL_A, parentKnotId: 'knot-on-twig', contactCone: cone('cone-lw', 15) },
        ],
        twigs: [{ id: 'twig-a', modelId: MODEL_A, segments: [seg('seg-wa', 8)], contactDiskA: cone('disk-wa1', 8), contactDiskB: cone('disk-wa2', 13) }],
        sticks: [{ id: 'stick-a', modelId: MODEL_A, segments: [seg('seg-sa', 9)], contactConeA: cone('cone-sa1', 9), contactConeB: cone('cone-sa2', 14) }],
        braces: [{ id: 'brace-a', modelId: MODEL_A, startKnotId: 'knot-a', endKnotId: 'knot-b', profile: { diameter: 0.8 } }],
        anchors: [{
            id: 'anchor-a', modelId: MODEL_A,
            rootPos: { x: 5, y: 0, z: 0 }, rootBaseDiameter: 2, rootTopDiameter: 1, rootHeight: 1,
            joint: { id: 'anchor-a-joint', pos: { x: 5, y: 0, z: 1 }, diameter: 1 },
            segments: [seg('seg-aa', 3)], contactCone: cone('cone-aa', 7),
        }],
        knots: [
            knotOn('knot-a', 'seg-ta', 4.5), knotOn('knot-b', 'seg-tb', 4.5),
            knotOn('knot-on-twig', 'seg-wa', 8.4), knotOn('knot-on-stick', 'seg-sa', 9.6),
            knotOn('knot-on-anchor', 'seg-aa', 1.5),
        ],
        kickstands: [{
            root: root('ks-root-a', MODEL_A, 3),
            hostKnot: knotOn('ks-knot-a', 'seg-ta', 3.5),
            kickstand: {
                id: 'ks-a', modelId: MODEL_A, rootId: 'ks-root-a', hostKnotId: 'ks-knot-a',
                hostSegmentId: 'seg-ta', hostMinT: 0.2, segments: [seg('seg-ka', 2)],
                profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 0.8 },
            },
        }],
    } as unknown as DragonfruitImportFormat;
}

/** Every entity id present, keyed by collection, for exact comparison. */
function census(): Record<string, string[]> {
    const state = getSnapshot() as unknown as Record<string, Record<string, unknown>>;
    const out: Record<string, string[]> = {};
    for (const key of SUPPORT_COLLECTION_KEYS) out[key] = Object.keys(state[key] ?? {}).sort();
    return out;
}

/** The seed entity each type's removal is driven from in the fixture. */
const SEED: Record<string, string> = {
    trunk: 'trunk-a',
    branch: 'branch-a',
    leaf: 'leaf-a',
    twig: 'twig-a',
    stick: 'stick-a',
    brace: 'brace-a',
    anchor: 'anchor-a',
    kickstand: 'ks-a',
};

let unregister: (() => void) | null = null;

function load() {
    unregister?.();
    resetStore();
    clearHistory();
    loadFromImportFormat(fixture());
    unregister = registerSupportHistoryHandlers();
}

test('every registered type has a seed in this fixture', () => {
    // Guards against a ninth type being added and silently skipping the suite.
    load();
    for (const descriptor of SUPPORT_TYPES) {
        assert.ok(SEED[descriptor.id], `${descriptor.id} has no fixture seed; add one`);
    }
});

for (const descriptor of SUPPORT_TYPES) {
    test(`${descriptor.id}: undo restores what its removal took`, () => {
        load();
        const before = census();

        const snapshot = removeSupportEntity(descriptor.id, SEED[descriptor.id]);
        assert.ok(snapshot, `removing ${descriptor.id} reported nothing`);

        const after = census();
        assert.notDeepEqual(after, before, 'the removal should have changed the store');

        pushSupportHistory({
            type: descriptor.historyRemove,
            payload: snapshot as never,
        });

        undo();
        assert.deepEqual(census(), before, `undo of ${descriptor.historyRemove} did not restore the store`);
    });

    test(`${descriptor.id}: redo removes it again`, () => {
        load();
        const before = census();

        const snapshot = removeSupportEntity(descriptor.id, SEED[descriptor.id]);
        const removed = census();

        pushSupportHistory({
            type: descriptor.historyRemove,
            payload: snapshot as never,
        });

        undo();
        assert.deepEqual(census(), before, 'undo should restore first');

        redo();
        assert.deepEqual(census(), removed, `redo of ${descriptor.historyRemove} did not re-remove`);
    });
}

test('a branch remove replays the host edits the manager attaches', () => {
    // Production spreads the remover's snapshot and adds trunkUpdate/knotUpdates
    // (useSupportInteractionManager.ts:477). Those invert with the entity, so a
    // handler that drops them leaves the host resized after undo.
    load();
    const snapshot = removeSupportEntity('branch', SEED.branch) as Record<string, unknown>;

    const knot = { id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 4.5 }, diameter: 1 };
    const widened = { ...knot, diameter: 9 };

    pushSupportHistory({
        type: 'support:remove-branch',
        payload: {
            ...snapshot,
            knotUpdates: [{ before: knot, after: widened }],
        } as never,
    });

    // Redo re-removes the branch, which cascades its host knot away, so the
    // edit is only observable on the undo side.
    undo();
    const restored = (getSnapshot() as unknown as Record<string, Record<string, { diameter: number }>>).knots['knot-a'];
    assert.equal(restored?.diameter, knot.diameter, 'undo should restore the host knot to its pre-edit size');
});

test('a remove handler reports the collections its removal shape declares', () => {
    // The handler reads the snapshot by field name, so a shape whose field is
    // renamed leaves the handler silently restoring nothing from it.
    load();
    for (const descriptor of SUPPORT_TYPES) {
        load();
        const shape = SUPPORT_REMOVAL_SHAPES[descriptor.id];
        const snapshot = removeSupportEntity(descriptor.id, SEED[descriptor.id]) as Record<string, unknown>;
        assert.ok(snapshot[shape.self], `${descriptor.id} snapshot has no "${shape.self}"`);
    }
});
