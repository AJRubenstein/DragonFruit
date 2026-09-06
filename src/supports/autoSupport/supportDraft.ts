import { getSupportTypeDescriptor, type SupportTypeId } from '../supportTypeRegistry';
import type { SupportState } from '../types';
// Only the deprecated per-type wrappers below need these; they go together.
import type { Roots, Trunk, Knot, Branch, Leaf, Anchor, Stick, Twig } from '../types';

/**
 * Immutable draft mutations for the auto-support PLAN phase.
 *
 * The auto pipeline must compute the whole placement against a LOCAL draft
 * state (no store commits, no notify()) so the run is one atomic commit and
 * the computation can later move into a worker. These mirror the entity-add
 * arms of the store's `addRoot`/`addTrunk`/… functions (state.ts), minus the
 * settings-code-hex cache and the `notify()` side effects.
 *
 * The placement phase only ever ADDS entities (the one replacement case uses
 * `applyTrunkReplacement` via a store swap), so these eight covers all
 * mutations the plan phase needs.
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

/** @deprecated Thin wrapper for removal; prefer `draftAddPrimitive(draft, 'roots', root)`. */
export function draftAddRoot(draft: SupportState, root: Roots): SupportState {
    return draftAddPrimitive(draft, 'roots', root);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddPrimitive(draft, 'knots', knot)`. */
export function draftAddKnot(draft: SupportState, knot: Knot): SupportState {
    return draftAddPrimitive(draft, 'knots', knot);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'trunk', entity)`. */
export function draftAddTrunk(draft: SupportState, trunk: Trunk): SupportState {
    return draftAddEntity(draft, 'trunk', trunk);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'branch', entity)`. */
export function draftAddBranch(draft: SupportState, branch: Branch): SupportState {
    return draftAddEntity(draft, 'branch', branch);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'leaf', entity)`. */
export function draftAddLeaf(draft: SupportState, leaf: Leaf): SupportState {
    return draftAddEntity(draft, 'leaf', leaf);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'anchor', entity)`. */
export function draftAddAnchor(draft: SupportState, anchor: Anchor): SupportState {
    return draftAddEntity(draft, 'anchor', anchor);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'stick', entity)`. */
export function draftAddStick(draft: SupportState, stick: Stick): SupportState {
    return draftAddEntity(draft, 'stick', stick);
}

/** @deprecated Thin wrapper for removal; prefer `draftAddEntity(draft, 'twig', entity)`. */
export function draftAddTwig(draft: SupportState, twig: Twig): SupportState {
    return draftAddEntity(draft, 'twig', twig);
}
