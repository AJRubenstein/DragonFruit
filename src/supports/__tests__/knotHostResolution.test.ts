import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createEmptySupportCollections,
    findKnotHost,
    getSupportTypeDescriptor,
    KNOT_HOST_PRECEDENCE,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Which support a knot hosts, for the delete path.
 *
 * Deleting a knot deletes what hangs off it. The types that can hang off one,
 * and the field each reads, come from the declared knot edges -- so a type that
 * gains a knot edge is covered by declaring it, and one that loses its entry
 * cannot silently stop being found.
 */

const base = () => createEmptySupportCollections() as unknown as SupportState;

const put = (state: SupportState, key: string, entity: { id: string }) => {
    (state[key as keyof SupportState] as unknown as Record<string, unknown>)[entity.id] = entity;
};

/** Every type declaring a hostedBy edge onto knots, read off the registry. */
const KNOT_HOSTS = SUPPORT_TYPES.filter((descriptor) =>
    descriptor.edges.some((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy'));

test('every type that can host a knot is reachable through its declared field', () => {
    // The hand-written chain this replaced listed four types and their fields.
    // Driving it from the edges is what makes a fifth work without an edit.
    for (const descriptor of KNOT_HOSTS) {
        const fields = descriptor.edges
            .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy')
            .map((edge) => edge.field);

        for (const field of fields) {
            const state = base();
            put(state, descriptor.location.key, { id: 'host-1', [field]: 'knot-1' } as { id: string });

            const found = findKnotHost(state, 'knot-1', [descriptor.id]);
            assert.ok(found, `${descriptor.id} not found through ${field}`);
            assert.equal(found.typeId, descriptor.id);
            assert.equal(found.id, 'host-1');
        }
    }
});

test('the precedence list covers every knot-hosting type', () => {
    // A type that can host a knot but is missing from the order is invisible to
    // the delete path -- the exact failure the enumerated chain used to have.
    for (const descriptor of KNOT_HOSTS) {
        assert.ok(
            KNOT_HOST_PRECEDENCE.includes(descriptor.id),
            `${descriptor.id} hosts knots but is absent from KNOT_HOST_PRECEDENCE`,
        );
    }
});

test('a brace is found through either of its two knot ends', () => {
    for (const field of ['startKnotId', 'endKnotId']) {
        const state = base();
        put(state, 'braces', { id: 'brace-1', [field]: 'knot-1' } as { id: string });

        assert.equal(findKnotHost(state, 'knot-1', KNOT_HOST_PRECEDENCE)?.id, 'brace-1');
    }
});

test('the first type in the order wins when several host the same knot', () => {
    const state = base();
    put(state, 'leaves', { id: 'leaf-1', parentKnotId: 'knot-1' } as { id: string });
    put(state, 'branches', { id: 'branch-1', parentKnotId: 'knot-1' } as { id: string });
    put(state, 'braces', { id: 'brace-1', startKnotId: 'knot-1' } as { id: string });
    put(state, 'kickstands', { id: 'kickstand-1', hostKnotId: 'knot-1' } as { id: string });

    const [first] = KNOT_HOST_PRECEDENCE;
    assert.equal(findKnotHost(state, 'knot-1', KNOT_HOST_PRECEDENCE)?.typeId, first);
});

test('a knot nothing hosts resolves to nothing', () => {
    // The delete path returns false here rather than deleting something else.
    assert.equal(findKnotHost(base(), 'knot-1', KNOT_HOST_PRECEDENCE), null);
});

test('each host resolves to the selection category the delete path dispatches on', () => {
    // The call site recurses with this category, so a mismatch would route the
    // removal into the wrong branch.
    for (const typeId of KNOT_HOST_PRECEDENCE) {
        const descriptor = getSupportTypeDescriptor(typeId);
        assert.equal(descriptor.selectionCategory, typeId);
    }
});
