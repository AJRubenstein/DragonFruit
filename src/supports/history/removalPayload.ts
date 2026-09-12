import { computeAndApplySupportDiameterProfile } from '../SupportTypes/Trunk/TrunkReplacement';
import { findShaftOwnerOfSegment, getSnapshot, removeSupportEntity, updateKnot } from '../state';
import { getSupportTypeDescriptor, removalShapeFor, updateSupportEntity } from '../supportTypeRegistry';
import type { SupportTypeId } from '../supportTypeRegistry';
import type { SupportState } from '../types';

/**
 * What a removal records, and any repair the removal forced.
 *
 * Two jobs, both derived:
 *
 * 1. **The payload.** `SUPPORT_REMOVAL_SHAPES` already declares every field a
 *    removal reports — `brace: { knots: ['startKnot', 'endKnot'] }` expands to
 *    `{ startKnot, endKnot }`, `leaf: { knots: 'knot' }` to `{ knot }`. So the
 *    payload is the cascade result re-keyed from that declaration, with its
 *    singular fields normalized from `undefined` to `null`. No type is named.
 *
 * 2. **The host repair.** A HOST type declaring `recomputesDiameterFromAttachments`
 *    is sized from what it carries, so losing an attachment leaves it sized for
 *    something that is gone; it is re-solved and the result reported beside the
 *    cascade. Which types those are is a registry fact, and which host was
 *    involved is read from the removed entity's declared `hostedBy` knot edge —
 *    nothing here names a type.
 *
 * It lives here rather than in the interaction manager because a React hook
 * cannot be exercised in tests, and both decisions are worth testing.
 */

/** The history payload a completed removal carries. */
export interface RemovalPayload {
    [field: string]: unknown;
}

/** A removal and what its undo entry carries. */
export interface ResolvedSupportRemoval {
    /** The type that was removed, so the caller can name the history action. */
    typeId: SupportTypeId;
    /** The cascade result, re-keyed, plus any repair the removal forced. */
    payload: RemovalPayload;
}

type RemovedRoot = Record<string, unknown> | undefined;

/**
 * The fields a removal of `typeId` reports, re-keyed from the declaration.
 *
 * `SUPPORT_REMOVAL_SHAPES` gives `self` (the entity's own field) and `cascade`
 * (each affected collection, mapped to the field names the payload uses). A
 * field declared as an array — `['startKnot', 'endKnot']` — is a set of NAMED
 * singular slots rather than a list, which is the only difference between the
 * two forms.
 */
function payloadFields(
    typeId: SupportTypeId,
    snapshots: Record<string, unknown>,
): RemovalPayload {
    const shape = removalShapeFor(typeId);
    const payload: RemovalPayload = { [shape.self]: snapshots[shape.self] };

    for (const field of Object.values(shape.cascade)) {
        if (typeof field !== 'string') {
            // Declared as an array: NAMED singular slots rather than a list.
            // `Array.isArray` does not narrow `readonly string[]`, so the test
            // is on the string case.
            for (const name of field) {
                payload[name] = snapshots[name] ?? null;
            }
            continue;
        }
        payload[field] = snapshots[field];
    }

    return payload;
}

/**
 * Re-solve the host a removed entity hung from.
 *
 * The host is found through the removed entity's own declarations — its
 * `hostedBy` knot edge, then that knot's shaft, then whichever type owns the
 * segment — so nothing here names a type.
 *
 * The re-solve itself is the flagged type's: `computeAndApplySupportDiameterProfile`
 * is the stepwise profile a host declaring `recomputesDiameterFromAttachments`
 * uses, and trunk is the one type that declares it today. The gate is the flag,
 * not a name, so a second such type reaches this path by declaring it.
 */
function repairHostAfterRemoval(
    typeId: SupportTypeId,
    id: string,
    snapshots: Record<string, unknown>,
    before: SupportState,
    after: SupportState,
): RemovalPayload {
    const hostEdge = getSupportTypeDescriptor(typeId).edges.find(
        (edge) => edge.to === 'knots' && edge.ownership === 'hostedBy',
    );
    if (!hostEdge) return {};

    const self = snapshots[removalShapeFor(typeId).self] as RemovedRoot | RemovedRoot[];
    const removedRoot: RemovedRoot = Array.isArray(self)
        ? self.find((entry) => entry?.id === id) ?? self[0]
        : self;
    const parentKnotId = removedRoot?.[hostEdge.field];
    if (typeof parentKnotId !== 'string') return {};

    const parentKnot = before.knots[parentKnotId];
    const parentSegId = parentKnot?.parentShaftId;
    if (!parentSegId) return {};

    const owner = findShaftOwnerOfSegment(parentSegId);
    if (!owner) return {};

    // The gate: does the HOST's own type derive its diameter from what it
    // carries? Trunk does; nothing else does today. Read from the host rather
    // than the removed entity, because the specialness is the host's.
    if (!getSupportTypeDescriptor(owner.typeId).recomputesDiameterFromAttachments) return {};

    // The host has to still exist; the profile call reports null when there is
    // nothing to re-solve.
    const hostKey = getSupportTypeDescriptor(owner.typeId).location.key;
    const hostsAfter = after[hostKey] as Record<string, unknown> | undefined;
    if (!hostsAfter?.[owner.id]) return {};

    const applied = computeAndApplySupportDiameterProfile(after, owner.id);
    if (!applied) return {};

    for (const update of applied.knotUpdates) updateKnot(update.after);
    updateSupportEntity('trunk', applied.trunk);

    const hostsBefore = before[hostKey] as Record<string, unknown> | undefined;
    const beforeHost = hostsBefore?.[owner.id];
    if (!beforeHost) return {};
    return {
        trunkUpdate: {
            before: structuredClone(beforeHost),
            after: structuredClone(applied.trunk),
        },
        knotUpdates: applied.knotUpdates,
    };
}

/**
 * The history payload for a completed removal: the cascade result re-keyed,
 * plus any host repair the removal forced.
 *
 * The repair is attempted for every removal and declines when the host's type
 * does not declare `recomputesDiameterFromAttachments`, so there is no list of
 * which types can trigger one.
 */
export function removalPayloadFor(
    typeId: SupportTypeId,
    id: string,
    snapshots: Record<string, unknown>,
    before: SupportState,
    after: SupportState,
): RemovalPayload {
    const payload = payloadFields(typeId, snapshots);
    return { ...payload, ...repairHostAfterRemoval(typeId, id, snapshots, before, after) };
}

/**
 * Removes one entity and resolves what its undo entry carries.
 *
 * Returns `null` when there was nothing to remove, which is how the cascade
 * reports an id that named nothing. The snapshots bracket the removal because
 * the repair reads the state the payload has to describe, not just the result.
 */
export function removeSupportEntityWithPayload(
    typeId: SupportTypeId,
    id: string,
): ResolvedSupportRemoval | null {
    const before = getSnapshot();
    const removed = removeSupportEntity(typeId, id);
    if (!removed) return null;
    const after = getSnapshot();
    return {
        typeId,
        payload: removalPayloadFor(typeId, id, removed as Record<string, unknown>, before, after),
    };
}
