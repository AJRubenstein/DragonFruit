import { SUPPORT_TYPES } from './supportTypeRegistry';

/**
 * Rewrite a support payload written under a type's FORMER names into the shape
 * the store reads today.
 *
 * A `.voxl` scene or `.lys` import keys its support payload by collection name
 * (`anchors: [...]`). Renaming a type renames that key, so without this pass a
 * file written under the old name loads with those entities in no collection at
 * all -- they are dropped from the scene with no error.
 *
 * This module names no type: the old spellings are declared on each descriptor
 * as `renamedFrom`, so a later rename edits only the descriptor.
 */

/** A payload keyed by support collection, as the wire format writes it. */
type SupportPayload = Record<string, unknown>;

/**
 * Every descriptor's former collection key, mapped to the key in use now.
 * Derived once at load: the registry is a naming point and its content is fixed.
 */
const COLLECTION_KEY_MIGRATIONS: readonly { from: string; to: string }[] =
    SUPPORT_TYPES.flatMap((descriptor) => (
        (descriptor.renamedFrom?.collectionKeys ?? []).map((from) => ({
            from,
            to: descriptor.location.key,
        }))
    ));

/** Every former type id, mapped to the id in use now. */
const TYPE_ID_MIGRATIONS: readonly { from: string; to: string }[] =
    SUPPORT_TYPES.flatMap((descriptor) => (
        (descriptor.renamedFrom?.ids ?? []).map((from) => ({ from, to: descriptor.id }))
    ));

/** The current id for a possibly-former one. */
function currentTypeId(typeId: unknown): string | undefined {
    if (typeof typeId !== 'string') return undefined;
    return TYPE_ID_MIGRATIONS.find((m) => m.from === typeId)?.to;
}

/**
 * Migrate a support payload in place-of-copy. Idempotent, and a payload that is
 * already current is returned BY IDENTITY, so a caller holding a cached document
 * does not see it rebuilt on every load. The input is never mutated.
 */
export function migrateLegacySupportPayload<T>(payload: T): T {
    if (!payload || typeof payload !== 'object') return payload;
    const source = payload as SupportPayload;

    // Nothing to do unless a former collection key is present, or some entity
    // still carries a former type id.
    const hasFormerKey = COLLECTION_KEY_MIGRATIONS.some(({ from }) => from in source);
    const hasFormerStamp = !hasFormerKey && SUPPORT_TYPES.some((descriptor) => {
        const entities = source[descriptor.location.key];
        return Array.isArray(entities) && entities.some((entity) => {
            const record = entity as { typeId?: unknown; origin?: unknown } | null;
            return currentTypeId(record?.typeId) || currentTypeId(record?.origin);
        });
    });
    if (!hasFormerKey && !hasFormerStamp) return payload;

    const migrated: SupportPayload = { ...source };

    for (const { from, to } of COLLECTION_KEY_MIGRATIONS) {
        if (!(from in migrated)) continue;
        const legacy = migrated[from];
        // A payload carrying both keys was written by a build that migrated and
        // then re-saved, so the former key is stale residue: the current one wins.
        if (!(to in migrated)) migrated[to] = legacy;
        delete migrated[from];
    }

    for (const descriptor of SUPPORT_TYPES) {
        const entities = migrated[descriptor.location.key];
        if (!Array.isArray(entities)) continue;
        if (!entities.some((entity) => {
            const record = entity as { typeId?: unknown; origin?: unknown } | null;
            return currentTypeId(record?.typeId) || currentTypeId(record?.origin);
        })) continue;
        migrated[descriptor.location.key] = entities.map((entity) => {
            const record = entity as { typeId?: unknown; origin?: unknown } | null;
            const to = currentTypeId(record?.typeId);
            // An entity's ORIGIN may carry the same former name: the origin that
            // names the near-plate band is spelled after the type that claims it.
            // It is a separate vocabulary, so it is migrated separately and only
            // when it actually holds a former name.
            const originTo = currentTypeId(record?.origin);
            if (!to && !originTo) return entity;
            return {
                ...(entity as object),
                ...(to ? { typeId: to } : {}),
                ...(originTo ? { origin: originTo } : {}),
            };
        });
    }

    return migrated as T;
}
