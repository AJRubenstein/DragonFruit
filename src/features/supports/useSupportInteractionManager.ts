import { useCallback, useEffect, useSyncExternalStore, useRef } from 'react';
import * as THREE from 'three';
import type { Brace, Branch, Leaf, SupportMode } from '@/supports/types';
import type { SupportPlacementPreviews } from '@/supports/rendering';
import { useTrunkPlacementV2 } from '@/supports/SupportTypes/Trunk/useTrunkPlacement';
import { useBranchPlacement } from '@/supports/SupportTypes/Branch/useBranchPlacement';
import { useLeafPlacement } from '@/supports/SupportTypes/Leaf/useLeafPlacement';
import { useBracePlacement } from '@/supports/SupportTypes/Brace/useBracePlacement';
import { useKickstandPlacement } from '@/supports/SupportTypes/Kickstand/useKickstandPlacement';
import { isContactDiskHudInteractionActive } from '@/supports/SupportPrimitives/ContactDisk/contactDiskHudInteraction';
import { isSupportEditInteractionActive } from '@/supports/interaction/gizmoInteractionLock';
import { useInteractionStatus } from '@/supports/interaction/useInteractionStatus';
import { useJointCreationHotkey } from '@/supports/SupportPrimitives/Joint/useJointCreationHotkey';
import { useCurveHotkey } from '@/supports/Curves/useCurveHotkey';
import { useJointCreationState } from '@/supports/SupportPrimitives/Joint/jointCreationState';
import { computeAndApplyTrunkDiameterProfile } from '@/supports/SupportTypes/Trunk/TrunkReplacement';
import {
  getSelectedId,
  getSelectedCategory,
  getSupportEntities,
  getSnapshot,
  removeBranch,
  removeBrace,
  removeLeaf,
  removeTwig,
  removeStick,
  removeAnchor,
  removeTrunk,
  removeSupportEntity,
  removeJointById,
  updateKnot,
  setSelectedId,
  setHoveredState,
  subscribe,
} from '@/supports/state';
import { registerDeleteHandler } from '@/features/delete/deleteRegistry';
import { pushSupportHistory } from '@/supports/history/supportHistory';
import { SUPPORT_REMOVE_ANCHOR, SUPPORT_REMOVE_BRANCH, SUPPORT_REMOVE_BRACE, SUPPORT_REMOVE_LEAF, SUPPORT_REMOVE_TRUNK, SUPPORT_UPDATE_TRUNK, SUPPORT_UPDATE_BRANCH, SUPPORT_REMOVE_TWIG, SUPPORT_REMOVE_STICK, SUPPORT_AUTO_BRACE_REPLACE, SUPPORT_REMOVE_KICKSTAND, type SupportBranchRemovePayload } from '@/supports/history/actionTypes';
import { getSupportTypeBySelectionCategory, SUPPORT_TYPES, updateSupportEntity } from '@/supports/supportTypeRegistry';
import { knotFields } from '@/supports/interaction/shared/selection/selectedIdsByType';
import { clearSupportSelection, getResolvedPrimarySelection, selectSupportIds } from '@/supports/interaction/shared/selection/selectionController';
import { getKickstandSnapshot } from '@/supports/SupportTypes/Kickstand/kickstandStore';
import { useHotkeyConfig } from '@/hotkeys/HotkeyContext';
import { resolveSupportPlacementHotkeyBindings } from '@/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver';
import { resolveSupportPlacementRouting } from '@/supports/interaction/shared/placement/hotkeys/supportPlacementRouting';
import { isKeyPressedSync } from '@/hotkeys/hotkeyStore';

interface SupportInteractionOptions {
  mode: SupportMode;
}



export function resolveSupportCategoryFromSnapshot(id: string) {
  const snapshot = getSnapshot();
  if (snapshot.trunks[id]) return 'trunk' as const;
  if (snapshot.branches[id]) return 'branch' as const;
  if (snapshot.leaves[id]) return 'leaf' as const;
  if (snapshot.twigs[id]) return 'twig' as const;
  if (snapshot.sticks[id]) return 'stick' as const;
  if (snapshot.braces[id]) return 'brace' as const;
  if (snapshot.anchors[id]) return 'anchor' as const;
  if (getSnapshot().kickstands[id]) return 'kickstand' as const;
  return null;
}

function collectAllSupportIds() {
  const snapshot = getSnapshot();
  const kickstandSnapshot = getSnapshot();

  return [
    ...Object.keys(snapshot.trunks),
    ...Object.keys(snapshot.branches),
    ...Object.keys(snapshot.leaves),
    ...Object.keys(snapshot.twigs),
    ...Object.keys(snapshot.sticks),
    ...Object.keys(snapshot.braces),
    ...Object.keys(snapshot.anchors),
    ...Object.keys(kickstandSnapshot.kickstands),
  ];
}

export function resolveSupportOwnerFromSegmentId(segmentId: string): { category: 'trunk' | 'branch' | 'twig' | 'stick' | 'brace' | 'kickstand'; id: string } | null {
  if (!segmentId) return null;

  const snapshot = getSnapshot();
  const kickstandSnapshot = getSnapshot();

  if (segmentId.startsWith('braceSegment:')) {
    const braceId = segmentId.slice('braceSegment:'.length);
    if (snapshot.braces[braceId]) return { category: 'brace', id: braceId };
  }

  for (const trunk of Object.values(snapshot.trunks)) {
    if (trunk.segments.some((segment) => segment.id === segmentId)) {
      return { category: 'trunk', id: trunk.id };
    }
  }

  for (const branch of Object.values(snapshot.branches)) {
    if (branch.segments.some((segment) => segment.id === segmentId)) {
      return { category: 'branch', id: branch.id };
    }
  }

  for (const twig of Object.values(snapshot.twigs)) {
    if (twig.segments.some((segment) => segment.id === segmentId)) {
      return { category: 'twig', id: twig.id };
    }
  }

  for (const stick of Object.values(snapshot.sticks)) {
    if (stick.segments.some((segment) => segment.id === segmentId)) {
      return { category: 'stick', id: stick.id };
    }
  }

  for (const kickstand of Object.values(kickstandSnapshot.kickstands)) {
    if (kickstand.segments.some((segment) => segment.id === segmentId)) {
      return { category: 'kickstand', id: kickstand.id };
    }
  }

  return null;
}

export function resolveSupportOwnerFromJointId(jointId: string): { category: 'kickstand'; id: string } | null {
  if (!jointId) return null;

  const kickstandSnapshot = getSnapshot();
  for (const kickstand of Object.values(kickstandSnapshot.kickstands)) {
    const ownsJoint = kickstand.segments.some((segment) =>
      segment.bottomJoint?.id === jointId || segment.topJoint?.id === jointId,
    );
    if (ownsJoint) {
      return { category: 'kickstand', id: kickstand.id };
    }
  }

  return null;
}

export function useSupportInteractionManager({ mode }: SupportInteractionOptions) {
  // V2 Trunk Placement
  const trunkPlacementV2 = useTrunkPlacementV2();
  const branchPlacement = useBranchPlacement();
  const leafPlacement = useLeafPlacement();
  const bracePlacement = useBracePlacement();
  const kickstandPlacement = useKickstandPlacement();
  const { getHotkey } = useHotkeyConfig();

  const altDownRef = useRef(false);
  const deletingRef = useRef(false);

  // V2 Joint Creation State
  useJointCreationHotkey(mode);
  useCurveHotkey(mode);
  const jointCreationState = useJointCreationState();

  // Centralized interaction status
  const { isPlacementDisabled, isPlacementHardDisabled } = useInteractionStatus();

  // Joint selection state for gizmo transformation
  const globalSelectedId = useSyncExternalStore(subscribe, getSelectedId, getSelectedId);
  const globalSelectedCategory = useSyncExternalStore(subscribe, getSelectedCategory, getSelectedCategory);

  const selectedJointId = globalSelectedCategory === 'joint' ? globalSelectedId : null;

  const resolvePlacementRouting = useCallback(() => {
    const bindings = resolveSupportPlacementHotkeyBindings(getHotkey);
    return resolveSupportPlacementRouting({
      bindings,
      modifierState: {
        ctrlKey: isKeyPressedSync('ctrl'),
        altKey: isKeyPressedSync('alt'),
        shiftKey: isKeyPressedSync('shift'),
        metaKey: isKeyPressedSync('meta'),
      },
      state: {
        branchHotkeyActive: branchPlacement.branchHotkeyActive,
        branchAwaitingBase: branchPlacement.stage === 'awaitingBase',
        leafHotkeyActive: leafPlacement.hotkeyActive,
        leafAwaitingBase: leafPlacement.stage === 'awaitingBase',
        braceHotkeyActive: branchPlacement.braceHotkeyActive,
        braceAwaitingEnd: bracePlacement.stage === 'awaitingEnd',
        kickstandHotkeyActive: kickstandPlacement.hotkeyActive,
      },
    });
  }, [getHotkey, branchPlacement.branchHotkeyActive, branchPlacement.stage, leafPlacement.hotkeyActive, leafPlacement.stage, branchPlacement.braceHotkeyActive, bracePlacement.stage, kickstandPlacement.hotkeyActive]);

  // Handler for MODEL hover (used for trunk placement preview, or branch tip preview)
  const onModelHover = useCallback((hit: THREE.Intersection | null) => {
    if (isSupportEditInteractionActive()) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(null);
      return;
    }

    if (isContactDiskHudInteractionActive()) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(null);
      return;
    }

    if (isPlacementHardDisabled) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(null);
      return;
    }

    if (jointCreationState.isActive) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(null);
      return;
    }

    const fanningActive = leafPlacement.sproutParentingLockHeld || leafPlacement.stage === 'awaitingSproutTip';
    if (fanningActive) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(hit);
      return;
    }

    const routing = resolvePlacementRouting();

    if (routing.modelHoverOwner === 'leaf') {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(hit);
      return;
    }

    if (routing.modelHoverOwner === 'branch') {
      trunkPlacementV2.onSupportHover(null);
      leafPlacement.onModelHover(null);
      branchPlacement.onModelHover(hit);
      return;
    }

    if (routing.blocksDefaultModelPlacement) {
      trunkPlacementV2.onSupportHover(null);
      branchPlacement.onModelHover(null);
      leafPlacement.onModelHover(null);
      return;
    }

    trunkPlacementV2.onSupportHover(hit);
  }, [isPlacementHardDisabled, trunkPlacementV2, branchPlacement, leafPlacement, jointCreationState.isActive, resolvePlacementRouting]);

  // Handler for MODEL click (trunk placement, or branch tip placement)
  const onModelClick = useCallback((hit: THREE.Intersection) => {
    if (isSupportEditInteractionActive()) {
      return;
    }

    if (jointCreationState.isActive) {
      return;
    }

    const fanningActive = leafPlacement.sproutParentingLockHeld || leafPlacement.stage === 'awaitingSproutTip';
    if (fanningActive) {
      leafPlacement.onModelClick(hit);
      return;
    }

    const routing = resolvePlacementRouting();

    if (routing.modelClickOwner === 'leaf') {
      leafPlacement.onModelClick(hit);
      return;
    }

    if (routing.modelClickOwner === 'branch') {
      branchPlacement.onModelClick(hit);
      return;
    }

    if (routing.blocksDefaultModelPlacement) {
      return;
    }

    trunkPlacementV2.onSupportClick(hit);
  }, [trunkPlacementV2, branchPlacement, leafPlacement, jointCreationState.isActive, resolvePlacementRouting]);

  // Handler for SUPPORT hover (branch base preview when hovering existing support shafts)
  // NOTE: We do NOT check isPlacementDisabled here because branch placement
  // REQUIRES hovering over supports. The isPlacementDisabled check would
  // always be true when hovering a support, breaking branch placement.
  const onSupportHover = useCallback((hit: THREE.Intersection | null) => {
    if (mode !== 'support') return;

    if (isSupportEditInteractionActive()) {
      leafPlacement.onSupportHover(null);
      branchPlacement.onSupportHover(null);
      return;
    }

    const fanningActive = leafPlacement.sproutParentingLockHeld || leafPlacement.stage === 'awaitingSproutTip';
    if (fanningActive) {
      branchPlacement.onSupportHover(null);
      leafPlacement.onSupportHover(hit);
      return;
    }

    const routing = resolvePlacementRouting();

    if (routing.supportHoverOwner === 'leaf') {
      leafPlacement.onSupportHover(hit);
      branchPlacement.onSupportHover(null);
    } else if (routing.supportHoverOwner === 'branch') {
      branchPlacement.onSupportHover(hit);
      leafPlacement.onSupportHover(null);
    } else {
      leafPlacement.onSupportHover(null);
      branchPlacement.onSupportHover(null);
    }
  }, [mode, branchPlacement, leafPlacement, resolvePlacementRouting]);

  // Handler for SUPPORT click (branch base placement on existing support shaft)
  const onSupportClick = useCallback((hit: THREE.Intersection) => {
    if (mode !== 'support') return;

    if (isSupportEditInteractionActive()) {
      return;
    }

    const fanningActive = leafPlacement.sproutParentingLockHeld || leafPlacement.stage === 'awaitingSproutTip';
    if (fanningActive) {
      leafPlacement.onSupportClick(hit);
      return;
    }

    const routing = resolvePlacementRouting();

    if (routing.blocksDefaultSupportPlacement) {
      return;
    }

    if (routing.supportClickOwner === 'leaf') {
      leafPlacement.onSupportClick(hit);
    } else if (routing.supportClickOwner === 'branch') {
      branchPlacement.onSupportClick(hit);
    }
    // Note: clicking on supports in non-branch mode is handled by SupportRenderer (selection)
  }, [mode, branchPlacement, leafPlacement, resolvePlacementRouting]);

  useEffect(() => {
    if (mode !== 'support') return;

    const deleteSelectionByCategoryAndId = (category: string, id: string, recordHistory = true): boolean => {
      if (category === 'joint') {
        const result = removeJointById(id);
        if (!result) {
          const kickstandOwner = resolveSupportOwnerFromJointId(id);
          if (!kickstandOwner) return false;
          return deleteSelectionByCategoryAndId(kickstandOwner.category, kickstandOwner.id, recordHistory);
        }
        if (result.kind === 'trunk') {
          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_UPDATE_TRUNK,
              description: 'Delete trunk joint',
              payload: { before: result.before, after: result.after },
            });
          }
          setSelectedId(result.trunkId);
        } else if (result.kind === 'branch') {
          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_UPDATE_BRANCH,
              payload: { before: result.before, after: result.after },
            });
          }
          setSelectedId(result.branchId);
        } else if (result.kind === 'kickstand') {
          // Joint removed from kickstand — just select the parent kickstand.
          // No dedicated SUPPORT_UPDATE_KICKSTAND history type exists yet,
          // so undo is handled via full state snapshot if needed.
          setSelectedId(result.kickstandId);
        }
        return true;
      }

      if (category === 'segment') {
        const owner = resolveSupportOwnerFromSegmentId(id);
        if (!owner) return false;
        return deleteSelectionByCategoryAndId(owner.category, owner.id, recordHistory);
      }

      if (category === 'trunk') {
        const snapshots = removeTrunk(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_TRUNK,
            payload: snapshots,
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'leaf') {
        const snapshots = removeLeaf(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_LEAF,
            payload: { leaf: snapshots.leaf, knot: snapshots.knot ?? undefined },
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'knot') {
        const leaves = getSupportEntities<Leaf>('leaf');
        const leaf = leaves.find(l => l.parentKnotId === id);
        if (leaf) {
          const snapshots = removeLeaf(leaf.id);
          if (!snapshots) return false;
          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_REMOVE_LEAF,
              payload: { leaf: snapshots.leaf, knot: snapshots.knot ?? undefined },
            });
          }
          setSelectedId(null);
          return true;
        }

        const branches = getSupportEntities<Branch>('branch');
        const branch = branches.find(b => b.parentKnotId === id);
        if (branch) {
          const beforeSnapshot = getSnapshot();
          const snapshots = removeBranch(branch.id);
          if (!snapshots) return false;
          const afterSnapshot = getSnapshot();

          let trunkUpdate: SupportBranchRemovePayload['trunkUpdate'];
          let knotUpdates: SupportBranchRemovePayload['knotUpdates'];
          const parentKnot = branch.parentKnotId ? beforeSnapshot.knots[branch.parentKnotId] : undefined;
          const parentSegId = parentKnot?.parentShaftId;
          const trunkId = parentSegId
            ? Object.values(beforeSnapshot.trunks).find(t => t.segments.some(s => s.id === parentSegId))?.id
            : undefined;

          if (trunkId && afterSnapshot.trunks[trunkId]) {
            const applied = computeAndApplyTrunkDiameterProfile(afterSnapshot, trunkId);
            if (applied) {
              for (const u of applied.knotUpdates) updateKnot(u.after);
              updateSupportEntity('trunk', applied.trunk);
              const beforeTrunk = beforeSnapshot.trunks[trunkId];
              if (beforeTrunk) {
                trunkUpdate = { before: structuredClone(beforeTrunk), after: structuredClone(applied.trunk) };
                knotUpdates = applied.knotUpdates;
              }
            }
          }

          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_REMOVE_BRANCH,
              payload: {
                ...snapshots,
                trunkUpdate,
                knotUpdates,
              },
            });
          }
          setSelectedId(null);
          return true;
        }

        const braces = getSupportEntities<Brace>('brace');
        const brace = braces.find(br => br.startKnotId === id || br.endKnotId === id);
        if (brace) {
          const snapshots = removeBrace(brace.id);
          if (!snapshots) return false;
          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_REMOVE_BRACE,
              payload: { brace: snapshots.brace, startKnot: snapshots.startKnot ?? undefined, endKnot: snapshots.endKnot ?? undefined },
            });
          }
          setSelectedId(null);
          return true;
        }

        const kickstands = Object.values(getSnapshot().kickstands);
        const kickstand = kickstands.find((ks) => ks.hostKnotId === id);
        if (kickstand) {
          const kickstandSnapshots = removeSupportEntity('kickstand', kickstand.id);
          if (!kickstandSnapshots) return false;
          if (recordHistory) {
            pushSupportHistory({
              type: SUPPORT_REMOVE_KICKSTAND,
              payload: kickstandSnapshots,
            });
          }
          setSelectedId(null);
          return true;
        }

        return false;
      }

      if (category === 'branch') {
        const beforeSnapshot = getSnapshot();
        const snapshots = removeBranch(id);
        if (!snapshots) return false;
        const afterSnapshot = getSnapshot();

        let trunkUpdate: SupportBranchRemovePayload['trunkUpdate'];
        let knotUpdates: SupportBranchRemovePayload['knotUpdates'];
        const removedRootBranch = snapshots.branches.find(b => b.id === id) ?? snapshots.branches[0];
        const parentKnot = removedRootBranch?.parentKnotId ? beforeSnapshot.knots[removedRootBranch.parentKnotId] : undefined;
        const parentSegId = parentKnot?.parentShaftId;
        const trunkId = parentSegId
          ? Object.values(beforeSnapshot.trunks).find(t => t.segments.some(s => s.id === parentSegId))?.id
          : undefined;

        if (trunkId && afterSnapshot.trunks[trunkId]) {
          const applied = computeAndApplyTrunkDiameterProfile(afterSnapshot, trunkId);
          if (applied) {
            for (const u of applied.knotUpdates) updateKnot(u.after);
            updateSupportEntity('trunk', applied.trunk);
            const beforeTrunk = beforeSnapshot.trunks[trunkId];
            if (beforeTrunk) {
              trunkUpdate = { before: structuredClone(beforeTrunk), after: structuredClone(applied.trunk) };
              knotUpdates = applied.knotUpdates;
            }
          }
        }

        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_BRANCH,
            payload: {
              ...snapshots,
              trunkUpdate,
              knotUpdates,
            },
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'twig') {
        const snapshots = removeTwig(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_TWIG,
            payload: snapshots,
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'stick') {
        const snapshots = removeStick(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_STICK,
            payload: snapshots,
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'anchor') {
        const snapshots = removeAnchor(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_ANCHOR,
            payload: snapshots,
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'kickstand') {
        const kickstandSnapshots = removeSupportEntity('kickstand', id);
        if (!kickstandSnapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_KICKSTAND,
            payload: kickstandSnapshots,
          });
        }
        setSelectedId(null);
        return true;
      }

      if (category === 'brace') {
        const snapshots = removeBrace(id);
        if (!snapshots) return false;
        if (recordHistory) {
          pushSupportHistory({
            type: SUPPORT_REMOVE_BRACE,
            payload: { brace: snapshots.brace, startKnot: snapshots.startKnot ?? undefined, endKnot: snapshots.endKnot ?? undefined },
          });
        }
        setSelectedId(null);
        return true;
      }

      return false;
    };



    const canDeleteSelection = () => {
      const multiSelectedIds = getResolvedPrimarySelection().selectedIds;
      if (multiSelectedIds.length > 0) return true;

      const category = getSelectedCategory();
      const id = getSelectedId();
      if (!id || !category) return false;
      // Every support type is deletable; 'joint' too. Enumerating them here is
      // how anchors ended up deletable but gated out of single-selection Delete.
      if (category === 'joint' || getSupportTypeBySelectionCategory(category)) return true;

      // A knot is deletable when something hangs off it. Which types can, and
      // by which field, is the declared hostedBy-knots edge set.
      if (category === 'knot') {
        return SUPPORT_TYPES.some((descriptor) => {
          const fields = knotFields(descriptor);
          if (fields.length === 0) return false;
          return getSupportEntities<Record<string, unknown>>(descriptor.id)
            .some((entity) => fields.some((field) => entity[field] === id));
        });
      }

      if (category === 'segment') {
        return resolveSupportOwnerFromSegmentId(id) !== null;
      }

      return false;
    };

    const performDeleteSelection = () => {
      if (deletingRef.current) return;
      deletingRef.current = true;
      try {
      const multiSelectedIds = Array.from(new Set(getResolvedPrimarySelection().selectedIds));
      if (multiSelectedIds.length > 0) {
        const beforeSupportSnapshot = structuredClone(getSnapshot());
        const beforeKickstandSnapshot = structuredClone(getKickstandSnapshot());
        let anyDeleted = false;
        for (const supportId of multiSelectedIds) {
          const category = resolveSupportCategoryFromSnapshot(supportId);
          if (!category) continue;
          const deleted = deleteSelectionByCategoryAndId(category, supportId, false);
          if (deleted) anyDeleted = true;
        }

        if (anyDeleted) {
          const afterSupportSnapshot = structuredClone(getSnapshot());
          const afterKickstandSnapshot = structuredClone(getKickstandSnapshot());

          pushSupportHistory({
            type: SUPPORT_AUTO_BRACE_REPLACE,
            description: `Delete ${multiSelectedIds.length} supports`,
            payload: {
              before: beforeSupportSnapshot,
              after: afterSupportSnapshot,
            },
          });
        }

        clearSupportSelection();
        setHoveredState('none', null);
        if (anyDeleted) return;
      }

      const category = getSelectedCategory();
      const id = getSelectedId();
      if (!id || !category) return;

      deleteSelectionByCategoryAndId(category, id);

      setHoveredState('none', null);
      } finally {
        deletingRef.current = false;
      }
    };

    const onKeyDown = (e: CustomEvent) => {
      const { key, code, repeat, ctrlKey, metaKey } = e.detail;

      if (key.toLowerCase() === 'e') {
        const category = getSelectedCategory();
        const id = getSelectedId();
        if (id) {
          if (category === 'leaf' || category === 'branch') {
            const snapshot = getSnapshot();
            const parentKnotId = category === 'leaf'
              ? snapshot.leaves[id]?.parentKnotId
              : snapshot.branches[id]?.parentKnotId;
            if (parentKnotId && snapshot.knots[parentKnotId]) {
              setSelectedId(parentKnotId);
            }
          } else if (category === 'knot') {
            const snapshot = getSnapshot();
            const childLeaves = Object.values(snapshot.leaves).filter(l => l.parentKnotId === id);
            const childBranches = Object.values(snapshot.branches).filter(b => b.parentKnotId === id);
            const children = [
              ...childLeaves.map(l => ({ id: l.id, category: 'leaf' })),
              ...childBranches.map(b => ({ id: b.id, category: 'branch' })),
            ];
            if (children.length > 0) {
              children.sort((a, b) => a.id.localeCompare(b.id));
              selectSupportIds([children[0].id]);
            }
          }
        }
        return;
      }

      // Delete/Backspace is handled by the delete registry (registerDeleteHandler)
      // — do NOT handle it here or it fires twice: once here (removes the joint,
      // selects the parent) and once via triggerDelete() (deletes the parent).

      if (key === 'Escape') {
        if (getSelectedId() || getResolvedPrimarySelection().selectedIds.length > 0) {
          clearSupportSelection();
          setHoveredState('none', null);
        }
        return;
      }

      if ((ctrlKey || metaKey) && key.toLowerCase() === 'a') {
        const allSupportIds = collectAllSupportIds();
        selectSupportIds(allSupportIds);
        return;
      }

      if (!(key === 'Alt' || key === 'AltGraph' || code === 'AltLeft' || code === 'AltRight')) return;
      if (repeat || altDownRef.current) return;
      altDownRef.current = true;
      console.log('[AltKey]', 'down', { key, code, time: performance.now() });
    };

    const onKeyUp = (e: CustomEvent) => {
      const { key, code } = e.detail;
      if (!(key === 'Alt' || key === 'AltGraph' || code === 'AltLeft' || code === 'AltRight')) return;
      if (!altDownRef.current) return;
      altDownRef.current = false;
      console.log('[AltKey]', 'up', { key, code, time: performance.now() });
    };

    window.addEventListener('app-hotkey-keydown', onKeyDown as EventListener);
    window.addEventListener('app-hotkey-keyup', onKeyUp as EventListener);

    const unregister = registerDeleteHandler(
      () => mode === 'support' && canDeleteSelection(),
      performDeleteSelection,
      100,
    );

    return () => {
      window.removeEventListener('app-hotkey-keydown', onKeyDown as EventListener);
      window.removeEventListener('app-hotkey-keyup', onKeyUp as EventListener);
      altDownRef.current = false;
      unregister();
    };
  }, [mode]);

  return {
    trunkPlacementV2,
    branchPlacement,
    leafPlacement,
    bracePlacement,
    kickstandPlacement,
    jointCreationState,
    isPlacementDisabled,
    isPlacementHardDisabled,
    globalSelectedId,
    globalSelectedCategory,
    selectedJointId,
    // Model interaction (for trunk placement or branch tip)
    onModelHover,
    onModelClick,
    // Support interaction (for branch base placement)
    onSupportHover,
    onSupportClick,
    previewError: trunkPlacementV2.previewError,
    previewWarning: trunkPlacementV2.previewWarning,
    /**
     * Placement previews, keyed by type. Brace names its field `preview`
     * where the others use `previewData`; that is the only difference.
     */
    placementPreviews: {
      trunk: trunkPlacementV2.previewData,
      branch: branchPlacement.previewData,
      leaf: leafPlacement.previewData,
      brace: bracePlacement.preview,
      kickstand: kickstandPlacement.previewData,
    } satisfies SupportPlacementPreviews,
  };
}
