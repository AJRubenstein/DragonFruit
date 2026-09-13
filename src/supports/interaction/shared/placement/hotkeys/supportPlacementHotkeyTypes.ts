import type * as THREE from 'three';
import { BRANCH_FAMILY_MEMBER_TYPES, PLACEMENT_MODE_OWNER_TYPES, getSupportTypeDescriptor } from '../../../../supportTypeRegistry';
import type {
    BranchFamilyMemberTypeId,
    ModelSurfaceGestureTypeId,
    OwnNamedPlacementFamilyTypeId,
    PlacementFamilyName,
    PlacementModeOwnerTypeId,
    SupportTypeDescriptor,
} from '../../../../supportTypeRegistry';
import type { HotkeyBinding } from '@/hotkeys/hotkeyConfig';

/**
 * Which placement a pointer gesture belongs to.
 *
 * Every member that names a type is derived in the registry, so a rename there
 * renames the family here. `branchFamily` is the one family NAME rather than a
 * type: branch and brace share one placement binding.
 */
export type SupportPlacementFamily = 'none' | PlacementFamilyName;
/**
 * Which placement a pointer gesture belongs to.
 *
 * Drawn from the registry's `PlacementModeOwnerTypeId` rather than spelled out,
 * so renaming a type in the registry renames it here. Only the types with a
 * placement mode appear; the set is held by `supportPlacementRouting.test.ts`.
 */
export type SupportPlacementOwner = 'none' | PlacementModeOwnerTypeId;
/** Model-surface gestures route to the types that declare they claim them. */
export type SupportModelPlacementOwner = 'none' | ModelSurfaceGestureTypeId;

/**
 * The model-face half of a placement hook. Every claiming type exposes it with
 * the same signature, so the router's owner can index a table of them.
 */
export interface SupportModelPlacementHandlers {
    onModelHover: (hit: THREE.Intersection | null) => void;
    onModelClick: (hit: THREE.Intersection | null) => void;
}
export type SupportPlacementFirstClickTarget = 'none' | 'model' | 'support';

export interface SupportPlacementModifierState {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

export interface SupportPlacementHotkeyBindings {
    branchFamily: HotkeyBinding;
    leaf: HotkeyBinding;
    kickstand: HotkeyBinding;
}

/** Whether `typeId` is placed by the shared branch binding rather than its own. */
function isBranchFamilyMember(typeId: PlacementModeOwnerTypeId): typeId is BranchFamilyMemberTypeId {
    return BRANCH_FAMILY_MEMBER_TYPES.some((memberTypeId) => memberTypeId === typeId);
}

/**
 * The own-named placement families: the owners that are NOT members of the
 * shared `branchFamily` binding, and so give their binding their own name.
 *
 * Read off the registry, so a type joining or leaving either set moves this
 * list, and with it the family values below.
 */
const OWN_NAMED_PLACEMENT_FAMILY_TYPES: readonly OwnNamedPlacementFamilyTypeId[] =
    PLACEMENT_MODE_OWNER_TYPES.filter(
        (typeId): typeId is OwnNamedPlacementFamilyTypeId => !isBranchFamilyMember(typeId),
    );

/**
 * The one own-named family declaring `flag`, asserting there is exactly one.
 *
 * The two own-named families are told apart by WHERE they place, which is what
 * `claimsModelSurfaceGestures` already records: a leaf is placed against the
 * model face and claims a model-surface gesture, while a kickstand is placed
 * between existing shafts and claims none. Reading that flag is what keeps the
 * type's name out of this table -- a name is exactly the literal this table
 * exists to avoid. Should a third own-named family ever appear, one side of the
 * split would stop being unique; this throws rather than silently picking a
 * contender, the same shape as the registry's `coneKnotHostType`.
 */
function singleOwnNamedFamily(
    flag: string,
    test: (descriptor: SupportTypeDescriptor) => boolean,
): OwnNamedPlacementFamilyTypeId {
    const matches = OWN_NAMED_PLACEMENT_FAMILY_TYPES.filter((typeId) =>
        test(getSupportTypeDescriptor(typeId)),
    );
    const [typeId, ...rest] = matches;
    if (!typeId || rest.length > 0) {
        throw new Error(
            `expected exactly one own-named placement family ${flag}, found: ${matches.join(', ') || 'none'}.`,
        );
    }
    return typeId;
}

/** The own-named family that places against the model face. */
const MODEL_FACE_PLACEMENT_FAMILY = singleOwnNamedFamily(
    'that claims a model-surface gesture',
    (descriptor) => descriptor.claimsModelSurfaceGestures,
);

/** The own-named family that places between existing supports. */
const BETWEEN_SUPPORTS_PLACEMENT_FAMILY = singleOwnNamedFamily(
    'that claims no model-surface gesture',
    (descriptor) => !descriptor.claimsModelSurfaceGestures,
);

/**
 * The family each placement binding belongs to.
 *
 * A mode with a family of its own gives its binding that family's name -- the
 * binding and the family are the same word, because the family was never
 * separate from the type. Branch and brace share the one `branchFamily`
 * binding, which is a family NAME rather than a type id and so is the only
 * value here that is not a type.
 *
 * Only `branchFamily` is spelled here; the type-named values come off the
 * registry's flag-derived families, so a rename moves them.
 *
 * Keyed by BINDING, not owner: the owner constants are derived in the router,
 * which imports the resolver, so an owner-keyed table would cycle.
 */
export const PLACEMENT_FAMILY_BY_BINDING = {
    branchFamily: 'branchFamily',
    leaf: MODEL_FACE_PLACEMENT_FAMILY,
    kickstand: BETWEEN_SUPPORTS_PLACEMENT_FAMILY,
} as const satisfies Record<keyof SupportPlacementHotkeyBindings, SupportPlacementFamily>;

export interface ResolvedSupportPlacementHotkeyIntent {
    family: SupportPlacementFamily;
    requiredKeysHeld: boolean;
    releaseShouldCancel: boolean;
    bindingSource: HotkeyBinding | null;
    matches: {
        branchFamily: boolean;
        leaf: boolean;
        kickstand: boolean;
    };
}

export interface SupportPlacementRoutingState {
    branchHotkeyActive: boolean;
    branchAwaitingBase: boolean;
    leafHotkeyActive: boolean;
    leafAwaitingBase: boolean;
    braceHotkeyActive: boolean;
    braceAwaitingEnd: boolean;
    kickstandHotkeyActive: boolean;
}

export interface ResolvedSupportPlacementOwner {
    owner: SupportPlacementOwner;
    basedOnFirstClick: boolean;
    firstClickTarget: SupportPlacementFirstClickTarget;
    modelHoverOwner: SupportModelPlacementOwner;
    modelClickOwner: SupportModelPlacementOwner;
    blocksDefaultModelPlacement: boolean;
    intent: ResolvedSupportPlacementHotkeyIntent;
}
