import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildStraightSocketRescueCandidates,
    findMixedSocketRescueCandidate,
    findStraightSocketRescueCandidate,
} from '../PlacementLogic/Pathfinding/SmartPlacementV2';
import type { SDFCache } from '../PlacementLogic/Pathfinding/SDFCache';

function makeOpenSdf(overrides?: Partial<Pick<SDFCache, 'distanceAt' | 'isBlocked' | 'segmentBlocked'>>): SDFCache {
    return {
        cellSize: 0.5,
        distanceAt: () => Infinity,
        isBlocked: () => false,
        segmentBlocked: () => false,
        ...overrides,
    } as SDFCache;
}

test('buildStraightSocketRescueCandidates expands outward from the blocked socket', () => {
    const candidates = buildStraightSocketRescueCandidates({
        socketPos: { x: 0, y: 0, z: 10 },
        maxTotalLateralMm: 2,
    });

    assert.deepEqual(candidates[0], { x: 0, y: 0, z: 10 });
    assert.ok(candidates.some((candidate) => Math.abs(candidate.x - 1) < 0.000001 && Math.abs(candidate.y) < 0.000001));
});

test('buildStraightSocketRescueCandidates caps pure straight rescue stretch before mixed rescue takes over', () => {
    const candidates = buildStraightSocketRescueCandidates({
        socketPos: { x: 0, y: 0, z: 10 },
        maxTotalLateralMm: 10,
    });

    const maxRadius = Math.max(...candidates.map((candidate) => Math.hypot(candidate.x, candidate.y)));
    assert.ok(maxRadius <= 4.000001, `expected straight rescue max radius <= 4mm, got ${maxRadius.toFixed(2)}mm`);
});

test('findStraightSocketRescueCandidate finds a nearby clear straight support when the default socket column is blocked', () => {
    const sdf = makeOpenSdf({
        segmentBlocked: (ax: number, _ay: number, _az: number, bx: number) => Math.abs(ax) < 0.000001 && Math.abs(bx) < 0.000001,
    });

    const rescued = findStraightSocketRescueCandidate({
        socketPos: { x: 0, y: 0, z: 10 },
        rootTopZ: 2,
        maxTotalLateralMm: 2,
        gridEnabled: false,
        spacingMm: 4,
        maxNearestNodeSearchRings: 1,
        sdf,
        diskHeight: 1,
        coneHeight: 1,
        rootsRadius: 1.5,
        shaftRadius: 0.75,
        clearance: 1,
    });

    assert.ok(rescued);
    assert.notDeepEqual(rescued?.socketPos, { x: 0, y: 0, z: 10 });
    assert.equal(rescued?.base.basePos.z, 0);
});

test('findMixedSocketRescueCandidate allows a small socket stretch plus a shaft bend before resorting to a farther straight rescue', () => {
    const sdf = makeOpenSdf({
        segmentBlocked: (ax: number, _ay: number, _az: number, bx: number, _by: number) => {
            const nearlyVertical = Math.abs(ax - bx) < 0.2;
            const insideBlockedColumn = Math.abs(ax) < 1.05 && Math.abs(bx) < 1.05;
            return nearlyVertical && insideBlockedColumn;
        },
    });

    const rescued = findMixedSocketRescueCandidate({
        socketPos: { x: 0, y: 0, z: 10 },
        rootTopZ: 2,
        maxTotalLateralMm: 4,
        gridEnabled: false,
        spacingMm: 4,
        maxNearestNodeSearchRings: 1,
        sdf,
        diskHeight: 1,
        coneHeight: 1,
        rootsRadius: 1.5,
        shaftRadius: 0.75,
        clearance: 1,
        maxAngleFromVerticalDeg: 80,
    });

    assert.ok(rescued);
    assert.ok(Math.abs(rescued!.socketPos.x) <= 1.000001);
    assert.ok(rescued!.joints.length >= 1);
});