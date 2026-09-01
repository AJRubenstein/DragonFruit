import type { SupportState } from './types';
import {
    SUPPORT_ADD_TRUNK, SUPPORT_REMOVE_TRUNK,
    SUPPORT_ADD_BRANCH, SUPPORT_REMOVE_BRANCH,
    SUPPORT_ADD_LEAF, SUPPORT_REMOVE_LEAF,
    SUPPORT_ADD_TWIG, SUPPORT_REMOVE_TWIG,
    SUPPORT_ADD_STICK, SUPPORT_REMOVE_STICK,
    SUPPORT_ADD_BRACE, SUPPORT_REMOVE_BRACE,
    SUPPORT_ADD_ANCHOR, SUPPORT_REMOVE_ANCHOR,
    SUPPORT_ADD_KICKSTAND, SUPPORT_REMOVE_KICKSTAND,
} from './history/actionTypes';
import type { SupportHistoryActionType } from './history/actionTypes';

export type SupportTypeId =
    | 'trunk'
    | 'branch'
    | 'leaf'
    | 'twig'
    | 'stick'
    | 'brace'
    | 'anchor'
    | 'kickstand';

export type SupportSelectionCategory = SupportTypeId | 'root' | 'joint' | 'knot' | 'segment' | 'contactDisk';

/**
 * Entity collections on SupportState: the keys holding Record<string, Entity>,
 * excluding interaction fields like selectedId. Derived, so a new collection on
 * SupportState is picked up automatically.
 */
export type SupportCollectionKey = NonNullable<{
    [K in keyof SupportState]-?: SupportState[K] extends Record<string, { id: string }> ? K : never;
}[keyof SupportState]>;

/**
 * Where a type's instances live. Every type is on SupportState now; the union is
 * kept so a future type can declare a different home without reshaping this.
 */
export type SupportCollectionLocation =
    | { store: 'support'; key: SupportCollectionKey }
    | { store: 'kickstand'; key: 'kickstands' };

/**
 * What a support type IS — not how it renders, builds or places. Adding a
 * renderer or builder reference here turns a mechanical refactor into a rewrite.
 */
export interface SupportTypeDescriptor {
    id: SupportTypeId;
    location: SupportCollectionLocation;
    selectionCategory: SupportSelectionCategory;
    historyAdd: SupportHistoryActionType;
    historyRemove: SupportHistoryActionType;
    /** Whether a modelId walk includes this type. All nine do; the flag exists so a future type can opt out. */
    carriesModelId: boolean;
}

export const SUPPORT_TYPES: readonly SupportTypeDescriptor[] = [
    {
        id: 'trunk',
        location: { store: 'support', key: 'trunks' },
        selectionCategory: 'trunk',
        historyAdd: SUPPORT_ADD_TRUNK,
        historyRemove: SUPPORT_REMOVE_TRUNK,
        carriesModelId: true,
    },
    {
        id: 'branch',
        location: { store: 'support', key: 'branches' },
        selectionCategory: 'branch',
        historyAdd: SUPPORT_ADD_BRANCH,
        historyRemove: SUPPORT_REMOVE_BRANCH,
        carriesModelId: true,
    },
    {
        id: 'leaf',
        location: { store: 'support', key: 'leaves' },
        selectionCategory: 'leaf',
        historyAdd: SUPPORT_ADD_LEAF,
        historyRemove: SUPPORT_REMOVE_LEAF,
        carriesModelId: true,
    },
    {
        id: 'twig',
        location: { store: 'support', key: 'twigs' },
        selectionCategory: 'twig',
        historyAdd: SUPPORT_ADD_TWIG,
        historyRemove: SUPPORT_REMOVE_TWIG,
        carriesModelId: true,
    },
    {
        id: 'stick',
        location: { store: 'support', key: 'sticks' },
        selectionCategory: 'stick',
        historyAdd: SUPPORT_ADD_STICK,
        historyRemove: SUPPORT_REMOVE_STICK,
        carriesModelId: true,
    },
    {
        id: 'brace',
        location: { store: 'support', key: 'braces' },
        selectionCategory: 'brace',
        historyAdd: SUPPORT_ADD_BRACE,
        historyRemove: SUPPORT_REMOVE_BRACE,
        carriesModelId: true,
    },
    {
        id: 'anchor',
        location: { store: 'support', key: 'anchors' },
        selectionCategory: 'anchor',
        historyAdd: SUPPORT_ADD_ANCHOR,
        historyRemove: SUPPORT_REMOVE_ANCHOR,
        carriesModelId: true,
    },
    {
        id: 'kickstand',
        location: { store: 'support', key: 'kickstands' },
        selectionCategory: 'kickstand',
        historyAdd: SUPPORT_ADD_KICKSTAND,
        historyRemove: SUPPORT_REMOVE_KICKSTAND,
        carriesModelId: true,
    },
];

const BY_ID = new Map<SupportTypeId, SupportTypeDescriptor>(
    SUPPORT_TYPES.map((descriptor) => [descriptor.id, descriptor]),
);

export function getSupportTypeDescriptor(id: SupportTypeId): SupportTypeDescriptor {
    const descriptor = BY_ID.get(id);
    if (!descriptor) throw new Error(`Unknown support type: ${id}`);
    return descriptor;
}

export function getSupportTypeBySelectionCategory(
    category: string | null | undefined,
): SupportTypeDescriptor | null {
    if (!category) return null;
    return SUPPORT_TYPES.find((descriptor) => descriptor.selectionCategory === category) ?? null;
}

/** Types held in SupportState, in registry order. */
export const SUPPORT_STATE_TYPES: readonly SupportTypeDescriptor[] = SUPPORT_TYPES.filter(
    (descriptor) => descriptor.location.store === 'support',
);

/** Types whose instances carry a modelId. */
export const MODEL_ID_TYPES: readonly SupportTypeDescriptor[] = SUPPORT_TYPES.filter(
    (descriptor) => descriptor.carriesModelId,
);

/**
 * Collections on SupportState that are not support types. Roots and knots are
 * primitives — they belong to a support rather than being one — but they are
 * still selectable and still need an empty collection at startup.
 *
 * ADDING A SUPPORT TYPE: this list is not the place. Add a descriptor to
 * SUPPORT_TYPES above instead.
 */
export const SUPPORT_PRIMITIVE_COLLECTIONS: readonly {
    key: SupportCollectionKey;
    selectionCategory: SupportSelectionCategory;
}[] = [
    { key: 'roots', selectionCategory: 'root' },
    { key: 'knots', selectionCategory: 'knot' },
];

/**
 * Collections selection resolves by direct id lookup, in order: roots, then the
 * support types. Knots are excluded because they resolve after kickstands, which
 * live in a separate store — see resolveSelectionCategory in state.ts.
 */
export const SUPPORT_STATE_COLLECTIONS: readonly {
    key: SupportCollectionKey;
    selectionCategory: SupportSelectionCategory;
}[] = [
    { key: 'roots', selectionCategory: 'root' },
    ...SUPPORT_STATE_TYPES.map((descriptor) => ({
        key: descriptor.location.key as SupportCollectionKey,
        selectionCategory: descriptor.selectionCategory,
    })),
];

/** An empty collection per SupportState entity key, for initial and reset state. */
export function createEmptySupportCollections(): Pick<SupportState, SupportCollectionKey> {
    const collections = {} as Record<SupportCollectionKey, Record<string, never>>;
    for (const { key } of SUPPORT_PRIMITIVE_COLLECTIONS) collections[key] = {};
    for (const descriptor of SUPPORT_STATE_TYPES) {
        collections[descriptor.location.key as SupportCollectionKey] = {};
    }
    return collections as Pick<SupportState, SupportCollectionKey>;
}

/** Entity collection keys on SupportState: primitives first, then support types. */
export const SUPPORT_COLLECTION_KEYS: readonly SupportCollectionKey[] = [
    ...SUPPORT_PRIMITIVE_COLLECTIONS.map((c) => c.key),
    ...SUPPORT_STATE_TYPES.map((d) => d.location.key as SupportCollectionKey),
];

/** Per-collection counts, for load diagnostics. */
export function countSupportCollections(
    snapshot: Pick<SupportState, SupportCollectionKey>,
): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const key of SUPPORT_COLLECTION_KEYS) counts[key] = Object.keys(snapshot[key]).length;
    return counts;
}

/** SupportState collection keys whose entities carry a modelId, in registry order. */
export const MODEL_ID_COLLECTION_KEYS: readonly SupportCollectionKey[] = [
    'roots' as SupportCollectionKey,
    ...SUPPORT_STATE_TYPES
        .filter((d) => d.carriesModelId)
        .map((d) => d.location.key as SupportCollectionKey),
];
