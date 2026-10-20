import type { Joint, LimitationCode, Segment, Vec3 } from '../../types';
import type { SupportData } from '../../rendering/SupportBuilder';
import { getJointDiameter } from '../../constants';
import { isShaftBlocked } from '../../PlacementLogic/CollisionAvoidance';
import * as THREE from 'three';
import { assertKickstandHostKind, clampKickstandHostT } from './kickstandRules';
import {
    getKickstandKnotDiameterMm,
    getKickstandRootProfile,
    resolveKickstandLayout,
} from './kickstandSettings';
import type { KickstandBuildInput, KickstandBuildResult } from './types';
import { v4 as uuidv4 } from 'uuid';

function createJoint(pos: { x: number; y: number; z: number }, diameter: number): Joint {
    return {
        id: uuidv4(),
        pos,
        diameter,
    };
}

function createRootAndJointHeights(input: KickstandBuildInput, rootTopZ: number) {
    const layout = resolveKickstandLayout(input.layoutOverrides);

    const hostZ = input.host.pos.z;
    const rawRise = hostZ - rootTopZ;

    // Kickstands are grounded columns first. If the host is very low,
    // keep a tiny positive vertical chain and let the terminal segment angle as needed.
    const effectiveRise = Math.max(rawRise, layout.minJointSpacingMm * 2 + layout.minTerminalClearanceMm + 0.01);

    let firstJointZ = rootTopZ + effectiveRise * layout.firstJointHeightRatio;
    let secondJointZ = rootTopZ + effectiveRise * layout.secondJointHeightRatio;

    const minFirst = rootTopZ + 0.01;
    const maxSecond = Math.max(minFirst + layout.minJointSpacingMm, hostZ - layout.minTerminalClearanceMm);

    if (secondJointZ > maxSecond) secondJointZ = maxSecond;

    const maxFirst = secondJointZ - layout.minJointSpacingMm;
    if (firstJointZ > maxFirst) firstJointZ = maxFirst;
    if (firstJointZ < minFirst) firstJointZ = minFirst;

    if (secondJointZ - firstJointZ < layout.minJointSpacingMm) {
        secondJointZ = firstJointZ + layout.minJointSpacingMm;
    }

    const maxThird = Math.max(secondJointZ + layout.minJointSpacingMm, hostZ - layout.minTerminalClearanceMm);
    const thirdJointZ = THREE.MathUtils.clamp(
        secondJointZ + Math.max(layout.minJointSpacingMm, (hostZ - secondJointZ) * 0.6),
        secondJointZ + layout.minJointSpacingMm,
        maxThird,
    );

    return { firstJointZ, secondJointZ, thirdJointZ, layout };
}

/** At least this far from horizontal, matching the shaft constraint's 80deg default. */
const DEFAULT_MAX_SHAFT_ANGLE_DEG = 80;

/**
 * Is the column a shape a printer can build?
 *
 * Every run has to climb: one that descends means the chain overshot the host
 * and doubles back, which no amount of angle allowance makes printable. The
 * rest obey the same limit from vertical that a shaft does, so a grid-snapped
 * column is held to what a freely placed one already was.
 */
function columnShapeError(
    segments: Segment[],
    hostPos: Vec3,
    maxShaftAngleDeg: number | undefined,
): LimitationCode | undefined {
    const limitDeg = maxShaftAngleDeg ?? DEFAULT_MAX_SHAFT_ANGLE_DEG;
    const points: Vec3[] = [];
    for (const segment of segments) {
        if (segment.bottomJoint?.pos && points.length === 0) points.push(segment.bottomJoint.pos);
        if (segment.topJoint?.pos) points.push(segment.topJoint.pos);
    }
    points.push(hostPos);

    for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const dz = end.z - start.z;
        const span = Math.hypot(end.x - start.x, end.y - start.y, dz);
        if (span < 1e-6) continue;
        const angleFromUpDeg = Math.acos(Math.max(-1, Math.min(1, dz / span))) * (180 / Math.PI);
        if (angleFromUpDeg > limitDeg) return 'ANGLE_TOO_STEEP';
    }
    return undefined;
}

/**
 * Does the column run through the model on its way up to the host?
 *
 * The topmost joint meets the host support, which sits on the surface, so that
 * end is inside material by construction. Pulling the probe back by a shaft
 * radius keeps the host's own contact from reading as a collision, the way a
 * stick insets both of its sockets.
 */
function columnCollision(
    segments: Segment[],
    bodyDiameterMm: number,
    mesh: THREE.Mesh | undefined,
): LimitationCode | undefined {
    if (!mesh) return undefined;

    const radius = Math.max(0.001, bodyDiameterMm / 2);
    const points: Vec3[] = [];
    for (const segment of segments) {
        if (segment.bottomJoint?.pos && points.length === 0) points.push(segment.bottomJoint.pos);
        if (segment.topJoint?.pos) points.push(segment.topJoint.pos);
    }

    for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const isTopRun = i === points.length - 2;
        const probeEnd = isTopRun ? insetTowards(end, start, radius) : end;
        if (isShaftBlocked(start, probeEnd, radius, mesh)) return 'COLLISION_WITH_MODEL';
    }
    return undefined;
}

/** `from` pulled back toward `towards` by `distanceMm`, or unchanged if shorter. */
function insetTowards(from: Vec3, towards: Vec3, distanceMm: number): Vec3 {
    const dx = towards.x - from.x;
    const dy = towards.y - from.y;
    const dz = towards.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length <= distanceMm) return from;
    const scale = distanceMm / length;
    return { x: from.x + dx * scale, y: from.y + dy * scale, z: from.z + dz * scale };
}

export function buildKickstandData(input: KickstandBuildInput): KickstandBuildResult {
    assertKickstandHostKind(input.host.supportKind);

    const rootProfile = getKickstandRootProfile();
    const bodyDiameterMm = Math.max(0.001, input.host.diameterMm);
    const jointDiameterMm = getJointDiameter(bodyDiameterMm);

    const rootId = uuidv4();
    const hostKnotId = uuidv4();
    const kickstandId = uuidv4();

    const root = {
        id: rootId,
        modelId: input.modelId,
        transform: {
            pos: input.rootPos,
            rot: { x: 0, y: 0, z: 0, w: 1 },
        },
        diameter: rootProfile.diameter,
        diskHeight: rootProfile.diskHeight,
        coneHeight: rootProfile.coneHeight,
    };

    const rootTopZ = input.rootPos.z + root.diskHeight + root.coneHeight;
    const { firstJointZ, secondJointZ, thirdJointZ } = createRootAndJointHeights(input, rootTopZ);

    const joint1 = createJoint(
        {
            x: input.rootPos.x,
            y: input.rootPos.y,
            z: firstJointZ,
        },
        jointDiameterMm,
    );

    const joint2 = createJoint(
        {
            x: input.rootPos.x,
            y: input.rootPos.y,
            z: secondJointZ,
        },
        jointDiameterMm,
    );

    const topBlend = 0.65;
    const joint3 = createJoint(
        {
            x: input.rootPos.x + (input.host.pos.x - input.rootPos.x) * topBlend,
            y: input.rootPos.y + (input.host.pos.y - input.rootPos.y) * topBlend,
            z: thirdJointZ,
        },
        jointDiameterMm,
    );

    const segment1: Segment = {
        id: uuidv4(),
        diameter: bodyDiameterMm,
        topJoint: joint1,
    };

    const segment2: Segment = {
        id: uuidv4(),
        diameter: bodyDiameterMm,
        bottomJoint: joint1,
        topJoint: joint2,
    };

    const terminalSegment: Segment = {
        id: uuidv4(),
        diameter: bodyDiameterMm,
        bottomJoint: joint3,
    };

    const upperSegment: Segment = {
        id: uuidv4(),
        diameter: bodyDiameterMm,
        bottomJoint: joint2,
        topJoint: joint3,
    };

    const hostT = clampKickstandHostT(input.host.t, input.host.minT ?? 0);

    const hostKnot = {
        id: hostKnotId,
        parentShaftId: input.host.segmentId,
        t: hostT,
        pos: input.host.pos,
        diameter: getKickstandKnotDiameterMm(input.host.diameterMm),
    };

    // An authored column is already straight, so it keeps that shape: one column
    // segment and one terminal. The derived joints exist to give a placed
    // kickstand something to drag, and would bend it.
    const columnTop = input.authoredColumn
        ? createJoint(input.authoredColumn.topPos, jointDiameterMm)
        : null;
    const segments = columnTop
        ? [
            { id: uuidv4(), diameter: bodyDiameterMm, topJoint: columnTop },
            { id: uuidv4(), diameter: bodyDiameterMm, bottomJoint: columnTop },
        ]
        : [segment1, segment2, upperSegment, terminalSegment];

    const kickstand = {
        id: kickstandId,
        modelId: input.modelId,
        rootId,
        hostKnotId,
        hostSegmentId: input.host.segmentId,
        hostMinT: input.host.minT ?? 0,
        segments,
        profile: {
            bodyDiameterMm,
            terminalStartDiameterMm: bodyDiameterMm,
            terminalEndDiameterMm: Math.max(0.001, input.host.diameterMm),
        },
    };

    return {
        root,
        hostKnot,
        kickstand,
        error: columnShapeError(segments, hostKnot.pos, input.maxShaftAngleDeg)
            ?? columnCollision(segments, bodyDiameterMm, input.collisionMesh),
    };
}

export function toKickstandPreviewData(build: KickstandBuildResult): SupportData {
    const lastIndex = build.kickstand.segments.length - 1;

    const previewSegments = build.kickstand.segments.map((segment, index) => {
        if (index !== lastIndex) return segment;
        return {
            ...segment,
            topJoint: {
                id: `preview-terminal-${build.kickstand.id}`,
                pos: build.hostKnot.pos,
                diameter: build.hostKnot.diameter ?? build.kickstand.profile.terminalEndDiameterMm,
            },
        };
    });

    return {
        id: build.kickstand.id,
        roots: build.root,
        segments: previewSegments,
        knot: build.hostKnot,
        error: build.error,
    };
}
