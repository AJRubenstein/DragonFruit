import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGizmoContextIndex } from '../Curves/BezierGizmo/bezierContextIndex';
import type { Kickstand } from '../types';
import type { SupportState } from '../types';
import { createEmptySupportCollections } from '../supportTypeRegistry';

/**
 * Where a bezier handle sits when a segment end has no joint of its own.
 *
 * The registry declares both ends, so the handle has to resolve the same way
 * the geometry does — `resolveSegmentEndpoints` reads the declared lower
 * endpoint for a first segment, and the declared upper endpoint at the top.
 * Kickstand is the type where this matters: its first segment starts on its
 * plate root, and its last ends on the host knot it braces, not on a contact
 * cone. A hand-written kickstand loop used to build these contexts a second
 * time, at partly different anchors and under duplicate React keys.
 */

function emptyState(): SupportState {
    return {
        ...createEmptySupportCollections(),
        selectedId: null,
        selectedCategory: null,
        hoveredId: null,
        hoveredCategory: 'none',
        interactionWarning: null,
    } as unknown as SupportState;
}

/** A bezier segment between two points, carrying no joints unless asked. */
function bezierSegment(id: string, zStart: number, zEnd: number) {
    return {
        id,
        type: 'bezier' as const,
        diameter: 1,
        controlPoint1: { x: 0, y: 0, z: zStart + 1 },
        controlPoint2: { x: 0, y: 0, z: zEnd - 1 },
        startTangent: { x: 0, y: 0, z: 1 },
        endTangent: { x: 0, y: 0, z: 1 },
        tension: 0,
        bias: 0.5,
        resolution: 12,
    };
}

test('a jointless first bezier segment anchors on the declared lower endpoint', () => {
    const state = emptyState();
    state.roots['r1'] = {
        id: 'r1', modelId: 'm', transform: { pos: { x: 0, y: 0, z: 0 } },
        diameter: 4, diskHeight: 0.5, coneHeight: 1,
    } as unknown as SupportState['roots'][string];
    state.trunks['t1'] = {
        id: 't1', modelId: 'm', rootId: 'r1',
        segments: [bezierSegment('seg-t1', 1.5, 10)],
    } as unknown as SupportState['trunks'][string];

    const index = buildGizmoContextIndex(state);
    const contexts = index.segmentContextsById.get('seg-t1') ?? [];
    const bottom = contexts.find((c) => c.id.endsWith('-bottom'));

    assert.ok(bottom, 'a first bezier segment offers a bottom handle');
    // rootTop: the root's own position plus its disk and cone stack.
    assert.equal(bottom.joint.pos.z, 1.5, 'bottom handle sits on the root top');
    assert.equal(bottom.joint.id, 'r1', 'bottom handle is the root it starts from');
});

test('a kickstand ends its shaft on its host knot, not on a contact', () => {
    const state = emptyState();
    state.roots['k1-root'] = {
        id: 'k1-root', modelId: 'm', transform: { pos: { x: 5, y: 0, z: 0 } },
        diameter: 4, diskHeight: 0.5, coneHeight: 1,
    } as unknown as SupportState['roots'][string];
    state.knots['k1-host'] = {
        id: 'k1-host', parentShaftId: 'seg-trunk', pos: { x: 0, y: 0, z: 8 }, diameter: 1.4,
    } as unknown as SupportState['knots'][string];
    state.kickstands['k1'] = {
        id: 'k1', modelId: 'm', rootId: 'k1-root', hostKnotId: 'k1-host', hostSegmentId: 'seg-trunk',
        hostMinT: 0,
        segments: [bezierSegment('seg-k1', 1.5, 8)],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1, terminalEndDiameterMm: 0.6 },
    } as unknown as Kickstand as SupportState['kickstands'][string];

    const index = buildGizmoContextIndex(state);
    const contexts = index.segmentContextsById.get('seg-k1') ?? [];
    const top = contexts.find((c) => c.id.endsWith('-top-host'));
    const bottom = contexts.find((c) => c.id.endsWith('-bottom'));

    assert.ok(bottom, 'kickstand first segment starts at its plate root');
    assert.equal(bottom.joint.id, 'k1-root', 'bottom handle is the kickstand root');
    assert.equal(bottom.joint.pos.z, 1.5, 'bottom handle sits on the root top');

    assert.ok(top, 'a jointless last segment ends at the host knot');
    assert.equal(top.joint.id, 'k1-host', 'top handle is the host knot');
    assert.equal(top.joint.pos.z, 8, 'top handle sits on the host knot');
});

test('one handle id per context, so no two handles share a React key', () => {
    const state = emptyState();
    state.roots['r1'] = {
        id: 'r1', modelId: 'm', transform: { pos: { x: 0, y: 0, z: 0 } },
        diameter: 4, diskHeight: 0.5, coneHeight: 1,
    } as unknown as SupportState['roots'][string];
    state.knots['k1-host'] = {
        id: 'k1-host', parentShaftId: 'seg-t1', pos: { x: 0, y: 0, z: 6 }, diameter: 1.4,
    } as unknown as SupportState['knots'][string];
    state.trunks['t1'] = {
        id: 't1', modelId: 'm', rootId: 'r1',
        segments: [{
            ...bezierSegment('seg-t1', 1.5, 6),
            topJoint: { id: 't1-top', pos: { x: 0, y: 0, z: 6 }, diameter: 1.2 },
        }],
    } as unknown as SupportState['trunks'][string];
    state.kickstands['k1'] = {
        id: 'k1', modelId: 'm', rootId: 'r1', hostKnotId: 'k1-host', hostSegmentId: 'seg-t1',
        hostMinT: 0,
        segments: [{
            ...bezierSegment('seg-k1', 1.5, 6),
            bottomJoint: { id: 'k1-bottom', pos: { x: 5, y: 0, z: 1.5 }, diameter: 1.2 },
            topJoint: { id: 'k1-top', pos: { x: 0, y: 0, z: 8 }, diameter: 1.2 },
        }],
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1, terminalEndDiameterMm: 0.6 },
    } as unknown as Kickstand as SupportState['kickstands'][string];

    // A joint with two handles (incoming and outgoing) is legitimate; the same
    // handle id twice under one key is not -- that is what the duplicate loop
    // produced for every kickstand joint and segment end.
    const index = buildGizmoContextIndex(state);
    const all = [
        ...index.jointContextsById.values(),
        ...index.segmentContextsById.values(),
        ...index.braceContextsById.values(),
    ].flat();
    const ids = all.map((context) => context.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate handle keys: ${ids.join(', ')}`);
});
