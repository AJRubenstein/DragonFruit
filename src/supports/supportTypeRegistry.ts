import type { SupportCollectionName, SupportEntityByCollection, SupportRemovedEntityByCollection, SupportState } from './types';
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
import { ANCHOR_HEIGHT_THRESHOLD_MM } from './autoSupport/constants';

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
 * What sits at one end of a support. A type is two endpoints plus whether a
 * shaft joins them; the vocabulary is closed over all eight.
 *
 * - `plateRoot`  -- a Roots row on the plate, via `rootId`.
 * - `inlineRoot` -- plate geometry on the entity, as an anchor carries.
 * - `knot`       -- hangs from a knot on another support's shaft.
 * - `cone` / `disk` -- a contact primitive against the model.
 * - `none`       -- nothing declared at this end.
 */
export type SupportEndpointKind =
    | 'plateRoot'
    | 'inlineRoot'
    | 'knot'
    | 'cone'
    | 'disk'
    | 'none';

/**
 * One end of a support: what kind it is, and the entity field carrying it.
 *
 * `field` is absent for `none`, and for an endpoint whose link is already a
 * declared edge (`plateRoot`, `knot`) -- the edge names the field.
 */
export interface SupportEndpoint {
    kind: SupportEndpointKind;
    field?: string;
}

/**
 * What a placement rule measures.
 *
 * - `contactSpan` -- distance between the two model contacts a support bridges.
 * - `tipHeight`   -- height of the model contact above the plate.
 */
export type SupportPlacementMetric = 'contactSpan' | 'tipHeight';

/**
 * A settings path a threshold reads from, with the fallback used when the
 * setting is absent. The union keeps a typo a compile error.
 */
export type SupportPlacementThreshold =
    | number
    | { setting: SupportPlacementSettingPath; fallback: number };

/**
 * The range of a measurement this type serves.
 *
 * `boundary` says which side owns a value sitting exactly on it, because the
 * hand-written sites disagreed: the span rule used `dist > cutoff` (so the
 * boundary is a twig) while the height rule used `z < threshold` (so the
 * boundary is a trunk). Declaring it keeps both.
 */
export interface SupportPlacementRule {
    metric: SupportPlacementMetric;
    minMm?: SupportPlacementThreshold;
    maxMm?: SupportPlacementThreshold;
    /** Which type claims a value exactly on a shared bound. Default `'lower'`. */
    boundary?: 'lower' | 'upper';
}

/**
 * One link from an entity to something it depends on, or that depends on it.
 *
 * `field` names an id-bearing property on the entity. `to` is what that id
 * points at -- a collection, or `'segment'` for a shaft segment, which is not a
 * collection of its own.
 *
 * `ownership` is the direction the cascade travels, and it is the part that
 * matters:
 *
 * - `owns`     -- removing the ENTITY removes the target. A trunk owns its root.
 * - `hostedBy` -- removing the TARGET removes the entity. A leaf dies with the
 *                 knot it hangs from.
 */
export interface SupportEdge {
    field: string;
    to: SupportCollectionKey | 'segment';
    ownership: 'owns' | 'hostedBy';
    /**
     * For a `hostedBy` edge: whether removing this entity also removes the host.
     *
     * - `'never'`     -- leave the host alone (a knot on a shaft segment).
     * - `'ifUnused'`  -- remove it only when nothing else references it.
     * - `'always'`    -- remove it regardless.
     *
     * The three removers that touch a host knot currently disagree, and the
     * disagreement is deliberate policy rather than drift: a branch takes its
     * knot AND everything else on it, a leaf tidies up only when it was the last
     * user. Declaring it keeps both without a per-type branch in the walk.
     */
    takeHost?: 'never' | 'ifUnused' | 'always';
}

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
    /**
     * Contact primitive fields, lower end first. Use for "every contact",
     * where order does not matter; when the end or kind matters use
     * `lower`/`upper` or `contactEndpointsFor`.
     */
    contactFields: readonly string[];
    /**
     * Prefix a selection id carries when one of this type's segments is
     * selected, if it uses one. Brace alone does today.
     */
    segmentSelectionPrefix?: string;
    /**
     * Whether instances record an auto-support `origin`, which the debug
     * origin-colouring overlay reads.
     */
    hasOrigin: boolean;
    /**
     * Whether the type has an interactive placement hook, and so a live
     * placement preview. Twig, stick and anchor have none -- they are chosen
     * automatically rather than placed.
     */
    hasPlacementPreview: boolean;
    /**
     * The measurement range this type serves, when the type is chosen
     * automatically rather than picked by the user.
     *
     * A missing bound is unbounded on that side; `boundary` decides who owns
     * a value sitting exactly on a shared bound.
     * Enforced by `__tests__/placementRules.test.ts`.
     */
    placementRule?: SupportPlacementRule;
    /**
     * Whether this type's preview yields to any other placement mode.
     *
     * True for the default tool: a trunk preview follows the cursor whenever
     * nothing else is being placed, so it must stand down when another mode
     * takes over. The rest only preview while their own mode is active.
     */
    previewYieldsToOtherModes?: boolean;
    /**
     * Whether the preview shows only while this type's own placement mode is
     * active, rather than whenever a preview exists.
     */
    previewRequiresOwnMode?: boolean;
    /**
     * Whether this type's placement mode displaces the default tool's preview.
     *
     * False for brace: it places between two existing supports rather than
     * against the model, so a trunk preview may sit under it.
     */
    placementModeDisplacesDefault?: boolean;
    /**
     * Where a tapering shaft reads its two end diameters, and on which
     * segment. A taper whose ends differ cannot be instanced, so the whole
     * support drops out of the batched pass.
     */
    shaftTaper?: {
        /** `'all'` tapers every segment; `'last'` only the terminal one. */
        segments: 'all' | 'last';
        /** Entity paths holding the start and end diameters. */
        from: readonly [string, string];
    };
    /** What sits at the bottom of this type. */
    lower: SupportEndpoint;
    /** What sits at the top of this type. */
    upper: SupportEndpoint;
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
     * Whether a model transform marks this type's segments as moved, so knots
     * sitting on them follow.
     *
     * False for a type that moves purely on its own `modelId` and carries no
     * hosted geometry -- an anchor is a plate-to-model stub, and a knot on its
     * shaft is not dragged along by the model moving.
     */
    transformPropagatesToShaft: boolean;
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
    /** How instances link to other entities. See {@link SupportEdge}. */
    edges: readonly SupportEdge[];
    /**
     * How a shaft behaves when its geometry cannot be resolved. Only reached
     * on malformed geometry, and the values differ per type.
     */
    shaftFallback: {
        /** No top joint and no contact: 10 for a trunk, 5 elsewhere. Inherited drift. */
        stubLengthMm: number;
        /**
         * Whether an unresolvable start falls back to the split point. True for
         * self-contained types; a hosted type stays straight instead.
         */
        startFallsBackToSplitPoint: boolean;
    };
    /**
     * Whether instances have per-entity editable settings.
     *
     * Such a type is selectable in the settings sidebar and caches a
     * `settingsCodeHex` outside the entity, keyed by type and id -- so it must
     * evict on remove or the next entity reusing that id inherits stale values.
     */
    hasEditableSettings: boolean;
}

export const SUPPORT_TYPES: readonly SupportTypeDescriptor[] = [
    {
        id: 'trunk',
        hasEditableSettings: true,
        edges: [{ field: 'rootId', to: 'roots', ownership: 'owns' }],
        ownsRoot: true,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: true,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: true,
        contactFields: ['contactCone'],
        shaftFallback: { stubLengthMm: 10, startFallsBackToSplitPoint: false },
        hasOrigin: true,
        hasPlacementPreview: true,
        previewYieldsToOtherModes: true,
        placementRule: { metric: 'tipHeight', minMm: ANCHOR_HEIGHT_THRESHOLD_MM, boundary: 'upper' },
        lower: { kind: 'plateRoot' },
        upper: { kind: 'cone', field: 'contactCone' },
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
        hasEditableSettings: true,
        edges: [{ field: 'parentKnotId', to: 'knots', ownership: 'hostedBy', takeHost: 'always' }],
        ownsRoot: false,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: true,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: false },
        hasOrigin: true,
        hasPlacementPreview: true,
        previewRequiresOwnMode: true,
        placementModeDisplacesDefault: true,
        lower: { kind: 'knot' },
        upper: { kind: 'cone', field: 'contactCone' },
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
        hasEditableSettings: true,
        edges: [{ field: 'parentKnotId', to: 'knots', ownership: 'hostedBy', takeHost: 'ifUnused' }],
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: false },
        hasOrigin: true,
        hasPlacementPreview: true,
        placementModeDisplacesDefault: true,
        lower: { kind: 'knot' },
        upper: { kind: 'cone', field: 'contactCone' },
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
        hasEditableSettings: false,
        edges: [],
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: ['contactDiskA', 'contactDiskB'],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: true },
        hasOrigin: false,
        shaftTaper: { segments: 'all', from: ['contactDiskA.contactDiameterMm', 'contactDiskB.contactDiameterMm'] },
        hasPlacementPreview: false,
        placementRule: { metric: 'contactSpan', maxMm: { setting: 'meshToMesh.stickVsTwigCutoffMm', fallback: 5 } },
        lower: { kind: 'disk', field: 'contactDiskA' },
        upper: { kind: 'disk', field: 'contactDiskB' },
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
        hasEditableSettings: false,
        edges: [],
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: ['contactConeA', 'contactConeB'],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: true },
        hasOrigin: false,
        hasPlacementPreview: false,
        placementRule: { metric: 'contactSpan', minMm: { setting: 'meshToMesh.stickVsTwigCutoffMm', fallback: 5 } },
        lower: { kind: 'cone', field: 'contactConeA' },
        upper: { kind: 'cone', field: 'contactConeB' },
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
        // Two named knot fields rather than a list: the history payload and its
        // undo handler read them by name, and start/end are not interchangeable.
        hasEditableSettings: false,
        edges: [
            { field: 'startKnotId', to: 'knots', ownership: 'hostedBy', takeHost: 'ifUnused' },
            { field: 'endKnotId', to: 'knots', ownership: 'hostedBy', takeHost: 'ifUnused' },
        ],
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: true,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: [],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: false },
        segmentSelectionPrefix: 'braceSegment:',
        hasOrigin: false,
        hasPlacementPreview: true,
        lower: { kind: 'knot' },
        upper: { kind: 'knot' },
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
        hasEditableSettings: false,
        edges: [],
        ownsRoot: false,
        segmentsCarryBothJoints: true,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: false,
        ownsEditHistoryEntry: false,
        contactFields: ['contactCone'],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: true },
        hasOrigin: true,
        hasPlacementPreview: false,
        placementRule: { metric: 'tipHeight', maxMm: ANCHOR_HEIGHT_THRESHOLD_MM, boundary: 'upper' },
        lower: { kind: 'inlineRoot', field: 'rootPos' },
        upper: { kind: 'cone', field: 'contactCone' },
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
        hasEditableSettings: false,
        edges: [
            { field: 'rootId', to: 'roots', ownership: 'owns' },
            { field: 'hostKnotId', to: 'knots', ownership: 'hostedBy', takeHost: 'always' },
            { field: 'hostSegmentId', to: 'segment', ownership: 'hostedBy', takeHost: 'always' },
        ],
        ownsRoot: true,
        segmentsCarryBothJoints: false,
        hasDedicatedSnapPass: false,
        hasContactDiskLengthOverride: false,
        transformPropagatesToShaft: true,
        ownsEditHistoryEntry: false,
        contactFields: [],
        shaftFallback: { stubLengthMm: 5, startFallsBackToSplitPoint: false },
        hasOrigin: false,
        shaftTaper: { segments: 'last', from: ['profile.terminalStartDiameterMm', 'profile.terminalEndDiameterMm'] },
        hasPlacementPreview: true,
        placementModeDisplacesDefault: true,
        lower: { kind: 'plateRoot' },
        upper: { kind: 'knot' },
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
export function registerSupportUpdater<T>(typeId: SupportTypeId, update: (entity: T) => void): void {
    UPDATERS.set(typeId, update as SupportUpdater);
}

/**
 * Apply an entity back to the store by type id.
 *
 * Returns false when nothing is registered for the id, so a caller can tell
 * "no updater" from "updated".
 */
export function updateSupportEntity(typeId: SupportTypeId, entity: unknown): boolean {
    const update = UPDATERS.get(typeId);
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
    typeId: SupportTypeId,
    rule: (entity: T, segmentId: string, t: number) => number | null,
): void {
    KNOT_DIAMETER_RULES.set(typeId, rule as KnotDiameterRule);
}

/** The type's own knot diameter at `t`, or null to use the generic rule. */
export function resolveKnotDiameter(
    typeId: SupportTypeId,
    entity: unknown,
    segmentId: string,
    t: number,
): number | null {
    return KNOT_DIAMETER_RULES.get(typeId)?.(entity, segmentId, t) ?? null;
}

/**
 * What each type's removal returns, so undo can rebuild what it deleted.
 *
 * `self` is the field the removed entity arrives under; types spell it
 * differently and the history handlers read it by name. `cascade` maps a
 * collection to the field its removed members arrive under -- a plural name
 * gets an array, a singular one at most one entity, and a tuple names slots
 * positionally for links that are not interchangeable (a brace's two ends).
 *
 * Declared `as const` and NOT annotated: the literal types are what
 * {@link SupportRemovalResult} derives the per-type return shapes from, so a
 * field renamed here changes every caller's type. Annotating this would widen
 * the literals to `string` and silently break that link -- the same trap that
 * makes a type-level check against SUPPORT_TYPES impossible.
 */
export const SUPPORT_REMOVAL_SHAPES = {
    trunk: { self: 'trunk', cascade: { roots: 'roots', branches: 'branches', braces: 'braces', kickstands: 'kickstands', leaves: 'leaves', knots: 'knots' } },
    branch: { self: 'branch', cascade: { branches: 'branches', braces: 'braces', kickstands: 'kickstands', leaves: 'leaves', knots: 'knots' } },
    leaf: { self: 'leaf', cascade: { knots: 'knot' } },
    twig: { self: 'twig', cascade: { knots: 'knots', leaves: 'leaves' } },
    stick: { self: 'stick', cascade: { knots: 'knots', leaves: 'leaves' } },
    brace: { self: 'brace', cascade: { knots: ['startKnot', 'endKnot'] } },
    anchor: { self: 'anchor', cascade: { knots: 'knots', leaves: 'leaves' } },
    kickstand: { self: 'kickstand', cascade: { roots: 'roots', knots: 'knots', braces: 'braces', leaves: 'leaves', branches: 'branches', kickstands: 'kickstands' } },
} as const;

/**
 * The entity type living in each collection, so a removal result can be typed
 * from the declared shape rather than restated at every call site.
 */
export type SupportEntityIn<K extends SupportCollectionKey> = SupportEntityByCollection[K];

/**
 * What a collection's entities look like when reported in a cascade.
 *
 * Read from SupportRemovedEntityByCollection, which names the one collection
 * that reports a nested shape. No type is named here.
 */
export type RemovedEntity<K extends SupportCollectionKey> = SupportRemovedEntityByCollection[K];

type CascadeField<K extends SupportCollectionKey, F> =
    F extends readonly string[]
        ? { [S in F[number]]: RemovedEntity<K> | null }
        : F extends `${string}s`
            ? { [S in F & string]: RemovedEntity<K>[] }
            : { [S in F & string]: RemovedEntity<K> | null };

type CascadeResult<C> = C extends Readonly<Record<string, unknown>>
    ? { [K in keyof C]: K extends SupportCollectionKey ? CascadeField<K, C[K]> : never }[keyof C]
    : never;

/**
 * What `removeSupportEntity` returns for a given type, derived from
 * {@link SUPPORT_REMOVAL_SHAPES}.
 *
 * Callers get precise field names and entity types without writing them out, so
 * renaming a field in the shape map is a compile error at every consumer rather
 * than a silent undo failure.
 */
export type SupportRemovalResult<T extends SupportTypeId> =
    { [S in (typeof SUPPORT_REMOVAL_SHAPES)[T]['self']]: RemovedEntity<(typeof SUPPORT_TYPE_COLLECTION)[T]> }
    & UnionToIntersection<CascadeResult<(typeof SUPPORT_REMOVAL_SHAPES)[T]['cascade']>>;

type UnionToIntersection<U> =
    (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

/** Type id -> the collection its entities live in, kept literal for the above. */
export const SUPPORT_TYPE_COLLECTION = {
    trunk: 'trunks', branch: 'branches', leaf: 'leaves', twig: 'twigs',
    stick: 'sticks', brace: 'braces', anchor: 'anchors', kickstand: 'kickstands',
} as const;

/** Compile-time check that every support type declares a removal shape. */
type _RemovalShapesCoverEveryType =
    Exclude<SupportTypeId, keyof typeof SUPPORT_REMOVAL_SHAPES> extends never ? true : never;
const _removalShapesCoverEveryType: _RemovalShapesCoverEveryType = true;
void _removalShapesCoverEveryType;

/**
 * How a type derives settings from an entity when it carries no encoded hex.
 *
 * A slot rather than an import: the inference reads other collections, so it
 * lives in `state.ts` and registers itself at load.
 */
type SettingsInference = (entity: unknown, base?: unknown) => unknown;

const SETTINGS_INFERENCE = new Map<SupportTypeId, SettingsInference>();

export function registerSettingsInference<E, B, R>(
    typeId: SupportTypeId,
    infer: (entity: E, base?: B) => R,
): void {
    SETTINGS_INFERENCE.set(typeId, infer as SettingsInference);
}

/** Settings inferred for `entity`, or null when the type declares no rule. */
export function inferSupportSettings<R>(typeId: SupportTypeId, entity: unknown, base?: unknown): R | null {
    const infer = SETTINGS_INFERENCE.get(typeId);
    return infer ? (infer(entity, base) as R) : null;
}

/**
 * How a collection puts one entity back, for undo.
 *
 * A slot rather than an import: the adders live in `state.ts`, and kickstands
 * take a nested build rather than a bare entity. Keyed by collection so the
 * `roots` and `knots` primitives participate alongside the types.
 */
type CollectionRestore = (entity: unknown) => void;

const COLLECTION_RESTORE = new Map<SupportCollectionKey, CollectionRestore>();

export function registerCollectionRestore(
    key: SupportCollectionKey,
    restore: CollectionRestore,
): void {
    COLLECTION_RESTORE.set(key, restore);
}

/** Puts one entity back into `key`. Throws if the collection declared no rule. */
export function restoreToCollection(key: SupportCollectionKey, entity: unknown): void {
    const restore = COLLECTION_RESTORE.get(key);
    if (!restore) throw new Error(`no restore registered for collection "${key}"`);
    restore(entity);
}

/** Whether every collection in the graph can be restored. For a startup check. */
export function collectionsMissingRestore(): SupportCollectionKey[] {
    return SUPPORT_COLLECTION_KEYS.filter((key) => !COLLECTION_RESTORE.has(key));
}

/**
 * Position-bearing fields a model transform must move, beyond the segments and
 * contact fields every shafted type shares.
 *
 * Declared because they are the only per-type difference in the transform's
 * apply phase: a brace carries a bezier curve, an anchor its own root position
 * and joint. Everything else is derived from `hasSegments` and `contactFields`.
 */
/**
 * The contact primitives this type carries, lower end first, each with its end
 * and kind -- so a caller never infers either from the field name.
 */
export function contactEndpointsFor(
    typeId: SupportTypeId,
): readonly { end: 'lower' | 'upper'; kind: 'cone' | 'disk'; field: string }[] {
    const descriptor = getSupportTypeDescriptor(typeId);
    const contacts: { end: 'lower' | 'upper'; kind: 'cone' | 'disk'; field: string }[] = [];
    for (const end of ['lower', 'upper'] as const) {
        const endpoint = descriptor[end];
        if ((endpoint.kind === 'cone' || endpoint.kind === 'disk') && endpoint.field) {
            contacts.push({ end, kind: endpoint.kind, field: endpoint.field });
        }
    }
    return contacts;
}

/**
 * Whether any contact this type declares satisfies `test`.
 *
 * Interior filtering asks this of every type; written out per type it covered
 * four of the eight and named the fields by hand.
 */
export function anyContactMatches(
    typeId: SupportTypeId,
    entity: unknown,
    test: (contact: unknown) => boolean,
): boolean {
    const record = entity as Record<string, unknown> | null | undefined;
    if (!record) return false;
    return contactEndpointsFor(typeId).some(({ field }) => test(record[field]));
}

/** A settings path a placement threshold may read from. */
export type SupportPlacementSettingPath = 'meshToMesh.stickVsTwigCutoffMm';

/** Resolves a threshold, reading the named setting when there is one. */
function thresholdMm(
    threshold: SupportPlacementThreshold | undefined,
    readSetting: (path: SupportPlacementSettingPath) => number | undefined,
): number | undefined {
    if (threshold === undefined) return undefined;
    if (typeof threshold === 'number') return threshold;
    return readSetting(threshold.setting) ?? threshold.fallback;
}

/**
 * Which type serves a measurement, or null when none declares a range for it.
 *
 * Bounds are half-open, so adjacent types meet without overlapping and the
 * answer is unambiguous.
 */
export function selectTypeForPlacement(
    metric: SupportPlacementMetric,
    valueMm: number,
    readSetting: (path: SupportPlacementSettingPath) => number | undefined,
): SupportTypeId | null {
    // A NaN measurement satisfies no comparison, so an unbounded side would
    // otherwise let it through.
    if (!Number.isFinite(valueMm)) return null;

    for (const descriptor of SUPPORT_TYPES) {
        const rule = descriptor.placementRule;
        if (!rule || rule.metric !== metric) continue;

        const min = thresholdMm(rule.minMm, readSetting);
        const max = thresholdMm(rule.maxMm, readSetting);
        const boundaryOwner = rule.boundary ?? 'lower';
        if (min !== undefined && (boundaryOwner === 'lower' ? valueMm <= min : valueMm < min)) continue;
        if (max !== undefined && (boundaryOwner === 'lower' ? valueMm > max : valueMm >= max)) continue;
        return descriptor.id;
    }
    return null;
}

/** Every type declaring a rule for this metric, in registry order. */
export function typesForPlacementMetric(metric: SupportPlacementMetric): readonly SupportTypeDescriptor[] {
    return SUPPORT_TYPES.filter((descriptor) => descriptor.placementRule?.metric === metric);
}

export const SUPPORT_TRANSFORM_EXTRAS = {
    brace: ['curve'],
    anchor: ['rootPos', 'joint'],
} as const satisfies Partial<Record<SupportTypeId, readonly string[]>>;

/** Extra transform fields this type declares, or none. */
export function transformExtrasFor(typeId: SupportTypeId): readonly string[] {
    return (SUPPORT_TRANSFORM_EXTRAS as Record<string, readonly string[]>)[typeId] ?? [];
}

/**
 * Types whose entities have editable settings, and can be a sidebar target.
 *
 * Derived, so a new type with settings joins by declaring the flag.
 */
export const EDITABLE_SUPPORT_TYPES: readonly SupportTypeDescriptor[] =
    SUPPORT_TYPES.filter((descriptor) => descriptor.hasEditableSettings);

/** Whether `id` names a type with editable settings. */
export function isEditableSupportType(id: string): id is SupportTypeId {
    return EDITABLE_SUPPORT_TYPES.some((descriptor) => descriptor.id === id);
}

/**
 * Where an auto-placed support came from, and what that implies.
 *
 * `convertibleToTree` gates trunk-to-tree conversion: anchors sit near the
 * plate and island trunks carry their own geometry, so neither converts. Stated
 * as a property because "not an anchor" was previously written out at the call
 * site, where a fifth origin would silently have joined the convertible set.
 */
export const SUPPORT_ORIGINS = {
    anchor: { convertibleToTree: false },
    overhang: { convertibleToTree: true },
    island: { convertibleToTree: false },
    standalone: { convertibleToTree: true },
} as const;

export type SupportOriginId = keyof typeof SUPPORT_ORIGINS;

/** Whether a trunk with this origin may be converted into a tree. */
export function isOriginConvertibleToTree(origin: string | undefined): boolean {
    if (!origin) return false;
    return SUPPORT_ORIGINS[origin as SupportOriginId]?.convertibleToTree ?? false;
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
    /**
     * How the primitive links to the rest of the graph.
     *
     * A knot's `parentShaftId` is the busiest edge there is -- nearly every
     * cascade travels it -- so a walk that only reads SUPPORT_TYPES misses the
     * majority of what a removal should take.
     */
    edges: readonly SupportEdge[];
}[] = [
    { key: 'roots', selectionCategory: 'root', edges: [] },
    {
        key: 'knots',
        selectionCategory: 'knot',
        edges: [{ field: 'parentShaftId', to: 'segment', ownership: 'hostedBy' }],
    },
];

/**
 * Every collection that takes part in the dependency graph, with its edges.
 *
 * Support types and primitives both, so a graph walk cannot silently skip the
 * primitives the way one reading SUPPORT_TYPES alone would.
 */
export const SUPPORT_GRAPH_NODES: readonly {
    key: SupportCollectionKey;
    edges: readonly SupportEdge[];
    hasSegments: boolean;
}[] = [
    ...SUPPORT_TYPES.map((descriptor) => ({
        key: descriptor.location.key,
        edges: descriptor.edges,
        hasSegments: descriptor.hasSegments,
    })),
    ...SUPPORT_PRIMITIVE_COLLECTIONS.map((primitive) => ({
        key: primitive.key,
        edges: primitive.edges,
        hasSegments: false,
    })),
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
