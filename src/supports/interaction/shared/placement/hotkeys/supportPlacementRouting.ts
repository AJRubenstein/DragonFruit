import {
    resolveSupportPlacementHotkeyIntent,
} from './supportPlacementHotkeyResolver';
import type {
    ResolvedSupportPlacementOwner,
    SupportModelPlacementOwner,
    SupportPlacementFamily,
    SupportPlacementHotkeyBindings,
    SupportPlacementModifierState,
    SupportPlacementOwner,
    SupportPlacementRoutingState,
} from './supportPlacementHotkeyTypes';
import { MODEL_SURFACE_GESTURE_TYPES, SUPPORT_TYPES } from '../../../../supportTypeRegistry';
import type {
    ModelSurfaceGestureTypeId,
    SupportTypeDescriptor,
    SupportTypeId,
} from '../../../../supportTypeRegistry';
import type { SupportPlacementActive, SupportPlacementPreviews } from '../../../../rendering';

/**
 * The types that have a placement mode of their own.
 *
 * A type declares `hasPlacementPreview` when it previews a placement at all, and
 * `previewYieldsToOtherModes` when that preview IS the default tool rather than a
 * mode the user toggles. Trunk declares the latter, so what is left is the modes
 * a pointer gesture can belong to.
 */
export const PLACEMENT_MODE_TYPE_IDS: readonly SupportTypeId[] = SUPPORT_TYPES
    .filter((descriptor) => descriptor.hasPlacementPreview && !descriptor.previewYieldsToOtherModes)
    .map((descriptor) => descriptor.id);

/**
 * The placement owner union without the empty arm: the types themselves.
 *
 * `SupportPlacementOwner` carries `'none'` because a router answer can be "no
 * owner"; a registry lookup can only ever name a type, and this says so.
 */
export type PlacementOwnerTypeId = Exclude<SupportPlacementOwner, 'none'>;

/**
 * The one type declaring `flag`, asserting there is exactly one.
 *
 * The registry is the only place a type is named, so the owners below are read
 * off it rather than spelled into the arms that use them. Everything here goes
 * through this one lookup.
 */
function singleTypeDeclaring(
    flag: string,
    test: (descriptor: SupportTypeDescriptor) => boolean,
): SupportTypeId {
    const matches = SUPPORT_TYPES.filter(test).map((descriptor) => descriptor.id);
    const [typeId, ...rest] = matches;
    if (!typeId || rest.length > 0) {
        throw new Error(
            `expected exactly one support type ${flag}, found: ${matches.join(', ') || 'none'}.`,
        );
    }
    return typeId;
}

/**
 * Whether `typeId` names a type the router resolves a placement owner to.
 *
 * The registry's modes and the router's `SupportPlacementOwner` union are the
 * same four types, which is what makes this the one place the two meet:
 * `__tests__/supportPlacementRouting.test.ts` holds them to each other.
 */
function isPlacementOwnerType(typeId: SupportTypeId): typeId is PlacementOwnerTypeId {
    return PLACEMENT_MODE_TYPE_IDS.includes(typeId);
}

/** Whether `typeId` is one of the types the router hands model-face gestures to. */
function isModelSurfaceGestureOwner(typeId: SupportTypeId): typeId is ModelSurfaceGestureTypeId {
    return (MODEL_SURFACE_GESTURE_TYPES as readonly SupportTypeId[]).includes(typeId);
}

/**
 * The one placement mode declaring `flag`.
 *
 * Every owner below is read through here, so a registry that stops declaring a
 * flag says which one rather than leaving a stale owner behind.
 */
function placementOwnerDeclaring(
    flag: string,
    test: (descriptor: SupportTypeDescriptor) => boolean,
): PlacementOwnerTypeId {
    const typeId = singleTypeDeclaring(flag, test);
    if (!isPlacementOwnerType(typeId)) {
        throw new Error(`expected ${flag} to be a placement mode, found ${typeId}.`);
    }
    return typeId;
}

/**
 * The one type declaring `flag` among those the router hands a model-face
 * gesture to.
 *
 * The gesture set is part of the LOOKUP rather than a check afterwards: a flag
 * that several types declare is not a way to name one of them, so narrowing the
 * candidates first is what makes the answer unique -- and what makes the "found:"
 * list in the error read as the contenders rather than the whole registry.
 *
 * The guard then asserts two things: that the answer is one of the router's
 * owners, so an arm may return it, and that a type taking a model gesture is
 * always one of those owners -- the same relationship the test holds.
 */
function gestureOwnerDeclaring(
    flag: string,
    test: (descriptor: SupportTypeDescriptor) => boolean,
): ModelSurfaceGestureTypeId {
    const typeId = singleTypeDeclaring(
        `${flag}, claiming a model-face gesture`,
        (descriptor) => test(descriptor) && isModelSurfaceGestureOwner(descriptor.id),
    );
    if (!isPlacementOwnerType(typeId) || !isModelSurfaceGestureOwner(typeId)) {
        throw new Error(`expected ${flag} to own a placement and claim a model-face gesture, found ${typeId}.`);
    }
    return typeId;
}

/**
 * The one placement family that has no flag telling it apart from the others.
 *
 * `SupportPlacementFamily` is `'none' | 'branchFamily' | Extract<SupportTypeId,
 * 'leaf' | 'kickstand'>`: two of its three named members ARE type ids, because
 * those families were never separate from the type. The branch and the leaf are
 * each read from a flag below, which distinguishes one from the other; nothing
 * in the registry distinguishes the kickstand's placement mode from the trunk's
 * except its name, so this is the one family name the router spells. The
 * comparison that reads it is against `KICKSTAND_PLACEMENT_OWNER`, which the
 * registry declares -- so a rename moves the owner and breaks the comparison
 * rather than leaving a stale family behind.
 */
const KICKSTAND_FAMILY = 'kickstand' satisfies SupportPlacementFamily;

/**
 * The type the branch family's gesture belongs to.
 *
 * The family cannot be named after its type -- branch and brace share its
 * binding -- so the registry declares which of the two owns its own placement
 * mode: `previewRequiresOwnMode` is branch's, the mode whose preview stands up
 * only while it is live. Brace places between two existing supports and claims
 * no model gesture, which is why it declares the flag false.
 */
export const BRANCH_FAMILY_PLACEMENT_OWNER = gestureOwnerDeclaring(
    'whose own mode owns its preview',
    (descriptor) => descriptor.hasPlacementPreview && descriptor.previewRequiresOwnMode === true,
);

/**
 * The leaf's placement: the mode that claims a model gesture and does NOT gate
 * its preview on being active.
 *
 * That is the same distinction the branch above is read from, one flag over:
 * a gesture-claiming mode either stands its preview up only while it is live
 * (branch) or leaves it up (leaf). Reading the flag rather than the name keeps
 * the leaf's own name out of the router, which is where the family and the type
 * are the same word and so cannot drift apart.
 */
export const LEAF_PLACEMENT_OWNER = gestureOwnerDeclaring(
    'whose preview is not kept for its own mode',
    (descriptor) => descriptor.hasPlacementPreview && descriptor.previewRequiresOwnMode !== true,
);

/** The brace's placement: the mode whose live preview is a bare span between supports. */
export const BRACE_PLACEMENT_OWNER = placementOwnerDeclaring(
    'whose preview is a bare segment',
    (descriptor) => descriptor.hasPlacementPreview && descriptor.previewShape === 'segment',
);

/** The kickstand's placement, the family and the type sharing one name. */
export const KICKSTAND_PLACEMENT_OWNER = placementOwnerDeclaring(
    'named after its own type',
    (descriptor) => descriptor.id === KICKSTAND_FAMILY,
);

/**
 * The default tool: the one type whose preview yields to every other mode,
 * because it stands in for a mode rather than being one. Not a placement mode
 * -- it is what the modes stand down to -- so it is typed as the wider id and
 * `PLACEMENT_MODE_TYPE_IDS` leaves it out.
 */
export const DEFAULT_PLACEMENT_TYPE_ID = singleTypeDeclaring(
    'whose preview yields to another mode',
    (descriptor) => descriptor.previewYieldsToOtherModes === true,
);

export interface SupportPlacementRoutingInput {
    bindings: SupportPlacementHotkeyBindings;
    modifierState: SupportPlacementModifierState;
    state: SupportPlacementRoutingState;
}

export function resolveSupportPlacementRouting(
    input: SupportPlacementRoutingInput,
): ResolvedSupportPlacementOwner {
    const intent = resolveSupportPlacementHotkeyIntent(input.bindings, input.modifierState);
    const branchFamilyActive = input.state.branchHotkeyActive || input.state.braceHotkeyActive || intent.family === 'branchFamily';
    const leafActive = input.state.leafHotkeyActive || intent.family === LEAF_PLACEMENT_OWNER;
    const kickstandActive = input.state.kickstandHotkeyActive || intent.family === KICKSTAND_PLACEMENT_OWNER;

    if (input.state.braceAwaitingEnd) {
        return {
            owner: BRACE_PLACEMENT_OWNER,
            basedOnFirstClick: true,
            firstClickTarget: 'support',
            modelHoverOwner: 'none',
            modelClickOwner: 'none',
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    if (input.state.leafAwaitingBase) {
        return {
            owner: LEAF_PLACEMENT_OWNER,
            basedOnFirstClick: true,
            firstClickTarget: 'model',
            modelHoverOwner: 'none',
            modelClickOwner: 'none',
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    if (input.state.branchAwaitingBase) {
        return {
            owner: BRANCH_FAMILY_PLACEMENT_OWNER,
            basedOnFirstClick: true,
            firstClickTarget: 'model',
            modelHoverOwner: BRANCH_FAMILY_PLACEMENT_OWNER,
            modelClickOwner: BRANCH_FAMILY_PLACEMENT_OWNER,
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    if (leafActive) {
        return {
            owner: LEAF_PLACEMENT_OWNER,
            basedOnFirstClick: false,
            firstClickTarget: 'none',
            modelHoverOwner: LEAF_PLACEMENT_OWNER,
            modelClickOwner: LEAF_PLACEMENT_OWNER,
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    if (branchFamilyActive) {
        return {
            owner: 'none',
            basedOnFirstClick: true,
            firstClickTarget: 'none',
            modelHoverOwner: BRANCH_FAMILY_PLACEMENT_OWNER,
            modelClickOwner: BRANCH_FAMILY_PLACEMENT_OWNER,
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    if (kickstandActive) {
        return {
            owner: KICKSTAND_PLACEMENT_OWNER,
            basedOnFirstClick: false,
            firstClickTarget: 'support',
            modelHoverOwner: 'none',
            modelClickOwner: 'none',
            blocksDefaultModelPlacement: true,
            intent,
        };
    }

    return {
        owner: 'none',
        basedOnFirstClick: false,
        firstClickTarget: 'none',
        modelHoverOwner: 'none',
        modelClickOwner: 'none',
        blocksDefaultModelPlacement: false,
        intent,
    };
}

/**
 * Which model-face placement receives a gesture, and which are cleared.
 *
 * The manager holds the hooks and cannot be exercised in tests, so the decision
 * lives here as a plain function over the owner the router named.
 */
export function routeModelPlacementHit<THit>(
    owners: readonly ModelSurfaceGestureTypeId[],
    owner: SupportModelPlacementOwner,
    hit: THit | null,
): Record<ModelSurfaceGestureTypeId, THit | null> {
    const routed = {} as Record<ModelSurfaceGestureTypeId, THit | null>;
    for (const id of owners) {
        routed[id] = id === owner ? hit : null;
    }
    return routed;
}

/**
 * Which support type owns the placement interaction right now, or null when none
 * does.
 *
 * A model-face owner counts as owning it: the branch family routes its gesture
 * to the model face while its `owner` stays `'none'`, which is the same answer
 * the manager acts on.
 */
export function resolveActivePlacementTypeId(
    input: SupportPlacementRoutingInput,
): SupportTypeId | null {
    const routing = resolveSupportPlacementRouting(input);
    if (routing.owner !== 'none') return routing.owner;
    return routing.modelHoverOwner === 'none' ? null : routing.modelHoverOwner;
}

/**
 * The type whose placement mode is live in `placementActive`, or null when none
 * is.
 *
 * More than one mode can be live at once, so this answers with the first in the
 * registry's declared order. A caller that must know about every live mode asks
 * `isPlacementActiveForType` for each type instead.
 */
export function activePlacementTypeId(placementActive: SupportPlacementActive): SupportTypeId | null {
    return PLACEMENT_MODE_TYPE_IDS.find((typeId) => placementActive[typeId] === true) ?? null;
}

/**
 * Whether type `typeId`'s placement mode is live.
 *
 * How a consumer tests the type-keyed `placementActive` record without spelling
 * a type: it passes the id it already holds, so a rename in the registry moves
 * the question with the record and no key is written at the reading site.
 */
export function isPlacementActiveForType(
    placementActive: SupportPlacementActive,
    typeId: SupportTypeId,
): boolean {
    return placementActive[typeId] === true;
}

/**
 * Whether a live placement preview exists for type `typeId`. Same contract as
 * `isPlacementActiveForType`, over `placementPreviews`: an absent key and a null
 * preview both read false, which is the truthiness the scene reads today.
 */
export function isPlacementPreviewForType(
    placementPreviews: SupportPlacementPreviews,
    typeId: SupportTypeId,
): boolean {
    return Boolean(placementPreviews[typeId]);
}

