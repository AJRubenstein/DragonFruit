import type { Roots, Trunk, Leaf, Knot, Kickstand, Branch, Brace, SupportState } from '../types';
import type { SupportEntityPayload, SupportRemovalResult, SupportTypeId } from '../supportTypeRegistry';
import type { KickstandBuildResult } from '../SupportTypes/Kickstand/types';

/**
 * Per-type history actions, derived from the type id.
 *
 * The spelling is `support:<verb>-<typeId>`, so a new type gets its actions by
 * being declared. These are in-memory undo/redo labels -- nothing in the voxl
 * codec writes them -- so the shape is free to be derived.
 */
type AddAction<T extends string> = `support:add-${T}`;
type RemoveAction<T extends string> = `support:remove-${T}`;

const addAction = <T extends SupportTypeId>(typeId: T): AddAction<T> => `support:add-${typeId}`;
const removeAction = <T extends SupportTypeId>(typeId: T): RemoveAction<T> => `support:remove-${typeId}`;

export const SUPPORT_ADD_TRUNK = addAction('trunk');
export const SUPPORT_REMOVE_TRUNK = removeAction('trunk');
export const SUPPORT_UPDATE_TRUNK = 'support:update-trunk' as const;

export const SUPPORT_ADD_LEAF = addAction('leaf');
export const SUPPORT_REMOVE_LEAF = removeAction('leaf');

export const SUPPORT_ADD_BRANCH = addAction('branch');
export const SUPPORT_REMOVE_BRANCH = removeAction('branch');
export const SUPPORT_UPDATE_BRANCH = 'support:update-branch' as const;

export const SUPPORT_ADD_TWIG = addAction('twig');
export const SUPPORT_REMOVE_TWIG = removeAction('twig');

export const SUPPORT_ADD_STICK = addAction('stick');
export const SUPPORT_REMOVE_STICK = removeAction('stick');

export const SUPPORT_ADD_BRACE = addAction('brace');
export const SUPPORT_REMOVE_BRACE = removeAction('brace');

export const SUPPORT_ADD_ANCHOR = addAction('anchor');
export const SUPPORT_REMOVE_ANCHOR = removeAction('anchor');

export const SUPPORT_ADD_KICKSTAND = addAction('kickstand');
export const SUPPORT_REMOVE_KICKSTAND = removeAction('kickstand');

export const SUPPORT_REPLACE_TRUNK = 'support:replace-trunk' as const;
export const SUPPORT_AUTO_BRACE_REPLACE = 'support:auto-brace-replace' as const;
export const SUPPORT_EDIT_REPLACE = 'support:edit-replace' as const;
export const SUPPORT_AUTO_PLACE = 'support:auto-place' as const;
export const SUPPORT_BLOCKER_STROKE = 'support:blocker-stroke' as const;

/** Every support history action type, derived from the payload map below. */
export type SupportHistoryActionType = keyof SupportHistoryPayloadMap;

export interface SupportTrunkPayload {
  trunk: Trunk;
  /** The trunk's own root, plus one per kickstand the cascade swept up. */
  roots?: Roots[];
  branches?: Branch[];
  braces?: Brace[];
  kickstands?: Kickstand[];
  leaves?: Leaf[];
  knots?: Knot[];
}

export interface SupportTrunkUpdatePayload {
  before: Trunk;
  after: Trunk;
}

export interface SupportLeafPayload {
  leaf: Leaf;
  knot?: Knot | null;
}

export interface SupportBranchPayload {
  branch: Branch;
  knot?: Knot | null;
  trunkUpdate?: {
    before: Trunk;
    after: Trunk;
  };
  knotUpdates?: {
    before: Knot;
    after: Knot;
  }[];
}

export interface SupportBranchUpdatePayload {
  before: Branch;
  after: Branch;
}


export interface SupportBranchRemovePayload {
  branches: Branch[];
  braces: Brace[];
  kickstands?: Kickstand[];
  leaves: Leaf[];
  knots: Knot[];
  trunkUpdate?: {
    before: Trunk;
    after: Trunk;
  };
  knotUpdates?: {
    before: Knot;
    after: Knot;
  }[];
}

export interface BraceLinkPayload {
  brace: Brace;
  startKnot?: Knot | null;
  endKnot?: Knot | null;
}


export interface SupportKickstandPayload {
  build: KickstandBuildResult;
}

/** Removal payloads, derived from what the registry declares each type takes. */
export type SupportTwigPayload = SupportEntityPayload<'twig'>;
export type SupportStickPayload = SupportEntityPayload<'stick'>;
export type SupportAnchorPayload = SupportEntityPayload<'anchor'>;

export type SupportTwigRemovePayload = SupportRemovalResult<'twig'>;
export type SupportStickRemovePayload = SupportRemovalResult<'stick'>;
export type SupportAnchorRemovePayload = SupportRemovalResult<'anchor'>;
export type SupportKickstandRemovePayload = SupportRemovalResult<'kickstand'>;

export interface SupportReplaceTrunkPayload {
  before: SupportState;
  after: SupportState;
}

export interface SupportReplaceStatePayload {
  before: SupportState;
  after: SupportState;
}

export interface SupportBlockerStrokePayload {
  modelId: string;
  before: number[];
  after: number[];
}

/**
 * The payload each support history action carries. One source of truth: push
 * sites and handlers both key off this map, so a type can't be pushed with a
 * payload its handler won't understand.
 */
export type SupportHistoryPayloadMap = {
  [SUPPORT_ADD_TRUNK]: SupportTrunkPayload;
  [SUPPORT_REMOVE_TRUNK]: SupportTrunkPayload;
  [SUPPORT_UPDATE_TRUNK]: SupportTrunkUpdatePayload;
  [SUPPORT_ADD_LEAF]: SupportLeafPayload;
  [SUPPORT_REMOVE_LEAF]: SupportLeafPayload;
  [SUPPORT_ADD_BRANCH]: SupportBranchPayload;
  [SUPPORT_REMOVE_BRANCH]: SupportBranchRemovePayload;
  [SUPPORT_UPDATE_BRANCH]: SupportBranchUpdatePayload;
  [SUPPORT_ADD_TWIG]: SupportTwigPayload;
  [SUPPORT_REMOVE_TWIG]: SupportTwigRemovePayload;
  [SUPPORT_ADD_STICK]: SupportStickPayload;
  [SUPPORT_REMOVE_STICK]: SupportStickRemovePayload;
  [SUPPORT_ADD_BRACE]: BraceLinkPayload;
  [SUPPORT_REMOVE_BRACE]: BraceLinkPayload;
  [SUPPORT_ADD_ANCHOR]: SupportAnchorPayload;
  [SUPPORT_REMOVE_ANCHOR]: SupportAnchorRemovePayload;
  [SUPPORT_ADD_KICKSTAND]: SupportKickstandPayload;
  [SUPPORT_REMOVE_KICKSTAND]: SupportKickstandRemovePayload;
  [SUPPORT_REPLACE_TRUNK]: SupportReplaceTrunkPayload;
  [SUPPORT_EDIT_REPLACE]: SupportReplaceStatePayload;
  [SUPPORT_AUTO_BRACE_REPLACE]: SupportReplaceStatePayload;
  [SUPPORT_AUTO_PLACE]: SupportReplaceStatePayload;
  [SUPPORT_BLOCKER_STROKE]: SupportBlockerStrokePayload;
};
