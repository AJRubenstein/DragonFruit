import { MODEL_ID_COLLECTION_KEYS, SUPPORT_COLLECTION_KEYS, type SupportCollectionKey } from './supportTypeRegistry';
import type { DragonfruitImportFormat, SupportState } from './types';

/**
 * Keys of `SupportState` holding modelId-bearing support entities. Excludes
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

/** The payload's collection part: every `DragonfruitImportFormat` key but `version` and `meta`. */
export type ImportPayloadCollections = Pick<DragonfruitImportFormat, SupportCollectionKey>;

/**
 * The payload's collections in the order `DragonfruitImportFormat` declares them.
 *
 * Written out rather than walked, because the ORDER is part of the wire format:
 * serialised exports are compared byte-for-byte by the export goldens, and the
 * export manager hashes them. `SUPPORT_COLLECTION_KEYS` is a different order --
 * primitives first, then the types -- so walking it would silently reorder every
 * export.
 *
 * This is the one place a payload key is named. `types.ts` may name them for the
 * same reason: a wire contract is not a walk. Membership is still guarded --
 * `registryIsSingleSourceOfTruth.test.ts` fails if this list and the registry
 * disagree, so a ninth type cannot be dropped from an export unnoticed.
 */
export const IMPORT_PAYLOAD_COLLECTION_ORDER: readonly SupportCollectionKey[] = [
    'roots',
    'trunks',
    'branches',
    'leaves',
    'twigs',
    'sticks',
    'braces',
    'stumps',
    'knots',
    'kickstands',
];

/**
 * The wire format's collections, read out of any registry-keyed source as arrays.
 *
 * `DragonfruitImportFormat` stores every collection as an array, while the store
 * and the scoped payloads hold them as id-keyed records. Both builders that
 * materialise the format listed the ten keys by hand -- the same shape that has
 * already dropped a collection once, when an export asked to omit supports kept
 * its stumps -- and neither would have carried a type added to the registry.
 */
export function importPayloadCollections(source: Partial<Record<SupportCollectionKey, unknown>>): ImportPayloadCollections {
    const collections = {} as Record<SupportCollectionKey, unknown[]>;
    for (const key of IMPORT_PAYLOAD_COLLECTION_ORDER) {
        const value = (source as Record<string, unknown>)[key];
        collections[key] = Array.isArray(value) ? value : Object.values((value ?? {}) as Record<string, unknown>);
    }
    return collections as ImportPayloadCollections;
}
