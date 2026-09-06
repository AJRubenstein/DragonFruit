import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
    diskTipCenter,
    recomputeConeForSocket,
    recomputeDiskForSocket,
    resolveDraggedContacts,
} from '../SupportPrimitives/Joint/resolveDraggedContacts';
import { calculateDiskThickness } from '../SupportPrimitives/ContactDisk/contactDiskUtils';
import type { ContactDisk, Segment, Stick, Twig } from '../types';

/**
 * One contact re-solve, against the four hand-written blocks it replaces.
 *
 * The pointer path and the gizmo each carried their own twig block and their
 * own stick block. This reproduces what those computed, inline and unchanged,
 * and asserts the shared function matches -- so the collapse is checked against
 * the old arithmetic rather than against itself.
 */

const disk = (id: string, z: number): ContactDisk => ({
    id,
    pos: { x: 0, y: 0, z },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    coneAxis: { x: 0, y: 0, z: 1 },
    contactDiameterMm: 0.6,
    profile: { type: 'disk', diskThicknessMm: 0.1, maxStandoffMm: 0.35, standoffAngleThreshold: Math.PI / 4 },
} as unknown as ContactDisk);

const cone = (id: string, socketJointId: string, z: number) => ({
    id,
    socketJointId,
    pos: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', contactDiameterMm: 0.4, bodyDiameterMm: 1, lengthMm: 2 },
});

const segment = (id: string, zBottom: number, zTop: number): Segment => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: zBottom }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: zTop }, diameter: 1 },
} as Segment);

/* ---- what the twig blocks computed, transcribed ---- */

function twigByHand(twig: Twig, jointId: string, nextSegments: Segment[]) {
    const firstSegment = nextSegments[0];
    const lastSegment = nextSegments[nextSegments.length - 1];
    const movingBottomEndpoint = firstSegment?.bottomJoint?.id === jointId;
    const movingTopEndpoint = lastSegment?.topJoint?.id === jointId;

    let nextDiskA = twig.contactDiskA;
    let nextDiskB = twig.contactDiskB;
    let adjustedSegments = nextSegments;

    if (movingBottomEndpoint && firstSegment?.bottomJoint) {
        const otherSocket = lastSegment?.topJoint?.pos ?? diskTipCenter(nextDiskB);
        const desiredSocketA = firstSegment.bottomJoint.pos;
        const axisHint = new THREE.Vector3(
            otherSocket.x - desiredSocketA.x,
            otherSocket.y - desiredSocketA.y,
            otherSocket.z - desiredSocketA.z,
        );
        const recomputedA = recomputeDiskForSocket(twig.contactDiskA, desiredSocketA, axisHint);
        nextDiskA = recomputedA.disk;
        adjustedSegments = adjustedSegments.map((s, i) => (
            i !== 0 || !s.bottomJoint ? s : { ...s, bottomJoint: { ...s.bottomJoint, pos: recomputedA.socket } }
        ));
    }

    if (movingTopEndpoint && lastSegment?.topJoint) {
        const firstAfterAdjust = adjustedSegments[0];
        const otherSocket = firstAfterAdjust?.bottomJoint?.pos ?? diskTipCenter(nextDiskA);
        const desiredSocketB = lastSegment.topJoint.pos;
        const axisHint = new THREE.Vector3(
            otherSocket.x - desiredSocketB.x,
            otherSocket.y - desiredSocketB.y,
            otherSocket.z - desiredSocketB.z,
        );
        const recomputedB = recomputeDiskForSocket(twig.contactDiskB, desiredSocketB, axisHint);
        nextDiskB = recomputedB.disk;
        adjustedSegments = adjustedSegments.map((s, i) => (
            i !== adjustedSegments.length - 1 || !s.topJoint
                ? s
                : { ...s, topJoint: { ...s.topJoint, pos: recomputedB.socket } }
        ));
    }

    return { ...twig, segments: adjustedSegments, contactDiskA: nextDiskA, contactDiskB: nextDiskB };
}

/* ---- what the stick blocks computed, transcribed ---- */

function stickByHand(stick: Stick, jointId: string, nextSegments: Segment[], newPos: { x: number; y: number; z: number }) {
    const nextConeA = stick.contactConeA?.socketJointId === jointId
        ? recomputeConeForSocket(stick.contactConeA as never, newPos)
        : stick.contactConeA;
    const nextConeB = stick.contactConeB?.socketJointId === jointId
        ? recomputeConeForSocket(stick.contactConeB as never, newPos)
        : stick.contactConeB;
    return { ...stick, segments: nextSegments, contactConeA: nextConeA, contactConeB: nextConeB };
}

test('a twig endpoint drag matches the hand-written block', () => {
    const twig = {
        id: 'twig-a', modelId: 'model-a',
        segments: [segment('s0', 2, 8)],
        contactDiskA: disk('diskA', 1),
        contactDiskB: disk('diskB', 9),
    } as unknown as Twig;

    // Bottom endpoint dragged to a new position.
    const moved = [segment('s0', 3.5, 8)];
    const jointId = 's0-bj';

    assert.deepEqual(
        resolveDraggedContacts('twig', twig as never, jointId, moved),
        twigByHand(twig, jointId, moved),
    );
});

test('a twig top-endpoint drag matches the hand-written block', () => {
    const twig = {
        id: 'twig-a', modelId: 'model-a',
        segments: [segment('s0', 2, 8)],
        contactDiskA: disk('diskA', 1),
        contactDiskB: disk('diskB', 9),
    } as unknown as Twig;

    const moved = [segment('s0', 2, 7.25)];
    const jointId = 's0-tj';

    assert.deepEqual(
        resolveDraggedContacts('twig', twig as never, jointId, moved),
        twigByHand(twig, jointId, moved),
    );
});

test('the axis hint aims the disk at the far end, not at its own socket', () => {
    // Off-axis on purpose: with everything on Z the hint and the
    // contact->socket vector coincide, and dropping the hint changes nothing.
    const twig = {
        id: 'twig-a', modelId: 'model-a',
        segments: [segment('s0', 2, 8)],
        contactDiskA: disk('diskA', 1),
        contactDiskB: disk('diskB', 9),
    } as unknown as Twig;

    const skewed: Segment[] = [{
        id: 's0', diameter: 1,
        bottomJoint: { id: 's0-bj', pos: { x: 4, y: -3, z: 3.5 }, diameter: 1 },
        topJoint: { id: 's0-tj', pos: { x: -2, y: 5, z: 8 }, diameter: 1 },
    } as Segment];

    const viaHelper = resolveDraggedContacts('twig', twig as never, 's0-bj', skewed) as unknown as Twig;
    const byHand = twigByHand(twig, 's0-bj', skewed);
    assert.deepEqual(viaHelper, byHand);

    // And the hint must actually matter here, or this case proves nothing.
    const withoutHint = recomputeDiskForSocket(twig.contactDiskA, skewed[0].bottomJoint!.pos);
    assert.notDeepEqual(
        viaHelper.contactDiskA.coneAxis,
        withoutHint.disk.coneAxis,
        'the axis hint must change the result for this fixture',
    );
});

test('a stick endpoint drag matches the hand-written block', () => {
    const stick = {
        id: 'stick-a', modelId: 'model-a',
        segments: [segment('s0', 2, 8)],
        contactConeA: cone('coneA', 's0-bj', 1),
        contactConeB: cone('coneB', 's0-tj', 9),
    } as unknown as Stick;

    const moved = [segment('s0', 3.5, 8)];
    const jointId = 's0-bj';
    const newPos = { x: 0, y: 0, z: 3.5 };

    assert.deepEqual(
        resolveDraggedContacts('stick', stick as never, jointId, moved),
        stickByHand(stick, jointId, moved, newPos),
    );
});

test('a mid-shaft joint leaves both contacts alone', () => {
    // Neither endpoint moved, so nothing should be re-solved.
    const stick = {
        id: 'stick-a', modelId: 'model-a',
        segments: [segment('s0', 2, 5), segment('s1', 5, 8)],
        contactConeA: cone('coneA', 's0-bj', 1),
        contactConeB: cone('coneB', 's1-tj', 9),
    } as unknown as Stick;

    const moved = [segment('s0', 2, 5.5), segment('s1', 5.5, 8)];
    const result = resolveDraggedContacts('stick', stick as never, 's0-tj', moved) as unknown as Stick;

    assert.deepEqual(result.contactConeA, stick.contactConeA);
    assert.deepEqual(result.contactConeB, stick.contactConeB);
    assert.deepEqual(result.segments, moved);
});

test('a type with no contacts just takes the moved segments', () => {
    const kickstand = { id: 'k-a', segments: [segment('s0', 2, 8)] };
    const moved = [segment('s0', 3, 8)];
    assert.deepEqual(
        resolveDraggedContacts('kickstand', kickstand as never, 's0-bj', moved),
        { ...kickstand, segments: moved },
    );
});

test('diskTipCenter is the disk position plus its standoff', () => {
    const d = disk('d', 4);
    const thickness = calculateDiskThickness(d.surfaceNormal, d.coneAxis, d.profile);
    assert.deepEqual(diskTipCenter(d), { x: 0, y: 0, z: 4 + thickness });
});
