import type { Segment, SupportState } from '../types';
import { getSnapshot, setSnapshot } from '../state';
import { MODEL_ID_COLLECTION_KEYS, type SupportCollectionKey } from '../supportTypeRegistry';

/**
  * Owns the relationship between supports and models: query a model's supports,
  * and remove them when it is deleted. Both walks come from
  * MODEL_ID_COLLECTION_KEYS so a collection cannot be silently missed.
  */

/** Ids of a model's supports, one array per modelId-bearing collection. */
export type ModelSupportIds = Record<SupportCollectionKey, string[]>;

function emptyModelSupportIds(): ModelSupportIds {
    const result = {} as ModelSupportIds;
    for (const key of MODEL_ID_COLLECTION_KEYS) result[key] = [];
    return result;
}

/** Finds all support entity ids associated with a given model id. */
export function getSupportsForModel(
    state: Pick<SupportState, SupportCollectionKey>,
    modelId: string,
): ModelSupportIds {
    const result = emptyModelSupportIds();

    for (const key of MODEL_ID_COLLECTION_KEYS) {
        const record = state[key] as Record<string, { modelId?: string }> | undefined;
        if (!record) continue;
        for (const [id, entity] of Object.entries(record)) {
            if (entity.modelId === modelId) result[key].push(id);
        }
    }

    return result;
}

/** Segment ids owned by the entities being removed, for cascading knot removal. */
function collectRemovedSegmentIds(
    state: Pick<SupportState, SupportCollectionKey>,
    removing: ModelSupportIds,
): Set<string> {
    const segmentIds = new Set<string>();

    for (const key of MODEL_ID_COLLECTION_KEYS) {
        const record = state[key] as Record<string, { segments?: Segment[] }> | undefined;
        if (!record) continue;
        for (const id of removing[key]) {
            for (const segment of record[id]?.segments ?? []) segmentIds.add(segment.id);
        }
    }

    // Braces have no `segments`; their knots hang off a synthetic shaft id.
    for (const braceId of removing.braces) segmentIds.add(`braceSegment:${braceId}`);

    return segmentIds;
}

/**
 * Removes every support belonging to `modelId`.
 *
 * @returns entities removed, excluding roots -- they cascade from shaft removals
 * rather than counting as removals themselves.
 */
export function deleteSupportsForModel(state: SupportState, modelId: string): number {
    const removing = getSupportsForModel(state, modelId);

    const hasAnything = MODEL_ID_COLLECTION_KEYS.some((key) => removing[key].length > 0);
    if (!hasAnything) return 0;

    const removingSets = {} as Record<SupportCollectionKey, Set<string>>;
    for (const key of MODEL_ID_COLLECTION_KEYS) removingSets[key] = new Set(removing[key]);

    const segmentsToRemove = collectRemovedSegmentIds(state, removing);

    // A kickstand owns its root and host knot, so both go with it.
    const knotsToRemove = new Set<string>();
    for (const kickstandId of removing.kickstands) {
        const kickstand = state.kickstands[kickstandId];
        if (!kickstand) continue;
        removingSets.roots.add(kickstand.rootId);
        knotsToRemove.add(kickstand.hostKnotId);
    }

    for (const [knotId, knot] of Object.entries(state.knots)) {
        const parentShaftId = knot.parentShaftId;
        const removeByShaft = segmentsToRemove.has(parentShaftId);
        const removeByLeafCone = parentShaftId.startsWith('leafCone:')
            && removingSets.leaves.has(parentShaftId.slice('leafCone:'.length));
        const removeByBraceSegment = parentShaftId.startsWith('braceSegment:')
            && removingSets.braces.has(parentShaftId.slice('braceSegment:'.length));
        if (removeByShaft || removeByLeafCone || removeByBraceSegment) {
            knotsToRemove.add(knotId);
        }
    }

    const filterRecord = <T>(record: Record<string, T>, shouldRemove: (id: string) => boolean): Record<string, T> => {
        const next: Record<string, T> = {};
        for (const [id, value] of Object.entries(record)) {
            if (shouldRemove(id)) continue;
            next[id] = value;
        }
        return next;
    };

    const nextState: SupportState = {
        ...state,
        knots: filterRecord(state.knots, (id) => knotsToRemove.has(id)),
        selectedId: null,
        selectedCategory: null,
        hoveredId: null,
    };

    for (const key of MODEL_ID_COLLECTION_KEYS) {
        (nextState as unknown as Record<string, unknown>)[key] = filterRecord(
            state[key] as Record<string, unknown>,
            (id) => removingSets[key].has(id),
        );
    }

    setSnapshot(nextState);

    let removedCount = 0;
    for (const key of MODEL_ID_COLLECTION_KEYS) {
        if (key === 'roots') continue;
        removedCount += removing[key].length;
    }

    return removedCount;
}

/** Convenience wrapper for callers that do not already hold a snapshot. */
export function getSupportsForModelFromStore(modelId: string): ModelSupportIds {
    return getSupportsForModel(getSnapshot(), modelId);
}
