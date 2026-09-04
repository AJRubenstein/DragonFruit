import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { getSnapshot, loadFromImportFormat, resetStore, transformSupportsForModel } from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import { DEFAULT_TIP_PROFILE } from '../SupportPrimitives/ContactCone/types';

/**
 * How a model transform REACHES an entity, as opposed to what it then writes.
 *
 * The apply phase is derived and covered; the walk had no coverage at all.
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

const transform = (x: number) => ({
    position: new THREE.Vector3(x, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
});

const base = () => ({
    version: 1,
    meta: { source: 'walk', objectCenter: { x: 0, y: 0, z: 0 } },
    roots: [], trunks: [], branches: [], leaves: [], twigs: [],
    sticks: [], braces: [], anchors: [], knots: [], kickstands: [],
});

function load(fixture: Record<string, unknown>) {
    resetStore();
    loadFromImportFormat(fixture as never);
}

function knotX(id: string): number {
    const knot = getSnapshot().knots[id];
    assert.ok(knot, `knot ${id} should exist`);
    return knot.pos.x;
}

/** Where an entity's first segment starts, as a stand-in for where it sits. */
function firstJointX(collection: 'twigs' | 'sticks' | 'branches', id: string): number {
    const entity = getSnapshot()[collection][id] as { segments?: { bottomJoint?: { pos: { x: number } } }[] } | undefined;
    const joint = entity?.segments?.[0]?.bottomJoint;
    assert.ok(joint, `${collection}:${id} should have a first segment joint`);
    return joint.pos.x;
}

/** A trunk on model-a, so anything hanging off it is reachable. */
const trunkOnA = () => ({
    roots: [root('root-a', 'model-a', 0)],
    trunks: [{
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
        segments: [seg('seg-ta', 0)], contactCone: cone('cone-ta', 12),
    }],
});

test('a leaf is reached through the shaft its parent knot sits on', () => {
    // The leaf declares the OTHER model: only the knot connects it.
    load({
        ...base(),
        ...trunkOnA(),
        knots: [{ id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 }],
        leaves: [{ id: 'leaf-a', modelId: 'model-b', parentKnotId: 'knot-a', contactCone: cone('cone-la', 3) }],
    });

    transformSupportsForModel('model-a', transform(0), transform(10));

    assert.equal(getSnapshot().leaves['leaf-a'].contactCone.pos.x, 10, 'the leaf follows the shaft it hangs from');
    assert.equal(knotX('knot-a'), 10, 'and so does the knot');
});

test('a brace is reached through a knot on another brace segment', () => {
    load({
        ...base(),
        roots: [root('root-a', 'model-a', 0), root('root-b', 'model-a', 20)],
        trunks: [
            { id: 'trunk-a', modelId: 'model-a', rootId: 'root-a', segments: [seg('seg-ta', 0)], contactCone: cone('cone-ta', 12) },
            { id: 'trunk-b', modelId: 'model-a', rootId: 'root-b', segments: [seg('seg-tb', 0)], contactCone: cone('cone-tb', 12) },
        ],
        knots: [
            { id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 },
            { id: 'knot-b', parentShaftId: 'seg-tb', t: 0.5, pos: { x: 20, y: 0, z: 2 }, diameter: 1 },
            // Only reachable once brace-1 itself is.
            { id: 'knot-on-brace', parentShaftId: 'braceSegment:brace-1', t: 0.5, pos: { x: 10, y: 0, z: 2 }, diameter: 1 },
            { id: 'knot-far', parentShaftId: 'seg-ta', t: 0.8, pos: { x: 0, y: 0, z: 3 }, diameter: 1 },
        ],
        braces: [
            { id: 'brace-1', modelId: 'model-a', startKnotId: 'knot-a', endKnotId: 'knot-b' },
            { id: 'brace-2', modelId: 'model-b', startKnotId: 'knot-on-brace', endKnotId: 'knot-far' },
        ],
    });

    // Knot positions are recomputed from their host on load, so compare
    // against what the store holds rather than the fixture literal.
    const before = knotX('knot-on-brace');
    transformSupportsForModel('model-a', transform(0), transform(10));

    assert.equal(knotX('knot-on-brace'), before + 10, 'a knot on a moved brace segment moves');
});

test('a twig is reached by sharing a joint with a moved segment', () => {
    load({
        ...base(),
        ...trunkOnA(),
        twigs: [{
            id: 'twig-a', modelId: 'model-b',
            segments: [seg('seg-wa', 8, 'seg-ta-tj')],
            contactDiskA: disk('disk-wa1', 8), contactDiskB: disk('disk-wa2', 13),
        }],
    });

    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.equal(firstJointX('twigs', 'twig-a'), 10);
});

test('a twig sharing no joint is left alone', () => {
    load({
        ...base(),
        ...trunkOnA(),
        twigs: [{
            id: 'twig-a', modelId: 'model-b',
            segments: [seg('seg-wa', 8)],
            contactDiskA: disk('disk-wa1', 8), contactDiskB: disk('disk-wa2', 13),
        }],
    });

    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.equal(firstJointX('twigs', 'twig-a'), 0);
});

test('a stick is reached by sharing a joint, like a twig', () => {
    load({
        ...base(),
        ...trunkOnA(),
        sticks: [{
            id: 'stick-a', modelId: 'model-b',
            segments: [seg('seg-sa', 8, 'seg-ta-tj')],
            contactConeA: cone('cone-sa1', 8), contactConeB: cone('cone-sa2', 13),
        }],
    });

    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.equal(firstJointX('sticks', 'stick-a'), 10);
});

test('reachability is transitive down a branch chain', () => {
    const knots = [];
    const branches = [];
    let shaft = 'seg-ta';
    for (let i = 0; i < 5; i++) {
        knots.push({ id: `knot-${i}`, parentShaftId: shaft, t: 0.5, pos: { x: 0, y: 0, z: 2 + i }, diameter: 1 });
        branches.push({
            id: `branch-${i}`, modelId: 'model-b', parentKnotId: `knot-${i}`,
            segments: [seg(`seg-b${i}`, 4 + i)], contactCone: cone(`cone-b${i}`, 16 + i),
        });
        shaft = `seg-b${i}`;
    }

    load({ ...base(), ...trunkOnA(), knots, branches });

    transformSupportsForModel('model-a', transform(0), transform(10));

    const state = getSnapshot();
    for (let i = 0; i < 5; i++) {
        assert.equal(firstJointX('branches', `branch-${i}`), 10, `branch-${i} at depth ${i}`);
        assert.equal(state.knots[`knot-${i}`].pos.x, 10, `knot-${i}`);
    }
});

test('a kickstand is reached through its host knot', () => {
    // The import format still carries the {kickstand, root, hostKnot} bundle
    // even though the store holds kickstands as ordinary entities.
    load({
        ...base(),
        ...trunkOnA(),
        kickstands: [{
            kickstand: {
                id: 'ks-a', modelId: 'model-b', rootId: 'ks-root', hostKnotId: 'ks-host',
                hostSegmentId: 'seg-ta', hostMinT: 0.2, segments: [seg('seg-ka', 0)],
                profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 0.8 },
            },
            root: root('ks-root', 'model-b', 3),
            hostKnot: { id: 'ks-host', parentShaftId: 'seg-ta', t: 0.3, pos: { x: 0, y: 0, z: 1 }, diameter: 1 },
        }],
    });

    const before = knotX('ks-host');
    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.equal(knotX('ks-host'), before + 10, 'the host knot moves with the trunk shaft');
});

test('knot-hosted and joint-shared are the two reachability rules', () => {
    const knotHosted = SUPPORT_TYPES
        .filter((d) => d.edges.some((e) => e.to === 'knots' && e.ownership === 'hostedBy'))
        .map((d) => d.id).sort();
    assert.deepEqual(knotHosted, ['brace', 'branch', 'kickstand', 'leaf']);

    const jointShared = SUPPORT_TYPES
        .filter((d) => d.hasSegments && !d.edges.some((e) => e.to === 'knots' && e.ownership === 'hostedBy'))
        .map((d) => d.id).sort();
    assert.deepEqual(jointShared, ['anchor', 'stick', 'trunk', 'twig']);
});

test('a knot on any shafted type resolves its model', () => {
    // The segment -> modelId index covered four of the six shafted types, so a
    // leaf hanging off an anchor or kickstand knot stayed behind when its
    // model moved.
    load({
        ...base(),
        anchors: [{
            id: 'anchor-a', modelId: 'model-a',
            rootPos: { x: 0, y: 0, z: 0 }, rootBaseDiameter: 2, rootTopDiameter: 1, rootHeight: 1,
            joint: { id: 'anchor-a-joint', pos: { x: 0, y: 0, z: 1 }, diameter: 1 },
            segments: [seg('seg-aa', 0)], contactCone: cone('cone-aa', 8),
        }],
        knots: [{ id: 'knot-on-anchor', parentShaftId: 'seg-aa', t: 0.5, pos: { x: 0, y: 0, z: 3 }, diameter: 1 }],
        leaves: [{ id: 'leaf-a', parentKnotId: 'knot-on-anchor', contactCone: cone('cone-la', 4) }],
    });

    const before = getSnapshot().leaves['leaf-a'].contactCone.pos.x;
    transformSupportsForModel('model-a', transform(0), transform(10));
    assert.equal(
        getSnapshot().leaves['leaf-a'].contactCone.pos.x,
        before + 10,
        'a leaf on an anchor-hosted knot moves with its model',
    );
});
