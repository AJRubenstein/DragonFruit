import { MODEL_ID_COLLECTION_KEYS, type SupportCollectionKey } from './supportTypeRegistry';
import type { SupportState } from './types';

/**
 * Keys of `SupportState` holding modelId-bearing support entities.
 *
 * A support's type is implicit -- an entity is a Stick because its id is a key in
 * `state.sticks` -- so a walk that misses a collection fails silently. Excludes
 * `knots`, which are attachments and carry no modelId.
 */
export const SUPPORT_ENTITY_COLLECTIONS = MODEL_ID_COLLECTION_KEYS;

export type SupportEntityCollectionKey = SupportCollectionKey;

/** Narrower than SupportState so these work on a partial import payload too. */
export type SupportEntityCollections = Pick<SupportState, SupportEntityCollectionKey>;

/** Minimum shape a support entity must have to take part in these walks. */
export interface SupportEntityLike {
    id: string;
    modelId?: string;
}

/**
 * Apply `mapEntity` to every entity in every collection, copy-on-write.
 *
 * Returns the original object when nothing changed, so callers keep their
 * `if (changed)` short-circuit. `mapEntity` signals "no change" by returning the
 * entity by reference.
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
 * The payload stores collections as arrays, so it needs its own walk. Optional
 * collections stay `undefined` rather than `[]` -- the shape is part of the
 * import contract. Kickstands nest at `kickstands[].kickstand` and are not
 * covered here.
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
