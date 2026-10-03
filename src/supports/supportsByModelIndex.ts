import { SUPPORT_COLLECTION_KEYS } from '@/supports/supportTypeRegistry';
import type { SupportCollectionKey } from '@/supports/supportTypeRegistry';

type Entity = Record<string, unknown>;

/**
 * Every support entity in one collection, bucketed by the model it belongs to.
 * `get` returns an empty array for a model with none, so callers iterate without
 * a null check.
 */
export interface SupportsByModelIndex {
    get(collectionKey: SupportCollectionKey, modelId: string): readonly Entity[];
}

const EMPTY: readonly Entity[] = Object.freeze([]);

/**
 * Buckets each collection's entities by `modelId` in one pass, so a caller
 * working per model reads its own entities instead of filtering the whole scene
 * once per model. Derived from `SUPPORT_COLLECTION_KEYS`, so a new type is
 * indexed without touching this.
 */
export function buildSupportsByModelIndex(state: Record<string, unknown>): SupportsByModelIndex {
    const byCollection = new Map<string, Map<string, Entity[]>>();

    for (const key of SUPPORT_COLLECTION_KEYS) {
        const collection = state[key] as Record<string, Entity> | undefined;
        if (!collection) continue;

        const byModel = new Map<string, Entity[]>();
        for (const entity of Object.values(collection)) {
            const modelId = entity?.modelId;
            if (typeof modelId !== 'string') continue;
            const bucket = byModel.get(modelId);
            if (bucket) bucket.push(entity);
            else byModel.set(modelId, [entity]);
        }
        byCollection.set(key, byModel);
    }

    return {
        get(collectionKey, modelId) {
            return byCollection.get(collectionKey)?.get(modelId) ?? EMPTY;
        },
    };
}
