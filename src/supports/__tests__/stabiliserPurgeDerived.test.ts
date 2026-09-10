import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { getSupportTypeDescriptor, lateralStabiliserTypes, SUPPORT_TYPES } from '../supportTypeRegistry';
import { buildAutoBracedSnapshot } from '../autoBracing/autoBrace';
import { createDefaultAutoBracingSettings } from '../autoBracing/settings';
import type { SupportState } from '../types';
// Registration is a side effect of loading the store's per-type modules.
import '../state';

function emptyState(): SupportState {
    const state = {
        roots: {}, knots: {},
        selectedId: null, hoveredId: null,
        selectedCategory: null, hoveredCategory: 'none', interactionWarning: null,
    } as unknown as SupportState;
    for (const descriptor of SUPPORT_TYPES) {
        (state as unknown as Record<string, unknown>)[descriptor.location.key] = {};
    }
    return state;
}

const put = (state: SupportState, key: string, entity: { id: string } & Record<string, unknown>) => {
    (state as unknown as Record<string, Record<string, unknown>>)[key][entity.id] = entity;
};

const root = (id: string, x: number) => ({
    id, modelId: 'model-a',
    transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
});

const knot = (id: string, parentShaftId: string) => ({
    id, parentShaftId, t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1,
});

/**
 * Auto-bracing purges its own generated stabilisers before regenerating.
 *
 * Generation already walks `lateralStabiliserTypes()`, but the purge beside it
 * named the kickstand collection and read `rootId` / `hostKnotId` directly. A
 * second stabiliser type would be generated and never purged, so each run would
 * pile more on.
 */

const SOURCE = readFileSync(
    new URL('../autoBracing/autoBrace.ts', import.meta.url),
    'utf8',
);

test('the purge walks the registered stabilisers', () => {
    assert.match(
        SOURCE,
        /for \(const typeId of lateralStabiliserTypes\(\)\)/,
        'the purge no longer walks the registered stabiliser types',
    );
});

test('the primitives a stabiliser owns come from its declared edges', () => {
    // What the purge depends on: it must be able to find a stabiliser's root
    // and host knot without knowing the field names.
    for (const typeId of lateralStabiliserTypes()) {
        const descriptor = getSupportTypeDescriptor(typeId);
        const primitiveEdges = descriptor.edges.filter(
            (edge) => edge.to === 'roots' || edge.to === 'knots',
        );
        assert.ok(
            primitiveEdges.length > 0,
            `${typeId} is a stabiliser but declares no root or knot edge, so a purge cannot follow it`,
        );
    }
});

test('kickstand is the stabiliser today, and declares both edges', () => {
    assert.deepEqual([...lateralStabiliserTypes()], ['kickstand']);

    const edges = getSupportTypeDescriptor('kickstand').edges;
    assert.ok(edges.some((e) => e.field === 'rootId' && e.to === 'roots'));
    assert.ok(edges.some((e) => e.field === 'hostKnotId' && e.to === 'knots'));
});

test('a run drops its own stabilisers and keeps hand-placed ones', () => {
    // The behaviour, not just the shape: disabling the `generatedBy` check left
    // the whole suite and all 22 goldens green.
    const state = emptyState();
    // Three trunks: auto-bracing returns early below `minGroupSize`, which is
    // why an earlier version of this test saw the purge never run.
    for (let i = 0; i < 3; i += 1) {
        put(state, 'roots', root(`t-root-${i}`, i * 8));
        put(state, 'trunks', {
            id: `trunk-${i}`, modelId: 'model-a', rootId: `t-root-${i}`,
            segments: [{
                id: `t-seg-${i}`, diameter: 1,
                bottomJoint: { id: `t-bj-${i}`, pos: { x: i * 8, y: 0, z: 0 }, diameter: 1 },
                topJoint: { id: `t-tj-${i}`, pos: { x: i * 8, y: 0, z: 30 }, diameter: 1 },
            }],
        });
    }
    put(state, 'roots', root('auto-root', 0));
    put(state, 'roots', root('manual-root', 20));
    put(state, 'knots', knot('auto-knot', 'auto-seg'));
    put(state, 'knots', knot('manual-knot', 'manual-seg'));

    put(state, 'kickstands', {
        id: 'auto-ks', modelId: 'model-a', rootId: 'auto-root',
        hostKnotId: 'auto-knot', hostSegmentId: 'auto-seg', hostMinT: 0,
        segments: [], generatedBy: 'autoBracing',
        profile: { bodyDiameterMm: 0.7, terminalStartDiameterMm: 0.7, terminalEndDiameterMm: 0.9 },
    });
    put(state, 'kickstands', {
        id: 'manual-ks', modelId: 'model-a', rootId: 'manual-root',
        hostKnotId: 'manual-knot', hostSegmentId: 'manual-seg', hostMinT: 0,
        segments: [],
        profile: { bodyDiameterMm: 0.7, terminalStartDiameterMm: 0.7, terminalEndDiameterMm: 0.9 },
    });

    const { snapshot } = buildAutoBracedSnapshot(state, createDefaultAutoBracingSettings());

    assert.ok(snapshot.kickstands['manual-ks'], 'a hand-placed stabiliser must survive');
    assert.equal(snapshot.kickstands['auto-ks'], undefined, 'the run must drop the one it generated');
    // Its primitives go with it; the manual one keeps its own.
    assert.ok(snapshot.roots['manual-root'], 'the surviving stabiliser keeps its root');
    assert.ok(snapshot.knots['manual-knot'], 'the surviving stabiliser keeps its host knot');
});
