import { MODEL_ID_COLLECTION_KEYS, type SupportCollectionKey } from './supportTypeRegistry';
import type { SupportState } from './types';

/**
 * The modelId-bearing support collections, in one place.
 *
 * A support's type is implicit -- an entity is a Stick because its id is a key in
 * `state.sticks`, not because of any field -- so every "do this to all supports"
 * walk hand-wrote the collection list, and a list missing one failed SILENTLY.
 * That shipped twice: applyZShift skipped sticks, and normalizeLoadedKnotAndLeaf-
 * Geometry had no stick map, both invisible until geometry looked wrong.
 *
 * Deriving the walks from one list makes "did this cover every type?" a question
 * the compiler answers.
 *
 * Excludes `knots` (attachments, no modelId) and interaction fields.
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
 * The payload stores collections as ARRAYS, so it needs its own walk -- derived
 * from the same list so the two cannot drift.
 *
 * Optional collections stay `undefined` rather than `[]`: the payload shape is
 * part of the import contract.
 *
 * Kickstands are NOT handled here -- they nest at `kickstands[].kickstand`, so
 * callers must walk them explicitly.
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
