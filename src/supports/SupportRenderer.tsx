"use client";

import React, { useSyncExternalStore, forwardRef, useImperativeHandle, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { removeRootById, subscribe, getSnapshot } from './state';
import {
    buildBracePlacementPreviewBatch,
    buildSupportPlacementPreviewBatch,
    recomputeLeafPreviewContactCone,
    resolvePlacementPreviewMaterial,
    type InteriorContactFilter,
    type InteriorContactPoint,
    type PlacementPreviewBatch,
    type PlacementPreviewDisk,
    type PlacementPreviewTaperedShaft,
    type PlacementSurface,
    type Vec3Like,
} from './supportPlacementPreviewMath';
import { anyContactMatches, collectOwnedRootIds, contactEndpointsFor, getSupportTypeBySelectionCategory, getSupportTypeDescriptor, SUPPORT_COLLECTION_KEYS, SUPPORT_TYPES, type SupportCollectionKey, type SupportTypeId } from './supportTypeRegistry';
import { buildKnotIndex, selectedIdsForType, type CollectionLookup, type SelectionInputs } from './interaction/shared/selection/selectedIdsByType';
import { TrunkRenderer } from './SupportTypes/Trunk/TrunkRenderer';
import { BranchRenderer } from './SupportTypes/Branch/BranchRenderer';
import { LeafRenderer } from './SupportTypes/Leaf/LeafRenderer';
import { BraceRenderer } from './SupportTypes/Brace/BraceRenderer';
import { TwigRenderer } from './SupportTypes/Twig/TwigRenderer';
import { StickRenderer } from './SupportTypes/Stick/StickRenderer';
import { KickstandRenderer } from './SupportTypes/Kickstand/KickstandRenderer';
import { AnchorRenderer } from './SupportTypes/Anchor/AnchorRenderer';
import { InstancedShaftGroup, type InstancedShaft } from './SupportPrimitives/Shaft/InstancedShaftGroup';
import { InstancedJointGroup, type InstancedJoint } from './SupportPrimitives/Joint/InstancedJointGroup';
import { InstancedRootsGroup, type InstancedRoot } from './SupportPrimitives/Roots/InstancedRootsGroup';
import { InstancedContactConeGroup, type InstancedContactCone } from './SupportPrimitives/ContactCone/InstancedContactConeGroup';
import { useBracePlacementState } from './SupportTypes/Brace/bracePlacementState';
import { useLeafPlacementState } from './SupportTypes/Leaf/leafPlacementState';
import { useKickstandStoreState } from './SupportTypes/Kickstand/kickstandStore';
import { useKickstandPlacementState } from './SupportTypes/Kickstand/kickstandPlacementState';
import { useJointInteraction } from './SupportPrimitives/Joint/useJointInteraction';
import { useKnotInteraction } from './SupportPrimitives/Knot/useKnotInteraction';
import { useActiveJointDragPreview, useJointDragPreviewOverrides } from './interaction/jointDragPreview';
import { useActiveKnotDragPreview } from './interaction/knotDragPreview';
import { useActiveTwigDragPreview } from './SupportTypes/Twig/twigDragPreview';
import { buildBranchCandidateKnotIdsByBranchId, buildBranchesByParentKnotId, buildBraceIdsByKnotId, buildLeafIdsByParentKnotId, collectPreviewLeavesById, computeCascadedPreviewKnotOverrides } from './interaction/supportPreviewOverlay';
import { JointCreationManager } from './SupportPrimitives/Joint/JointCreationManager';
import { JointGizmo } from './SupportPrimitives/Joint/JointGizmo';
import { KnotGizmo } from './SupportPrimitives/Knot/KnotGizmo';
import { BezierGizmoManager } from './Curves/BezierGizmo/BezierGizmoManager';
import { ContactDisk, SupportMode, BezierSegment, type Brace, type Knot, type Leaf, type Roots, type Segment, type Twig, type SupportOrigin, type Vec3 } from './types';
import { resolveTwigDiameterAtSegmentT } from './SupportTypes/Twig/twigTaper';
import { bezierSegmentToBatchedShaft, braceBezierToBatchedShaft } from './Curves/batchedBezierShaft';
import type { SupportData } from './rendering';
import type { BracePreviewData } from './SupportTypes/Brace/bracePlacementState';
import { useJointCreationState } from './SupportPrimitives/Joint/jointCreationState';
import { subscribeToSettings, getSettingsSnapshot } from './Settings/state';
import { emitSupportModelPointerHover, emitSupportModelPointerSelect, handleSupportClick } from './interaction/clickHandlers';
import { useResolvedSelectionState } from './interaction/shared/selection/resolvedSelectionStore';
import { getFinalSocketPosition } from './SupportPrimitives/ContactCone/contactConeUtils';
import { calculateDiskThickness, getDiskCenter, getDiskRotation } from './SupportPrimitives/ContactDisk/contactDiskUtils';
import type { ContactDiskProfile } from './SupportPrimitives/ContactCone/types';
import { getRaftSettings, subscribeToRaftStore } from './Rafts/Crenelated/RaftState';
import { JOINT_DIAMETER_OFFSET_MM } from './constants';
import { DEBUG_SECTION_COLORS as AUTO_BRACING_DEBUG_SECTION_COLORS } from './autoBracing/settings';
import { getAutoBracingSettings } from './Settings/state';
import { VoronoiSeedDebugMarkers } from './autoBracing/VoronoiSeedDebugMarkers';
import { clearSupportMarqueeHover, setSupportMarqueeHoverBlocked, useSupportMarqueeHoverState } from './interaction/shared/hover/sceneHoverMarquee';
import { applySceneHoverWriteDecision, resolveSceneBatchedShaftHoverWriteDecision, resolveSceneBatchedShaftPointerOutWriteDecision, resolveSceneBatchedSupportHoverWriteDecision, shouldClearSceneHoverForSelectedPrimitiveSuppression, shouldClearSceneHoverForSelectionChange } from './interaction/shared/hover/sceneHoverController';
import { cancelPendingSceneHoverClearFrame, clearImmediateModelHover } from './interaction/shared/hover/sceneHoverReset';
import { isJointHoverCategory, resolveHoveredSupportOwnerId, resolveHoveredSupportVisualState, resolveRawSupportHoverSuppressionState, resolveSelectedPrimitiveHoverSuppression } from './interaction/shared/hover/supportHoverResolver';
import { setSceneHoveredSupportId as setSharedSceneHoveredSupportId, useSceneHoveredSupportId } from './interaction/shared/hover/sceneHoverStore';
import { useSupportRenderLookup } from './interaction/useSupportRenderLookup';
import { setInteriorSupportInteractionActive } from './interaction/pointerOcclusion';
import { MARQUEE_CANDIDATE_TINT_FACTOR } from '@/utils/marqueeCandidateTint';

interface SupportRendererProps {
    mode?: SupportMode;
    navigationLodActive?: boolean;
    hidePlateContactPrimitives?: boolean;
    clipLower?: number | null;
    clipUpper?: number | null;
    supportColorsByModelId?: Record<string, string>;
    hoverTintColor?: string;
    hoverTintStrength?: number;
    selectedTintStrength?: number;
    activeModelId?: string | null;
    selectedModelIds?: string[];
    /** Models the marquee would take if the drag ended now. */
    marqueeCandidateModelIds?: readonly string[];
    hoverModelId?: string | null;
    modelDropOffsetsById?: Record<string, number>;
    modelFilterId?: string | null;
    excludeModelId?: string | null;
    excludeModelIds?: string[];
    passive?: boolean;
    disableSelectionAndHover?: boolean;
    ghostOpacity?: number;
    ghostRenderOrder?: number;
    trunkPlacementPreview?: SupportData | null;
    branchPlacementPreview?: SupportData | null;
    leafPlacementPreview?: SupportData | null;
    bracePlacementPreview?: BracePreviewData | null;
    kickstandPlacementPreview?: SupportData | null;
    interiorView?: boolean;
    cavityGeometryByModelId?: Map<string, THREE.BufferGeometry>;
    modelWorldInverseById?: Map<string, THREE.Matrix4>;
}

interface SupportPlacementPreviewLayerProps {
    mode?: SupportMode;
    hidePlateContactPrimitives?: boolean;
    trunkPlacementPreview?: SupportData | null;
    branchPlacementPreview?: SupportData | null;
    leafPlacementPreview?: SupportData | null;
    bracePlacementPreview?: BracePreviewData | null;
    kickstandPlacementPreview?: SupportData | null;
}



interface SupportShaftSet {
    supportId: string;
    modelId?: string;
    shafts: InstancedShaft[];
}

interface SupportJointSet {
    supportId: string;
    modelId?: string;
    joints: InstancedJoint[];
}

const BATCHED_SHAFT_RADIAL_SEGMENTS = 10;
const BATCHED_SHAFT_LOW_RADIAL_SEGMENTS = 6;
const BATCHED_SHAFT_HIGH_INSTANCE_THRESHOLD = 1200;
const BATCHED_JOINT_WIDTH_SEGMENTS = 12;
const BATCHED_JOINT_HEIGHT_SEGMENTS = 10;
const MULTI_SELECTION_DETAIL_THRESHOLD = 24;
const BULK_MULTI_SELECTED_COLOR = '#80fffd';
/** Debug origin coloring (AutoSupport "Origin Colors" toggle): red = anchor
 *  band, orange = overhang (grid infill / organic Poisson / fanned overhang),
 *  blue = island (voxel/minima), purple = standalone overhang trunks. */
const ORIGIN_COLORS: Record<SupportOrigin, string> = {
    anchor: '#ff3b30',
    overhang: '#ff9f0a',
    island: '#0a84ff',
    standalone: '#bf5af2',
};
/** Origin coloring: gray = entity generated before origin stamping existed —
 * regenerate the supports to get colors. */
const ORIGIN_NO_ORIGIN_COLOR = '#8e8e93';
/** Origin coloring: a type that records no origin at all, so the question does
 * not apply. Distinct from every ORIGIN_COLORS hue and from the gray above, or
 * a debug mode for telling types apart would put two of them side by side. */
const ORIGIN_NOT_APPLICABLE_COLOR = '#2e4a5c';
const SCENE_JOINT_DIAMETER_BLEND_MM = JOINT_DIAMETER_OFFSET_MM * 0.75;
/** Leaf base knots rendered in the scene batch: KnotRenderer subtracts the
 *  full JOINT_DIAMETER_OFFSET_MM from the knot diameter while the batch
 *  subtracts only SCENE_JOINT_DIAMETER_BLEND_MM (×0.75), so batched entries
 *  pre-compensate to keep the exact KnotRenderer sphere size. */
const KNOT_BATCH_DIAMETER_PRECOMPENSATION_MM = SCENE_JOINT_DIAMETER_BLEND_MM - JOINT_DIAMETER_OFFSET_MM;
const EMPTY_SUPPORT_ID_LIST: readonly string[] = Object.freeze([]);
const EMPTY_KNOT_DRAG_BRANCH_SEGMENTS_BY_ID: Record<string, never> = Object.freeze({});
const FREEZE_DEPENDENT_PREVIEW_DURING_JOINT_DRAG = true;

/** Simple line vector for debugSimpleSupportRender — like J×2 pathfinding debug, but for all shafts. */
function SimpleShaftLines({ shafts, color }: { shafts: InstancedShaft[]; color: string }) {
    const line = React.useMemo(() => {
        if (shafts.length === 0) return null;
        const positions: number[] = [];
        for (const s of shafts) {
            positions.push(s.start.x, s.start.y, s.start.z, s.end.x, s.end.y, s.end.z);
        }
        if (positions.length === 0) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: true });
        const obj = new THREE.LineSegments(geometry, material);
        obj.frustumCulled = false;
        obj.renderOrder = 999;
        return obj;
    }, [shafts, color]);
    React.useEffect(() => () => { line?.geometry.dispose(); (line?.material as THREE.Material)?.dispose(); }, [line]);
    if (!line || shafts.length === 0) return null;
    return <primitive object={line} />;
}




export function SupportPlacementPreviewLayer({
    mode,
    hidePlateContactPrimitives = false,
    trunkPlacementPreview = null,
    branchPlacementPreview = null,
    leafPlacementPreview = null,
    bracePlacementPreview = null,
    kickstandPlacementPreview = null,
}: SupportPlacementPreviewLayerProps) {
    const raftSettings = useSyncExternalStore(subscribeToRaftStore, getRaftSettings, getRaftSettings);
    const { sproutParentingLockHeld, stage: leafStage } = useLeafPlacementState();

    const placementPreviewBatches = useMemo(() => {
        if (mode !== 'support') return [] as PlacementPreviewBatch[];

        const hasSolidBottom = raftSettings.bottomMode === 'solid';
        const raftThickness = raftSettings.thickness ?? 0;
        const next: PlacementPreviewBatch[] = [];

        const pushSupportPreview = (id: string, preview: SupportData | null) => {
            if (!preview) return;
            const batch = buildSupportPlacementPreviewBatch(id, preview, hasSolidBottom, raftThickness);
            if (!batch) return;

            if (hidePlateContactPrimitives) {
                next.push({
                    ...batch,
                    roots: [],
                });
                return;
            }

            next.push(batch);
        };

        pushSupportPreview('placement-preview:trunk', trunkPlacementPreview);
        pushSupportPreview('placement-preview:branch', branchPlacementPreview);
        pushSupportPreview('placement-preview:leaf', leafPlacementPreview);
        pushSupportPreview('placement-preview:kickstand', kickstandPlacementPreview);

        if (bracePlacementPreview) {
            const braceBatch = buildBracePlacementPreviewBatch('placement-preview:brace', bracePlacementPreview);
            if (braceBatch) next.push(braceBatch);
        }

        return next;
    }, [
        mode,
        trunkPlacementPreview,
        branchPlacementPreview,
        leafPlacementPreview,
        bracePlacementPreview,
        kickstandPlacementPreview,
        raftSettings.bottomMode,
        raftSettings.thickness,
        hidePlateContactPrimitives,
    ]);

    if (placementPreviewBatches.length === 0) return null;

    return (
        <>
            {placementPreviewBatches.map((batch) => (
                <group key={`${batch.id}:${batch.color}:${batch.opacity}`}>
                    {batch.shafts.length > 0 && (
                        <InstancedShaftGroup
                            shafts={batch.shafts}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                            radialSegments={BATCHED_SHAFT_RADIAL_SEGMENTS}
                        />
                    )}
                    {batch.taperedShafts.map((seg) => {
                        const startVec = new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z);
                        const endVec = new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z);
                        const length = startVec.distanceTo(endVec);
                        if (length < 0.001) return null;
                        const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
                        const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
                        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                        return (
                            <mesh key={`tapered-shaft:${batch.id}:${seg.id}`} position={[midpoint.x, midpoint.y, midpoint.z]} quaternion={quat}>
                                <cylinderGeometry args={[seg.diameterEnd / 2, seg.diameterStart / 2, length, BATCHED_SHAFT_RADIAL_SEGMENTS]} />
                                <meshStandardMaterial
                                    color={batch.color}
                                    emissive={batch.color}
                                    emissiveIntensity={0.08}
                                    transparent
                                    opacity={batch.opacity}
                                />
                            </mesh>
                        );
                    })}
                    {batch.disks.map((disk) => {
                        const thickness = disk.diskLengthOverride ?? calculateDiskThickness(disk.surfaceNormal, disk.coneAxis, disk.profile);
                        const center = getDiskCenter(disk.pos, disk.surfaceNormal, thickness);
                        const rotation = getDiskRotation(disk.surfaceNormal);
                        const radius = disk.contactDiameterMm / 2;
                        return (
                            <group key={`preview-disk:${batch.id}:${disk.id}`} position={[center.x, center.y, center.z]} quaternion={rotation}>
                                <mesh position={[0, 0, 0]}>
                                    <cylinderGeometry args={[radius, radius, thickness, BATCHED_SHAFT_RADIAL_SEGMENTS]} />
                                    <meshStandardMaterial
                                        color={batch.color}
                                        emissive={batch.color}
                                        emissiveIntensity={0.08}
                                        transparent
                                        opacity={batch.opacity}
                                    />
                                </mesh>
                                <mesh position={[0, thickness / 2, 0]}>
                                    <sphereGeometry args={[radius, BATCHED_JOINT_WIDTH_SEGMENTS, BATCHED_JOINT_HEIGHT_SEGMENTS]} />
                                    <meshStandardMaterial
                                        color={batch.color}
                                        emissive={batch.color}
                                        emissiveIntensity={0.08}
                                        transparent
                                        opacity={batch.opacity}
                                    />
                                </mesh>
                            </group>
                        );
                    })}
                    {batch.joints.length > 0 && (
                        <InstancedJointGroup
                            joints={batch.joints}
                            color={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? '#00ff00'
                                    : batch.color
                            }
                            emissive={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? '#00ff00'
                                    : batch.color
                            }
                            emissiveIntensity={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? 0.5
                                    : 0.08
                            }
                            transparent
                            opacity={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? 0.70
                                    : batch.opacity
                            }
                            widthSegments={BATCHED_JOINT_WIDTH_SEGMENTS}
                            heightSegments={BATCHED_JOINT_HEIGHT_SEGMENTS}
                        />
                    )}
                    {batch.roots.length > 0 && (
                        <InstancedRootsGroup
                            roots={batch.roots}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                        />
                    )}
                    {batch.cones.length > 0 && (
                        <InstancedContactConeGroup
                            cones={batch.cones}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                        />
                    )}
                </group>
            ))}
        </>
    );
}

export const SupportRenderer = forwardRef<THREE.Group, SupportRendererProps>(({ mode, navigationLodActive = false, hidePlateContactPrimitives = false, clipLower, clipUpper, activeModelId = null, selectedModelIds = [], marqueeCandidateModelIds = EMPTY_SUPPORT_ID_LIST, hoverModelId = null, modelDropOffsetsById, modelFilterId = null, excludeModelId = null, excludeModelIds = [], passive = false, disableSelectionAndHover = false, ghostOpacity = 1, ghostRenderOrder = 100000, trunkPlacementPreview = null, branchPlacementPreview = null, leafPlacementPreview = null, bracePlacementPreview = null, kickstandPlacementPreview = null, interiorView = false, cavityGeometryByModelId, modelWorldInverseById }, ref) => {
    const state = useSyncExternalStore(subscribe, getSnapshot);
    const resolvedSelection = useResolvedSelectionState();
    const settings = useSyncExternalStore(subscribeToSettings, getSettingsSnapshot, getSettingsSnapshot);
    const simpleRender = settings.debugSimpleSupportRender;
    const raftSettings = useSyncExternalStore(subscribeToRaftStore, getRaftSettings, getRaftSettings);
    const kickstandState = useKickstandStoreState();
    const activeJointDragPreview = useActiveJointDragPreview();
    const { isActive: isJointCreationActive } = useJointCreationState();
    const { altActive: braceAltActive } = useBracePlacementState();
    const { hotkeyActive: kickstandHotkeyActive } = useKickstandPlacementState();
    const { hotkeyActive: leafHotkeyActive, stage: leafStage, sproutParentingLockHeld } = useLeafPlacementState();
    useEffect(() => {
        const active = interiorView && mode === 'support' && !passive;
        if (!active) return;
        setInteriorSupportInteractionActive(true);
        return () => setInteriorSupportInteractionActive(false);
    }, [interiorView, mode, passive]);

    const selectionEnabled = mode === 'support';
    const effectiveSelectedSupportIds = selectionEnabled ? resolvedSelection.selectedIds : [];
    const selectedSupportIdSet = useMemo(() => new Set(effectiveSelectedSupportIds), [effectiveSelectedSupportIds]);
    const selectedId = selectionEnabled ? resolvedSelection.selectedId : null;
    const selectedCategory = selectionEnabled ? resolvedSelection.selectedCategory : null;
    const hasSupportMultiSelection = effectiveSelectedSupportIds.length > 0;
    const useMultiSelectionDetail = hasSupportMultiSelection && effectiveSelectedSupportIds.length <= MULTI_SELECTION_DETAIL_THRESHOLD;
    const dimNonSelected = selectedId !== null || hasSupportMultiSelection;
    const hideUnselectedKnots = selectedId !== null || hasSupportMultiSelection;
    // Twigs participate in scene-batched shaft rendering like other supports.
    // TwigRenderer still mounts (to draw the disks + joints, which have no
    // scene-batched equivalent); it just defers its straight shafts to the
    // batched pipeline via deferStraightShaftsToSceneBatch.
    const enableTwigSceneBatching = true;

    const interactionHooksEnabled = !passive;
    const [gizmoInteractionLockActive, setGizmoInteractionLockActive] = React.useState(false);
    const knotGizmoInteractionLockTimeoutRef = React.useRef<number | null>(null);
    const [contactDiskHudHoverActive, setContactDiskHudHoverActive] = React.useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleContactDiskHudInteractionChange = (event: Event) => {
            const detail = (event as CustomEvent<{ active?: boolean }>).detail;
            setContactDiskHudHoverActive(!!detail?.active);
        };

        window.addEventListener('contact-disk-hud-interaction-change', handleContactDiskHudInteractionChange as EventListener);
        return () => {
            window.removeEventListener('contact-disk-hud-interaction-change', handleContactDiskHudInteractionChange as EventListener);
        };
    }, []);
    const rawHoveredCategory = state.hoveredCategory as string | null | undefined;
    const {
        primitiveHoverSuppressesSceneShaftHover,
        jointCategoryHoverSuppressed,
    } = resolveRawSupportHoverSuppressionState(rawHoveredCategory);
    const supportInteractionSuppressed = mode === 'support' && (disableSelectionAndHover || gizmoInteractionLockActive || contactDiskHudHoverActive);
    const supportSelectionAndHoverSuppressed = supportInteractionSuppressed;
    const supportPointerInteractable = interactionHooksEnabled && mode === 'support' && !navigationLodActive;
    const isInteractable = supportPointerInteractable && !supportInteractionSuppressed;
    const isPreparePointerInteractable = interactionHooksEnabled && mode === 'prepare' && !navigationLodActive;
    const isPointerInteractable = supportPointerInteractable || isPreparePointerInteractable;
    const ghostOpacityClamped = Math.max(0.05, Math.min(1, ghostOpacity));
    const ghostTransparent = ghostOpacityClamped < 0.999;
    const selectedModelIdSet = useMemo(() => new Set(selectedModelIds), [selectedModelIds]);
    const marqueeCandidateModelIdSet = useMemo(() => new Set(marqueeCandidateModelIds), [marqueeCandidateModelIds]);
    const excludedModelIdSet = useMemo(() => new Set(excludeModelIds.filter((id): id is string => Boolean(id))), [excludeModelIds]);
    const hidePlateContactPrimitivesEffective = hidePlateContactPrimitives;
    const restrictToActiveModel = mode === 'support' && !!activeModelId;
    const filteredActiveModelId = restrictToActiveModel ? activeModelId : null;
    const suppressHover = supportSelectionAndHoverSuppressed || isJointCreationActive || !isInteractable || braceAltActive;
    const [immediateModelHoverId, setImmediateModelHoverId] = React.useState<string | null>(null);
    const [immediatePrepareActiveModelId, setImmediatePrepareActiveModelId] = React.useState<string | null>(null);
    const lastSyncedPrepareActiveModelIdRef = React.useRef<string | null>(activeModelId ?? null);
    const sceneHoveredSupportId = useSceneHoveredSupportId();
    const setSceneHoveredSupportId = setSharedSceneHoveredSupportId;
    const pendingSceneHoverClearFrameRef = React.useRef<number | null>(null);
    const orbitInteractionActiveRef = React.useRef(false);
    const marqueeHover = useSupportMarqueeHoverState();
    const marqueeHoveredSupportId = supportSelectionAndHoverSuppressed ? null : marqueeHover.supportId;
    const marqueeHoveredSupportIds = supportSelectionAndHoverSuppressed ? EMPTY_SUPPORT_ID_LIST : marqueeHover.supportIds;
    const marqueeHoveredSupportIdSet = useMemo(() => new Set(marqueeHoveredSupportIds), [marqueeHoveredSupportIds]);
    const activeKnotDragPreview = useActiveKnotDragPreview();
    const activeTwigDragPreview = useActiveTwigDragPreview();
    // Collections picked by SUPPORT_COLLECTION_KEYS rather than listed: the old
    // list omitted anchors, so nothing could resolve which support an anchor
    // segment belonged to. `state` is the dependency because the picked object is
    // rebuilt whenever any collection identity changes, which is what `state` does.
    const supportRenderLookupInput = useMemo(() => {
        const picked = {} as Record<string, unknown>;
        for (const key of SUPPORT_COLLECTION_KEYS) picked[key] = state[key];
        return {
            state: picked as Pick<typeof state, SupportCollectionKey>,
            kickstandState: {
                kickstands: kickstandState.kickstands,
                knots: kickstandState.knots,
            },
            // Keep worker lookups driven by committed state only.
            // Drag previews are resolved locally in this renderer to avoid per-frame
            // structured-clone payload churn during joint dragging.
            activePreviewSupport: null,
        };
    }, [state, kickstandState.kickstands, kickstandState.knots]);
    const supportRenderLookup = useSupportRenderLookup(supportRenderLookupInput);

    const trunkList = useMemo(() => Object.values(state.trunks), [state.trunks]);
    const branchList = useMemo(() => Object.values(state.branches), [state.branches]);
    const leafList = useMemo(() => Object.values(state.leaves), [state.leaves]);
    const twigList = useMemo(() => Object.values(state.twigs), [state.twigs]);
    // Reverse lookup: twig segment id â†’ owning twig. Used during knot drag to
    // resolve a Leaf's wide-end (bodyDiameterMm) against the twig taper so the
    // cone visibly tapers with the knot. While a disk drag is in flight, the
    // live (not-yet-committed) twig is substituted so taper math reflects the
    // live geometry.
    const twigBySegmentId = useMemo(() => {
        const map = new Map<string, Twig>();
        for (const twig of twigList) {
            const liveTwig = activeTwigDragPreview && activeTwigDragPreview.twigId === twig.id
                ? activeTwigDragPreview.twig
                : twig;
            for (const seg of liveTwig.segments) {
                map.set(seg.id, liveTwig);
            }
        }
        return map;
    }, [twigList, activeTwigDragPreview]);
    const stickList = useMemo(() => Object.values(state.sticks), [state.sticks]);
    const braceList = useMemo(() => Object.values(state.braces), [state.braces]);
    const anchorList = useMemo(() => Object.values(state.anchors), [state.anchors]);
    const kickstandList = useMemo(() => Object.values(kickstandState.kickstands), [kickstandState.kickstands]);
    const matchesInteriorContact = useMemo<InteriorContactFilter>(() => {
        if (!interiorView) return () => true;

        return (contact, _modelId) => {
            if (!contact) return false;
            if (contact.placementSurface === 'interior') return true;
            if (contact.placementSurface === 'exterior') return false;
            // placementSurface is undefined for imported (LYS) supports — show them
            // in interior view so the user can see how all supports relate to the
            // cavity. The BVH/raycasting tests are unreliable on non-watertight
            // cavity meshes.
            return true;
        };
    }, [interiorView, cavityGeometryByModelId, modelWorldInverseById]);
    const knotList = useMemo(() => Object.values(state.knots), [state.knots]);
    const kickstandKnotList = useMemo(() => Object.values(kickstandState.knots), [kickstandState.knots]);
    const matchesInteriorBrace = useMemo(() => {
        if (!interiorView) return (_brace: Brace) => true;

        // Every shafted type, by its declared contacts. The four loops this
        // replaces omitted anchors and kickstands.
        const directSegmentInteriorById = new Map<string, boolean>();
        for (const descriptor of SUPPORT_TYPES) {
            if (!descriptor.hasSegments) continue;
            const collection = state[descriptor.location.key] as unknown as Record<string, { modelId: string; segments?: Segment[] }>;
            for (const entity of Object.values(collection ?? {})) {
                const isInterior = anyContactMatches(descriptor.id, entity, (contact: unknown) =>
                    matchesInteriorContact(contact as Parameters<typeof matchesInteriorContact>[0], entity.modelId));
                for (const segment of entity.segments ?? []) directSegmentInteriorById.set(segment.id, isInterior);
            }
        }

        const resolveKnotInterior = (knotId?: string, visitedBraceIds?: Set<string>): boolean => {
            if (!knotId) return false;
            const knot = state.knots[knotId] ?? kickstandState.knots[knotId];
            if (!knot) return false;
            return resolveParentShaftInterior(knot.parentShaftId, visitedBraceIds);
        };

        const resolveParentShaftInterior = (parentShaftId?: string, visitedBraceIds?: Set<string>): boolean => {
            if (!parentShaftId) return false;

            if (parentShaftId.startsWith('leafCone:')) {
                const leafId = parentShaftId.slice('leafCone:'.length);
                const leaf = state.leaves[leafId];
                return !!leaf && matchesInteriorContact(leaf.contactCone, leaf.modelId);
            }

            if (parentShaftId.startsWith('braceSegment:')) {
                const braceId = parentShaftId.slice('braceSegment:'.length);
                const brace = state.braces[braceId];
                if (!brace) return false;
                if (brace.placementSurface === 'interior') return true;
                if (brace.placementSurface === 'exterior') return false;

                const nextVisited = visitedBraceIds ?? new Set<string>();
                if (nextVisited.has(braceId)) return false;
                nextVisited.add(braceId);
                return resolveKnotInterior(brace.startKnotId, nextVisited)
                    || resolveKnotInterior(brace.endKnotId, nextVisited);
            }

            return directSegmentInteriorById.get(parentShaftId) ?? false;
        };

        return (brace: Brace) => {
            if (brace.placementSurface === 'interior') return true;
            if (brace.placementSurface === 'exterior') return false;
            return resolveKnotInterior(brace.startKnotId) || resolveKnotInterior(brace.endKnotId);
        };
    }, [interiorView, state.trunks, state.branches, state.leaves, state.twigs, state.sticks, state.braces, state.knots, kickstandState.knots, matchesInteriorContact]);

    const entitySegmentModelIdById = useMemo(() => {
        const map = new Map<string, string | undefined>();
        for (const [id, modelId] of Object.entries(supportRenderLookup.entitySegmentModelIdById)) {
            map.set(id, modelId);
        }
        return map;
    }, [supportRenderLookup.entitySegmentModelIdById]);

    const entityModelIdByKnotId = useMemo(() => {
        const map = new Map<string, string | undefined>();
        for (const [id, modelId] of Object.entries(supportRenderLookup.entityModelIdByKnotId)) {
            map.set(id, modelId);
        }
        return map;
    }, [supportRenderLookup.entityModelIdByKnotId]);

    const resolveSupportModelId = React.useCallback((modelId?: string, supportId?: string) => {
        if (modelId) return modelId;
        if (!supportId) return undefined;

        const trunk = state.trunks[supportId];
        if (trunk?.modelId) return trunk.modelId;

        const branch = state.branches[supportId];
        if (branch) return branch.modelId ?? entityModelIdByKnotId.get(branch.parentKnotId);

        const leaf = state.leaves[supportId];
        if (leaf) return leaf.modelId ?? entityModelIdByKnotId.get(leaf.parentKnotId);

        const brace = state.braces[supportId];
        if (brace) {
            return brace.modelId
                ?? entityModelIdByKnotId.get(brace.startKnotId)
                ?? entityModelIdByKnotId.get(brace.endKnotId);
        }

        const twig = state.twigs[supportId];
        if (twig?.modelId) return twig.modelId;

        const stick = state.sticks[supportId];
        if (stick?.modelId) return stick.modelId;

        const kickstand = kickstandState.kickstands[supportId];
        if (kickstand) {
            return kickstand.modelId
                ?? kickstandState.roots[kickstand.rootId]?.modelId
                ?? entityModelIdByKnotId.get(kickstand.hostKnotId);
        }

        return undefined;
    }, [state.trunks, state.branches, state.leaves, state.braces, state.twigs, state.sticks, kickstandState.kickstands, kickstandState.roots, entityModelIdByKnotId]);

    const isModelVisible = React.useCallback((modelId?: string, supportId?: string) => {
        const resolvedModelId = resolveSupportModelId(modelId, supportId);

        if ((restrictToActiveModel || modelFilterId || excludeModelId || excludedModelIdSet.size > 0) && !resolvedModelId) return false;
        if (restrictToActiveModel && resolvedModelId !== filteredActiveModelId) return false;
        if (modelFilterId && resolvedModelId !== modelFilterId) return false;
        if (excludeModelId && resolvedModelId === excludeModelId) return false;
        if (resolvedModelId && excludedModelIdSet.has(resolvedModelId)) return false;
        return true;
    }, [resolveSupportModelId, restrictToActiveModel, filteredActiveModelId, modelFilterId, excludeModelId, excludedModelIdSet]);

    useEffect(() => {
        setSupportMarqueeHoverBlocked(!interactionHooksEnabled || supportSelectionAndHoverSuppressed);
        return () => {
            setSupportMarqueeHoverBlocked(false);
        };
    }, [interactionHooksEnabled, supportSelectionAndHoverSuppressed]);

    useEffect(() => {
        if (!interactionHooksEnabled) return;

        const handleImmediateModelHover = (event: Event) => {
            if (orbitInteractionActiveRef.current) return;
            if (supportSelectionAndHoverSuppressed) return;
            const customEvent = event as CustomEvent<{ modelId?: string | null }>;
            setImmediateModelHoverId(customEvent.detail?.modelId ?? null);
        };

        const handleOrbitStartOrChange = () => {
            orbitInteractionActiveRef.current = true;
            cancelPendingSceneHoverClearFrame(pendingSceneHoverClearFrameRef);
            applySceneHoverWriteDecision(
                { type: 'clear', reason: 'interaction-suppressed' },
                pendingSceneHoverClearFrameRef,
                setSceneHoveredSupportId,
                emitSupportModelPointerHover,
            );
            clearSupportMarqueeHover();
        };

        const handleOrbitEnd = () => {
            orbitInteractionActiveRef.current = false;
        };

        const forceOrbitInactive = () => {
            orbitInteractionActiveRef.current = false;
        };

        window.addEventListener('model-pointer-hover-immediate', handleImmediateModelHover as EventListener);
        window.addEventListener('picking-orbit-start', handleOrbitStartOrChange);
        window.addEventListener('picking-orbit-change', handleOrbitStartOrChange);
        window.addEventListener('picking-orbit-end', handleOrbitEnd);
        window.addEventListener('pointerup', forceOrbitInactive, true);
        window.addEventListener('pointercancel', forceOrbitInactive, true);
        window.addEventListener('mouseup', forceOrbitInactive, true);
        window.addEventListener('contextmenu', forceOrbitInactive, true);
        window.addEventListener('blur', forceOrbitInactive);
        document.addEventListener('visibilitychange', forceOrbitInactive);
        return () => {
            window.removeEventListener('model-pointer-hover-immediate', handleImmediateModelHover as EventListener);
            window.removeEventListener('picking-orbit-start', handleOrbitStartOrChange);
            window.removeEventListener('picking-orbit-change', handleOrbitStartOrChange);
            window.removeEventListener('picking-orbit-end', handleOrbitEnd);
            window.removeEventListener('pointerup', forceOrbitInactive, true);
            window.removeEventListener('pointercancel', forceOrbitInactive, true);
            window.removeEventListener('mouseup', forceOrbitInactive, true);
            window.removeEventListener('contextmenu', forceOrbitInactive, true);
            window.removeEventListener('blur', forceOrbitInactive);
            document.removeEventListener('visibilitychange', forceOrbitInactive);
        };
    }, [interactionHooksEnabled, supportInteractionSuppressed, supportSelectionAndHoverSuppressed]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const refreshFromGlobals = () => {
            const w = window as any;
            const knotDragging = !!w.__knotGizmoDragging;
            const jointDragging = !!w.__jointGizmoDragging;
            const bezierDragging = !!w.__bezierGizmoDragging;
            const dragging = knotDragging || jointDragging || bezierDragging;
            const knotGuardUntil = typeof w.__knotGizmoGuardUntil === 'number' ? w.__knotGizmoGuardUntil : 0;
            const jointGuardUntil = typeof w.__jointGizmoGuardUntil === 'number' ? w.__jointGizmoGuardUntil : 0;
            const bezierGuardUntil = typeof w.__bezierGizmoGuardUntil === 'number' ? w.__bezierGizmoGuardUntil : 0;
            const guardUntil = Math.max(knotGuardUntil, jointGuardUntil, bezierGuardUntil);
            const now = Date.now();
            const guardActive = guardUntil > now;
            const nextActive = dragging || guardActive;
            setGizmoInteractionLockActive(nextActive);

            if (knotGizmoInteractionLockTimeoutRef.current != null) {
                window.clearTimeout(knotGizmoInteractionLockTimeoutRef.current);
                knotGizmoInteractionLockTimeoutRef.current = null;
            }

            if (!dragging && guardActive) {
                knotGizmoInteractionLockTimeoutRef.current = window.setTimeout(() => {
                    knotGizmoInteractionLockTimeoutRef.current = null;
                    refreshFromGlobals();
                }, Math.max(0, guardUntil - now + 1));
            }
        };

        const handleKnotGizmoInteractionLock = (event: Event) => {
            const detail = (event as CustomEvent<{ active?: boolean; guardUntil?: number }>).detail;
            if (typeof detail?.active !== 'boolean') {
                refreshFromGlobals();
                return;
            }

            const guardUntil = typeof detail.guardUntil === 'number' ? detail.guardUntil : 0;
            const now = Date.now();
            const nextActive = detail.active || guardUntil > now;
            setGizmoInteractionLockActive(nextActive);

            if (knotGizmoInteractionLockTimeoutRef.current != null) {
                window.clearTimeout(knotGizmoInteractionLockTimeoutRef.current);
                knotGizmoInteractionLockTimeoutRef.current = null;
            }

            if (!detail.active && guardUntil > now) {
                knotGizmoInteractionLockTimeoutRef.current = window.setTimeout(() => {
                    knotGizmoInteractionLockTimeoutRef.current = null;
                    refreshFromGlobals();
                }, Math.max(0, guardUntil - now + 1));
            }
        };

        const handleJointGizmoInteractionLock = (event: Event) => {
            const detail = (event as CustomEvent<{ active?: boolean; guardUntil?: number }>).detail;
            if (typeof detail?.active !== 'boolean') {
                refreshFromGlobals();
                return;
            }

            const w = window as any;
            if (typeof detail.active === 'boolean') {
                w.__jointGizmoDragging = detail.active;
            }
            if (typeof detail.guardUntil === 'number') {
                w.__jointGizmoGuardUntil = detail.guardUntil;
            }

            refreshFromGlobals();
        };

        const handleBezierGizmoInteractionLock = (event: Event) => {
            const detail = (event as CustomEvent<{ active?: boolean; guardUntil?: number }>).detail;
            if (typeof detail?.active !== 'boolean') {
                refreshFromGlobals();
                return;
            }

            const w = window as any;
            if (typeof detail.active === 'boolean') {
                w.__bezierGizmoDragging = detail.active;
            }
            if (typeof detail.guardUntil === 'number') {
                w.__bezierGizmoGuardUntil = detail.guardUntil;
            }

            refreshFromGlobals();
        };

        refreshFromGlobals();
        window.addEventListener('knot-gizmo-interaction-lock', handleKnotGizmoInteractionLock as EventListener);
        window.addEventListener('joint-gizmo-interaction-lock', handleJointGizmoInteractionLock as EventListener);
        window.addEventListener('bezier-gizmo-interaction-lock', handleBezierGizmoInteractionLock as EventListener);
        return () => {
            window.removeEventListener('knot-gizmo-interaction-lock', handleKnotGizmoInteractionLock as EventListener);
            window.removeEventListener('joint-gizmo-interaction-lock', handleJointGizmoInteractionLock as EventListener);
            window.removeEventListener('bezier-gizmo-interaction-lock', handleBezierGizmoInteractionLock as EventListener);
            if (knotGizmoInteractionLockTimeoutRef.current != null) {
                window.clearTimeout(knotGizmoInteractionLockTimeoutRef.current);
                knotGizmoInteractionLockTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!supportSelectionAndHoverSuppressed) return;

        cancelPendingSceneHoverClearFrame(pendingSceneHoverClearFrameRef);
        applySceneHoverWriteDecision(
            { type: 'clear', reason: 'interaction-suppressed' },
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
        clearSupportMarqueeHover();
        clearImmediateModelHover(setImmediateModelHoverId);
    }, [supportSelectionAndHoverSuppressed]);

    useEffect(() => {
        return () => {
            cancelPendingSceneHoverClearFrame(pendingSceneHoverClearFrameRef);
        };
    }, []);

    const effectiveHoverModelId = supportSelectionAndHoverSuppressed ? null : (immediateModelHoverId ?? hoverModelId);
    const effectiveVisualActiveModelId = mode === 'prepare'
        ? (immediatePrepareActiveModelId ?? activeModelId)
        : activeModelId;
    const hoveredCategoryForVisual = supportSelectionAndHoverSuppressed ? 'none' : state.hoveredCategory;
    const hoveredIdForVisual = supportSelectionAndHoverSuppressed ? null : state.hoveredId;
    const supportIdBySegmentId = useMemo(() => {
        const map = new Map<string, string>();
        for (const [id, supportId] of Object.entries(supportRenderLookup.supportIdBySegmentId)) map.set(id, supportId);
        return map;
    }, [supportRenderLookup.supportIdBySegmentId]);

    const supportIdByJointId = useMemo(() => {
        const map = new Map<string, string>();
        for (const [id, supportId] of Object.entries(supportRenderLookup.supportIdByJointId)) map.set(id, supportId);
        return map;
    }, [supportRenderLookup.supportIdByJointId]);

    const supportIdByKnotId = useMemo(() => {
        const map = new Map<string, string>();
        for (const [id, supportId] of Object.entries(supportRenderLookup.supportIdByKnotId)) map.set(id, supportId);
        return map;
    }, [supportRenderLookup.supportIdByKnotId]);

    const supportIdByContactDiskId = useMemo(() => {
        const map = new Map<string, string>();
        for (const [id, supportId] of Object.entries(supportRenderLookup.supportIdByContactDiskId)) map.set(id, supportId);
        // Add anchor contact cones (not indexed by render lookup worker)
        for (const anchor of anchorList) {
            if (anchor.contactCone?.id) map.set(anchor.contactCone.id, anchor.id);
        }
        return map;
    }, [supportRenderLookup.supportIdByContactDiskId, anchorList]);

    const hoveredSupportIdFromPicking = useMemo(() => {
        return resolveHoveredSupportOwnerId(
            hoveredIdForVisual,
            hoveredCategoryForVisual,
            supportIdBySegmentId,
            supportIdByJointId,
            supportIdByKnotId,
            supportIdByContactDiskId,
        );
    }, [hoveredCategoryForVisual, hoveredIdForVisual, supportIdBySegmentId, supportIdByJointId, supportIdByKnotId, supportIdByContactDiskId]);

    const selectedPrimitiveSupportId = useMemo(() => {
        if (!selectedId) return null;
        if (selectedCategory === 'joint') return supportIdByJointId.get(selectedId) ?? null;
        if (selectedCategory === 'segment') return supportIdBySegmentId.get(selectedId) ?? null;
        if (selectedCategory === 'contactDisk') return supportIdByContactDiskId.get(selectedId) ?? null;
        if (selectedCategory === 'knot') return supportIdByKnotId.get(selectedId) ?? null;
        return null;
    }, [selectedCategory, selectedId, supportIdByContactDiskId, supportIdByJointId, supportIdByKnotId, supportIdBySegmentId]);

    const {
        primitiveHoverOnSelectedSupport,
        selectedPrimitiveHoverActive,
        suppressSupportHoverForSelectedKnotSupport,
        suppressSupportHoverForSelectedJointSupport,
    } = resolveSelectedPrimitiveHoverSuppression(
        hoveredSupportIdFromPicking,
        hoveredCategoryForVisual,
        hoveredIdForVisual,
        selectedId,
        selectedCategory,
        selectedSupportIdSet,
        selectedPrimitiveSupportId,
    );

    const {
        hoveredSupportIdForVisual,
        hoveredSupportIsSelected,
    } = resolveHoveredSupportVisualState(
        marqueeHoveredSupportId,
        hoveredSupportIdFromPicking,
        sceneHoveredSupportId,
        hoveredCategoryForVisual,
        selectedPrimitiveHoverActive,
        suppressSupportHoverForSelectedKnotSupport,
        selectedSupportIdSet,
        selectedPrimitiveSupportId,
    );
    const previousSelectionKeyRef = React.useRef<string>('');

    useEffect(() => {
        const selectionKey = `${selectedId ?? ''}|${effectiveSelectedSupportIds.join(',')}`;
        if (previousSelectionKeyRef.current === selectionKey) return;
        const previousSelectionKey = previousSelectionKeyRef.current;
        previousSelectionKeyRef.current = selectionKey;

        if (!shouldClearSceneHoverForSelectionChange(previousSelectionKey, selectionKey, sceneHoveredSupportId)) return;

        cancelPendingSceneHoverClearFrame(pendingSceneHoverClearFrameRef);
        applySceneHoverWriteDecision(
            { type: 'clear', reason: 'selection-changed' },
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [sceneHoveredSupportId, selectedId, effectiveSelectedSupportIds]);

    useEffect(() => {
        const clearForJointParent = selectedPrimitiveSupportId !== null
            && sceneHoveredSupportId !== null
            && sceneHoveredSupportId === selectedPrimitiveSupportId;

        if (!shouldClearSceneHoverForSelectedPrimitiveSuppression(
            selectedPrimitiveHoverActive,
            suppressSupportHoverForSelectedKnotSupport,
            suppressSupportHoverForSelectedJointSupport,
        ) && !clearForJointParent) return;

        cancelPendingSceneHoverClearFrame(pendingSceneHoverClearFrameRef);
        applySceneHoverWriteDecision(
            { type: 'clear', reason: 'selected-primitive-suppressed' },
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [selectedPrimitiveHoverActive, suppressSupportHoverForSelectedKnotSupport, suppressSupportHoverForSelectedJointSupport, selectedPrimitiveSupportId, sceneHoveredSupportId]);

    useEffect(() => {
        if (mode !== 'prepare') {
            setImmediatePrepareActiveModelId((prev) => (prev === null ? prev : null));
            return;
        }

        const handleModelClicked = (event: Event) => {
            const customEvent = event as CustomEvent<{ modelId?: string | null }>;
            const modelId = customEvent.detail?.modelId ?? null;
            setImmediatePrepareActiveModelId((prev) => (prev === modelId ? prev : modelId));
        };

        const handleModelDeselected = () => {
            setImmediatePrepareActiveModelId((prev) => (prev === null ? prev : null));
        };

        window.addEventListener('model-clicked', handleModelClicked as EventListener);
        window.addEventListener('model-deselected', handleModelDeselected);

        return () => {
            window.removeEventListener('model-clicked', handleModelClicked as EventListener);
            window.removeEventListener('model-deselected', handleModelDeselected);
        };
    }, [mode]);

    useEffect(() => {
        const next = (mode === 'prepare' && !passive) ? (activeModelId ?? null) : null;
        if (lastSyncedPrepareActiveModelIdRef.current === next) return;
        lastSyncedPrepareActiveModelIdRef.current = next;
        setImmediatePrepareActiveModelId((prev) => (prev === next ? prev : next));
    }, [activeModelId, mode, passive]);

    useEffect(() => {
        if (mode !== 'prepare') return;
        if (!immediatePrepareActiveModelId) return;
        if (selectedModelIdSet.has(immediatePrepareActiveModelId)) return;
        setImmediatePrepareActiveModelId((prev) => (prev === null ? prev : null));
    }, [immediatePrepareActiveModelId, mode, selectedModelIdSet]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const w = window as any;
        const knotGuardUntil = typeof w.__knotGizmoGuardUntil === 'number' ? w.__knotGizmoGuardUntil : 0;
        const jointGuardUntil = typeof w.__jointGizmoGuardUntil === 'number' ? w.__jointGizmoGuardUntil : 0;
        const bezierGuardUntil = typeof w.__bezierGizmoGuardUntil === 'number' ? w.__bezierGizmoGuardUntil : 0;
        const guardUntil = Math.max(knotGuardUntil, jointGuardUntil, bezierGuardUntil);
        w.__supportRendererDebug = {
            supportInteractionSuppressed,
            supportSelectionAndHoverSuppressed,
            disableSelectionAndHover,
            gizmoInteractionLockActive,
            jointCategoryHoverSuppressed,
            knotGizmoDragging: !!w.__knotGizmoDragging,
            jointGizmoDragging: !!w.__jointGizmoDragging,
            bezierGizmoDragging: !!w.__bezierGizmoDragging,
            knotGizmoGuardUntil: guardUntil,
            knotOnlyGuardUntil: knotGuardUntil,
            jointOnlyGuardUntil: jointGuardUntil,
            bezierOnlyGuardUntil: bezierGuardUntil,
            immediateModelHoverId,
            externalHoverModelId: hoverModelId,
            effectiveHoverModelId,
            sceneHoveredSupportId,
            marqueeHoveredSupportId,
            rawHoveredCategory: state.hoveredCategory,
            rawHoveredId: state.hoveredId,
            hoveredCategoryForVisual,
            hoveredIdForVisual,
        };
    }, [
        supportInteractionSuppressed,
        supportSelectionAndHoverSuppressed,
        disableSelectionAndHover,
        gizmoInteractionLockActive,
        jointCategoryHoverSuppressed,
        immediateModelHoverId,
        hoverModelId,
        effectiveHoverModelId,
        sceneHoveredSupportId,
        marqueeHoveredSupportId,
        state.hoveredCategory,
        state.hoveredId,
        hoveredCategoryForVisual,
        hoveredIdForVisual,
    ]);

    // Cull roots no entity claims any more.
    //
    // Kickstand roots and knots used to be copied into support state here. They
    // now live there already -- getKickstandSnapshot() derives its view FROM
    // state.roots/state.knots -- so the copy compared each object with itself and
    // never fired. Only the cull was ever live.
    useEffect(() => {
        if (!interactionHooksEnabled) return;
        const ownedRootIds = collectOwnedRootIds(state);
        for (const rootId of Object.keys(state.roots)) {
            if (ownedRootIds.has(rootId)) continue;
            removeRootById(rootId);
        }
    }, [state, interactionHooksEnabled]);

    // Enable joint dragging
    useJointInteraction(isInteractable);
    // Enable knot sliding
    useKnotInteraction(isInteractable);

    // Expose the group ref to parent components
    const groupRef = React.useRef<THREE.Group>(null);
    useImperativeHandle(ref, () => groupRef.current!);

    // Derive clipping planes synchronously so a freshly mounted renderer
    // (e.g. after support refresh key changes) is clipped correctly on its
    // very first render, without waiting for a post-commit effect.
    const clippingPlanes = useMemo(() => {
        const planes: THREE.Plane[] = [];

        if (clipLower != null) {
            planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipLower));
        }

        if (clipUpper != null) {
            planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), clipUpper));
        }

        return planes;
    }, [clipLower, clipUpper]);

    const resolveBaseColor = useMemo(() => {
        const baseHex = '#9a9a9a';
        const selectedHex = '#c8752a';
        const hoverTintHex = '#d18a4a';
        const hoveredColor = new THREE.Color(baseHex).lerp(new THREE.Color(hoverTintHex), 0.35).getStyle();
        const candidateColor = new THREE.Color(baseHex)
            .lerp(new THREE.Color(hoverTintHex), 0.35 * MARQUEE_CANDIDATE_TINT_FACTOR)
            .getStyle();

        return (modelId?: string) => {
            const isSelectedModelSupport = !!modelId && selectedModelIdSet.has(modelId);
            if (isSelectedModelSupport) return selectedHex;

            const isHoveredModelSupport = !!effectiveHoverModelId && !!modelId && modelId === effectiveHoverModelId;
            if (isHoveredModelSupport) return hoveredColor;

            // A model the marquee is about to take reads as hovered, so its
            // supports tint with it instead of waiting for the drag to end —
            // lighter than a hover, since the whole rig lights up at once.
            if (!!modelId && marqueeCandidateModelIdSet.has(modelId)) return candidateColor;

            return baseHex;
        };
    }, [effectiveHoverModelId, marqueeCandidateModelIdSet, selectedModelIdSet]);

    const debugOriginColors = !!settings.autoSupport?.debugSupportOriginColors;

    // Support id → origin lookup for the debug origin coloring.
    const originById = useMemo(() => {
        const map = new Map<string, SupportOrigin>();
        for (const t of trunkList) if (t.origin) map.set(t.id, t.origin);
        for (const b of branchList) if (b.origin) map.set(b.id, b.origin);
        for (const l of leafList) if (l.origin) map.set(l.id, l.origin);
        for (const a of anchorList) if (a.origin) map.set(a.id, a.origin);
        return map;
    }, [trunkList, branchList, leafList, anchorList]);

    const originColorFor = React.useCallback((supportId: string): string | null => {
        if (!debugOriginColors) return null;
        const origin = originById.get(supportId);
        return origin ? ORIGIN_COLORS[origin] : ORIGIN_NO_ORIGIN_COLOR;
    }, [debugOriginColors, originById]);

    const resolveSceneSupportColor = React.useCallback((
        modelId: string | undefined,
        supportId: string,
        typeId?: SupportTypeId,
    ) => {
        if (hasSupportMultiSelection && !useMultiSelectionDetail && selectedSupportIdSet.has(supportId)) {
            return BULK_MULTI_SELECTED_COLOR;
        }

        // Debug origin coloring: anchor / overhang / island / standalone, gray
        // for an entity stamped before origins existed, and a separate slate
        // for a type that records no origin at all -- reusing the model colour
        // put braces next to the overhang orange.
        if (debugOriginColors) {
            return typeId && !getSupportTypeDescriptor(typeId).hasOrigin
                ? ORIGIN_NOT_APPLICABLE_COLOR
                : originColorFor(supportId) ?? ORIGIN_NO_ORIGIN_COLOR;
        }

        return dimNonSelected ? '#666666' : resolveBaseColor(modelId);
    }, [hasSupportMultiSelection, useMultiSelectionDetail, selectedSupportIdSet, dimNonSelected, resolveBaseColor, debugOriginColors, originColorFor]);

    const resolveModelDropOffsetZ = React.useCallback((modelId?: string) => {
        if (!modelId) return 0;
        return modelDropOffsetsById?.[modelId] ?? 0;
    }, [modelDropOffsetsById]);

    const applyDropToVec3Like = React.useCallback((pos: { x: number; y: number; z: number }, modelId?: string) => {
        const zOffset = resolveModelDropOffsetZ(modelId);
        if (Math.abs(zOffset) < 1e-6) return pos;
        return {
            x: pos.x,
            y: pos.y,
            z: pos.z + zOffset,
        };
    }, [resolveModelDropOffsetZ]);

    // Curved batched shafts carry bezier control points; the drop offset must
    // move them together with the endpoints or the curve deforms.
    const applyDropToInstancedShaft = React.useCallback((shaft: InstancedShaft): InstancedShaft => {
        const dropped: InstancedShaft = {
            ...shaft,
            start: applyDropToVec3Like(shaft.start, shaft.modelId),
            end: applyDropToVec3Like(shaft.end, shaft.modelId),
        };
        if (shaft.controlPoint1) dropped.controlPoint1 = applyDropToVec3Like(shaft.controlPoint1, shaft.modelId);
        if (shaft.controlPoint2) dropped.controlPoint2 = applyDropToVec3Like(shaft.controlPoint2, shaft.modelId);
        return dropped;
    }, [applyDropToVec3Like]);

    const trunkIdByRootIdForSelection = useMemo(() => {
        const map = new Map<string, string>();
        for (const trunk of trunkList) {
            map.set(trunk.rootId, trunk.id);
        }
        return map;
    }, [trunkList]);

    const fallbackSupportIdByPrimitiveForSelection = useMemo(() => {
        const map = new Map<string, string>();

        for (const kickstand of kickstandList) {
            map.set(kickstand.id, kickstand.id);
            map.set(kickstand.hostKnotId, kickstand.id);
            for (const segment of kickstand.segments) {
                map.set(segment.id, kickstand.id);
                if (segment.topJoint?.id) map.set(segment.topJoint.id, kickstand.id);
                if (segment.bottomJoint?.id) map.set(segment.bottomJoint.id, kickstand.id);
            }
        }

        for (const brace of braceList) {
            map.set(`braceSegment:${brace.id}`, brace.id);
        }

        return map;
    }, [kickstandList, braceList]);

    const singleSelectedSupportId = useMemo(() => {
        if (!selectedId) return null;

        if (selectedCategory === 'knot') {
            return null;
        }

        if (selectedCategory === 'root') {
            return trunkIdByRootIdForSelection.get(selectedId) ?? null;
        }

        if (getSupportTypeBySelectionCategory(selectedCategory)) {
            return selectedId;
        }

        return selectedPrimitiveSupportId
            ?? fallbackSupportIdByPrimitiveForSelection.get(selectedId)
            ?? null;
    }, [
        selectedId,
        selectedCategory,
        selectedPrimitiveSupportId,
        fallbackSupportIdByPrimitiveForSelection,
        trunkIdByRootIdForSelection,
    ]);

    // Selection resolution, derived. The kickstand collection still lives in
    // its own store, so the lookup routes that one key there.
    const selectionCollections = useCallback<CollectionLookup>((key) => (
        key === 'kickstands'
            ? (kickstandState.kickstands as unknown as Record<string, unknown>)
            : ((state as unknown as Record<string, Record<string, unknown>>)[key])
    ), [state, kickstandState.kickstands]);

    const selectionKnotIndex = useMemo(
        () => buildKnotIndex(selectionCollections),
        [selectionCollections],
    );

    const selectionInputs = useMemo<SelectionInputs>(() => ({
        selectedSupportIdSet,
        singleSelectedSupportId,
        useMultiSelectionDetail,
        selectedCategory,
        selectedId,
    }), [selectedSupportIdSet, singleSelectedSupportId, useMultiSelectionDetail, selectedCategory, selectedId]);

    const selectedIdsByType = useMemo(() => {
        const byType = new Map<SupportTypeId, Set<string>>();
        for (const descriptor of SUPPORT_TYPES) {
            byType.set(
                descriptor.id,
                selectedIdsForType(descriptor.id, selectionInputs, selectionCollections, selectionKnotIndex),
            );
        }
        return byType;
    }, [selectionInputs, selectionCollections, selectionKnotIndex]);

    const EMPTY_SELECTION: ReadonlySet<string> = useMemo(() => new Set(), []);
    const selectedOf = useCallback(
        (typeId: SupportTypeId) => selectedIdsByType.get(typeId) ?? EMPTY_SELECTION,
        [selectedIdsByType, EMPTY_SELECTION],
    );

    const selectedTrunkIds = selectedOf('trunk');
    const selectedBranchIds = selectedOf('branch');
    const selectedLeafIds = selectedOf('leaf');
    const selectedTwigIds = selectedOf('twig');
    const selectedStickIds = selectedOf('stick');
    const selectedBraceIds = selectedOf('brace');
    const selectedAnchorIds = selectedOf('anchor');
    const selectedKickstandIds = selectedOf('kickstand');

    const knotIdsByParentShaftId = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const [id, knots] of Object.entries(supportRenderLookup.knotIdsByParentShaftId)) map.set(id, knots);
        return map;
    }, [supportRenderLookup.knotIdsByParentShaftId]);

    const kickstandKnotIdsByParentShaftId = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const [id, knots] of Object.entries(supportRenderLookup.kickstandKnotIdsByParentShaftId)) map.set(id, knots);
        return map;
    }, [supportRenderLookup.kickstandKnotIdsByParentShaftId]);

    const previewCandidateKnots = useMemo(() => {
        const result: Record<string, Knot> = {};
        const previewSupport = activeJointDragPreview?.support;
        if (!previewSupport) return result;

        for (const segment of previewSupport.segments) {
            const sharedIds = knotIdsByParentShaftId.get(segment.id) ?? [];
            for (const knotId of sharedIds) {
                const knot = state.knots[knotId];
                if (knot) result[knotId] = knot;
            }

            const kickstandIds = kickstandKnotIdsByParentShaftId.get(segment.id) ?? [];
            for (const knotId of kickstandIds) {
                const knot = kickstandState.knots[knotId];
                if (knot) result[knotId] = knot;
            }
        }

        return result;
    }, [activeJointDragPreview, knotIdsByParentShaftId, kickstandKnotIdsByParentShaftId, state.knots, kickstandState.knots]);

    const basePreviewKnotOverrides = useJointDragPreviewOverrides({
        roots: state.roots,
        knots: state.knots,
        kickstandKnots: kickstandState.knots,
        candidateKnots: previewCandidateKnots,
    });

    const branchesByParentKnotId = useMemo(() => buildBranchesByParentKnotId(branchList), [branchList]);
    const leafIdsByParentKnotId = useMemo(() => buildLeafIdsByParentKnotId(leafList), [leafList]);
    const braceIdsByKnotId = useMemo(() => buildBraceIdsByKnotId(braceList), [braceList]);
    const branchCandidateKnotIdsByBranchId = useMemo(
        () => buildBranchCandidateKnotIdsByBranchId(branchList, knotIdsByParentShaftId),
        [branchList, knotIdsByParentShaftId],
    );

    const freezeDependentPreviewDuringJointDrag = FREEZE_DEPENDENT_PREVIEW_DURING_JOINT_DRAG
        && !!activeJointDragPreview?.support;

    const previewSeedKnotOverrides = useMemo(() => {
        const knotPreview = activeKnotDragPreview?.knot;
        const twigKnots = activeTwigDragPreview?.knotsById;
        const hasTwigKnots = !!twigKnots && Object.keys(twigKnots).length > 0;

        if (!knotPreview && !hasTwigKnots) return basePreviewKnotOverrides;

        const merged = { ...basePreviewKnotOverrides };
        if (hasTwigKnots) {
            for (const id in twigKnots) merged[id] = twigKnots[id];
        }
        if (knotPreview) merged[knotPreview.id] = knotPreview;
        if (activeKnotDragPreview?.coincidentKnots) {
            for (const coincKnot of activeKnotDragPreview.coincidentKnots) {
                merged[coincKnot.id] = coincKnot;
            }
        }
        return merged;
    }, [basePreviewKnotOverrides, activeKnotDragPreview, activeTwigDragPreview]);

    const shouldCascadeDependentPreview = !freezeDependentPreviewDuringJointDrag
        && (!!activeJointDragPreview?.support || !!activeKnotDragPreview?.knot || !!activeTwigDragPreview);

    const previewKnotOverrides = useMemo(() => {
        return computeCascadedPreviewKnotOverrides({
            enableCascade: shouldCascadeDependentPreview,
            basePreviewKnotOverrides: previewSeedKnotOverrides,
            branchesByParentKnotId,
            branchCandidateKnotIdsByBranchId,
            branchesById: state.branches,
            committedKnotsById: state.knots,
        });
    }, [shouldCascadeDependentPreview, previewSeedKnotOverrides, branchesByParentKnotId, branchCandidateKnotIdsByBranchId, state.branches, state.knots]);

    const previewKnotOverrideIds = useMemo(() => Object.keys(previewKnotOverrides), [previewKnotOverrides]);
    const hasPreviewKnotOverrides = previewKnotOverrideIds.length > 0;

    const previewLeavesById = useMemo(() => {
        if (!hasPreviewKnotOverrides) return new Map<string, Leaf>();
        return collectPreviewLeavesById({
            previewKnotOverrideIds,
            previewKnotOverrides,
            leafIdsByParentKnotId,
            leavesById: state.leaves,
            recomputeLeafPreviewContactCone: (leaf, previewKnot) =>
                recomputeLeafPreviewContactCone(leaf, previewKnot, twigBySegmentId),
        });
    }, [hasPreviewKnotOverrides, previewKnotOverrideIds, previewKnotOverrides, leafIdsByParentKnotId, state.leaves, twigBySegmentId]);

    const activePreviewTrunk = activeJointDragPreview?.kind === 'trunk'
        ? (activeJointDragPreview.support as (typeof state.trunks)[string])
        : null;
    const activePreviewBranch = activeJointDragPreview?.kind === 'branch'
        ? (activeJointDragPreview.support as (typeof state.branches)[string])
        : null;
    const activePreviewKickstand = activeJointDragPreview?.kind === 'kickstand'
        ? (activeJointDragPreview.support as (typeof kickstandState.kickstands)[string])
        : null;

    const renderLeavesById = useMemo(() => {
        if (previewLeavesById.size === 0) return state.leaves;
        const leaves = Object.create(state.leaves) as typeof state.leaves;
        for (const [leafId, previewLeaf] of previewLeavesById) {
            leaves[leafId] = previewLeaf;
        }
        return leaves;
    }, [state.leaves, previewLeavesById]);

    const renderBracesById = state.braces;
    // Historically braces were ghosted during joint-drag preview because their
    // live geometry couldn't be trusted. Now that brace endpoint knots ride
    // the live preview overrides (see enableBraceLivePreview), the brace can
    // render at its true live position instead of going transparent.
    const ghostedBraceIdSet = useMemo(() => new Set<string>(), []);
    const renderKnotsById = useMemo(() => {
        if (!hasPreviewKnotOverrides) return state.knots;
        const knots = Object.create(state.knots) as typeof state.knots;
        for (const knotId of previewKnotOverrideIds) {
            knots[knotId] = previewKnotOverrides[knotId];
        }
        return knots;
    }, [state.knots, previewKnotOverrides, previewKnotOverrideIds, hasPreviewKnotOverrides]);
    const renderKickstandKnotsById = useMemo(() => {
        if (!hasPreviewKnotOverrides) return kickstandState.knots;
        const knots = Object.create(kickstandState.knots) as typeof kickstandState.knots;
        for (const knotId of previewKnotOverrideIds) {
            knots[knotId] = previewKnotOverrides[knotId];
        }
        return knots;
    }, [kickstandState.knots, previewKnotOverrides, previewKnotOverrideIds, hasPreviewKnotOverrides]);

    // Live brace render: enable whenever any current preview override touches a
    // brace endpoint knot, regardless of which interaction produced it (direct
    // brace knot drag, host joint/trunk drag, twig curve reshape, twig disk
    // drag, etc.). Without this the brace freezes mid-drag and only snaps to
    // its new geometry on release.
    const enableBraceLivePreview = useMemo(() => {
        if (previewKnotOverrideIds.length === 0) return false;
        for (const knotId of previewKnotOverrideIds) {
            if ((braceIdsByKnotId.get(knotId)?.length ?? 0) > 0) return true;
        }
        return false;
    }, [previewKnotOverrideIds, braceIdsByKnotId]);
    const braceRenderKnotsById = useMemo(() => {
        return enableBraceLivePreview ? renderKnotsById : state.knots;
    }, [enableBraceLivePreview, renderKnotsById, state.knots]);

    const knotDragPreviewBranchSegmentsById = activeKnotDragPreview?.branchSegmentsById ?? EMPTY_KNOT_DRAG_BRANCH_SEGMENTS_BY_ID;
    const knotDragPreviewBranchIds = useMemo(() => Object.keys(knotDragPreviewBranchSegmentsById), [knotDragPreviewBranchSegmentsById]);
    const branchListWithKnotDragPreview = useMemo(() => {
        if (knotDragPreviewBranchIds.length === 0) return branchList;
        return branchList.map((branch) => {
            const previewSegments = knotDragPreviewBranchSegmentsById[branch.id];
            if (!previewSegments || previewSegments === branch.segments) return branch;
            return { ...branch, segments: previewSegments };
        });
    }, [branchList, knotDragPreviewBranchSegmentsById, knotDragPreviewBranchIds]);

    const renderTrunkList = useMemo(() => {
        const filterInteriorTrunks = (list: typeof trunkList) => interiorView
            ? list.filter((trunk) => matchesInteriorContact(trunk.contactCone, trunk.modelId))
            : list;

        if (!activePreviewTrunk) return filterInteriorTrunks(trunkList);

        let replaced = false;
        const result = trunkList.map((trunk) => {
            if (trunk.id !== activePreviewTrunk.id) return trunk;
            replaced = true;
            return activePreviewTrunk;
        });

        if (!replaced) result.push(activePreviewTrunk);
        return filterInteriorTrunks(result);
    }, [trunkList, activePreviewTrunk, interiorView, matchesInteriorContact]);

    const renderBranchList = useMemo(() => {
        const filterInteriorBranches = (list: typeof branchListWithKnotDragPreview) => interiorView
            ? list.filter((branch) => matchesInteriorContact(branch.contactCone, branch.modelId))
            : list;

        if (!activePreviewBranch) return filterInteriorBranches(branchListWithKnotDragPreview);

        let replaced = false;
        const result = branchListWithKnotDragPreview.map((branch) => {
            if (branch.id !== activePreviewBranch.id) return branch;
            replaced = true;
            return activePreviewBranch;
        });

        if (!replaced) result.push(activePreviewBranch);
        return filterInteriorBranches(result);
    }, [branchListWithKnotDragPreview, activePreviewBranch, interiorView, matchesInteriorContact]);

    const renderLeafList = useMemo(() => {
        const result = previewLeavesById.size === 0
            ? leafList
            : leafList.map((leaf) => previewLeavesById.get(leaf.id) ?? leaf);
        return interiorView
            ? result.filter((leaf) => matchesInteriorContact(leaf.contactCone, leaf.modelId))
            : result;
    }, [leafList, previewLeavesById, interiorView, matchesInteriorContact]);
    const renderTwigList = useMemo(() => {
        return interiorView
            ? twigList.filter((twig) => anyContactMatches('twig', twig,
                (contact: unknown) => matchesInteriorContact(contact as ContactDisk, twig.modelId)))
            : twigList;
    }, [twigList, interiorView, matchesInteriorContact]);
    const renderStickList = useMemo(() => {
        return interiorView
            ? stickList.filter((stick) => anyContactMatches('stick', stick,
                (contact: unknown) => matchesInteriorContact(contact as ContactDisk, stick.modelId)))
            : stickList;
    }, [stickList, interiorView, matchesInteriorContact]);
    const renderBraceList = useMemo(() => {
        return interiorView
            ? braceList.filter((brace) => matchesInteriorBrace(brace))
            : braceList;
    }, [braceList, interiorView, matchesInteriorBrace]);
    const renderAnchorList = useMemo(() => {
        return interiorView
            ? anchorList.filter((anchor) => matchesInteriorContact(anchor.contactCone, anchor.modelId))
            : anchorList;
    }, [anchorList, interiorView, matchesInteriorContact]);
    const renderKickstandList = useMemo(() => {
        if (interiorView) return [];
        if (!activePreviewKickstand) return kickstandList;

        let replaced = false;
        const result = kickstandList.map((kickstand) => {
            if (kickstand.id !== activePreviewKickstand.id) return kickstand;
            replaced = true;
            return activePreviewKickstand;
        });

        if (!replaced) result.push(activePreviewKickstand);
        return result;
    }, [kickstandList, activePreviewKickstand, interiorView]);

    const renderKnotList = useMemo(() => {
        if (!hasPreviewKnotOverrides) return knotList;
        return knotList.map((knot) => previewKnotOverrides[knot.id] ?? knot);
    }, [hasPreviewKnotOverrides, knotList, previewKnotOverrides]);
    const renderKickstandKnotList = useMemo(() => {
        if (!hasPreviewKnotOverrides) return kickstandKnotList;
        return kickstandKnotList.map((knot) => previewKnotOverrides[knot.id] ?? knot);
    }, [hasPreviewKnotOverrides, kickstandKnotList, previewKnotOverrides]);

    const resolvePreviewKnot = React.useCallback((knotId: string) => {
        return previewKnotOverrides[knotId] ?? state.knots[knotId] ?? kickstandState.knots[knotId] ?? null;
    }, [previewKnotOverrides, state.knots, kickstandState.knots]);

    const trunkShaftsBySupport = useMemo(() => {
        const result = new Map<string, SupportShaftSet>();
        const hasSolidBottom = raftSettings.bottomMode === 'solid';
        const raftThickness = raftSettings.thickness ?? 0;

        for (const trunk of renderTrunkList) {
            if (!isModelVisible(trunk.modelId, trunk.id)) continue;

            const root = state.roots[trunk.rootId];
            if (!root) continue;

            const shafts: InstancedShaft[] = [];

            const basePos = new THREE.Vector3(root.transform.pos.x, root.transform.pos.y, root.transform.pos.z);
            const effectiveDiskHeight = Math.max(0.001, root.diskHeight);
            const verticalOffset = 0;
            let currentStart = basePos.clone().add(new THREE.Vector3(0, 0, verticalOffset + effectiveDiskHeight + Math.max(0, root.coneHeight)));

            for (const segment of trunk.segments) {
                if (segment.bottomJoint) {
                    currentStart = new THREE.Vector3(segment.bottomJoint.pos.x, segment.bottomJoint.pos.y, segment.bottomJoint.pos.z);
                }

                let endPoint: THREE.Vector3;
                if (segment.topJoint) {
                    endPoint = new THREE.Vector3(segment.topJoint.pos.x, segment.topJoint.pos.y, segment.topJoint.pos.z);
                } else if (trunk.contactCone) {
                    const socketPos = getFinalSocketPosition(trunk.contactCone);
                    endPoint = new THREE.Vector3(socketPos.x, socketPos.y, socketPos.z);
                } else {
                    endPoint = currentStart.clone().add(new THREE.Vector3(0, 0, 10));
                }

                if (segment.type === 'bezier') {
                    shafts.push(bezierSegmentToBatchedShaft(segment, currentStart, endPoint, trunk.id, trunk.modelId));
                    currentStart = endPoint;
                    continue;
                }

                shafts.push({
                    id: segment.id,
                    start: { x: currentStart.x, y: currentStart.y, z: currentStart.z },
                    end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                    diameter: segment.diameter,
                    supportId: trunk.id,
                    modelId: trunk.modelId,
                });

                currentStart = endPoint;
            }

            if (shafts.length > 0) {
                result.set(trunk.id, {
                    supportId: trunk.id,
                    modelId: trunk.modelId,
                    shafts,
                });
            }
        }

        return result;
    }, [raftSettings.bottomMode, raftSettings.thickness, renderTrunkList, state.roots, isModelVisible]);

    const branchShaftsBySupport = useMemo(() => {
        const result = new Map<string, SupportShaftSet>();

        for (const branch of renderBranchList) {
            if (!isModelVisible(branch.modelId, branch.id)) continue;
            const parentKnot = renderKnotsById[branch.parentKnotId];
            if (!parentKnot) continue;

            const shafts: InstancedShaft[] = [];
            let currentStart = new THREE.Vector3(parentKnot.pos.x, parentKnot.pos.y, parentKnot.pos.z);

            for (const segment of branch.segments) {
                let endPoint: THREE.Vector3;
                if (segment.topJoint) {
                    endPoint = new THREE.Vector3(segment.topJoint.pos.x, segment.topJoint.pos.y, segment.topJoint.pos.z);
                } else if (branch.contactCone) {
                    const socketPos = getFinalSocketPosition(branch.contactCone);
                    endPoint = new THREE.Vector3(socketPos.x, socketPos.y, socketPos.z);
                } else {
                    endPoint = currentStart.clone().add(new THREE.Vector3(0, 0, 5));
                }

                if (segment.type === 'bezier') {
                    shafts.push(bezierSegmentToBatchedShaft(segment, currentStart, endPoint, branch.id, branch.modelId));
                    currentStart = endPoint;
                    continue;
                }

                shafts.push({
                    id: segment.id,
                    start: { x: currentStart.x, y: currentStart.y, z: currentStart.z },
                    end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                    diameter: segment.diameter,
                    supportId: branch.id,
                    modelId: branch.modelId,
                });

                currentStart = endPoint;
            }

            if (shafts.length > 0) {
                result.set(branch.id, {
                    supportId: branch.id,
                    modelId: branch.modelId,
                    shafts,
                });
            }
        }

        return result;
    }, [renderBranchList, renderKnotsById, isModelVisible]);

    const braceShaftsBySupport = useMemo(() => {
        const result = new Map<string, SupportShaftSet>();

        for (const brace of renderBraceList) {
            if (!isModelVisible(brace.modelId, brace.id)) continue;

            // braceRenderKnotsById uses live preview overrides whenever any
            // brace endpoint knot is being reflowed by an upstream drag â€” so
            // braces follow live as their host moves (twig curve reshape, twig
            // disk drag, trunk/branch joint drag, direct brace knot drag).
            const startKnot = braceRenderKnotsById[brace.startKnotId];
            const endKnot = braceRenderKnotsById[brace.endKnotId];
            if (!startKnot || !endKnot) continue;

            const profileDiameter = Math.max(0.001, brace.profile?.diameter ?? 1.0);
            const startHostDiameter = Math.min(
                profileDiameter,
                Math.max(
                    0.001,
                    (startKnot.diameter ?? (profileDiameter + JOINT_DIAMETER_OFFSET_MM)) - JOINT_DIAMETER_OFFSET_MM,
                ),
            );
            const endHostDiameter = Math.min(
                profileDiameter,
                Math.max(
                    0.001,
                    (endKnot.diameter ?? (profileDiameter + JOINT_DIAMETER_OFFSET_MM)) - JOINT_DIAMETER_OFFSET_MM,
                ),
            );
            const isTaperedBrace = Math.abs(startHostDiameter - endHostDiameter) > 1e-4;

            // Tapered braces are rendered in the detailed path so we can preserve
            // dynamic start/end diameters. Uniform braces remain batched for speed.
            if (isTaperedBrace) {
                continue;
            }

            const diameter = (startHostDiameter + endHostDiameter) * 0.5;
            const segmentId = `braceSegment:${brace.id}`;
            const shafts = brace.curve?.type === 'bezier'
                ? [braceBezierToBatchedShaft(
                    segmentId,
                    startKnot.pos,
                    endKnot.pos,
                    brace.curve.controlPoint1,
                    brace.curve.controlPoint2,
                    diameter,
                    brace.curve.resolution,
                    brace.id,
                    brace.modelId,
                )]
                : [{
                    id: segmentId,
                    start: startKnot.pos,
                    end: endKnot.pos,
                    diameter,
                    supportId: brace.id,
                    modelId: brace.modelId,
                }];

            result.set(brace.id, {
                supportId: brace.id,
                modelId: brace.modelId,
                shafts,
            });
        }

        return result;
    }, [renderBraceList, braceRenderKnotsById, isModelVisible]);

    const twigShaftsBySupport = useMemo(() => {
        if (!enableTwigSceneBatching) {
            return new Map<string, SupportShaftSet>();
        }

        const result = new Map<string, SupportShaftSet>();

        const getDiskTipCenter = (disk: ContactDisk) => {
            const thickness = disk.diskLengthOverride ?? calculateDiskThickness(disk.surfaceNormal, disk.coneAxis, disk.profile);
            return {
                x: disk.pos.x + disk.surfaceNormal.x * thickness,
                y: disk.pos.y + disk.surfaceNormal.y * thickness,
                z: disk.pos.z + disk.surfaceNormal.z * thickness,
            };
        };

        for (const twig of renderTwigList) {
            if (!isModelVisible(twig.modelId, twig.id)) continue;

            const shafts: InstancedShaft[] = [];
            let fullyBatchable = true;

            for (const segment of twig.segments) {
                let startPoint: THREE.Vector3;
                let endPoint: THREE.Vector3;
                // Twig shaft tapers between the two contact disks (matches
                // TwigRenderer). Batchability is decided by whether the two
                // ends are equal.
                const diameterStart = twig.contactDiskA.contactDiameterMm;
                const diameterEnd = twig.contactDiskB.contactDiameterMm;

                if (segment.bottomJoint) {
                    startPoint = new THREE.Vector3(segment.bottomJoint.pos.x, segment.bottomJoint.pos.y, segment.bottomJoint.pos.z);
                } else {
                    const diskATipCenter = getDiskTipCenter(twig.contactDiskA);
                    startPoint = new THREE.Vector3(diskATipCenter.x, diskATipCenter.y, diskATipCenter.z);
                }

                if (segment.topJoint) {
                    endPoint = new THREE.Vector3(segment.topJoint.pos.x, segment.topJoint.pos.y, segment.topJoint.pos.z);
                } else {
                    const diskBTipCenter = getDiskTipCenter(twig.contactDiskB);
                    endPoint = new THREE.Vector3(diskBTipCenter.x, diskBTipCenter.y, diskBTipCenter.z);
                }

                const isUniformDiameter = Math.abs(diameterStart - diameterEnd) < 1e-6;
                if (!isUniformDiameter) {
                    fullyBatchable = false;
                }

                if (segment.type === 'bezier') {
                    shafts.push(bezierSegmentToBatchedShaft(segment, startPoint, endPoint, twig.id, twig.modelId));
                } else if (isUniformDiameter) {
                    shafts.push({
                        id: segment.id,
                        start: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
                        end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                        diameter: segment.diameter,
                        supportId: twig.id,
                        modelId: twig.modelId,
                    });
                }
            }

            if (fullyBatchable && shafts.length > 0) {
                result.set(twig.id, {
                    supportId: twig.id,
                    modelId: twig.modelId,
                    shafts,
                });
            }
        }

        return result;
    }, [renderTwigList, isModelVisible, enableTwigSceneBatching]);

    const stickShaftsBySupport = useMemo(() => {
        const result = new Map<string, SupportShaftSet>();

        for (const stick of renderStickList) {
            if (!isModelVisible(stick.modelId, stick.id)) continue;

            const shafts: InstancedShaft[] = [];

            for (const segment of stick.segments) {
                const startPoint = segment.bottomJoint
                    ? new THREE.Vector3(segment.bottomJoint.pos.x, segment.bottomJoint.pos.y, segment.bottomJoint.pos.z)
                    : (() => {
                        const socket = getFinalSocketPosition(stick.contactConeA);
                        return new THREE.Vector3(socket.x, socket.y, socket.z);
                    })();

                const endPoint = segment.topJoint
                    ? new THREE.Vector3(segment.topJoint.pos.x, segment.topJoint.pos.y, segment.topJoint.pos.z)
                    : (() => {
                        const socket = getFinalSocketPosition(stick.contactConeB);
                        return new THREE.Vector3(socket.x, socket.y, socket.z);
                    })();

                if (segment.type === 'bezier') {
                    shafts.push(bezierSegmentToBatchedShaft(segment, startPoint, endPoint, stick.id, stick.modelId));
                } else {
                    shafts.push({
                        id: segment.id,
                        start: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
                        end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                        diameter: segment.diameter,
                        supportId: stick.id,
                        modelId: stick.modelId,
                    });
                }
            }

            if (shafts.length > 0) {
                result.set(stick.id, {
                    supportId: stick.id,
                    modelId: stick.modelId,
                    shafts,
                });
            }
        }

        return result;
    }, [renderStickList, isModelVisible]);

    const kickstandShaftsBySupport = useMemo(() => {
        const result = new Map<string, SupportShaftSet>();
        const hasSolidBottom = raftSettings.bottomMode === 'solid';
        const raftThickness = raftSettings.thickness ?? 0;

        for (const kickstand of renderKickstandList) {
            if (!isModelVisible(kickstand.modelId, kickstand.id)) continue;

            const root = kickstandState.roots[kickstand.rootId];
            const hostKnot = renderKickstandKnotsById[kickstand.hostKnotId];
            if (!root || !hostKnot) continue;

            const basePos = new THREE.Vector3(root.transform.pos.x, root.transform.pos.y, root.transform.pos.z);
            const effectiveDiskHeight = Math.max(0.001, root.diskHeight);
            const verticalOffset = 0;
            let currentStart = basePos.clone().add(new THREE.Vector3(0, 0, verticalOffset + effectiveDiskHeight + Math.max(0, root.coneHeight)));

            const shafts: InstancedShaft[] = [];
            let fullyBatchable = true;

            kickstand.segments.forEach((segment, index) => {
                const isLast = index === kickstand.segments.length - 1;

                const endPoint = segment.topJoint
                    ? new THREE.Vector3(segment.topJoint.pos.x, segment.topJoint.pos.y, segment.topJoint.pos.z)
                    : new THREE.Vector3(hostKnot.pos.x, hostKnot.pos.y, hostKnot.pos.z);

                const diameterStart = isLast ? kickstand.profile.terminalStartDiameterMm : undefined;
                const diameterEnd = isLast ? kickstand.profile.terminalEndDiameterMm : undefined;
                const isUniformDiameter = (diameterStart == null && diameterEnd == null)
                    || (diameterStart != null && diameterEnd != null && Math.abs(diameterStart - diameterEnd) < 1e-6);

                if (!isUniformDiameter) {
                    fullyBatchable = false;
                }

                if (segment.type === 'bezier') {
                    shafts.push(bezierSegmentToBatchedShaft(segment, currentStart, endPoint, kickstand.id, kickstand.modelId));
                } else if (isUniformDiameter) {
                    shafts.push({
                        id: segment.id,
                        start: { x: currentStart.x, y: currentStart.y, z: currentStart.z },
                        end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                        diameter: segment.diameter,
                        supportId: kickstand.id,
                        modelId: kickstand.modelId,
                    });
                }

                currentStart = endPoint;
            });

            if (fullyBatchable && shafts.length > 0) {
                result.set(kickstand.id, {
                    supportId: kickstand.id,
                    modelId: kickstand.modelId,
                    shafts,
                });
            }
        }

        return result;
    }, [renderKickstandList, kickstandState.roots, renderKickstandKnotsById, isModelVisible, raftSettings.bottomMode, raftSettings.thickness]);

    const segmentModelIdById = useMemo(() => {
        const map = new Map<string, string | undefined>();

        for (const trunk of renderTrunkList) {
            for (const segment of trunk.segments) {
                map.set(segment.id, trunk.modelId);
            }
        }

        for (const branch of renderBranchList) {
            for (const segment of branch.segments) {
                map.set(segment.id, branch.modelId);
            }
        }

        for (const twig of renderTwigList) {
            for (const segment of twig.segments) {
                map.set(segment.id, twig.modelId);
            }
        }

        for (const stick of renderStickList) {
            for (const segment of stick.segments) {
                map.set(segment.id, stick.modelId);
            }
        }

        for (const kickstand of renderKickstandList) {
            for (const segment of kickstand.segments) {
                map.set(segment.id, kickstand.modelId);
            }
        }

        return map;
    }, [renderTrunkList, renderBranchList, renderTwigList, renderStickList, renderKickstandList]);

    const modelIdByKnotId = useMemo(() => {
        const map = new Map<string, string | undefined>();

        for (const knot of renderKnotList) {
            const parentShaftId = knot.parentShaftId;
            let modelId: string | undefined;

            if (parentShaftId.startsWith('braceSegment:')) {
                const braceId = parentShaftId.slice('braceSegment:'.length);
                modelId = renderBracesById[braceId]?.modelId;
            } else if (parentShaftId.startsWith('leafCone:')) {
                const leafId = parentShaftId.slice('leafCone:'.length);
                modelId = renderLeavesById[leafId]?.modelId;
            } else {
                modelId = segmentModelIdById.get(parentShaftId);
            }

            map.set(knot.id, modelId);
        }

        for (const knot of renderKickstandKnotList) {
            const parentShaftId = knot.parentShaftId;
            let modelId: string | undefined;

            if (parentShaftId.startsWith('braceSegment:')) {
                const braceId = parentShaftId.slice('braceSegment:'.length);
                modelId = renderBracesById[braceId]?.modelId;
            } else if (parentShaftId.startsWith('leafCone:')) {
                const leafId = parentShaftId.slice('leafCone:'.length);
                modelId = renderLeavesById[leafId]?.modelId;
            } else {
                modelId = segmentModelIdById.get(parentShaftId);
            }

            map.set(knot.id, modelId);
        }

        return map;
    }, [renderKnotList, renderBracesById, renderLeavesById, renderKickstandKnotList, segmentModelIdById]);

    /**
     * Contact cones for the batched pass, keyed by support.
     *
     * Which fields to read comes from the declared contact endpoints. Anchors
     * are absent deliberately -- AnchorRenderer draws their cone itself, and
     * only while selected; see the note in the plan.
     */
    const contactConesBySupport = useMemo(() => {
        const result = new Map<string, { supportId: string; modelId?: string; cones: InstancedContactCone[] }>();

        const collect = <T extends { id: string; modelId?: string }>(
            typeId: SupportTypeId,
            list: readonly T[],
            resolveModelId: (entity: T) => string | undefined,
        ) => {
            for (const entity of list) {
                const modelId = resolveModelId(entity);
                if (!isModelVisible(modelId)) continue;

                const record = entity as unknown as Record<string, InstancedContactCone | undefined>;
                const cones: InstancedContactCone[] = [];
                for (const { kind, field } of contactEndpointsFor(typeId)) {
                    if (kind !== 'cone') continue;
                    const cone = record[field];
                    if (!cone) continue;
                    cones.push({
                        id: cone.id,
                        supportId: entity.id,
                        modelId,
                        pos: cone.pos,
                        normal: cone.normal,
                        surfaceNormal: cone.surfaceNormal,
                        diskLengthOverride: cone.diskLengthOverride,
                        profile: cone.profile,
                    });
                }

                if (cones.length > 0) result.set(entity.id, { supportId: entity.id, modelId, cones });
            }
        };

        collect('trunk', renderTrunkList, (trunk) => trunk.modelId);
        collect('branch', renderBranchList, (branch) => branch.modelId ?? modelIdByKnotId.get(branch.parentKnotId));
        collect('stick', renderStickList, (stick) => stick.modelId);
        collect('leaf', renderLeafList, (leaf) => leaf.modelId ?? modelIdByKnotId.get(leaf.parentKnotId));

        return result;
    }, [renderTrunkList, renderBranchList, renderStickList, renderLeafList, modelIdByKnotId, isModelVisible]);

    /**
     * A type's shaft joints, keyed by support. `segmentsCarryBothJoints`
     * decides whether the bottom joint counts: on a hosted shaft it is a
     * render artefact, and the real lower end is the root or host knot.
     */
    const collectShaftJoints = useCallback(<T extends { id: string; modelId?: string; segments: Segment[] }>(
        typeId: SupportTypeId,
        list: readonly T[],
    ) => {
        const includeBottom = getSupportTypeDescriptor(typeId).segmentsCarryBothJoints;
        const result = new Map<string, SupportJointSet>();

        for (const entity of list) {
            if (!isModelVisible(entity.modelId, entity.id)) continue;

            const seen = new Set<string>();
            const joints: InstancedJoint[] = [];

            const take = (joint?: { id: string; pos: Vec3; diameter: number }) => {
                if (!joint || seen.has(joint.id)) return;
                seen.add(joint.id);
                joints.push({
                    id: joint.id,
                    pos: joint.pos,
                    diameter: joint.diameter,
                    supportId: entity.id,
                    modelId: entity.modelId,
                });
            };

            for (const segment of entity.segments) {
                if (includeBottom) take(segment.bottomJoint);
                take(segment.topJoint);
            }

            if (joints.length > 0) {
                result.set(entity.id, { supportId: entity.id, modelId: entity.modelId, joints });
            }
        }

        return result;
    }, [isModelVisible]);

    const trunkJointsBySupport = useMemo(
        () => collectShaftJoints('trunk', renderTrunkList),
        [renderTrunkList, collectShaftJoints],
    );

    const branchJointsBySupport = useMemo(
        () => collectShaftJoints('branch', renderBranchList),
        [renderBranchList, collectShaftJoints],
    );

    const twigJointsBySupport = useMemo(
        () => collectShaftJoints('twig', renderTwigList),
        [renderTwigList, collectShaftJoints],
    );

    const stickJointsBySupport = useMemo(
        () => collectShaftJoints('stick', renderStickList),
        [renderStickList, collectShaftJoints],
    );

    const kickstandJointsBySupport = useMemo(
        () => collectShaftJoints('kickstand', renderKickstandList),
        [renderKickstandList, collectShaftJoints],
    );

    /** Unselected leaf base knots as batch-ready joints: one instanced draw
     *  instead of a mounted KnotRenderer per leaf. Read through
     *  renderKnotsById so knot-drag previews keep moving these balls.
     *  Diameter is pre-compensated for pushJoints' smaller blend — see
     *  KNOT_BATCH_DIAMETER_PRECOMPENSATION_MM. */
    const leafJointsBySupport = useMemo(() => {
        const result = new Map<string, SupportJointSet>();

        for (const leaf of renderLeafList) {
            if (!isModelVisible(leaf.modelId, leaf.id)) continue;
            const knot = renderKnotsById[leaf.parentKnotId];
            if (!knot?.pos) continue;

            const modelId = leaf.modelId ?? modelIdByKnotId.get(leaf.parentKnotId);
            result.set(leaf.id, {
                supportId: leaf.id,
                modelId,
                joints: [{
                    id: knot.id,
                    pos: knot.pos,
                    diameter: Math.max(0.001, (knot.diameter ?? 1.2) + KNOT_BATCH_DIAMETER_PRECOMPENSATION_MM),
                    supportId: leaf.id,
                    modelId,
                }],
            });
        }

        return result;
    }, [renderLeafList, isModelVisible, renderKnotsById, modelIdByKnotId]);

    const sceneBatchedJointGroups = useMemo(() => {
        const grouped = new Map<string, { modelId: string | null; color: string; joints: InstancedJoint[] }>();

        const pushJoints = (modelId: string | null, color: string, joints: InstancedJoint[]) => {
            const key = `${modelId ?? '__unassigned__'}:${color}`;
            const existing = grouped.get(key);
            const adjusted = joints.map((joint) => ({
                ...joint,
                pos: applyDropToVec3Like(joint.pos, joint.modelId),
                diameter: Math.max(0.001, joint.diameter - SCENE_JOINT_DIAMETER_BLEND_MM),
            }));
            if (existing) {
                existing.joints.push(...adjusted);
            } else {
                grouped.set(key, { modelId, color, joints: adjusted });
            }
        };

        for (const trunk of renderTrunkList) {
            if (!isModelVisible(trunk.modelId, trunk.id)) continue;
            if (selectedTrunkIds.has(trunk.id)) continue;
            const jointSet = trunkJointsBySupport.get(trunk.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(trunk.modelId, trunk.id, 'trunk');
            pushJoints(trunk.modelId ?? null, color, jointSet.joints);
        }

        for (const branch of renderBranchList) {
            if (!isModelVisible(branch.modelId, branch.id)) continue;
            if (selectedBranchIds.has(branch.id)) continue;
            const jointSet = branchJointsBySupport.get(branch.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(branch.modelId, branch.id, 'branch');
            pushJoints(branch.modelId ?? null, color, jointSet.joints);
        }

        for (const twig of renderTwigList) {
            if (!isModelVisible(twig.modelId, twig.id)) continue;
            if (selectedTwigIds.has(twig.id)) continue;
            const jointSet = twigJointsBySupport.get(twig.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(twig.modelId, twig.id, 'twig');
            pushJoints(twig.modelId ?? null, color, jointSet.joints);
        }

        for (const stick of renderStickList) {
            if (!isModelVisible(stick.modelId, stick.id)) continue;
            if (selectedStickIds.has(stick.id)) continue;
            const jointSet = stickJointsBySupport.get(stick.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(stick.modelId, stick.id, 'stick');
            pushJoints(stick.modelId ?? null, color, jointSet.joints);
        }

        for (const kickstand of renderKickstandList) {
            if (!isModelVisible(kickstand.modelId, kickstand.id)) continue;
            if (selectedKickstandIds.has(kickstand.id)) continue;
            const jointSet = kickstandJointsBySupport.get(kickstand.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(kickstand.modelId, kickstand.id, 'kickstand');
            pushJoints(kickstand.modelId ?? null, color, jointSet.joints);
        }

        for (const leaf of renderLeafList) {
            if (!isModelVisible(leaf.modelId, leaf.id)) continue;
            if (selectedLeafIds.has(leaf.id)) continue;
            const jointSet = leafJointsBySupport.get(leaf.id);
            if (!jointSet) continue;

            const color = resolveSceneSupportColor(jointSet.modelId, leaf.id, 'leaf');
            pushJoints(jointSet.modelId ?? null, color, jointSet.joints);
        }

        return Array.from(grouped.values());
    }, [
        disableSelectionAndHover,
        renderTrunkList,
        renderBranchList,
        renderTwigList,
        renderStickList,
        renderKickstandList,
        isModelVisible,
        selectedTrunkIds,
        selectedBranchIds,
        selectedTwigIds,
        selectedStickIds,
        selectedKickstandIds,
        trunkJointsBySupport,
        branchJointsBySupport,
        twigJointsBySupport,
        stickJointsBySupport,
        kickstandJointsBySupport,
        leafJointsBySupport,
        selectedLeafIds,
        renderLeafList,
        applyDropToVec3Like,
        dimNonSelected,
        resolveSceneSupportColor,
    ]);

    /**
     * Groups a type's unselected shafts by model and colour for instanced
     * drawing. Five of the six batched types differed only in the type name.
     */
    const groupShaftsForSceneBatch = useCallback(<T extends { id: string; modelId?: string }>(
        typeId: SupportTypeId,
        list: readonly T[],
        shaftsBySupport: Map<string, { modelId?: string; shafts: InstancedShaft[] }>,
        selectedIds: ReadonlySet<string>,
        skip?: (entity: T) => boolean,
    ) => {
        const grouped = new Map<string, { modelId?: string; color: string; shafts: InstancedShaft[] }>();

        for (const entity of list) {
            if (!isModelVisible(entity.modelId, entity.id)) continue;
            if (selectedIds.has(entity.id)) continue;
            if (skip?.(entity)) continue;

            const shaftSet = shaftsBySupport.get(entity.id);
            if (!shaftSet) continue;

            const color = resolveSceneSupportColor(shaftSet.modelId, entity.id, typeId);
            const groupKey = `${shaftSet.modelId ?? '__unassigned__'}:${color}`;
            const existing = grouped.get(groupKey) ?? { modelId: shaftSet.modelId, color, shafts: [] };
            existing.shafts.push(...shaftSet.shafts.map(applyDropToInstancedShaft));
            if (existing.shafts.length > 0) grouped.set(groupKey, existing);
        }

        return Array.from(grouped.values());
    }, [isModelVisible, resolveSceneSupportColor, applyDropToInstancedShaft]);

    const sceneBatchedTwigShaftGroups = useMemo(
        () => (enableTwigSceneBatching
            ? groupShaftsForSceneBatch('twig', renderTwigList, twigShaftsBySupport, selectedTwigIds)
            : []),
        [enableTwigSceneBatching, renderTwigList, twigShaftsBySupport, selectedTwigIds, groupShaftsForSceneBatch],
    );

    const sceneBatchedStickShaftGroups = useMemo(
        () => groupShaftsForSceneBatch('stick', renderStickList, stickShaftsBySupport, selectedStickIds),
        [renderStickList, stickShaftsBySupport, selectedStickIds, groupShaftsForSceneBatch],
    );

    const sceneBatchedKickstandShaftGroups = useMemo(
        () => groupShaftsForSceneBatch('kickstand', renderKickstandList, kickstandShaftsBySupport, selectedKickstandIds),
        [renderKickstandList, kickstandShaftsBySupport, selectedKickstandIds, groupShaftsForSceneBatch],
    );

    const sceneBatchedBraceShaftGroups = useMemo(() => {
        const grouped = new Map<string, { modelId?: string; color: string; shafts: InstancedShaft[] }>();

        const sectionColorsEnabled = !!settings.autoBracing.debugSectionColorsEnabled;
        const splitByDebugSection = sectionColorsEnabled && !dimNonSelected;

        for (const brace of renderBraceList) {
            if (!isModelVisible(brace.modelId, brace.id)) continue;
            const shaftSet = braceShaftsBySupport.get(brace.id);
            if (!shaftSet) continue;

            if (selectedBraceIds.has(brace.id) || ghostedBraceIdSet.has(brace.id)) continue;

            const modelKey = shaftSet.modelId ?? '__unassigned__';
            const debugSection = splitByDebugSection
                ? (brace.debugSection ?? null)
                : null;
            const color = debugSection
                ? AUTO_BRACING_DEBUG_SECTION_COLORS[debugSection]
                : resolveSceneSupportColor(shaftSet.modelId, brace.id, 'brace');
            const groupKey = `${modelKey}:${color}`;

            const existing = grouped.get(groupKey);
            if (existing) {
                existing.shafts.push(...shaftSet.shafts.map(applyDropToInstancedShaft));
            } else {
                grouped.set(groupKey, {
                    modelId: shaftSet.modelId,
                    color,
                    shafts: shaftSet.shafts.map(applyDropToInstancedShaft),
                });
            }
        }

        return Array.from(grouped.values());
    }, [renderBraceList, braceShaftsBySupport, selectedBraceIds, ghostedBraceIdSet, isModelVisible, applyDropToInstancedShaft, settings.autoBracing.debugSectionColorsEnabled, dimNonSelected, resolveSceneSupportColor]);

    const sceneBatchedTrunkShaftGroups = useMemo(
        () => groupShaftsForSceneBatch('trunk', renderTrunkList, trunkShaftsBySupport, selectedTrunkIds),
        [renderTrunkList, trunkShaftsBySupport, selectedTrunkIds, groupShaftsForSceneBatch],
    );

    const sceneBatchedBranchShaftGroups = useMemo(
        () => groupShaftsForSceneBatch('branch', renderBranchList, branchShaftsBySupport, selectedBranchIds),
        [renderBranchList, branchShaftsBySupport, selectedBranchIds, groupShaftsForSceneBatch],
    );

    /**
     * Plate roots for the batched pass, grouped by model and colour.
     *
     * Both root-owning types build these identically; only the shaft-diameter
     * fallback differs, and the store the root comes from.
     */
    const groupRootsForSceneBatch = useCallback(<T extends { id: string; modelId?: string; rootId: string; segments?: Segment[] }>(
        typeId: SupportTypeId,
        list: readonly T[],
        selectedIds: ReadonlySet<string>,
        roots: Record<string, Roots>,
        fallbackShaftDiameter: (entity: T) => number,
    ) => {
        if (hidePlateContactPrimitivesEffective) {
            return [] as Array<{ modelId: string | null; color: string; roots: InstancedRoot[] }>;
        }

        const grouped = new Map<string, { modelId: string | null; color: string; roots: InstancedRoot[] }>();

        for (const entity of list) {
            if (!isModelVisible(entity.modelId, entity.id)) continue;
            if (selectedIds.has(entity.id)) continue;

            const root = roots[entity.rootId];
            if (!root) continue;

            const shaftDiameter = Math.max(0.001, entity.segments?.[0]?.diameter ?? fallbackShaftDiameter(entity));
            const color = resolveSceneSupportColor(entity.modelId, entity.id, typeId);
            const groupKey = `${entity.modelId ?? '__unassigned__'}:${color}`;
            const existing = grouped.get(groupKey) ?? { modelId: entity.modelId ?? null, color, roots: [] };

            existing.roots.push({
                id: root.id,
                supportId: entity.id,
                modelId: entity.modelId,
                basePos: applyDropToVec3Like({
                    x: root.transform.pos.x,
                    y: root.transform.pos.y,
                    z: root.transform.pos.z,
                }, entity.modelId),
                bottomRadius: Math.max(0.001, root.diameter / 2),
                topRadius: shaftDiameter / 2,
                effectiveDiskHeight: Math.max(0.001, root.diskHeight),
                coneHeight: Math.max(0, root.coneHeight),
            });
            grouped.set(groupKey, existing);
        }

        return Array.from(grouped.values());
    }, [
        hidePlateContactPrimitivesEffective, isModelVisible,
        resolveSceneSupportColor, applyDropToVec3Like,
    ]);

    const sceneBatchedTrunkRootGroups = useMemo(
        () => groupRootsForSceneBatch('trunk', renderTrunkList, selectedTrunkIds, state.roots, () => 1.5),
        [renderTrunkList, selectedTrunkIds, state.roots, groupRootsForSceneBatch],
    );

    const sceneBatchedKickstandRootGroups = useMemo(
        () => groupRootsForSceneBatch(
            'kickstand', renderKickstandList, selectedKickstandIds,
            kickstandState.roots, (kickstand) => kickstand.profile.bodyDiameterMm,
        ),
        [renderKickstandList, selectedKickstandIds, kickstandState.roots, groupRootsForSceneBatch],
    );

    const sceneBatchedContactConeGroups = useMemo(() => {
        const grouped = new Map<string, { modelId: string | null; color: string; cones: InstancedContactCone[] }>();

        const collect = <T extends { id: string }>(
            typeId: SupportTypeId,
            list: readonly T[],
            selectedIds: ReadonlySet<string>,
        ) => {
            for (const entity of list) {
                if (selectedIds.has(entity.id)) continue;
                const coneSet = contactConesBySupport.get(entity.id);
                if (!coneSet) continue;

                const color = resolveSceneSupportColor(coneSet.modelId, entity.id, typeId);
                const key = `${coneSet.modelId ?? '__unassigned__'}:${color}`;
                const existing = grouped.get(key)
                    ?? { modelId: coneSet.modelId ?? null, color, cones: [] as InstancedContactCone[] };

                for (const cone of coneSet.cones) {
                    existing.cones.push({ ...cone, pos: applyDropToVec3Like(cone.pos, cone.modelId) });
                }
                grouped.set(key, existing);
            }
        };

        collect('trunk', renderTrunkList, selectedTrunkIds);
        collect('branch', renderBranchList, selectedBranchIds);
        collect('stick', renderStickList, selectedStickIds);
        collect('leaf', renderLeafList, selectedLeafIds);

        return Array.from(grouped.values());
    }, [
        renderTrunkList, renderBranchList, renderStickList, renderLeafList,
        selectedTrunkIds, selectedBranchIds, selectedStickIds, selectedLeafIds,
        contactConesBySupport, resolveSceneSupportColor, applyDropToVec3Like,
    ]);

    const sceneBatchedShaftInstanceCount = useMemo(() => {
        const countGroups = [
            sceneBatchedTrunkShaftGroups,
            sceneBatchedBranchShaftGroups,
            sceneBatchedBraceShaftGroups,
            sceneBatchedTwigShaftGroups,
            sceneBatchedStickShaftGroups,
            sceneBatchedKickstandShaftGroups,
        ];

        let total = 0;
        for (const groups of countGroups) {
            for (const group of groups) {
                total += group.shafts.length;
            }
        }

        return total;
    }, [
        sceneBatchedTrunkShaftGroups,
        sceneBatchedBranchShaftGroups,
        sceneBatchedBraceShaftGroups,
        sceneBatchedTwigShaftGroups,
        sceneBatchedStickShaftGroups,
        sceneBatchedKickstandShaftGroups,
    ]);

    const sceneBatchedShaftRadialSegments = sceneBatchedShaftInstanceCount >= BATCHED_SHAFT_HIGH_INSTANCE_THRESHOLD
        ? BATCHED_SHAFT_LOW_RADIAL_SEGMENTS
        : BATCHED_SHAFT_RADIAL_SEGMENTS;

    const placementPreviewBatches = useMemo(() => {
        if (mode !== 'support') return [] as PlacementPreviewBatch[];

        const hasSolidBottom = raftSettings.bottomMode === 'solid';
        const raftThickness = raftSettings.thickness ?? 0;
        const next: PlacementPreviewBatch[] = [];

        const pushSupportPreview = (id: string, preview: SupportData | null) => {
            if (!preview) return;
            const batch = buildSupportPlacementPreviewBatch(id, preview, hasSolidBottom, raftThickness);
            if (!batch) return;

            if (hidePlateContactPrimitivesEffective) {
                next.push({
                    ...batch,
                    roots: [],
                });
                return;
            }

            next.push(batch);
        };

        pushSupportPreview('placement-preview:trunk', trunkPlacementPreview);
        pushSupportPreview('placement-preview:branch', branchPlacementPreview);
        pushSupportPreview('placement-preview:leaf', leafPlacementPreview);
        pushSupportPreview('placement-preview:kickstand', kickstandPlacementPreview);

        if (bracePlacementPreview) {
            const braceBatch = buildBracePlacementPreviewBatch('placement-preview:brace', bracePlacementPreview);
            if (braceBatch) next.push(braceBatch);
        }

        return next;
    }, [
        mode,
        trunkPlacementPreview,
        branchPlacementPreview,
        leafPlacementPreview,
        bracePlacementPreview,
        kickstandPlacementPreview,
        raftSettings.bottomMode,
        raftSettings.thickness,
        hidePlateContactPrimitivesEffective,
    ]);

    const hoveredSupportShaftSet = useMemo(() => {
        if (!isInteractable) return null;
        if (hoveredSupportIsSelected) return null;

        const hoveredSupportId = hoveredSupportIdForVisual;
        if (!hoveredSupportId) return null;

        const trunkSet = trunkShaftsBySupport.get(hoveredSupportId);
        if (trunkSet) return trunkSet;

        const branchSet = branchShaftsBySupport.get(hoveredSupportId);
        if (branchSet) return branchSet;

        const braceSet = braceShaftsBySupport.get(hoveredSupportId);
        if (braceSet) return braceSet;

        const twigSet = twigShaftsBySupport.get(hoveredSupportId);
        if (twigSet) return twigSet;

        const stickSet = stickShaftsBySupport.get(hoveredSupportId);
        if (stickSet) return stickSet;

        const kickstandSet = kickstandShaftsBySupport.get(hoveredSupportId);
        if (kickstandSet) return kickstandSet;

        return null;
    }, [isInteractable, hoveredSupportIdForVisual, hoveredSupportIsSelected, trunkShaftsBySupport, branchShaftsBySupport, braceShaftsBySupport, twigShaftsBySupport, stickShaftsBySupport, kickstandShaftsBySupport]);

    const hoveredSupportOverlayShafts = useMemo(() => {
        if (!hoveredSupportShaftSet) return [] as InstancedShaft[];

        return hoveredSupportShaftSet.shafts.map((shaft) => ({
            ...applyDropToInstancedShaft(shaft),
            diameter: shaft.diameter * 1.02,
        }));
    }, [hoveredSupportShaftSet, applyDropToInstancedShaft]);

    const hoveredSupportConeSet = useMemo(() => {
        if (!isInteractable) return null;
        if (hoveredSupportIsSelected) return null;

        const hoveredSupportId = hoveredSupportIdForVisual;
        if (!hoveredSupportId) return null;

        return contactConesBySupport.get(hoveredSupportId) ?? null;
    }, [isInteractable, hoveredSupportIdForVisual, hoveredSupportIsSelected, contactConesBySupport]);

    const hoveredSupportOverlayCones = useMemo(() => {
        if (!hoveredSupportConeSet) return [] as InstancedContactCone[];
        return hoveredSupportConeSet.cones.map((cone) => ({
            ...cone,
            pos: applyDropToVec3Like(cone.pos, cone.modelId),
        }));
    }, [hoveredSupportConeSet, applyDropToVec3Like]);

    const hoveredSupportJointSet = useMemo(() => {
        if (!isInteractable) return null;
        if (hoveredSupportIsSelected) return null;

        const hoveredSupportId = hoveredSupportIdForVisual;
        if (!hoveredSupportId) return null;

        const trunkSet = trunkJointsBySupport.get(hoveredSupportId);
        if (trunkSet) return trunkSet;

        const branchSet = branchJointsBySupport.get(hoveredSupportId);
        if (branchSet) return branchSet;

        const twigSet = twigJointsBySupport.get(hoveredSupportId);
        if (twigSet) return twigSet;

        const stickSet = stickJointsBySupport.get(hoveredSupportId);
        if (stickSet) return stickSet;

        const kickstandSet = kickstandJointsBySupport.get(hoveredSupportId);
        if (kickstandSet) return kickstandSet;

        const leafSet = leafJointsBySupport.get(hoveredSupportId);
        if (leafSet) return leafSet;

        return null;
    }, [
        isInteractable,
        hoveredSupportIdForVisual,
        hoveredSupportIsSelected,
        trunkJointsBySupport,
        branchJointsBySupport,
        twigJointsBySupport,
        stickJointsBySupport,
        kickstandJointsBySupport,
        leafJointsBySupport,
    ]);

    const hoveredSupportOverlayJoints = useMemo(() => {
        if (!hoveredSupportJointSet) return [] as InstancedJoint[];

        return hoveredSupportJointSet.joints.map((joint) => ({
            ...joint,
            pos: applyDropToVec3Like(joint.pos, joint.modelId),
            diameter: joint.diameter * 1.06,
        }));
    }, [hoveredSupportJointSet, applyDropToVec3Like]);

    const buildHighlightedRootOverlay = React.useCallback((supportId: string): InstancedRoot | null => {
        const hasSolidBottom = raftSettings.bottomMode === 'solid';
        const raftThickness = raftSettings.thickness ?? 0;

        const trunk = state.trunks[supportId];
        if (trunk) {
            const root = state.roots[trunk.rootId];
            if (!root) return null;

            const shaftDiameter = Math.max(0.001, trunk.segments[0]?.diameter ?? 1.5);
            const topRadius = shaftDiameter / 2;
            const bottomRadius = Math.max(0.001, root.diameter / 2);
            const effectiveDiskHeight = Math.max(0.001, root.diskHeight);
            const verticalOffset = 0;

            return {
                id: root.id,
                supportId: trunk.id,
                modelId: trunk.modelId,
                basePos: applyDropToVec3Like({
                    x: root.transform.pos.x,
                    y: root.transform.pos.y,
                    z: root.transform.pos.z + verticalOffset,
                }, trunk.modelId),
                bottomRadius,
                topRadius,
                effectiveDiskHeight,
                coneHeight: Math.max(0, root.coneHeight),
            };
        }

        const kickstand = kickstandState.kickstands[supportId];
        if (kickstand) {
            const root = kickstandState.roots[kickstand.rootId];
            if (!root) return null;

            const shaftDiameter = Math.max(
                0.001,
                kickstand.segments[0]?.diameter ?? kickstand.profile.bodyDiameterMm,
            );
            const topRadius = shaftDiameter / 2;
            const bottomRadius = Math.max(0.001, root.diameter / 2);
            const effectiveDiskHeight = Math.max(0.001, root.diskHeight);
            const verticalOffset = 0;

            return {
                id: root.id,
                supportId: kickstand.id,
                modelId: kickstand.modelId,
                basePos: applyDropToVec3Like({
                    x: root.transform.pos.x,
                    y: root.transform.pos.y,
                    z: root.transform.pos.z + verticalOffset,
                }, kickstand.modelId),
                bottomRadius,
                topRadius,
                effectiveDiskHeight,
                coneHeight: Math.max(0, root.coneHeight),
            };
        }

        return null;
    }, [
        raftSettings.bottomMode,
        raftSettings.thickness,
        state.trunks,
        state.roots,
        kickstandState.kickstands,
        kickstandState.roots,
        applyDropToVec3Like,
    ]);

    const hoveredSupportOverlayRoots = useMemo(() => {
        if (hidePlateContactPrimitivesEffective) return [] as InstancedRoot[];
        if (!isInteractable) return [] as InstancedRoot[];

        const hoveredSupportId = hoveredSupportIdForVisual;
        if (!hoveredSupportId) return [] as InstancedRoot[];

        const overlay = buildHighlightedRootOverlay(hoveredSupportId);
        return overlay ? [overlay] : [];
    }, [
        hidePlateContactPrimitivesEffective,
        isInteractable,
        hoveredSupportIdForVisual,
        buildHighlightedRootOverlay,
    ]);

    const additionalMarqueeHoveredSupportIds = useMemo(() => {
        if (!isInteractable || marqueeHoveredSupportIds.length <= 1) return EMPTY_SUPPORT_ID_LIST;
        return marqueeHoveredSupportIds.slice(1);
    }, [isInteractable, marqueeHoveredSupportIds]);

    const marqueeHoveredOverlayShafts = useMemo(() => {
        if (additionalMarqueeHoveredSupportIds.length === 0) return [] as InstancedShaft[];

        const overlays: InstancedShaft[] = [];
        for (const supportId of additionalMarqueeHoveredSupportIds) {
            const shaftSet = trunkShaftsBySupport.get(supportId)
                ?? branchShaftsBySupport.get(supportId)
                ?? braceShaftsBySupport.get(supportId)
                ?? twigShaftsBySupport.get(supportId)
                ?? stickShaftsBySupport.get(supportId)
                ?? kickstandShaftsBySupport.get(supportId)
                ?? null;
            if (!shaftSet) continue;
            overlays.push(...shaftSet.shafts.map((shaft) => ({
                ...applyDropToInstancedShaft(shaft),
                diameter: shaft.diameter * 1.02,
            })));
        }
        return overlays;
    }, [additionalMarqueeHoveredSupportIds, trunkShaftsBySupport, branchShaftsBySupport, braceShaftsBySupport, twigShaftsBySupport, stickShaftsBySupport, kickstandShaftsBySupport, applyDropToInstancedShaft]);

    const marqueeHoveredOverlayCones = useMemo(() => {
        if (additionalMarqueeHoveredSupportIds.length === 0) return [] as InstancedContactCone[];

        const overlays: InstancedContactCone[] = [];
        for (const supportId of additionalMarqueeHoveredSupportIds) {
            const coneSet = contactConesBySupport.get(supportId);
            if (!coneSet) continue;
            overlays.push(...coneSet.cones.map((cone) => ({
                ...cone,
                pos: applyDropToVec3Like(cone.pos, cone.modelId),
            })));
        }
        return overlays;
    }, [additionalMarqueeHoveredSupportIds, contactConesBySupport, applyDropToVec3Like]);

    const marqueeHoveredOverlayJoints = useMemo(() => {
        if (additionalMarqueeHoveredSupportIds.length === 0) return [] as InstancedJoint[];

        const overlays: InstancedJoint[] = [];
        for (const supportId of additionalMarqueeHoveredSupportIds) {
            const jointSet = trunkJointsBySupport.get(supportId)
                ?? branchJointsBySupport.get(supportId)
                ?? twigJointsBySupport.get(supportId)
                ?? stickJointsBySupport.get(supportId)
                ?? kickstandJointsBySupport.get(supportId)
                ?? leafJointsBySupport.get(supportId)
                ?? null;
            if (!jointSet) continue;
            overlays.push(...jointSet.joints.map((joint) => ({
                ...joint,
                pos: applyDropToVec3Like(joint.pos, joint.modelId),
                diameter: joint.diameter * 1.06,
            })));
        }
        return overlays;
    }, [additionalMarqueeHoveredSupportIds, trunkJointsBySupport, branchJointsBySupport, twigJointsBySupport, stickJointsBySupport, kickstandJointsBySupport, leafJointsBySupport, applyDropToVec3Like]);

    const marqueeHoveredOverlayRoots = useMemo(() => {
        if (hidePlateContactPrimitivesEffective) return [] as InstancedRoot[];
        if (additionalMarqueeHoveredSupportIds.length === 0) return [] as InstancedRoot[];

        const overlays: InstancedRoot[] = [];

        for (const supportId of additionalMarqueeHoveredSupportIds) {
            const overlay = buildHighlightedRootOverlay(supportId);
            if (overlay) overlays.push(overlay);
        }

        return overlays;
    }, [
        hidePlateContactPrimitivesEffective,
        additionalMarqueeHoveredSupportIds,
        buildHighlightedRootOverlay,
    ]);

    const handleSceneBatchedShaftClick = React.useCallback((shaft: InstancedShaft, event: { nativeEvent?: Event }) => {
        const e = event as any;
        const altDown = !!(e?.nativeEvent?.altKey || e?.altKey);
        const ctrlDown = !!(e?.nativeEvent?.ctrlKey || e?.ctrlKey);
        const shiftDown = !!(e?.nativeEvent?.shiftKey || e?.shiftKey);

        console.log('[DEBUG SupportRenderer handleSceneBatchedShaftClick]', {
            shaft,
            isPointerInteractable,
            isPreparePointerInteractable,
            supportSelectionAndHoverSuppressed,
            braceAltActive,
            kickstandHotkeyActive,
            leafHotkeyActive,
            leafStage,
            sproutParentingLockHeld,
            altDown,
            ctrlDown,
            shiftDown,
            event,
        });

        if (!isPointerInteractable) return;
        if (isPreparePointerInteractable) {
            emitSupportModelPointerSelect(shaft.modelId ?? null);
            return;
        }

        if (supportSelectionAndHoverSuppressed || braceAltActive || kickstandHotkeyActive || leafHotkeyActive || leafStage === 'awaitingBase' || sproutParentingLockHeld) {
            if (typeof e?.stopPropagation === 'function') {
                e.stopPropagation();
            }
            if (typeof e?.nativeEvent?.stopPropagation === 'function') {
                e.nativeEvent.stopPropagation();
            }

            const point = e?.point
                ? { x: e.point.x, y: e.point.y, z: e.point.z }
                : null;

            console.log('[DEBUG SupportRenderer handleSceneBatchedShaftClick] Emitting shaft-click event:', {
                segmentId: shaft.id,
                point,
            });

            window.dispatchEvent(new CustomEvent('shaft-click', {
                detail: {
                    segmentId: shaft.id,
                    point,
                    intersection: event,
                },
            }));
            return;
        }

        if (!shaft.supportId) return;
        handleSupportClick(event, shaft.supportId, isInteractable);
    }, [isPointerInteractable, isPreparePointerInteractable, isInteractable, supportSelectionAndHoverSuppressed, braceAltActive, kickstandHotkeyActive, leafHotkeyActive, leafStage, sproutParentingLockHeld]);

    const handleSceneBatchedShaftPointerMove = React.useCallback((shaft: InstancedShaft, event: { point?: { x: number; y: number; z: number } | THREE.Vector3 } | null) => {
        if (!isPointerInteractable) return;
        if (orbitInteractionActiveRef.current) return;

        const jointDragInteractionActive = typeof window !== 'undefined' && !!(window as any).__jointGizmoDragging;
        const allowSuppressedShaftHoverForPlacementPreview = (braceAltActive || kickstandHotkeyActive || leafHotkeyActive || leafStage === 'awaitingBase' || sproutParentingLockHeld) && mode === 'support' && !jointDragInteractionActive;

        const sceneHoverWriteDecision = resolveSceneBatchedShaftHoverWriteDecision({
            supportId: shaft.supportId,
            modelId: shaft.modelId,
            selectedCategory,
            selectedPrimitiveHoverActive,
            primitiveHoverOnSelectedSupport,
            selectedSupportIdSet,
            hoverSuppressed: supportSelectionAndHoverSuppressed,
            primitiveHoverSuppressesSceneShaftHover,
            selectedPrimitiveSupportId,
        });
        const point = event?.point
            ? { x: (event.point as any).x, y: (event.point as any).y, z: (event.point as any).z }
            : null;

        if (sceneHoverWriteDecision.type === 'clear' && sceneHoverWriteDecision.reason !== 'interaction-suppressed') {
            // When placement hotkeys are active, always emit shaft-hover so previews can track
            // unselected shafts even when hover suppression logic would otherwise clear it.
            if (allowSuppressedShaftHoverForPlacementPreview) {
                window.dispatchEvent(new CustomEvent('shaft-hover', {
                    detail: { segmentId: shaft.id, point, intersection: event },
                }));
            } else {
                window.dispatchEvent(new CustomEvent('shaft-leave', {
                    detail: { segmentId: shaft.id },
                }));
            }
            applySceneHoverWriteDecision(
                sceneHoverWriteDecision,
                pendingSceneHoverClearFrameRef,
                setSceneHoveredSupportId,
                emitSupportModelPointerHover,
            );
            return;
        }

        if (sceneHoverWriteDecision.type === 'clear' && sceneHoverWriteDecision.reason === 'interaction-suppressed') {
            if (allowSuppressedShaftHoverForPlacementPreview) {
                window.dispatchEvent(new CustomEvent('shaft-hover', {
                    detail: {
                        segmentId: shaft.id,
                        point,
                        intersection: event,
                    },
                }));
            } else {
                window.dispatchEvent(new CustomEvent('shaft-leave', {
                    detail: { segmentId: shaft.id },
                }));
            }
            applySceneHoverWriteDecision(
                sceneHoverWriteDecision,
                pendingSceneHoverClearFrameRef,
                setSceneHoveredSupportId,
                emitSupportModelPointerHover,
            );
            return;
        }

        if (mode === 'support') {
            window.dispatchEvent(new CustomEvent('shaft-hover', {
                detail: {
                    segmentId: shaft.id,
                    point,
                    intersection: event,
                },
            }));
        }

        applySceneHoverWriteDecision(
            sceneHoverWriteDecision,
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [isPointerInteractable, mode, braceAltActive, kickstandHotkeyActive, leafHotkeyActive, leafStage, sproutParentingLockHeld, primitiveHoverOnSelectedSupport, primitiveHoverSuppressesSceneShaftHover, selectedCategory, selectedPrimitiveSupportId, selectedPrimitiveHoverActive, selectedSupportIdSet, supportSelectionAndHoverSuppressed]);

    const handleSceneBatchedShaftPointerOut = React.useCallback((entity: { id: string } | null) => {
        if (!isPointerInteractable) return;
        if (orbitInteractionActiveRef.current) return;

        if (mode === 'support') {
            window.dispatchEvent(new CustomEvent('shaft-leave', {
                detail: { segmentId: entity?.id ?? null },
            }));
        }

        if (supportSelectionAndHoverSuppressed) {
            window.dispatchEvent(new CustomEvent('shaft-leave', {
                detail: { segmentId: null },
            }));
            return;
        }

        applySceneHoverWriteDecision(
            resolveSceneBatchedShaftPointerOutWriteDecision(supportSelectionAndHoverSuppressed),
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [isPointerInteractable, mode, supportSelectionAndHoverSuppressed]);

    /** Base colour for a detail-rendered support, origin overlay included. */
    const resolveDetailSupportColor = useCallback((
        typeId: SupportTypeId,
        supportId: string,
        modelId?: string,
    ) => {
        if (!debugOriginColors) return resolveBaseColor(modelId);
        return getSupportTypeDescriptor(typeId).hasOrigin
            ? originColorFor(supportId) ?? ORIGIN_NO_ORIGIN_COLOR
            : ORIGIN_NOT_APPLICABLE_COLOR;
    }, [debugOriginColors, originColorFor, resolveBaseColor]);

    /** The props every detail renderer takes identically. */
    const sharedRenderProps = useCallback((
        typeId: SupportTypeId,
        entity: { id: string; modelId?: string },
        isSelected: boolean,
        isHovered: boolean,
    ) => ({
        isSelected,
        selectedId: isSelected ? selectedId : null,
        dimNonSelected,
        isHovered,
        baseColor: resolveDetailSupportColor(typeId, entity.id, entity.modelId),
        suppressHover,
        isInteractable,
    }), [selectedId, dimNonSelected, resolveDetailSupportColor, suppressHover, isInteractable]);

    /** Draws one type's batched shaft groups. Six identical blocks became this. */
    const renderSceneBatchedShafts = useCallback((
        typeId: string,
        groups: ReadonlyArray<{ modelId?: string; color: string; shafts: InstancedShaft[] }>,
        options?: { detailedOnly?: boolean },
    ) => {
        if (options?.detailedOnly && simpleRender) return null;
        return groups.map((group) => (
            <group
                key={`scene-${typeId}-batch:${group.modelId ?? 'none'}:${group.color}:${group.shafts.length}`}
                userData={{ modelId: group.modelId ?? null }}
            >
                {simpleRender ? (
                    <SimpleShaftLines shafts={group.shafts} color={group.color} />
                ) : (
                    <InstancedShaftGroup
                        shafts={group.shafts}
                        color={group.color}
                        transparent={ghostTransparent}
                        opacity={ghostOpacityClamped}
                        radialSegments={sceneBatchedShaftRadialSegments}
                        onShaftClick={isPointerInteractable ? handleSceneBatchedShaftClick : undefined}
                        onShaftPointerMove={isPointerInteractable ? handleSceneBatchedShaftPointerMove : undefined}
                        onShaftPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                    />
                )}
            </group>
        ));
    }, [
        simpleRender, ghostTransparent, ghostOpacityClamped, sceneBatchedShaftRadialSegments,
        isPointerInteractable, handleSceneBatchedShaftClick,
        handleSceneBatchedShaftPointerMove, handleSceneBatchedShaftPointerOut,
    ]);


    const handleSceneBatchedRootClick = React.useCallback((root: InstancedRoot, event: { nativeEvent?: Event }) => {
        if (!isPointerInteractable) return;
        if (isPreparePointerInteractable) {
            emitSupportModelPointerSelect(root.modelId ?? null);
            return;
        }
        if (supportSelectionAndHoverSuppressed) return;
        if (!root.supportId) return;
        handleSupportClick(event, root.supportId, isInteractable);
    }, [isPointerInteractable, isPreparePointerInteractable, isInteractable, supportSelectionAndHoverSuppressed]);

    const handleSceneBatchedRootPointerMove = React.useCallback((root: InstancedRoot) => {
        if (!isPointerInteractable) return;
        if (orbitInteractionActiveRef.current) return;

        applySceneHoverWriteDecision(
            resolveSceneBatchedSupportHoverWriteDecision({
                supportId: root.supportId,
                modelId: root.modelId,
                selectedCategory,
                selectedPrimitiveHoverActive,
                primitiveHoverOnSelectedSupport,
                selectedSupportIdSet,
                hoverSuppressed: supportSelectionAndHoverSuppressed,
                selectedPrimitiveSupportId,
            }),
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [isPointerInteractable, primitiveHoverOnSelectedSupport, selectedCategory, selectedPrimitiveSupportId, selectedPrimitiveHoverActive, selectedSupportIdSet, supportSelectionAndHoverSuppressed]);

    const handleSceneBatchedConeClick = React.useCallback((cone: InstancedContactCone, event: { nativeEvent?: Event }) => {
        if (!isPointerInteractable) return;
        if (isPreparePointerInteractable) {
            emitSupportModelPointerSelect(cone.modelId ?? null);
            return;
        }

        // Brace tool: an unselected leaf's cone is rendered in this batched mesh
        // (not LeafRenderer), so the leaf's own onClick never fires. Mirror the
        // batched-shaft brace branch here and emit brace-leaf-click for leaf cones
        // so the brace tool can start/end an endpoint on a leaf. cone.supportId is
        // the leaf id (see contactConesBySupport).
        if ((supportSelectionAndHoverSuppressed || braceAltActive) && cone.supportId && state.leaves[cone.supportId]) {
            const e = event as unknown as { point?: THREE.Vector3 | { x: number; y: number; z: number } };
            const point = e.point
                ? { x: (e.point as any).x, y: (e.point as any).y, z: (e.point as any).z }
                : null;
            window.dispatchEvent(new CustomEvent('brace-leaf-click', {
                detail: {
                    leafId: cone.supportId,
                    point,
                    intersection: event,
                },
            }));
            return;
        }

        if (supportSelectionAndHoverSuppressed) return;
        if (!cone.supportId) return;
        handleSupportClick(event, cone.supportId, isInteractable);
    }, [isPointerInteractable, isPreparePointerInteractable, isInteractable, supportSelectionAndHoverSuppressed, braceAltActive, state.leaves]);

    const handleSceneBatchedConePointerMove = React.useCallback((cone: InstancedContactCone, event?: { point?: { x: number; y: number; z: number } | THREE.Vector3 } | null) => {
        if (!isPointerInteractable) return;
        if (orbitInteractionActiveRef.current) return;

        // Brace tool: emit brace-leaf-hover for an unselected leaf's batched cone
        // so the brace placement preview can track it (counterpart to the batched
        // shaft hover path). cone.supportId is the leaf id. Without this the leaf
        // is unhoverable for braces (its own LeafRenderer handlers only mount when
        // the leaf is selected â€” the cone is otherwise drawn in this batched mesh).
        const jointDragInteractionActive = typeof window !== 'undefined' && !!(window as any).__jointGizmoDragging;
        const allowLeafHoverForPlacementPreview = braceAltActive && mode === 'support' && !jointDragInteractionActive;
        if (allowLeafHoverForPlacementPreview && cone.supportId && state.leaves[cone.supportId]) {
            const point = event?.point
                ? { x: (event.point as any).x, y: (event.point as any).y, z: (event.point as any).z }
                : null;
            window.dispatchEvent(new CustomEvent('brace-leaf-hover', {
                detail: { leafId: cone.supportId, point, intersection: event },
            }));
        }

        applySceneHoverWriteDecision(
            resolveSceneBatchedSupportHoverWriteDecision({
                supportId: cone.supportId,
                modelId: cone.modelId,
                selectedCategory,
                selectedPrimitiveHoverActive,
                primitiveHoverOnSelectedSupport,
                selectedSupportIdSet,
                hoverSuppressed: supportSelectionAndHoverSuppressed,
                selectedPrimitiveSupportId,
            }),
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [isPointerInteractable, mode, braceAltActive, state.leaves, primitiveHoverOnSelectedSupport, selectedCategory, selectedPrimitiveSupportId, selectedPrimitiveHoverActive, selectedSupportIdSet, supportSelectionAndHoverSuppressed]);

    // Cone pointer-out: clear the brace tool's leaf hover (so a leaf preview
    // doesn't stick once the cursor leaves the cone), then fall through to the
    // shared shaft pointer-out cleanup for the rest of the hover state.
    const handleSceneBatchedConePointerOut = React.useCallback((cone: InstancedContactCone | null) => {
        if (braceAltActive && cone?.supportId && state.leaves[cone.supportId]) {
            window.dispatchEvent(new CustomEvent('brace-leaf-leave', {
                detail: { leafId: cone.supportId },
            }));
        }
        handleSceneBatchedShaftPointerOut(cone ? { id: cone.id } : null);
    }, [braceAltActive, state.leaves, handleSceneBatchedShaftPointerOut]);

    const handleSceneBatchedJointClick = React.useCallback((joint: InstancedJoint, event: { nativeEvent?: Event }) => {
        if (!isPointerInteractable) return;
        if (isPreparePointerInteractable) {
            emitSupportModelPointerSelect(joint.modelId ?? null);
            return;
        }
        if (supportInteractionSuppressed) return;
        if (!joint.supportId) return;
        handleSupportClick(event, joint.supportId, isInteractable);
    }, [isPointerInteractable, isPreparePointerInteractable, isInteractable, supportInteractionSuppressed]);

    const handleSceneBatchedJointPointerMove = React.useCallback((joint: InstancedJoint) => {
        if (!isPointerInteractable) return;
        if (orbitInteractionActiveRef.current) return;

        applySceneHoverWriteDecision(
            resolveSceneBatchedSupportHoverWriteDecision({
                supportId: joint.supportId,
                modelId: joint.modelId,
                selectedCategory,
                selectedPrimitiveHoverActive,
                primitiveHoverOnSelectedSupport,
                selectedSupportIdSet,
                hoverSuppressed: supportInteractionSuppressed,
                selectedPrimitiveSupportId,
            }),
            pendingSceneHoverClearFrameRef,
            setSceneHoveredSupportId,
            emitSupportModelPointerHover,
        );
    }, [isPointerInteractable, primitiveHoverOnSelectedSupport, selectedCategory, selectedPrimitiveSupportId, selectedPrimitiveHoverActive, selectedSupportIdSet, supportInteractionSuppressed]);

    useEffect(() => {
        const root = groupRef.current;
        if (!root) return;

        const nextClippingPlanes = clippingPlanes.length > 0 ? clippingPlanes : null;

        const applyMaterialClipping = (material: THREE.Material) => {
            const clipMaterial = material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null };
            if (clipMaterial.clippingPlanes === nextClippingPlanes) return;
            clipMaterial.clippingPlanes = nextClippingPlanes;
            material.needsUpdate = true;
        };

        const applyMaterialGhostOpacity = (material: THREE.Material) => {
            if (!ghostTransparent && Math.abs(ghostOpacityClamped - 1) <= 1e-4) {
                return;
            }

            const renderMaterial = material as THREE.Material & {
                transparent?: boolean;
                opacity?: number;
                depthWrite?: boolean;
            };

            let changed = false;

            if (renderMaterial.transparent !== ghostTransparent) {
                renderMaterial.transparent = ghostTransparent;
                changed = true;
            }

            if (typeof renderMaterial.opacity === 'number' && Math.abs(renderMaterial.opacity - ghostOpacityClamped) > 1e-4) {
                renderMaterial.opacity = ghostOpacityClamped;
                changed = true;
            }

            if (typeof renderMaterial.depthWrite === 'boolean') {
                const nextDepthWrite = !ghostTransparent;
                if (renderMaterial.depthWrite !== nextDepthWrite) {
                    renderMaterial.depthWrite = nextDepthWrite;
                    changed = true;
                }
            }

            if (changed) material.needsUpdate = true;
        };

        const applyMeshRenderOrder = (mesh: THREE.Mesh) => {
            if (mesh.renderOrder !== ghostRenderOrder) {
                mesh.renderOrder = ghostRenderOrder;
            }
        };

        const clearMaterialClipping = (material: THREE.Material) => {
            const m = material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null };
            if (m.clippingPlanes !== null) {
                m.clippingPlanes = null;
                material.needsUpdate = true;
            }
        };

        // Returns true if this object should be exempt from cross-section clipping.
        // Gizmo handles tag themselves with isGizmoHandle. Selected-support groups
        // are tagged with noClipping so their entire subtree is preserved.
        const isClipExempt = (obj: THREE.Object3D): boolean => {
            if (obj.userData.isGizmoHandle === true) return true;
            let cur: THREE.Object3D | null = obj;
            while (cur && cur !== root) {
                if (cur.userData.noClipping === true) return true;
                cur = cur.parent;
            }
            return false;
        };

        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.material) return;
            applyMeshRenderOrder(mesh);

            const exempt = isClipExempt(obj);

            if (Array.isArray(mesh.material)) {
                mesh.material.forEach((material) => {
                    if (exempt) {
                        clearMaterialClipping(material);
                    } else {
                        applyMaterialClipping(material);
                    }
                    applyMaterialGhostOpacity(material);
                });
            } else {
                if (exempt) {
                    clearMaterialClipping(mesh.material);
                } else {
                    applyMaterialClipping(mesh.material);
                }
                applyMaterialGhostOpacity(mesh.material);
            }
        });
    }, [
        clippingPlanes,
        ghostOpacityClamped,
        ghostTransparent,
        ghostRenderOrder,
        selectedId,
        // Re-apply clipping when committed support geometry collections change.
        // Without this, newly added meshes can miss clipping until some other
        // dependency (like slider movement) forces a re-run.
        state.roots,
        state.trunks,
        state.branches,
        state.leaves,
        state.twigs,
        state.sticks,
        state.braces,
        state.anchors,
        state.knots,
        kickstandState.roots,
        kickstandState.kickstands,
        kickstandState.knots,
    ]);

    return (
        <group ref={groupRef}>
            {/* Joint Creation Manager */}
            <JointCreationManager />

            {/* Joint Gizmo */}
            <JointGizmo />
            {/* Knot Gizmo (for sliding knots along shafts) */}
            <KnotGizmo />
            <BezierGizmoManager />

            {/* Render Trunks */}
            {renderSceneBatchedShafts('trunk', sceneBatchedTrunkShaftGroups)}
            {!simpleRender && sceneBatchedJointGroups.map((group) => (
                <group key={`scene-joint-batch:${group.modelId ?? 'none'}:${group.color}:${group.joints.length}`} userData={{ modelId: group.modelId ?? null }}>
                    <InstancedJointGroup
                        joints={group.joints}
                        color={group.color}
                        transparent={ghostTransparent}
                        opacity={ghostOpacityClamped}
                        widthSegments={BATCHED_JOINT_WIDTH_SEGMENTS}
                        heightSegments={BATCHED_JOINT_HEIGHT_SEGMENTS}
                        onJointClick={isPointerInteractable ? handleSceneBatchedJointClick : undefined}
                        onJointPointerMove={isPointerInteractable ? handleSceneBatchedJointPointerMove : undefined}
                        onJointPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                    />
                </group>
            ))}
            {!simpleRender && sceneBatchedTrunkRootGroups.map((group) => (
                <group key={`scene-trunk-root-batch:${group.modelId ?? 'none'}:${group.color}:${group.roots.length}`} userData={{ modelId: group.modelId ?? null }}>
                    <InstancedRootsGroup
                        roots={group.roots}
                        color={group.color}
                        transparent={ghostTransparent}
                        opacity={ghostOpacityClamped}
                        onRootClick={isPointerInteractable ? handleSceneBatchedRootClick : undefined}
                        onRootPointerMove={isPointerInteractable ? handleSceneBatchedRootPointerMove : undefined}
                        onRootPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                    />
                </group>
            ))}

            {!simpleRender && sceneBatchedKickstandRootGroups.map((group) => (
                <group key={`scene-kickstand-root-batch:${group.modelId ?? 'none'}:${group.color}:${group.roots.length}`} userData={{ modelId: group.modelId ?? null }}>
                    <InstancedRootsGroup
                        roots={group.roots}
                        color={group.color}
                        transparent={ghostTransparent}
                        opacity={ghostOpacityClamped}
                        onRootClick={isPointerInteractable ? handleSceneBatchedRootClick : undefined}
                        onRootPointerMove={isPointerInteractable ? handleSceneBatchedRootPointerMove : undefined}
                        onRootPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                    />
                </group>
            ))}
            {sceneBatchedContactConeGroups.map((group) => (
                <group key={`scene-cone-batch:${group.modelId ?? 'none'}:${group.color}:${group.cones.length}`} userData={{ modelId: group.modelId ?? null }}>
                    <InstancedContactConeGroup
                        cones={group.cones}
                        color={group.color}
                        transparent={ghostTransparent}
                        opacity={ghostOpacityClamped}
                        onConeClick={isPointerInteractable ? handleSceneBatchedConeClick : undefined}
                        onConePointerMove={isPointerInteractable ? handleSceneBatchedConePointerMove : undefined}
                        onConePointerOut={isPointerInteractable ? handleSceneBatchedConePointerOut : undefined}
                    />
                </group>
            ))}

            {placementPreviewBatches.map((batch) => (
                <group key={`${batch.id}:${batch.color}:${batch.opacity}`}>
                    {batch.shafts.length > 0 && (
                        <InstancedShaftGroup
                            shafts={batch.shafts}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                            radialSegments={BATCHED_SHAFT_RADIAL_SEGMENTS}
                        />
                    )}
                    {batch.taperedShafts.map((seg) => {
                        const startVec = new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z);
                        const endVec = new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z);
                        const length = startVec.distanceTo(endVec);
                        if (length < 0.001) return null;
                        const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
                        const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
                        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                        return (
                            <mesh key={`tapered-shaft:${batch.id}:${seg.id}`} position={[midpoint.x, midpoint.y, midpoint.z]} quaternion={quat}>
                                <cylinderGeometry args={[seg.diameterEnd / 2, seg.diameterStart / 2, length, BATCHED_SHAFT_RADIAL_SEGMENTS]} />
                                <meshStandardMaterial
                                    color={batch.color}
                                    emissive={batch.color}
                                    emissiveIntensity={0.08}
                                    transparent
                                    opacity={batch.opacity}
                                />
                            </mesh>
                        );
                    })}
                    {batch.disks.map((disk) => {
                        const thickness = disk.diskLengthOverride ?? calculateDiskThickness(disk.surfaceNormal, disk.coneAxis, disk.profile);
                        const center = getDiskCenter(disk.pos, disk.surfaceNormal, thickness);
                        const rotation = getDiskRotation(disk.surfaceNormal);
                        const radius = disk.contactDiameterMm / 2;
                        return (
                            <group key={`preview-disk:${batch.id}:${disk.id}`} position={[center.x, center.y, center.z]} quaternion={rotation}>
                                <mesh position={[0, 0, 0]}>
                                    <cylinderGeometry args={[radius, radius, thickness, BATCHED_SHAFT_RADIAL_SEGMENTS]} />
                                    <meshStandardMaterial
                                        color={batch.color}
                                        emissive={batch.color}
                                        emissiveIntensity={0.08}
                                        transparent
                                        opacity={batch.opacity}
                                    />
                                </mesh>
                                <mesh position={[0, thickness / 2, 0]}>
                                    <sphereGeometry args={[radius, BATCHED_JOINT_WIDTH_SEGMENTS, BATCHED_JOINT_HEIGHT_SEGMENTS]} />
                                    <meshStandardMaterial
                                        color={batch.color}
                                        emissive={batch.color}
                                        emissiveIntensity={0.08}
                                        transparent
                                        opacity={batch.opacity}
                                    />
                                </mesh>
                            </group>
                        );
                    })}
                    {batch.joints.length > 0 && (
                        <InstancedJointGroup
                            joints={batch.joints}
                            color={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? '#00ff00'
                                    : batch.color
                            }
                            emissive={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? '#00ff00'
                                    : batch.color
                            }
                            emissiveIntensity={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? 0.5
                                    : 0.08
                            }
                            transparent
                            opacity={
                                batch.id === 'placement-preview:leaf' && (sproutParentingLockHeld || leafStage === 'awaitingSproutTip')
                                    ? 0.70
                                    : batch.opacity
                            }
                            widthSegments={BATCHED_JOINT_WIDTH_SEGMENTS}
                            heightSegments={BATCHED_JOINT_HEIGHT_SEGMENTS}
                        />
                    )}
                    {batch.roots.length > 0 && (
                        <InstancedRootsGroup
                            roots={batch.roots}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                        />
                    )}
                    {batch.cones.length > 0 && (
                        <InstancedContactConeGroup
                            cones={batch.cones}
                            color={batch.color}
                            emissive={batch.color}
                            emissiveIntensity={0.08}
                            transparent
                            opacity={batch.opacity}
                        />
                    )}
                </group>
            ))}

            {hoveredSupportOverlayShafts.length > 0 && hoveredSupportShaftSet && (
                <InstancedShaftGroup
                    key={`scene-hover-overlay:${hoveredSupportShaftSet.supportId}:${hoveredSupportOverlayShafts.length}`}
                    shafts={hoveredSupportOverlayShafts}
                    color={dimNonSelected ? '#666666' : resolveBaseColor(hoveredSupportShaftSet.modelId)}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    radialSegments={BATCHED_SHAFT_RADIAL_SEGMENTS}
                    onShaftClick={isPointerInteractable ? handleSceneBatchedShaftClick : undefined}
                    onShaftPointerMove={isPointerInteractable ? handleSceneBatchedShaftPointerMove : undefined}
                    onShaftPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {hoveredSupportOverlayCones.length > 0 && hoveredSupportConeSet && (
                <InstancedContactConeGroup
                    key={`scene-cone-hover-overlay:${hoveredSupportConeSet.supportId}:${hoveredSupportOverlayCones.length}`}
                    cones={hoveredSupportOverlayCones}
                    color={dimNonSelected ? '#666666' : resolveBaseColor(hoveredSupportConeSet.modelId)}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    onConeClick={isPointerInteractable ? handleSceneBatchedConeClick : undefined}
                    onConePointerMove={isPointerInteractable ? handleSceneBatchedConePointerMove : undefined}
                    onConePointerOut={isPointerInteractable ? handleSceneBatchedConePointerOut : undefined}
                />
            )}

            {!simpleRender && hoveredSupportOverlayJoints.length > 0 && hoveredSupportJointSet && (
                <InstancedJointGroup
                    key={`scene-joint-hover-overlay:${hoveredSupportJointSet.supportId}:${hoveredSupportOverlayJoints.length}`}
                    joints={hoveredSupportOverlayJoints}
                    color={dimNonSelected ? '#666666' : resolveBaseColor(hoveredSupportJointSet.modelId)}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    widthSegments={BATCHED_JOINT_WIDTH_SEGMENTS}
                    heightSegments={BATCHED_JOINT_HEIGHT_SEGMENTS}
                    onJointClick={isPointerInteractable ? handleSceneBatchedJointClick : undefined}
                    onJointPointerMove={isPointerInteractable ? handleSceneBatchedJointPointerMove : undefined}
                    onJointPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {!simpleRender && hoveredSupportOverlayRoots.length > 0 && (
                <InstancedRootsGroup
                    key={`scene-root-hover-overlay:${hoveredSupportOverlayRoots.map((root) => root.supportId ?? root.id).join(':')}:${hoveredSupportOverlayRoots.length}`}
                    roots={hoveredSupportOverlayRoots}
                    color={dimNonSelected ? '#666666' : resolveBaseColor(hoveredSupportOverlayRoots[0]?.modelId)}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    onRootClick={isPointerInteractable ? handleSceneBatchedRootClick : undefined}
                    onRootPointerMove={isPointerInteractable ? handleSceneBatchedRootPointerMove : undefined}
                    onRootPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {marqueeHoveredOverlayShafts.length > 0 && (
                <InstancedShaftGroup
                    key={`scene-marquee-overlay-shafts:${marqueeHoveredSupportIds.join(':')}:${marqueeHoveredOverlayShafts.length}`}
                    shafts={marqueeHoveredOverlayShafts}
                    color={BULK_MULTI_SELECTED_COLOR}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    radialSegments={BATCHED_SHAFT_RADIAL_SEGMENTS}
                    onShaftClick={isPointerInteractable ? handleSceneBatchedShaftClick : undefined}
                    onShaftPointerMove={isPointerInteractable ? handleSceneBatchedShaftPointerMove : undefined}
                    onShaftPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {marqueeHoveredOverlayCones.length > 0 && (
                <InstancedContactConeGroup
                    key={`scene-marquee-overlay-cones:${marqueeHoveredSupportIds.join(':')}:${marqueeHoveredOverlayCones.length}`}
                    cones={marqueeHoveredOverlayCones}
                    color={BULK_MULTI_SELECTED_COLOR}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    onConeClick={isPointerInteractable ? handleSceneBatchedConeClick : undefined}
                    onConePointerMove={isPointerInteractable ? handleSceneBatchedConePointerMove : undefined}
                    onConePointerOut={isPointerInteractable ? handleSceneBatchedConePointerOut : undefined}
                />
            )}

            {!simpleRender && marqueeHoveredOverlayJoints.length > 0 && (
                <InstancedJointGroup
                    key={`scene-marquee-overlay-joints:${marqueeHoveredSupportIds.join(':')}:${marqueeHoveredOverlayJoints.length}`}
                    joints={marqueeHoveredOverlayJoints}
                    color={BULK_MULTI_SELECTED_COLOR}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    widthSegments={BATCHED_JOINT_WIDTH_SEGMENTS}
                    heightSegments={BATCHED_JOINT_HEIGHT_SEGMENTS}
                    onJointClick={isPointerInteractable ? handleSceneBatchedJointClick : undefined}
                    onJointPointerMove={isPointerInteractable ? handleSceneBatchedJointPointerMove : undefined}
                    onJointPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {!simpleRender && marqueeHoveredOverlayRoots.length > 0 && (
                <InstancedRootsGroup
                    key={`scene-marquee-overlay-roots:${marqueeHoveredSupportIds.join(':')}:${marqueeHoveredOverlayRoots.length}`}
                    roots={marqueeHoveredOverlayRoots}
                    color={BULK_MULTI_SELECTED_COLOR}
                    emissive="#ffffff"
                    emissiveIntensity={0.12}
                    transparent={ghostTransparent}
                    opacity={ghostOpacityClamped}
                    onRootClick={isPointerInteractable ? handleSceneBatchedRootClick : undefined}
                    onRootPointerMove={isPointerInteractable ? handleSceneBatchedRootPointerMove : undefined}
                    onRootPointerOut={isPointerInteractable ? handleSceneBatchedShaftPointerOut : undefined}
                />
            )}

            {renderTrunkList.map(trunk => {
                if (!isModelVisible(trunk.modelId, trunk.id)) return null;
                const root = state.roots[trunk.rootId];
                if (!root) return null;

                const effectiveSelected = selectedTrunkIds.has(trunk.id);
                const renderDetailedTrunk = effectiveSelected && !simpleRender;
                if (!renderDetailedTrunk) return null;

                const isTrunkHovered = hoveredSupportIdForVisual === trunk.id
                    || marqueeHoveredSupportIdSet.has(trunk.id);
                const deferTrunkInteractionToSceneBatch = !effectiveSelected;

                return (
                    // noClipping: this trunk is actively selected/edited â€” exempt it
                    // from cross-section clipping so it always renders fully visible.
                    <group key={trunk.id} userData={{ noClipping: true }}>
                    <TrunkRenderer
                        key={trunk.id}
                        trunk={trunk}
                        root={root}
                        {...sharedRenderProps('trunk', trunk, effectiveSelected, isTrunkHovered)}
                        deferStraightShaftsToSceneBatch={!effectiveSelected}
                        deferInteractionToSceneBatch={deferTrunkInteractionToSceneBatch}
                        deferRootsToSceneBatch={!effectiveSelected}
                        deferContactConesToSceneBatch={!effectiveSelected && !!trunk.contactCone}
                        hidePlateContactPrimitives={hidePlateContactPrimitivesEffective}
                    />
                    </group>
                );
            })}

            {/* Render Branches */}
            {renderSceneBatchedShafts('branch', sceneBatchedBranchShaftGroups)}

            {renderBranchList.map(branch => {
                if (!isModelVisible(branch.modelId, branch.id)) return null;
                const knot = renderKnotsById[branch.parentKnotId];
                if (!knot) return null;
                const effectiveSelected = selectedBranchIds.has(branch.id);
                const renderDetailedBranch = effectiveSelected && !simpleRender;
                if (!renderDetailedBranch) return null;

                const isBranchHovered = hoveredSupportIdForVisual === branch.id
                    || marqueeHoveredSupportIdSet.has(branch.id);
                const deferBranchInteractionToSceneBatch = !effectiveSelected;
                const showKnots = simpleRender ? false : (!hideUnselectedKnots || effectiveSelected);

                return (
                    <group key={branch.id} userData={{ noClipping: true }}>
                    <BranchRenderer
                        key={branch.id}
                        branch={branch}
                        parentKnot={knot}
                        {...sharedRenderProps('branch', branch, effectiveSelected, isBranchHovered)}
                        showKnots={showKnots}
                        deferStraightShaftsToSceneBatch={!effectiveSelected}
                        deferInteractionToSceneBatch={deferBranchInteractionToSceneBatch}
                        deferContactConesToSceneBatch={!effectiveSelected && !!branch.contactCone}
                    />
                    </group>
                );
            })}

            {/* Render Leaves */}
            {renderLeafList.map(leaf => {
                if (!isModelVisible(leaf.modelId, leaf.id)) return null;
                const knot = renderKnotsById[leaf.parentKnotId];
                if (!knot) return null;

                const effectiveSelected = selectedLeafIds.has(leaf.id);
                // Only the selected leaf mounts LeafRenderer. Unselected
                // leaves are fully scene-batched: cones via
                // deferContactConesToSceneBatch, base knots via
                // leafJointsBySupport → sceneBatchedJointGroups (the junction
                // ball stays visible without a per-leaf KnotRenderer).
                if (!effectiveSelected) return null;
                const showKnots = !simpleRender;

                return (
                    <group key={leaf.id} userData={{ noClipping: true }}>
                    <LeafRenderer
                        key={leaf.id}
                        leaf={leaf}
                        parentKnot={knot}
                        selectedId={selectedId}
                        isSelected={effectiveSelected}
                        dimNonSelected={dimNonSelected}
                        baseColor={resolveDetailSupportColor('leaf', leaf.id, leaf.modelId)}
                        showKnots={showKnots}
                        suppressHover={suppressHover}
                        isInteractable={isInteractable}
                        deferContactConesToSceneBatch={!effectiveSelected && !!leaf.contactCone}
                    />
                    </group>
                );
            })}

            {/* Render Twigs.
             *
             * Unlike Trunks/Branches, twigs always mount TwigRenderer (even
             * when scene-batched), because the contact disks and joints have
             * no scene-batched equivalent and would otherwise vanish for
             * unselected twigs. TwigRenderer defers its shafts to the
             * scene batch via deferStraightShaftsToSceneBatch.
             */}
            {renderTwigList.map(twig => {
                if (!isModelVisible(twig.modelId, twig.id)) return null;
                const effectiveSelected = selectedTwigIds.has(twig.id);
                const isTwigBatchable = twigShaftsBySupport.has(twig.id);

                const isTwigHovered = hoveredSupportIdForVisual === twig.id
                    || marqueeHoveredSupportIdSet.has(twig.id);
                const deferTwigInteractionToSceneBatch = !effectiveSelected && isTwigBatchable;

                return (
                    <group key={twig.id} userData={{ noClipping: effectiveSelected }}>
                    <TwigRenderer
                        key={twig.id}
                        twig={twig}
                        {...sharedRenderProps('twig', twig, effectiveSelected, isTwigHovered)}
                        deferStraightShaftsToSceneBatch={!effectiveSelected && isTwigBatchable}
                        deferInteractionToSceneBatch={deferTwigInteractionToSceneBatch}
                    />
                    </group>
                );
            })}

            {renderSceneBatchedShafts('twig', sceneBatchedTwigShaftGroups)}
            {/* Render Sticks */}
            {renderStickList.map(stick => {
                if (!isModelVisible(stick.modelId, stick.id)) return null;
                const effectiveSelected = selectedStickIds.has(stick.id);
                const isStickBatchable = stickShaftsBySupport.has(stick.id);
                const renderDetailedStick = (effectiveSelected || !isStickBatchable) && !simpleRender;
                if (!renderDetailedStick) return null;

                const isStickHovered = hoveredSupportIdForVisual === stick.id
                    || marqueeHoveredSupportIdSet.has(stick.id);
                const deferStickInteractionToSceneBatch = !effectiveSelected && isStickBatchable;

                return (
                    <group key={stick.id} userData={{ noClipping: effectiveSelected }}>
                    <StickRenderer
                        key={stick.id}
                        stick={stick}
                        {...sharedRenderProps('stick', stick, effectiveSelected, isStickHovered)}
                        deferStraightShaftsToSceneBatch={!effectiveSelected && isStickBatchable}
                        deferInteractionToSceneBatch={deferStickInteractionToSceneBatch}
                        deferContactConesToSceneBatch={!effectiveSelected}
                    />
                    </group>
                );
            })}

            {renderSceneBatchedShafts('stick', sceneBatchedStickShaftGroups)}

            {/* Render Braces */}
            {renderSceneBatchedShafts('brace', sceneBatchedBraceShaftGroups, { detailedOnly: true })}

            {!simpleRender && renderBraceList.map(brace => {
                if (!isModelVisible(brace.modelId, brace.id)) return null;
                const effectiveSelected = selectedBraceIds.has(brace.id);
                const isBraceBatchable = braceShaftsBySupport.has(brace.id);
                const isBraceGhosted = ghostedBraceIdSet.has(brace.id);
                const renderDetailedBrace = effectiveSelected || !isBraceBatchable || isBraceGhosted;
                if (!renderDetailedBrace) return null;

                const isBraceHovered = hoveredSupportIdForVisual === brace.id
                    || marqueeHoveredSupportIdSet.has(brace.id);
                const deferBraceInteractionToSceneBatch = !effectiveSelected && isBraceBatchable;
                const showKnots = !hideUnselectedKnots || effectiveSelected;
                const braceStartKnot = braceRenderKnotsById[brace.startKnotId];
                const braceEndKnot = braceRenderKnotsById[brace.endKnotId];
                if (!braceStartKnot || !braceEndKnot) return null;

                return (
                    <group key={brace.id} userData={{ noClipping: effectiveSelected }}>
                        <BraceRenderer
                            key={brace.id}
                            brace={brace}
                            startKnot={braceStartKnot}
                            endKnot={braceEndKnot}
                            isSelected={effectiveSelected}
                            ghosted={isBraceGhosted}
                            ghostOpacity={ghostOpacityClamped}
                            dimNonSelected={dimNonSelected}
                            baseColor={resolveBaseColor(brace.modelId)}
                            showKnots={showKnots}
                            suppressHover={suppressHover || isBraceGhosted}
                            isHovered={isBraceHovered}
                            isInteractable={isInteractable && !isBraceGhosted}
                            deferStraightShaftToSceneBatch={!effectiveSelected && isBraceBatchable && !isBraceGhosted}
                            deferInteractionToSceneBatch={deferBraceInteractionToSceneBatch || isBraceGhosted}
                            debugSectionColors={settings.autoBracing.debugSectionColorsEnabled}
                        />
                    </group>
                );
            })}
            {/* Render Kickstands */}
            {renderKickstandList.map((kickstand) => {
                if (!isModelVisible(kickstand.modelId, kickstand.id)) return null;
                const root = kickstandState.roots[kickstand.rootId];
                const hostKnot = renderKickstandKnotsById[kickstand.hostKnotId];
                if (!root || !hostKnot) return null;

                const effectiveSelected = selectedKickstandIds.has(kickstand.id);
                const isKickstandBatchable = kickstandShaftsBySupport.has(kickstand.id);
                const renderDetailedKickstand = (effectiveSelected || !isKickstandBatchable) && !simpleRender;
                if (!renderDetailedKickstand) return null;

                const isKickstandHovered = hoveredSupportIdForVisual === kickstand.id
                    || marqueeHoveredSupportIdSet.has(kickstand.id);
                const deferKickstandInteractionToSceneBatch = !effectiveSelected && isKickstandBatchable;
                const showKnot = simpleRender ? false : (!hideUnselectedKnots || effectiveSelected);

                return (
                    <group key={kickstand.id} userData={{ noClipping: effectiveSelected }}>
                    <KickstandRenderer
                        key={kickstand.id}
                        kickstand={kickstand}
                        root={root}
                        hostKnot={hostKnot}
                        isSelected={effectiveSelected}
                        selectedId={effectiveSelected ? selectedId : null}
                        dimNonSelected={dimNonSelected}
                        isHovered={isKickstandHovered}
                        baseColor={resolveBaseColor(kickstand.modelId)}
                        showKnot={showKnot}
                        suppressHover={suppressHover}
                        isInteractable={isInteractable}
                        deferStraightShaftsToSceneBatch={!effectiveSelected && isKickstandBatchable}
                        deferInteractionToSceneBatch={deferKickstandInteractionToSceneBatch}
                        hidePlateContactPrimitives={hidePlateContactPrimitivesEffective}
                    />
                    </group>
                );
            })}

            {renderSceneBatchedShafts('kickstand', sceneBatchedKickstandShaftGroups)}
            {/* Render Anchors */}
            {renderAnchorList.map(anchor => {
                if (!isModelVisible(anchor.modelId, anchor.id)) return null;
                const effectiveSelected = selectedAnchorIds.has(anchor.id);
                const isAnchorHovered = hoveredSupportIdForVisual === anchor.id
                    || marqueeHoveredSupportIdSet.has(anchor.id);

                return (
                    <group key={anchor.id}>
                    <AnchorRenderer
                        key={anchor.id}
                        anchor={anchor}
                        {...sharedRenderProps('anchor', anchor, effectiveSelected, isAnchorHovered)}
                    />
                    </group>
                );
            })}

            {/*
              Auto-bracing debug overlay mount point.
              - This only renders Voronoi seed indicators when the auto-bracing debug toggle is enabled.
              - Core support rendering does not depend on these markers.
              - If needed later, this block can be safely commented out or removed.
            */}
            <VoronoiSeedDebugMarkers
                enabled={!!settings.autoBracing.debugVoronoiSeedsEnabled}
                ghostRenderOrder={ghostRenderOrder}
                isModelVisible={isModelVisible}
                applyDropToVec3Like={applyDropToVec3Like}
            />
        </group>
    );
});

SupportRenderer.displayName = 'SupportRenderer';
