import assert from 'node:assert/strict';
import test from 'node:test';

import { addSupportEntity, getKnotPlacementOnShaft, resetStore, setSnapshot } from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Roots, Segment, SupportState } from '../types';

/**
 * Where a knot sits on the shaft it hangs from.
 *
 * Four registrations, differing in how they resolve the segment's ends and in
 * two trunk-only rules: a knot-diameter bump, and projecting a knot that
 * carries no `t`. These hold all three so the shared derivation cannot quietly
 * drop one.
 */

const ROOT = {
    id: 'root-a', modelId: 'model-a',
    transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
} as Roots;

const segment = (id: string, zBottom: number, zTop: number): Segment => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: zBottom }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: zTop }, diameter: 1 },
} as Segment);

function seedTrunk() {
    resetStore();
    setSnapshot({
        ...({} as SupportState),
        roots: { 'root-a': ROOT },
        knots: { 'host-knot': { id: 'host-knot', parentShaftId: 'x', pos: { x: 0, y: 0, z: 2 }, diameter: 1 } },
    } as unknown as SupportState);
    addSupportEntity('trunk' as never, {
        id: 'trunk-a', modelId: 'model-a', rootId: 'root-a',
        segments: [segment('s0', 2, 10)],
    } as never);
}

test('a trunk knot takes the joint diameter, not the shaft diameter', () => {
    seedTrunk();
    const place = getKnotPlacementOnShaft('trunk');
    assert.ok(place, 'trunk registers a placement rule');

    const seg = segment('s0', 2, 10);
    const result = place({ id: 'trunk-a', rootId: 'root-a', segments: [seg] } as never,
        { id: 'k', parentShaftId: 's0', t: 0.5, pos: { x: 0, y: 0, z: 6 }, diameter: 1 } as never,
        seg, 0);

    // +0.125 renders at the trunk joint; the shaft diameter would be invisible.
    assert.equal(result?.diameter, seg.diameter + 0.125);
});

test('a trunk knot with no t is projected onto the segment', () => {
    seedTrunk();
    const place = getKnotPlacementOnShaft('trunk')!;
    const seg = segment('s0', 2, 10);

    const result = place({ id: 'trunk-a', rootId: 'root-a', segments: [seg] } as never,
        { id: 'k', parentShaftId: 's0', pos: { x: 0, y: 0, z: 6 }, diameter: 1 } as never,
        seg, 0);

    assert.ok(result, 'a t-less trunk knot still resolves');
    assert.ok(Math.abs(result.pos.z - 6) < 0.5, `projected onto the segment, got z=${result.pos.z}`);
});

test('a knot with no t on any other type resolves nothing', () => {
    // Only trunk projects; the rest return null so the knot is left alone.
    seedTrunk();
    for (const typeId of ['branch', 'twig', 'stick'] as const) {
        const place = getKnotPlacementOnShaft(typeId);
        if (!place) continue;
        const seg = segment('s0', 2, 10);
        // Branch resolves through its parent knot, so give it one.
        const result = place({ id: `${typeId}-a`, parentKnotId: 'host-knot', segments: [seg] } as never,
            { id: 'k', parentShaftId: 's0', pos: { x: 0, y: 0, z: 6 }, diameter: 1 } as never,
            seg, 0);
        assert.equal(result, null, `${typeId} should not project a t-less knot`);
    }
});

test('a self-contained shaft interpolates straight from its own joints', () => {
    for (const typeId of ['twig', 'stick'] as const) {
        const place = getKnotPlacementOnShaft(typeId);
        assert.ok(place, `${typeId} registers a placement rule`);

        const seg = segment('s0', 2, 10);
        const result = place({ id: `${typeId}-a`, segments: [seg] } as never,
            { id: 'k', parentShaftId: 's0', t: 0.5, pos: { x: 0, y: 0, z: 0 }, diameter: 1 } as never,
            seg, 0);

        assert.ok(result, `${typeId} resolves a knot with t`);
        assert.equal(result.pos.z, 6, `${typeId} midpoint of 2..10`);
        assert.equal(result.diameter, undefined, `${typeId} does not change the knot diameter`);
    }
});

test('every shafted type places the knots riding it', () => {
    // Four registered by hand, so a knot on an anchor or kickstand shaft was
    // never repositioned -- the same gap clipboardKnotHosts.test.ts pins for
    // the copy walk. A knot can ride any shaft, so every shafted type registers.
    const registered = SUPPORT_TYPES.filter((d) => getKnotPlacementOnShaft(d.id)).map((d) => d.id);
    assert.deepEqual(
        registered.sort(),
        SUPPORT_TYPES.filter((d) => d.hasSegments).map((d) => d.id).sort(),
    );
});

test('a type with no shaft registers nothing', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.hasSegments) continue;
        assert.equal(getKnotPlacementOnShaft(descriptor.id), null, descriptor.id);
    }
});
