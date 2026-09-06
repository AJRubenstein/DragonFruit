import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAndCullOrphans } from '../autoSupport/autoPlace';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Which hosts the orphan cull recognises.
 *
 * After placing supports, auto-support culls leaves and branches whose host
 * shaft it cannot find. `findHostSegment` searched trunks only, so a leaf
 * hanging off a BRANCH -- or a twig, stick, anchor or kickstand -- was reported
 * `missingHost` and deleted.
 *
 * The visible symptom: running auto-support on a model with hand-placed leaves
 * on branches silently removed them, 97 leaves down to 79 in one reported run.
 */

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
});

const cone = (id: string) => ({
    id,
    pos: { x: 0, y: 0, z: 20 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    profile: { type: 'cone', lengthMm: 1, contactDiameterMm: 0.4, bodyDiameterMm: 0.8 },
});

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

const put = (state: SupportState, key: string, entity: { id: string }) => {
    (state as unknown as Record<string, Record<string, unknown>>)[key][entity.id] = entity;
};

/**
 * A leaf hanging from a knot on a `hostType` shaft.
 *
 * The tip sits directly above the knot so the shallow-angle guard passes, and
 * no mesh is supplied so the collision checks are skipped -- the only thing
 * under test is whether the host shaft is found.
 */
function leafOnHost(hostType: string): SupportState {
    const state = emptyState();
    const descriptor = SUPPORT_TYPES.find((d) => d.id === hostType)!;

    put(state, descriptor.location.key, {
        id: 'host', modelId: 'm', typeId: hostType,
        rootId: 'r', segments: [seg('host-seg')],
    } as { id: string });

    put(state, 'knots', {
        id: 'k', parentShaftId: 'host-seg', t: 0.5,
        pos: { x: 0, y: 0, z: 5 }, diameter: 1,
    } as { id: string });

    put(state, 'leaves', {
        id: 'leaf-a', modelId: 'm', typeId: 'leaf',
        parentKnotId: 'k', contactCone: cone('leaf-cone'),
    } as { id: string });

    return state;
}

test('a leaf survives on every shafted host, not just a trunk', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;

        const state = leafOnHost(descriptor.id);
        const { draft, orphans } = validateAndCullOrphans(state, undefined);

        assert.ok(
            draft.leaves['leaf-a'],
            `a leaf on a ${descriptor.id} shaft was culled as ${orphans[0]?.reason ?? 'unknown'}`,
        );
    }
});

test('a leaf whose host really is gone is still culled', () => {
    // The cull must keep working: widening the search must not make every
    // orphan look attached.
    const state = emptyState();
    put(state, 'knots', {
        id: 'k', parentShaftId: 'no-such-segment', t: 0.5,
        pos: { x: 0, y: 0, z: 5 }, diameter: 1,
    } as { id: string });
    put(state, 'leaves', {
        id: 'leaf-a', modelId: 'm', typeId: 'leaf',
        parentKnotId: 'k', contactCone: cone('leaf-cone'),
    } as { id: string });

    const { draft, orphans } = validateAndCullOrphans(state, undefined);

    assert.equal(draft.leaves['leaf-a'], undefined, 'a genuinely hostless leaf should go');
    assert.equal(orphans[0]?.reason, 'missingHost');
});

test('a branch survives on a non-trunk host too', () => {
    // Branches go through the same validation as leaves.
    const state = emptyState();
    put(state, 'twigs', {
        id: 'host', modelId: 'm', typeId: 'twig', segments: [seg('host-seg')],
    } as { id: string });
    put(state, 'knots', {
        id: 'k', parentShaftId: 'host-seg', t: 0.5,
        pos: { x: 0, y: 0, z: 5 }, diameter: 1,
    } as { id: string });
    put(state, 'branches', {
        id: 'branch-a', modelId: 'm', typeId: 'branch',
        parentKnotId: 'k', segments: [seg('branch-seg')], contactCone: cone('branch-cone'),
    } as { id: string });

    const { draft } = validateAndCullOrphans(state, undefined);
    assert.ok(draft.branches['branch-a'], 'a branch on a twig shaft was culled');
});

test('every shafted type is a possible host', () => {
    // The regression was a search over one collection. This is the set it
    // should have been searching.
    const shafted = SUPPORT_TYPES.filter((d) => d.hasSegments).map((d) => d.id).sort();
    assert.deepEqual(shafted, ['anchor', 'branch', 'kickstand', 'stick', 'trunk', 'twig']);
});
