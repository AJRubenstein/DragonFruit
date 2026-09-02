import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addBrace,
    addStick,
    getSnapshot,
    loadFromImportFormat,
    resetStore,
    setSelectedId,
} from '../state';
import type { DragonfruitImportFormat } from '../types';
import { DEFAULT_TIP_PROFILE } from '../SupportPrimitives/ContactCone/types';

/**
 * Covers the selection lookup cache after it was derived from the registry.
 *
 * It resolves a primitive id (joint / segment / contact disk) to its category by
 * walking every type that contributes one. Miss a type and its primitives become
 * unselectable -- silently, since the id simply resolves to null.
 */

const MODEL = 'model-a';

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

function fixture(): DragonfruitImportFormat {
    return {
        version: 1,
        meta: { source: 'selection-cache', objectCenter: { x: 0, y: 0, z: 0 } },
        roots: [{
            id: 'root-a', modelId: MODEL,
            transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
            diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
        }],
        trunks: [{
            id: 'trunk-a', modelId: MODEL, rootId: 'root-a',
            segments: [seg('seg-ta', 4)], contactCone: cone('cone-ta', 12),
        }],
        branches: [],
        leaves: [],
        twigs: [{
            id: 'twig-a', modelId: MODEL, segments: [seg('seg-wa', 8)],
            contactDiskA: cone('disk-wa1', 8), contactDiskB: cone('disk-wa2', 13),
        }] as never,
        sticks: [{
            id: 'stick-a', modelId: MODEL, segments: [seg('seg-sa', 9)],
            contactConeA: cone('cone-sa1', 9), contactConeB: cone('cone-sa2', 14),
        }] as never,
        braces: [],
        anchors: [{
            id: 'anchor-a', modelId: MODEL,
            rootPos: { x: 5, y: 0, z: 0 }, rootBaseDiameter: 2, rootTopDiameter: 1, rootHeight: 1,
            joint: { id: 'anchor-a-joint', pos: { x: 5, y: 0, z: 1 }, diameter: 1 },
            segments: [seg('seg-aa', 3)], contactCone: cone('cone-aa', 7),
        }] as never,
        knots: [],
    };
}

/** Selection category the store resolves for `id`. */
function categoryOf(id: string): string | null | undefined {
    setSelectedId(null);
    setSelectedId(id);
    return getSnapshot().selectedCategory;
}

function load() {
    resetStore();
    loadFromImportFormat(fixture());
}

test('segments and joints resolve for every shafted type', () => {
    load();
    for (const segmentId of ['seg-ta', 'seg-wa', 'seg-sa', 'seg-aa']) {
        assert.equal(categoryOf(segmentId), 'segment', segmentId);
        assert.equal(categoryOf(`${segmentId}-tj`), 'joint', `${segmentId} top joint`);
        assert.equal(categoryOf(`${segmentId}-bj`), 'joint', `${segmentId} bottom joint`);
    }
});

test('contact primitives resolve whatever the type calls them', () => {
    // The field names differ per type -- contactCone, contactDiskA/B,
    // contactConeA/B -- which is why the registry declares them.
    load();
    for (const contactId of ['cone-ta', 'disk-wa1', 'disk-wa2', 'cone-sa1', 'cone-sa2', 'cone-aa']) {
        assert.equal(categoryOf(contactId), 'contactDisk', contactId);
    }
});

test('an unknown id resolves to no category', () => {
    load();
    assert.equal(categoryOf('not-a-real-id'), null);
});

test('the cache refreshes when a watched collection changes', () => {
    load();
    assert.equal(categoryOf('seg-new'), null, 'not present yet');

    addStick({
        id: 'stick-new', modelId: MODEL, segments: [seg('seg-new', 5)],
        contactConeA: cone('cone-new', 5), contactConeB: cone('cone-new-b', 9),
    } as never);

    assert.equal(categoryOf('seg-new'), 'segment', 'cache must see the new stick');
    assert.equal(categoryOf('cone-new'), 'contactDisk');
});

test('adding a brace does not disturb resolution', () => {
    // Braces contribute nothing to the cache (no segments, no contact fields),
    // so they are deliberately not watched. Resolution must still be correct
    // after one is added.
    load();
    addBrace({
        id: 'brace-a', modelId: MODEL,
        startKnotId: 'k1', endKnotId: 'k2', profile: { diameter: 0.8 },
    } as never);

    assert.equal(categoryOf('seg-ta'), 'segment');
    assert.equal(categoryOf('cone-ta'), 'contactDisk');
    assert.equal(categoryOf('brace-a'), 'brace');
});
