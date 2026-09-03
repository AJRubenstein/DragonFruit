import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { getSnapshot, loadFromImportFormat, resetStore, transformSupportsForModel } from '../state';
import { DEFAULT_TIP_PROFILE } from '../SupportPrimitives/ContactCone/types';

/**
 * Which entities a model transform moves.
 *
 * `transformSupportsForModel` walks the graph to decide, and the existing tests
 * only cover root anchoring. Its reachability rules are subtle: an entity moves
 * if its modelId matches OR it is connected to something that moved -- through
 * knots, shafts, and for twigs and sticks through shared JOINTS, which is a
 * wider graph than a removal cascade walks.
 */

const seg = (id: string, z: number, bottomId?: string, topId?: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: bottomId ?? `${id}-bj`, pos: { x: 0, y: 0, z }, diameter: 1 },
    topJoint: { id: topId ?? `${id}-tj`, pos: { x: 0, y: 0, z: z + 4 }, diameter: 1 },
});

const cone = (id: string, z: number) => ({
    id,
    socketJointId: `${id}-socket`,
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1,
    height: 1,
    profile: { ...DEFAULT_TIP_PROFILE },
});

/** A twig's contact disk. Unlike a cone it carries a coneAxis. */
const disk = (id: string, z: number) => ({
    id,
    socketJointId: `${id}-socket`,
    pos: { x: 0, y: 0, z },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.4,
});

const root = (id: string, modelId: string, x: number) => ({
    id, modelId,
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

/**
 * Two models. Model A carries a trunk with a branch and a leaf; model B a
 * separate trunk. A twig bridges A's trunk by sharing its top joint, and a
 * brace spans a knot on each model.
 */
function fixture() {
    return {
        version: 1,
        meta: { source: 'reach', objectCenter: { x: 0, y: 0, z: 0 } },
        roots: [root('root-a', 'model-a', 0), root('root-b', 'model-b', 40)],
        trunks: [
            { id: 'trunk-a', modelId: 'model-a', rootId: 'root-a', segments: [seg('seg-ta', 0)], contactCone: cone('cone-ta', 12) },
            { id: 'trunk-b', modelId: 'model-b', rootId: 'root-b', segments: [seg('seg-tb', 0)], contactCone: cone('cone-tb', 12) },
        ],
        branches: [
            { id: 'branch-a', modelId: 'model-a', parentKnotId: 'knot-a', segments: [seg('seg-ba', 4)], contactCone: cone('cone-ba', 16) },
        ],
        leaves: [
            { id: 'leaf-a', modelId: 'model-a', parentKnotId: 'knot-a', contactCone: cone('cone-la', 14) },
        ],
        // Shares seg-ta's top joint id, so it is connected through a joint only.
        twigs: [
            { id: 'twig-a', modelId: 'model-b', segments: [seg('seg-wa', 8, 'seg-ta-tj')], contactDiskA: disk('disk-wa1', 8), contactDiskB: disk('disk-wa2', 13) },
        ],
        sticks: [
            { id: 'stick-far', modelId: 'model-b', segments: [seg('seg-sf', 9)], contactConeA: cone('cone-sf1', 9), contactConeB: cone('cone-sf2', 14) },
        ],
        braces: [
            { id: 'brace-ab', modelId: 'model-a', startKnotId: 'knot-a', endKnotId: 'knot-b' },
        ],
        anchors: [],
        knots: [
            { id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 },
            { id: 'knot-b', parentShaftId: 'seg-tb', t: 0.5, pos: { x: 40, y: 0, z: 2 }, diameter: 1 },
        ],
        kickstands: [],
    };
}

const transform = (x: number) => ({
    position: new THREE.Vector3(x, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
});

/** Loads the fixture fresh and returns a deep copy of the loaded state. */
function load(): Record<string, Record<string, Record<string, unknown>>> {
    resetStore();
    loadFromImportFormat(fixture() as never);
    return JSON.parse(JSON.stringify(getSnapshot()));
}

/** First x coordinate that identifies where an entity sits. */
function anchorX(entity: Record<string, unknown> | undefined): number | null {
    if (!entity) return null;
    const segments = entity.segments as { bottomJoint?: { pos: { x: number } } }[] | undefined;
    if (segments?.[0]?.bottomJoint) return segments[0].bottomJoint.pos.x;
    const cone = entity.contactCone as { pos: { x: number } } | undefined;
    if (cone) return cone.pos.x;
    const disk = entity.contactDiskA as { pos: { x: number } } | undefined;
    return disk ? disk.pos.x : null;
}

/** Entities whose anchor moved between `before` and the current snapshot. */
function movedSince(before: Record<string, Record<string, Record<string, unknown>>>): string[] {
    const now = JSON.parse(JSON.stringify(getSnapshot()));
    const moved: string[] = [];
    for (const collection of ['trunks', 'branches', 'leaves', 'twigs', 'sticks']) {
        for (const id of Object.keys(before[collection] ?? {})) {
            const a = anchorX(before[collection][id]);
            const b = anchorX(now[collection]?.[id]);
            if (a !== null && b !== null && Math.abs(a - b) > 1e-6) moved.push(`${collection}:${id}`);
        }
    }
    return moved.sort();
}

test('a model transform moves exactly the connected graph', () => {
    const before = load();
    transformSupportsForModel('model-a', transform(0), transform(10));

    // trunk-a, its branch and leaf by modelId; twig-a because it shares
    // seg-ta's top joint. stick-far is on model-b with no connection.
    assert.deepEqual(movedSince(before), [
        'branches:branch-a', 'leaves:leaf-a', 'trunks:trunk-a', 'twigs:twig-a',
    ]);
});

test('an unrelated model is left alone', () => {
    const before = load();
    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.ok(!movedSince(before).includes('sticks:stick-far'));
    assert.ok(!movedSince(before).includes('trunks:trunk-b'));
});

test('the transform reports whether anything changed', () => {
    load();
    assert.equal(
        transformSupportsForModel('model-a', transform(0), transform(0)).supportsChanged,
        false,
        'an identity transform changes nothing',
    );
    assert.equal(transformSupportsForModel('model-a', transform(0), transform(10)).supportsChanged, true);
});

test('an unknown model moves nothing', () => {
    const before = load();
    const result = transformSupportsForModel('model-nope', transform(0), transform(10));
    assert.equal(result.supportsChanged, false);
    assert.deepEqual(movedSince(before), []);
});

test('an empty model id is a no-op', () => {
    load();
    const result = transformSupportsForModel('', transform(0), transform(10));
    assert.equal(result.supportsChanged, false);
    assert.equal(result.kickstandsChanged, false);
});
