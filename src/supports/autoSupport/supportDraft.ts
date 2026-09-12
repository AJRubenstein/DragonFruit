import { getSupportTypeDescriptor, type SupportTypeId } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * Immutable draft mutations for the auto-support PLAN phase.
 *
 * The auto pipeline must compute the whole placement against a LOCAL draft
 * state (no store commits, no notify()) so the run is one atomic commit and
 * the computation can later move into a worker. These mirror the entity-add
 * arm of the store's `addSupportEntity` (state.ts), minus the settings-code-hex
 * cache and the `notify()` side effects.
 *
 * The placement phase only ever ADDS entities (the one replacement case uses
 * `applyTrunkReplacement` via a store swap), so these two cover every mutation
 * the plan phase needs.
 */

/**
 * Add one support entity to a draft, stamped with its type.
 *
 * The plan phase commits with a single `setSnapshot`, so an entity entering
 * the draft unstamped reaches the store unstamped.
 */
export function draftAddEntity(
    draft: SupportState,
    typeId: SupportTypeId,
    entity: { id: string },
): SupportState {
    const key = getSupportTypeDescriptor(typeId).location.key;
    return {
        ...draft,
        [key]: { ...draft[key], [entity.id]: { ...entity, typeId } },
    };
}

/** Primitives are not support types and carry no `typeId`. */
export function draftAddPrimitive<K extends 'roots' | 'knots'>(
    draft: SupportState,
    key: K,
    primitive: { id: string },
): SupportState {
    return { ...draft, [key]: { ...draft[key], [primitive.id]: primitive } };
}

/**
 * Commit one placed support: the entity plus every primitive its declared
 * `edges` point at.
 *
 * Derived, so a caller never names a type to place it. The two facts this needs
 * are already declared on the descriptor — `location.key` is the collection the
 * entity joins, and each `edges` entry names a field holding a primitive's id
 * and the collection that primitive lives in. Trunk carries a root that way;
 * branch and leaf carry the knot they hang from; a type with no edges (anchor,
 * twig, stick) carries nothing and adds only itself.
 *
 * `supplied` is keyed by EDGE FIELD, so the caller passes what it built against
 * the same names the declaration uses and the two cannot drift apart.
 */
export function draftCommitSupport(
    draft: SupportState,
    typeId: SupportTypeId,
    entity: { id: string },
    supplied: Record<string, { id: string } | undefined> = {},
): SupportState {
    let next = draftAddEntity(draft, typeId, entity);
    for (const edge of getSupportTypeDescriptor(typeId).edges) {
        // A `segment` edge names part of the entity, not a collection member.
        // Only roots and knots are collections a placement can carry in.
        if (edge.to !== 'roots' && edge.to !== 'knots') continue;
        const primitive = supplied[edge.field];
        if (primitive) next = draftAddPrimitive(next, edge.to, primitive);
    }
    return next;
}
