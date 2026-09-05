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
  if (kind === 'trunk') {
    return moveJoint(
      support as Trunk,
      jointId,
      newPos,
      undefined,
      isCurveMode,
      root,
      contextStart,
      { skipContactConeSolve },
    ) as JointDragSupportByKind[K];
  }

  if (kind === 'branch') {
    return moveJoint(
      support as unknown as Trunk,
      jointId,
      newPos,
      undefined,
      isCurveMode,
      undefined,
      contextStart,
      { skipContactConeSolve },
    ) as unknown as JointDragSupportByKind[K];
  }

  return moveJoint(
    support as unknown as Trunk,
    jointId,
    newPos,
    undefined,
    isCurveMode,
    root,
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
