import type { SupportState } from '../types';
import type { SupportTypeId } from '../supportTypeRegistry';

/**
 * What a type recomputes after its own entity is written.
 *
 * `applySupportEntityUpdate` writes an entity and then repositions the knots
 * riding its shafts. That covers a type whose dependents hang off its segments.
 * Two types need more, and need it in a particular order:
 *
 * - a LEAF carries a contact cone on the model and a knot on a host shaft, so a
 *   written leaf recomputes the cone-host knots and then the span-host knots;
 * - a BRACE spans two knots, so a written brace recomputes the span-host knots
 *   FIRST and only then the leaf cascade, which is the opposite of the leaf's
 *   order and the reason `settleKnotDependentGeometry` cannot serve either.
 *
 * Both are declared here rather than in `state.ts`, which is the point: the store
 * writes and notifies, and what else a type touches is a fact about that type.
 *
 * A slot for the same reason the registry's other slots are: the store cannot
 * import a type's folder without an initialisation cycle, so the folder
 * registers and the store asks.
 */
export interface SupportSettleContext {
    /**
     * The state with this type's own collection already replaced, and every
     * other collection still as it was before the write. A hook therefore reads
     * the entity it was handed through `next`, and its collaborators through the
     * collections it did not touch.
     */
    next: SupportState;
}

/**
 * The collections to write on top of the entity's own, or null for none.
 *
 * Returning null leaves the write exactly as `applySupportEntityUpdate` would
 * have made it, which is what a type with no cascade returns.
 */
export type SupportSettleHook = (context: SupportSettleContext) => Partial<SupportState> | null;

const SETTLE_HOOKS = new Map<SupportTypeId, SupportSettleHook>();

/**
 * Called once per type from its own folder's registration module.
 *
 * Only the types whose cascade differs from the generic one need this; a type
 * with none is written by `applySupportEntityUpdate` alone.
 */
export function registerSupportSettle(typeId: SupportTypeId, hook: SupportSettleHook): void {
    SETTLE_HOOKS.set(typeId, hook);
}

/** This type's settle hook, or null when its folder registered none. */
export function supportSettleFor(typeId: SupportTypeId): SupportSettleHook | null {
    return SETTLE_HOOKS.get(typeId) ?? null;
}

/** Types whose folder registered a settle hook, for the completeness test. */
export function typesWithSettleHook(): readonly SupportTypeId[] {
    return [...SETTLE_HOOKS.keys()];
}
