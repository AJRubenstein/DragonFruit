import type { SupportCollectionName, SupportState } from './types';
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

/** Entity collections on SupportState, named once in SupportEntityByCollection. */
export type SupportCollectionKey = SupportCollectionName;

/** Where a type's instances live. Every type is on SupportState today. */
export type SupportCollectionLocation =
    | { store: 'support'; key: SupportCollectionKey }
    | { store: 'kickstand'; key: 'kickstands' };

/**
 * What a support type IS — not how it renders, builds or places. Adding a
 * renderer or builder reference here turns a mechanical refactor into a rewrite.
 */
export interface SupportTypeDescriptor {
    id: SupportTypeId;
    /** Plural display name, so panels listing collections need no label table. */
    label: string;
    location: SupportCollectionLocation;
    selectionCategory: SupportSelectionCategory;
    historyAdd: SupportHistoryActionType;
    historyRemove: SupportHistoryActionType;
    /** Whether a modelId walk includes this type. All nine do; the flag exists so a future type can opt out. */
    carriesModelId: boolean;
    /** Whether instances carry real shafts, for segment and joint walks. */
    hasSegments: boolean;
    /** Contact primitive fields, in order: types name these differently. */
    contactFields: readonly string[];
    /**
     * Whether every segment carries both its own joints, so a host resolves from
     * the segment alone.
     *
     * False for types whose endpoints come from elsewhere -- a root, a parent
     * knot, or a neighbouring segment -- which need their own endpoint maps.
     */
    segmentsCarryBothJoints: boolean;
    /**
     * Whether the type is placed by its own dedicated snap pass.
     *
     * Such a type is skipped by the generic shafted-snap loop, which would
     * otherwise offer its segments a second time.
     */
    hasDedicatedSnapPass: boolean;
    /**
     * Whether a contact cone on this type carries `diskLengthOverride`, which a
     * joint drag strips on commit.
     */
    hasContactDiskLengthOverride: boolean;
    /**
     * Whether an edit gizmo records its own before/after history entry.
     *
     * The generic path commits the preview and records one entry; a type that
     * writes its own would get two.
     */
    ownsEditHistoryEntry: boolean;
    /**
     * Whether instances own a Roots entry, via a `rootId` field.
     *
     * A root with no owner is garbage and gets culled, so a type missing here
     * has its roots deleted out from under it.
     */
    ownsRoot: boolean;
}

export const SUPPORT_TYPES: readonly SupportTypeDescriptor[] = [
    {
        id: 'trunk',
        ownsRoot: true,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: true,
        ownsEditHistoryEntry: true,
        contactFields: ['contactCone'],
        hasSegments: true,
        label: 'Trunks',
        location: { store: 'support', key: 'trunks' },
        selectionCategory: 'trunk',
        historyAdd: SUPPORT_ADD_TRUNK,
        historyRemove: SUPPORT_REMOVE_TRUNK,
        carriesModelId: true,
    },
    {
        id: 'branch',
        ownsRoot: false,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: true,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        hasSegments: true,
        label: 'Branches',
        location: { store: 'support', key: 'branches' },
        selectionCategory: 'branch',
        historyAdd: SUPPORT_ADD_BRANCH,
        historyRemove: SUPPORT_REMOVE_BRANCH,
        carriesModelId: true,
    },
    {
        id: 'leaf',
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        hasSegments: false,
        label: 'Leaves',
        location: { store: 'support', key: 'leaves' },
        selectionCategory: 'leaf',
        historyAdd: SUPPORT_ADD_LEAF,
        historyRemove: SUPPORT_REMOVE_LEAF,
        carriesModelId: true,
    },
    {
        id: 'twig',
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: ['contactDiskA', 'contactDiskB'],
        hasSegments: true,
        label: 'Twigs',
        location: { store: 'support', key: 'twigs' },
        selectionCategory: 'twig',
        historyAdd: SUPPORT_ADD_TWIG,
        historyRemove: SUPPORT_REMOVE_TWIG,
        carriesModelId: true,
    },
    {
        id: 'stick',
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: ['contactConeA', 'contactConeB'],
        hasSegments: true,
        label: 'Sticks',
        location: { store: 'support', key: 'sticks' },
        selectionCategory: 'stick',
        historyAdd: SUPPORT_ADD_STICK,
        historyRemove: SUPPORT_REMOVE_STICK,
        carriesModelId: true,
    },
    {
        id: 'brace',
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: [],
        hasSegments: false,
        label: 'Braces',
        location: { store: 'support', key: 'braces' },
        selectionCategory: 'brace',
        historyAdd: SUPPORT_ADD_BRACE,
        historyRemove: SUPPORT_REMOVE_BRACE,
        carriesModelId: true,
    },
    {
        id: 'anchor',
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        hasSegments: true,
        label: 'Anchors',
        location: { store: 'support', key: 'anchors' },
        selectionCategory: 'anchor',
        historyAdd: SUPPORT_ADD_ANCHOR,
        historyRemove: SUPPORT_REMOVE_ANCHOR,
        carriesModelId: true,
    },
    {
        id: 'kickstand',
        ownsRoot: true,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        ownsEditHistoryEntry: false,
        contactFields: [],
        hasSegments: true,
        label: 'Kickstands',
        location: { store: 'support', key: 'kickstands' },
        selectionCategory: 'kickstand',
        historyAdd: SUPPORT_ADD_KICKSTAND,
        historyRemove: SUPPORT_REMOVE_KICKSTAND,
        carriesModelId: true,
    },
];

/**
 * The store's update function for a type, filled in by state.ts at load.
 *
 * A slot rather than an import: state.ts calls into this module while building
 * its initial state, so importing it back would be an initialisation cycle.
 */
type SupportUpdater = (entity: never) => void;

const UPDATERS = new Map<SupportTypeId, SupportUpdater>();

/** Called once by state.ts; later calls for the same id replace the previous one. */
export function registerSupportUpdater<T>(id: SupportTypeId, update: (entity: T) => void): void {
    UPDATERS.set(id, update as SupportUpdater);
}

/**
 * Apply an entity back to the store by type id.
 *
 * Returns false when nothing is registered for the id, so a caller can tell
 * "no updater" from "updated".
 */
export function updateSupportEntity(id: SupportTypeId, entity: unknown): boolean {
    const update = UPDATERS.get(id);
    if (!update) return false;
    (update as (value: unknown) => void)(entity);
    return true;
}

/**
 * How a type sizes a knot sitting on its shaft, when it does so specially.
 *
 * Most types leave this unset and get the generic segment-diameter rule. Twigs
 * taper along their length, so a knot on one is sized from that taper instead.
 * A slot for the same reason as the updaters: the rule lives with the type, but
 * importing it here would be an initialisation cycle.
 */
type KnotDiameterRule = (entity: unknown, segmentId: string, t: number) => number | null;

const KNOT_DIAMETER_RULES = new Map<SupportTypeId, KnotDiameterRule>();

export function registerKnotDiameterRule<T>(
    id: SupportTypeId,
    rule: (entity: T, segmentId: string, t: number) => number | null,
): void {
    KNOT_DIAMETER_RULES.set(id, rule as KnotDiameterRule);
}

/** The type's own knot diameter at `t`, or null to use the generic rule. */
export function resolveKnotDiameter(
    id: SupportTypeId,
    entity: unknown,
    segmentId: string,
    t: number,
): number | null {
    return KNOT_DIAMETER_RULES.get(id)?.(entity, segmentId, t) ?? null;
}

/**
 * Ids of every Roots entry some entity still claims.
 *
 * A root outlives the entity that made it unless something culls it, so callers
 * need the live set. Derived from `ownsRoot` rather than named types: a new
 * root-owning type would otherwise have its roots collected as garbage.
 */
export function collectOwnedRootIds(
    collections: Partial<Record<SupportCollectionKey, Record<string, unknown>>>,
): Set<string> {
    const owned = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.ownsRoot) continue;
        const record = collections[descriptor.location.key];
        if (!record) continue;
        for (const entity of Object.values(record)) {
            const rootId = (entity as { rootId?: string }).rootId;
            if (rootId) owned.add(rootId);
        }
    }
    return owned;
}

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

/**
 * The placement surface an entity contacts, from whichever contact field is set.
 *
 * Braces and kickstands declare no contact fields and always return undefined.
 */
export function getPlacementSurface(
    descriptor: SupportTypeDescriptor,
    entity: unknown,
): 'interior' | 'exterior' | undefined {
    const record = entity as Record<string, { placementSurface?: 'interior' | 'exterior' } | undefined>;
    for (const field of descriptor.contactFields) {
        const surface = record[field]?.placementSurface;
        if (surface) return surface;
    }
    return undefined;
}

/** Collections whose entities have real shafts, for segment and joint walks. */
export const SHAFTED_COLLECTION_KEYS: readonly SupportCollectionKey[] = SUPPORT_TYPES
    .filter((descriptor) => descriptor.hasSegments)
    .map((descriptor) => descriptor.location.key as SupportCollectionKey);

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

/** Collections selection resolves by direct id lookup: roots, then support types. */
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

/**
 * Categories that count as "a support is selected": every type, plus `root`.
 *
 * Knots are excluded -- selecting one is selecting an attachment point, which
 * the multi-selection paths treat as not-a-support.
 */
export const SUPPORT_SELECTION_CATEGORIES: ReadonlySet<SupportSelectionCategory> = new Set([
    ...SUPPORT_TYPES.map((descriptor) => descriptor.selectionCategory),
    'root' as SupportSelectionCategory,
]);

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
