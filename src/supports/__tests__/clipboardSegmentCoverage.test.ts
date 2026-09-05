import assert from 'node:assert/strict';
import test from 'node:test';

import { addKnot, addRoot, addSupportEntity, resetStore } from '../state';
import { captureModelSupportsToClipboard } from '../PlacementLogic/supportClipboard';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Which knots a copy takes with it.
 *
 * A knot is copied when its host shaft is being copied, which means the copy
 * has to know every segment it is taking. That was four hand-written loops --
 * trunk, branch, twig, stick -- so a knot on an anchor or kickstand shaft was
 * left behind.
 *
 * Only a BARE knot was lost. One with a leaf or branch on it is pulled in by
 * that child's `parentKnotId` instead, which is why the gap survived: the
 * visible cases were covered by a different path.
 */

const MODEL = 'model-a';

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const cone = () => ({
    pos: { x: 0, y: 0, z: 4 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

/** A shafted support of `typeId`, with a knot on its shaft and a leaf on that. */
function shaftWithKnot(typeId: string, extras: Record<string, unknown> = {}) {
    resetStore();
    addRoot({
        id: 'root-a', modelId: MODEL,
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);

    addSupportEntity(typeId as never, {
        id: 'host', modelId: MODEL, segments: [seg('host-seg')], contactCone: cone(), ...extras,
    } as never);

    addKnot({ id: 'knot-on-host', parentShaftId: 'host-seg', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);
}

/** The same, plus a leaf hanging from that knot. */
function shaftWithKnotAndLeaf(typeId: string, extras: Record<string, unknown> = {}) {
    shaftWithKnot(typeId, extras);
    addSupportEntity('leaf', { id: 'leaf-a', modelId: MODEL, parentKnotId: 'knot-on-host', contactCone: cone() } as never);
}

test('a bare knot on any shafted type is copied with it', () => {
    // Bare on purpose: a knot with a leaf on it is pulled in by the leaf's
    // parentKnotId instead, so only an empty one exercises the segment set.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const extras = descriptor.id === 'kickstand'
            ? { rootId: 'root-a', hostKnotId: 'knot-on-host', hostSegmentId: 'host-seg', hostMinT: 0.2 }
            : descriptor.id === 'trunk' ? { rootId: 'root-a' } : {};

        shaftWithKnot(descriptor.id, extras);
        const payload = captureModelSupportsToClipboard(MODEL);
        assert.ok(payload, `${descriptor.id}: nothing captured`);

        const knotIds = payload.knots.map((knot) => knot.id);
        assert.ok(
            knotIds.includes('knot-on-host'),
            `${descriptor.id}: the knot on its shaft was left behind`,
        );
    }
});

test('a leaf hanging from that knot comes too', () => {
    shaftWithKnotAndLeaf('anchor');
    const payload = captureModelSupportsToClipboard(MODEL);

    assert.ok(payload);
    assert.ok(payload.leaves.some((leaf) => leaf.id === 'leaf-a'), 'the leaf was not copied');
});

test('a brace contributes its prefixed segment id, not a segment list', () => {
    // Brace has no segments of its own; its shaft is addressed as
    // `braceSegment:<id>`, which is what a knot on it points at.
    resetStore();
    addRoot({
        id: 'root-a', modelId: MODEL,
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('trunk', { id: 'trunk-a', modelId: MODEL, rootId: 'root-a', segments: [seg('t-seg')], contactCone: cone() } as never);
    addKnot({ id: 'k1', parentShaftId: 't-seg', t: 0.3, pos: { x: 0, y: 0, z: 1 }, diameter: 1 } as never);
    addKnot({ id: 'k2', parentShaftId: 't-seg', t: 0.7, pos: { x: 0, y: 0, z: 3 }, diameter: 1 } as never);
    addSupportEntity('brace', { id: 'brace-a', modelId: MODEL, startKnotId: 'k1', endKnotId: 'k2' } as never);
    addKnot({ id: 'knot-on-brace', parentShaftId: 'braceSegment:brace-a', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);

    const payload = captureModelSupportsToClipboard(MODEL);
    assert.ok(payload);
    assert.ok(
        payload.knots.some((knot) => knot.id === 'knot-on-brace'),
        'a knot on a brace segment was left behind',
    );
});
