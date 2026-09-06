import * as THREE from 'three';
import React from 'react';

import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import type { SupportTypeId } from '../supportTypeRegistry';
import type { Knot, Roots, Segment, Vec3 } from '../types';

/**
 * Where each of a shaft's segments starts and ends, for a renderer to draw.
 *
 * Every shafted renderer walked its own segments with a local `currentStart`
 * that chained from the previous end, seeded from whatever that type hangs
 * from. `resolveSegmentEndpoints` derives the same points from the declared
 * lower and upper endpoints, and already serves the slicer.
 */

export interface ShaftSegment {
    segment: Segment;
    index: number;
    isLast: boolean;
    start: Vec3;
    end: Vec3;
    startVec: THREE.Vector3;
    endVec: THREE.Vector3;
}

export interface ShaftHosts {
    root?: Roots | null;
    hostKnot?: Knot | null;
}

export function resolveShaftSegments(
    typeId: SupportTypeId,
    entity: { segments?: Segment[] } | null | undefined,
    hosts: ShaftHosts = {},
): ShaftSegment[] {
    const segments = entity?.segments ?? [];
    const out: ShaftSegment[] = [];

    segments.forEach((segment, index) => {
        const endpoints = resolveSegmentEndpoints(typeId, entity as { segments: Segment[] }, segment, index, hosts);
        if (!endpoints) return;

        out.push({
            segment,
            index,
            isLast: index === segments.length - 1,
            start: endpoints.start,
            end: endpoints.end,
            startVec: new THREE.Vector3(endpoints.start.x, endpoints.start.y, endpoints.start.z),
            endVec: new THREE.Vector3(endpoints.end.x, endpoints.end.y, endpoints.end.z),
        });
    });

    return out;
}

/** Memoised for render use; recomputes when the entity or its hosts change. */
export function useShaftSegments(
    typeId: SupportTypeId,
    entity: { segments?: Segment[] } | null | undefined,
    hosts: ShaftHosts = {},
): ShaftSegment[] {
    const { root, hostKnot } = hosts;
    return React.useMemo(
        () => resolveShaftSegments(typeId, entity, { root, hostKnot }),
        [typeId, entity, root, hostKnot],
    );
}
