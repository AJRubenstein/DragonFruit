import type { SupportClipboardPayload } from '../../PlacementLogic/supportClipboard';
import {
    getSupportTypeDescriptor,
    SUPPORT_COLLECTION_KEYS,
    SUPPORT_TYPES,
    type SupportCollectionKey,
    type SupportEntityFor,
    type SupportTypeId,
} from '../../supportTypeRegistry';

/** Collection keys and entity walks, asked of the registry rather than spelled. */

/** The collection a type's entities live in. */
export function keyOf(typeId: SupportTypeId): SupportCollectionKey {
    return getSupportTypeDescriptor(typeId).location.key;
}

/** Every collection key, in registry order. */
export const ALL_COLLECTION_KEYS: readonly SupportCollectionKey[] = SUPPORT_COLLECTION_KEYS;

/** The type owning a collection, or null for the primitives (`roots`, `knots`). */
export function owningTypeId(key: SupportCollectionKey): SupportTypeId | null {
    return SUPPORT_TYPES.find((descriptor) => descriptor.location.key === key)?.id ?? null;
}

/**
 * An entity as a mixed walk sees it. A caller that knows the type should use
 * `SupportEntityFor<T>` instead.
 */
export interface WalkedEntity {
    id: string;
    modelId?: string;
    segments?: Array<{ id: string; bottomJoint?: { id?: string }; topJoint?: { id?: string } }>;
    [field: string]: unknown;
}

/** A collection's entities, whether the source holds an array or a record. */
export function entitiesIn<T = WalkedEntity>(source: object, key: SupportCollectionKey): T[] {
    const value = (source as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value as T[];
    return Object.values((value ?? {}) as Record<string, T>);
}

/**
 * Every collection in `source` as `[key, entities]`, so a fixture or an assertion
 * can walk all of them without naming each one -- and so it cannot silently skip
 * one, which is how a hand-written list falls behind the registry.
 */
export function collectionEntries(source: object): Array<[SupportCollectionKey, WalkedEntity[]]> {
    return ALL_COLLECTION_KEYS.map((key) => [key, entitiesIn(source, key)] as [SupportCollectionKey, WalkedEntity[]]);
}

/**
 * A clipboard payload with every collection present and empty, to be filled with
 * `setCollection`.
 *
 * A literal cannot express these fixtures any more. Spelling the keys breaks on a
 * rename, and deriving them with `[keyOf('trunk')]` collapses the object to an
 * index signature -- which loses the check that a trunk's rows really are trunks.
 * Assigning through a type id keeps both: the key comes from the registry, and the
 * value is checked against the entity type that same id names.
 */
export function emptyPayload(): SupportClipboardPayload {
    const payload = { kickstandRoots: [], kickstandKnots: [] } as unknown as SupportClipboardPayload;
    for (const key of ALL_COLLECTION_KEYS) {
        (payload as Record<string, unknown>)[key] = [];
    }
    return payload;
}

/** Fill one collection of a payload, with the entities the type declares. */
export function setCollection<K extends SupportTypeId>(
    payload: SupportClipboardPayload,
    typeId: K,
    entities: Array<SupportEntityFor<K>>,
): void {
    (payload as Record<string, unknown>)[keyOf(typeId)] = entities;
}
