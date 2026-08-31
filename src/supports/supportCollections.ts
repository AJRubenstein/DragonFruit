import { MODEL_ID_COLLECTION_KEYS, type SupportCollectionKey } from './supportTypeRegistry';
import type { SupportState } from './types';

/**
 * The support collections held in `SupportState`, in one place.
 *
 * WHY THIS EXISTS
 *
 * A support's type is implicit: there is no `type` field on any support object,
 * so an entity is a Stick purely because its id is a key in `state.sticks`. Every
 * operation that means "do this to all supports" therefore hand-writes the list
 * of collections, and a list that misses one fails SILENTLY -- no error, no
 * warning, just a support type that quietly stops being transformed, reassigned
 * or persisted.
 *
 * That has bitten this codebase repeatedly. `applyZShift` walked trunks,
 * branches, twigs and leaves but not sticks, so imported sticks stayed in the
 * authored frame while their own knots moved with everything else.
 * `normalizeLoadedKnotAndLeafGeometry` resolved knot hosts against trunks,
 * branches and twigs but had no stick map, so stick-hosted knots were skipped
 * entirely. Both were invisible until someone noticed geometry in the wrong
 * place.
 *
 * Deriving those walks from ONE list makes "did this cover every type?" a
 * question the compiler answers, instead of one a reviewer has to answer by
 * reading. Adding a ninth support type means adding it here; anything built on
 * `SUPPORT_ENTITY_COLLECTIONS` picks it up, and anything that cannot be
 * expressed that way is at least a deliberate, visible exception.
 *
 * SCOPE
 *
 * Only top-level entity collections that carry a `modelId` -- the things a
 * "for every support" walk means. Deliberately excluded:
 *
 *   - `knots`, which are attachments rather than supports and have no modelId
 *   - kickstands, which live in their own store (SupportTypes/Kickstand)
 *   - interaction fields (selectedId, hoveredId, ...)
 */

/**
 * Keys of `SupportState` holding top-level, modelId-bearing support entities.
 * Derived from the type registry so a new type is picked up by adding one
 * descriptor, rather than by remembering this list too.
 */
export const SUPPORT_ENTITY_COLLECTIONS = MODEL_ID_COLLECTION_KEYS;

export type SupportEntityCollectionKey = SupportCollectionKey;

/**
 * The subset of SupportState these helpers read and write.
 *
 * Narrower than SupportState on purpose: it keeps the helpers usable with a
 * partial snapshot (an import payload being reconciled, say) and stops them
 * reaching into interaction state.
 */
export type SupportEntityCollections = Pick<SupportState, SupportEntityCollectionKey>;

/** Minimum shape a support entity must have to take part in these walks. */
export interface SupportEntityLike {
    id: string;
    modelId?: string;
}

/**
 * Apply `mapEntity` to every entity in every collection, copy-on-write.
 *
 * Returns the ORIGINAL collections object when nothing changed, so callers can
 * keep their existing `if (changed)` short-circuit and avoid a pointless state
 * update plus subscriber notification. Individual collections are likewise only
 * cloned once something in them actually changes.
 *
 * `mapEntity` returns the entity unchanged (by reference) to signal "no change".
 */
export function mapSupportEntities<T extends SupportEntityCollections>(
    collections: T,
    mapEntity: <E extends SupportEntityLike>(entity: E, collection: SupportEntityCollectionKey) => E,
): { collections: T; changed: boolean } {
    let changed = false;
    let next: T = collections;

    for (const key of SUPPORT_ENTITY_COLLECTIONS) {
        const record = collections[key] as Record<string, SupportEntityLike> | undefined;
        if (!record) continue;

        let nextRecord: Record<string, SupportEntityLike> | null = null;
        for (const entity of Object.values(record)) {
            const mapped = mapEntity(entity, key);
            if (mapped === entity) continue;

            if (!nextRecord) nextRecord = { ...record };
            nextRecord[entity.id] = mapped;
        }

        if (nextRecord) {
            if (!changed) {
                next = { ...collections };
                changed = true;
            }
            (next as Record<string, unknown>)[key] = nextRecord;
        }
    }

    return { collections: next, changed };
}

/** Visit every entity in every collection without modifying anything. */
export function forEachSupportEntity(
    collections: Partial<SupportEntityCollections>,
    visit: (entity: SupportEntityLike, collection: SupportEntityCollectionKey) => void,
): void {
    for (const key of SUPPORT_ENTITY_COLLECTIONS) {
        const record = collections[key] as Record<string, SupportEntityLike> | undefined;
        if (!record) continue;
        for (const entity of Object.values(record)) visit(entity, key);
    }
}

/**
 * Apply `mapEntity` to every support entity in an import payload.
 *
 * `DragonfruitImportFormat` stores each collection as an ARRAY rather than a
 * record, and marks several optional, so it needs its own walk -- but it must
 * cover the same collections, which is why both derive from
 * SUPPORT_ENTITY_COLLECTIONS rather than repeating the list.
 *
 * Optional collections stay `undefined` rather than becoming `[]`: the payload
 * shape is part of the import contract, and materialising empty arrays would
 * change what round-trips through save/load.
 *
 * Kickstands are NOT handled here. They sit at `kickstands[].kickstand` and
 * `kickstands[].root` rather than as a flat collection, so callers that need
 * them must walk them explicitly.
 */
export function mapImportPayloadEntities<T extends Partial<Record<SupportEntityCollectionKey, unknown>>>(
    payload: T,
    mapEntity: <E extends SupportEntityLike>(entity: E, collection: SupportEntityCollectionKey) => E,
): T {
    const next = { ...payload };
    for (const key of SUPPORT_ENTITY_COLLECTIONS) {
        const list = payload[key] as SupportEntityLike[] | undefined;
        if (!list) continue;
        (next as Record<string, unknown>)[key] = list.map((entity) => mapEntity(entity, key));
    }
    return next;
}
