import type { Branch, Roots, Trunk, Vec3 } from '../../types';
import type { Kickstand } from '../../SupportTypes/Kickstand/types';
import { getSupportTypeDescriptor, updateSupportEntity, type SupportTypeId } from '../../supportTypeRegistry';
import { moveJoint } from './jointUtils';
import { clearSupportDragPreview, emitSupportDragPreview } from './jointDragRuntime';

export type JointDragSupportKind = 'trunk' | 'branch' | 'kickstand';

/**
 * The types whose joint drag commits through `commitJointDragSupport`, which
 * clears their live preview on the way. Twig and stick commit through their
 * own `updateX` and must clear theirs by hand.
 *
 * @deprecated Hand-written type list; belongs in the registry as a declared
 * flag. Blocked on the §4b drag-commit collapse — the per-type preview refs
 * have to go first.
 */
export const JOINT_DRAG_COMMIT_TYPES: ReadonlySet<SupportTypeId> =
  new Set<JointDragSupportKind>(['trunk', 'branch', 'kickstand']);

export type JointDragSupportByKind = {
  trunk: Trunk;
  branch: Branch;
  kickstand: Kickstand;
};

type JointDragSupport = JointDragSupportByKind[keyof JointDragSupportByKind];

interface ComputeJointDragSupportPreviewOptions<K extends JointDragSupportKind> {
  kind: K;
  support: JointDragSupportByKind[K];
  jointId: string;
  newPos: Vec3;
  isCurveMode: boolean;
  root?: Roots;
  contextStart?: Vec3;
  skipContactConeSolve?: boolean;
}

interface CommitJointDragSupportOptions {
  clearPreview?: boolean;
  stripDiskLengthOverride?: boolean;
}

export function computeJointDragSupportPreview<K extends JointDragSupportKind>({
  kind,
  support,
  jointId,
  newPos,
  isCurveMode,
  root,
  contextStart,
  skipContactConeSolve,
}: ComputeJointDragSupportPreviewOptions<K>): JointDragSupportByKind[K] {
  // Only a plate-rooted type constrains its drag against a root; a knot-hosted
  // one is clamped from its host instead, so passing a root would move it.
  const rooted = getSupportTypeDescriptor(kind).lower.kind === 'plateRoot';

  return moveJoint(
    support as unknown as Trunk,
    jointId,
    newPos,
    undefined,
    isCurveMode,
    rooted ? root : undefined,
    contextStart,
    { skipContactConeSolve },
  ) as unknown as JointDragSupportByKind[K];
}

export function publishJointDragSupportPreview<K extends JointDragSupportKind>(
  kind: K,
  support: JointDragSupportByKind[K],
) {
  emitSupportDragPreview(kind, support.id, support);
}

export function clearJointDragSupportPreview(kind: JointDragSupportKind, supportId: string) {
  clearSupportDragPreview(kind, supportId);
}

function normalizeCommittedSupport<K extends JointDragSupportKind>(
  kind: K,
  support: JointDragSupportByKind[K],
  stripDiskLengthOverride: boolean,
): JointDragSupportByKind[K] {
  if (!stripDiskLengthOverride) return support;
  if (!getSupportTypeDescriptor(kind).hasContactDiskLengthOverride) return support;

  const typed = support as Trunk | Branch;
  if (!typed.contactCone) return support;

  return {
    ...typed,
    contactCone: {
      ...typed.contactCone,
      diskLengthOverride: undefined,
    },
  } as JointDragSupportByKind[K];
}

export function commitJointDragSupport<K extends JointDragSupportKind>(
  kind: K,
  support: JointDragSupportByKind[K],
  options: CommitJointDragSupportOptions = {},
): JointDragSupportByKind[K] {
  const { clearPreview = true, stripDiskLengthOverride = false } = options;
  const committed = normalizeCommittedSupport(kind, support, stripDiskLengthOverride);

  // Dispatched by the registry: a fourth draggable type is written to its own
  // collection without touching this file. The trailing else this replaced put
  // anything unrecognised into the kickstand collection.
  if (!updateSupportEntity(kind, committed)) {
    throw new Error(`No updater registered for support type ${kind}`);
  }

  if (clearPreview) {
    clearJointDragSupportPreview(kind, (committed as JointDragSupport).id);
  }

  return committed;
}
