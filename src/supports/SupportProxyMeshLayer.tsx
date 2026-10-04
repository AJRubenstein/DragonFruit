import React from 'react';
import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { usePicking } from '@/components/picking';
import { subscribe, getSnapshot } from './state';
// Loading the generated barrel runs every type's proxy geometry registration.
import './generatedSupportRegistrations';
import { supportProxyGeometryOf, type ProxyGeometryContext } from './proxyGeometry/seam';
import { getRaftSettings, subscribeToRaftStore } from './Rafts/Crenelated/RaftState';
import { JOINT_DIAMETER_OFFSET_MM } from './constants';
import { InstancedShaftGroup, type InstancedShaft } from './SupportPrimitives/Shaft/InstancedShaftGroup';
import { InstancedRootsGroup, type InstancedRoot } from './SupportPrimitives/Roots/InstancedRootsGroup';
import { InstancedJointGroup, type InstancedJoint } from './SupportPrimitives/Joint/InstancedJointGroup';
import { InstancedContactConeGroup, type InstancedContactCone } from './SupportPrimitives/ContactCone/InstancedContactConeGroup';
import { emitSupportModelPointerHover } from './interaction/clickHandlers';
import { bezierSegmentToBatchedShaft } from './Curves/batchedBezierShaft';
import type { Segment, SupportState, Vec3 } from './types';
import { MARQUEE_CANDIDATE_TINT_FACTOR } from '@/utils/marqueeCandidateTint';
import {
    anyContactMatches,
    contactEndpointsFor,
    SUPPORT_TYPES,
    type SupportTypeId,
} from './supportTypeRegistry';

interface SupportProxyMeshLayerProps {
  mode?: 'prepare' | 'analysis' | 'support' | 'export' | 'printing';
  clipLower?: number | null;
  clipUpper?: number | null;
  supportColorsByModelId?: Record<string, string>;
  activeModelId?: string | null;
  selectedModelIds?: string[];
  /** Models the marquee would take if the drag ended now. */
  marqueeCandidateModelIds?: readonly string[];
  hoverModelId?: string | null;
  hoverTintColor?: string;
  hoverTintStrength?: number;
  modelFilterId?: string | null;
  excludeModelId?: string | null;
  excludeModelIds?: string[];
  modelDropOffsetsById?: Record<string, number>;
  ghostOpacity?: number;
  showOutOfBoundsOverlay?: boolean;
  outOfBoundsMin?: THREE.Vector3 | null;
  outOfBoundsMax?: THREE.Vector3 | null;
  outOfBoundsStripeColor?: string;
  onModelPointerSelect?: (modelId: string) => void;
  /** In Select mode, a pointer-down on a support proxy reports a potential
   *  model XY-drag start (model + screen coords). The scene owns the drag. */
  onModelPointerDragStart?: (modelId: string, clientX: number, clientY: number) => void;
  enablePointerSelection?: boolean;
  includeDetailedPrimitives?: boolean;
  /** When true, only show supports whose contact points touch the cavity mesh. */
  interiorView?: boolean;
  /** Cavity mesh geometry keyed by modelId, used for interior support filtering. */
  cavityGeometryByModelId?: Map<string, THREE.BufferGeometry>;
  /**
   * World-to-local inverse matrices per modelId. Needed to transform support
   * contact positions (world space) into the cavity geometry's local space
   * for accurate BVH closest-point queries.
   */
  modelWorldInverseById?: Map<string, THREE.Matrix4>;
}

const DEFAULT_SUPPORT_COLOR = '#9a9a9a';
const ACTIVE_SUPPORT_COLOR = '#c8752a';
const EMPTY_MARQUEE_CANDIDATES: readonly string[] = Object.freeze([]);
const PROXY_JOINT_DIAMETER_BLEND_MM = JOINT_DIAMETER_OFFSET_MM * 0.75;
/** Grown by this much, so a box still catches a support a hair outside its bounds. */
const PROXY_HOVER_BOX_MARGIN_MM = 0.5;
/** The hover tint's glow. A selection has none: it is the active colour flat. */
const HOVER_EMISSIVE_INTENSITY = 0.1;

export type ProxyModelGeometry = {
  modelId?: string;
  shafts: InstancedShaft[];
  roots: InstancedRoot[];
  joints: InstancedJoint[];
  cones: InstancedContactCone[];
};

type VisibleModelEntry = {
  modelKey: string;
  modelId?: string;
  zOffset: number;
  geometry: ProxyModelGeometry;
};

type FlatProxyGeometry = {
  shafts: InstancedShaft[];
  roots: InstancedRoot[];
  joints: InstancedJoint[];
  cones: InstancedContactCone[];
};

/** One model drawn again over the base batch: a selection, or a hover tint. */
export type ProxyOverlayEntry = {
  key: string;
  modelId?: string;
  modelKey: string;
  zOffset: number;
  geometry: ProxyModelGeometry;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
};

export type ProxyOverlayInput = {
  selectedModelIds: ReadonlySet<string>;
  hoverModelId: string | null;
  marqueeCandidateModelIds: readonly string[];
  geometryByModel: ReadonlyMap<string, ProxyModelGeometry>;
  isModelVisible: (modelId?: string) => boolean;
  zOffsetByModelId?: Record<string, number>;
  selectionOpacity: number;
  hoverOpacity: number;
};

/**
 * The models drawn again on top of the base batch: the selected ones in the
 * active colour, then the hovered and marquee-candidate ones as a tint.
 *
 * A selected model is not also tinted for hover: it already reads as the
 * active one, and a marquee that takes it does not need to say so twice.
 */
export function computeProxyOverlayEntries(input: ProxyOverlayInput): ProxyOverlayEntry[] {
  const entries: ProxyOverlayEntry[] = [];

  const entryFor = (modelId: string, key: string, opacity: number, emissiveIntensity: number): ProxyOverlayEntry | null => {
    if (!input.isModelVisible(modelId)) return null;
    const modelKey = toModelKey(modelId);
    const geometry = input.geometryByModel.get(modelKey);
    if (!geometry) return null;
    return {
      key,
      modelId,
      modelKey,
      zOffset: input.zOffsetByModelId?.[modelId] ?? 0,
      geometry,
      color: ACTIVE_SUPPORT_COLOR,
      emissive: ACTIVE_SUPPORT_COLOR,
      emissiveIntensity,
      opacity,
    };
  };

  for (const modelId of input.selectedModelIds) {
    // No glow: a selected support has always been the active colour flat.
    const entry = entryFor(modelId, `selection:${toModelKey(modelId)}`, input.selectionOpacity, 0);
    if (entry) entries.push(entry);
  }

  const hoveredModelIds = new Set<string>();
  if (input.hoverModelId) hoveredModelIds.add(input.hoverModelId);
  for (const modelId of input.marqueeCandidateModelIds) hoveredModelIds.add(modelId);

  for (const modelId of hoveredModelIds) {
    if (input.selectedModelIds.has(modelId)) continue;
    // A candidate tints lighter than a hover, so a marquee lighting up model,
    // supports and raft at once still reads apart from a selection.
    const opacity = modelId === input.hoverModelId
      ? input.hoverOpacity
      : input.hoverOpacity * MARQUEE_CANDIDATE_TINT_FACTOR;
    const entry = entryFor(modelId, `hover:${toModelKey(modelId)}`, opacity, HOVER_EMISSIVE_INTENSITY);
    if (entry) entries.push(entry);
  }

  return entries;
}

/**
 * One hover target per model, standing in for the model's proxy primitives.
 *
 * R3F raycasts every instance of every mesh carrying a pointer handler, so
 * hovering the instanced batches costs O(supports) per pointer move — 13 ms at
 * 20k supports. Hover only ever resolves a model id, so a box around that
 * model's support volume answers the same question at O(models). Clicks keep
 * their per-instance targets: R3F filters non-hover handlers out of the
 * pointer-move raycast, so they are only paid once per click.
 */
type ProxyHoverBox = {
  modelKey: string;
  modelId?: string;
  position: [number, number, number];
  size: [number, number, number];
};

/** The entries `computeProxyHoverBoxes` reads, so the walk can be tested alone. */
export type ProxyHoverBoxEntry = {
  modelKey: string;
  modelId?: string;
  zOffset: number;
  geometry: ProxyModelGeometry;
};

/**
 * One hover box per entry, sized to hold every primitive that entry draws.
 *
 * A box that misses a primitive is a support you cannot hover, so the walk
 * takes the shaft ends and bezier control points, the roots, the joints and the
 * cones — everything the batches draw.
 */
export function computeProxyHoverBoxes(entries: readonly ProxyHoverBoxEntry[]): ProxyHoverBox[] {
  const boxes: ProxyHoverBox[] = [];
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();

  const include = (value: Vec3) => bounds.expandByPoint(point.set(value.x, value.y, value.z));

  for (const entry of entries) {
    bounds.makeEmpty();

    for (const shaft of entry.geometry.shafts) {
      include(shaft.start);
      include(shaft.end);
      if (shaft.controlPoint1) include(shaft.controlPoint1);
      if (shaft.controlPoint2) include(shaft.controlPoint2);
    }
    for (const root of entry.geometry.roots) include(root.basePos);
    for (const joint of entry.geometry.joints) include(joint.pos);
    for (const cone of entry.geometry.cones) include(cone.pos);

    if (bounds.isEmpty()) continue;
    bounds.expandByScalar(PROXY_HOVER_BOX_MARGIN_MM);

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    boxes.push({
      modelKey: entry.modelKey,
      modelId: entry.modelId,
      position: [center.x, center.y, center.z + entry.zOffset],
      // A flat model can give a zero extent on one axis; a box needs volume.
      size: [Math.max(size.x, 0.2), Math.max(size.y, 0.2), Math.max(size.z, 0.2)],
    });
  }

  return boxes;
}

type SharedProxyCacheEntry = {
  /** The one input the walk reads, so one identity covers every collection. */
  supportStateRef: SupportState;
  hasSolidBottom: boolean;
  raftThickness: number;
  includeDetailedPrimitives: boolean;
  interiorSupportIdSet: Set<string> | null;
  baseProxyByModel: Map<string, ProxyModelGeometry>;
};

let sharedProxyCache: SharedProxyCacheEntry | null = null;

const MODEL_NONE_KEY = '__none__';

function toModelKey(modelId?: string): string {
  return modelId ?? MODEL_NONE_KEY;
}

function fromModelKey(modelKey: string): string | undefined {
  return modelKey === MODEL_NONE_KEY ? undefined : modelKey;
}


/** An interior-support id: the entity's `typeId`, a colon, then its own id. */
function interiorIdPrefix(entity: { typeId?: SupportTypeId }): string {
    return `${entity.typeId}:`;
}

/** The key an entity contributes to, and looks itself up under. */
function interiorSupportKey(entity: { id: string; typeId?: SupportTypeId }): string {
    return `${interiorIdPrefix(entity)}${entity.id}`;
}

/**
 * Which supports the interior (cavity) view draws. A `plateRoot` type is
 * skipped; any interior contact qualifies; a shaft is tested along its length
 * only when it starts at a knot. Predicates are injected to keep this pure.
 */
export function interiorSupportIds(
    state: SupportState,
    isContactInterior: (contact: unknown, modelId?: string) => boolean,
    areSegmentsInterior: (segments: readonly Segment[], modelId?: string) => boolean,
): Set<string> {
    const ids = new Set<string>();

    for (const descriptor of SUPPORT_TYPES) {
        // Rooted in the plate: never inside a cavity.
        if (descriptor.lower.kind === 'plateRoot') continue;
        if (contactEndpointsFor(descriptor.id).length === 0) continue;

        const collection = state[descriptor.location.key] as unknown as
            Record<string, { id: string; typeId?: SupportTypeId; modelId?: string; segments?: Segment[] }> | undefined;

        for (const entity of Object.values(collection ?? {})) {
            const key = interiorSupportKey(entity);
            if (anyContactMatches(descriptor.id, entity, (contact) => isContactInterior(contact, entity.modelId))) {
                ids.add(key);
                continue;
            }
            if (descriptor.lower.kind === 'knot'
                && descriptor.hasSegments
                && areSegmentsInterior(entity.segments ?? [], entity.modelId)) {
                ids.add(key);
            }
        }
    }

    return ids;
}

/** Every proxy primitive the layer draws, grouped by model. Geometry only. */
export function collectProxyPrimitives(
    state: SupportState,
    options: {
        includeDetailedPrimitives: boolean;
        interiorSupportIdSet: Set<string> | null;
    },
): Map<string, ProxyModelGeometry> {
    const { includeDetailedPrimitives, interiorSupportIdSet } = options;

  const byModel = new Map<string, ProxyModelGeometry>();
  const segmentModelIdById = new Map<string, string | undefined>();
  const segmentSupportIdById = new Map<string, string | undefined>();
  const seenJointKeysByModel = new Map<string, Set<string>>();
  const seenConeKeysByModel = new Map<string, Set<string>>();

  const ensureModel = (modelId?: string): ProxyModelGeometry => {
    const key = toModelKey(modelId);
    let existing = byModel.get(key);
    if (!existing) {
      existing = { modelId, shafts: [], roots: [], joints: [], cones: [] };
      byModel.set(key, existing);
    }
    return existing;
  };

  const ensureJointSeenSet = (modelId?: string): Set<string> => {
    const key = toModelKey(modelId);
    const existing = seenJointKeysByModel.get(key);
    if (existing) return existing;
    const created = new Set<string>();
    seenJointKeysByModel.set(key, created);
    return created;
  };

  const ensureConeSeenSet = (modelId?: string): Set<string> => {
    const key = toModelKey(modelId);
    const existing = seenConeKeysByModel.get(key);
    if (existing) return existing;
    const created = new Set<string>();
    seenConeKeysByModel.set(key, created);
    return created;
  };

  const registerSegmentMeta = (segmentId: string, modelId?: string, supportId?: string) => {
    segmentModelIdById.set(segmentId, modelId);
    segmentSupportIdById.set(segmentId, supportId);
  };

  const pushShaft = (shaft: InstancedShaft) => {
    ensureModel(shaft.modelId).shafts.push(shaft);
    registerSegmentMeta(shaft.id, shaft.modelId, shaft.supportId);
  };

  // Curved segments become batched-shaft entries, drawn as capped tubes. The
  // unscoped STL/3MF export serializes this layer's scene graph, so curves must
  // be visible here too.
  const pushSegmentShafts = (segment: Segment, start: Vec3, end: Vec3, supportId: string, modelId?: string) => {
    if (segment.type === 'bezier') {
      pushShaft(bezierSegmentToBatchedShaft(segment, start, end, supportId, modelId));
      return;
    }
    pushShaft({
      id: segment.id,
      supportId,
      modelId,
      start,
      end,
      diameter: segment.diameter,
    });
  };

  const pushRoot = (root: InstancedRoot) => {
    const effectiveDiskHeight = Math.max(0.001, root.effectiveDiskHeight);
    const verticalOffset = 0;

    ensureModel(root.modelId).roots.push({
      ...root,
      basePos: {
        x: root.basePos.x,
        y: root.basePos.y,
        z: root.basePos.z + verticalOffset,
      },
      effectiveDiskHeight,
    });
  };

  const pushJoint = (joint: InstancedJoint, dedupeKey?: string, diameterBlendMm: number = PROXY_JOINT_DIAMETER_BLEND_MM) => {
    const seen = ensureJointSeenSet(joint.modelId);
    const key = dedupeKey ?? joint.id;
    if (seen.has(key)) return;
    seen.add(key);
    ensureModel(joint.modelId).joints.push({
      ...joint,
      diameter: Math.max(0.001, joint.diameter - diameterBlendMm),
    });
  };

  const pushCone = (cone: InstancedContactCone, dedupeKey?: string) => {
    const seen = ensureConeSeenSet(cone.modelId);
    const key = dedupeKey ?? cone.id;
    if (seen.has(key)) return;
    seen.add(key);
    ensureModel(cone.modelId).cones.push(cone);
  };

  const context: ProxyGeometryContext = {
    state,
    includeDetailedPrimitives,
    pushShaft,
    pushSegmentShafts,
    pushRoot,
    pushJoint,
    pushCone,
  };

  // One walk over every type, each emitting its own registered recipe.
  for (const descriptor of SUPPORT_TYPES) {
    const registered = supportProxyGeometryOf(descriptor.id);
    if (!registered) continue;
    if (registered.registration.detailedOnly && !includeDetailedPrimitives) continue;
    if (registered.registration.skipInInteriorView && interiorSupportIdSet) continue;

    const entities = state[descriptor.location.key] as unknown as
      | Record<string, { id: string; typeId?: SupportTypeId }>
      | undefined;
    for (const entity of Object.values(entities ?? {})) {
      if (interiorSupportIdSet && !interiorSupportIdSet.has(interiorSupportKey(entity))) continue;
      registered.build(entity as never, context);
    }
  }


  return byModel;
}

export function SupportProxyMeshLayer({
  mode,
  clipLower,
  clipUpper,
  activeModelId = null,
  selectedModelIds = [],
  marqueeCandidateModelIds = EMPTY_MARQUEE_CANDIDATES,
  hoverModelId = null,
  hoverTintColor = '#d18a4a',
  hoverTintStrength = 0.35,
  modelFilterId = null,
  excludeModelId = null,
  excludeModelIds = [],
  modelDropOffsetsById,
  ghostOpacity = 1,
  showOutOfBoundsOverlay = false,
  outOfBoundsMin = null,
  outOfBoundsMax = null,
  outOfBoundsStripeColor,
  onModelPointerSelect,
  onModelPointerDragStart,
  enablePointerSelection = true,
  includeDetailedPrimitives = true,
  interiorView = false,
  cavityGeometryByModelId,
  modelWorldInverseById,
}: SupportProxyMeshLayerProps) {
  // usePicking() causes a re-render on every pointer-move frame — only
  // subscribe when pointer interactions are enabled (prepare mode). In
  // other modes, the hit data is unused but still cost us re-renders.
  const { hit } = usePicking();
  const hitCategoryRef = React.useRef(hit.category);
  hitCategoryRef.current = hit.category;
  const supportState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const raftSettings = useSyncExternalStore(subscribeToRaftStore, getRaftSettings, getRaftSettings);

  // The walk reads the state itself, so the snapshot is the only identity needed.
  const hasSolidBottom = raftSettings.bottomMode === 'solid';
  const raftThickness = raftSettings.thickness ?? 0;

  const excludedModelIdSet = React.useMemo(
    () => new Set(excludeModelIds.filter((id): id is string => Boolean(id))),
    [excludeModelIds],
  );
  const lastSupportHoverModelIdRef = React.useRef<string | null>(null);
  const hoverClearRafRef = React.useRef<number | null>(null);

  const resolveModelVisible = React.useCallback((modelId?: string) => {
    if (modelFilterId && modelId !== modelFilterId) return false;
    if (excludeModelId && modelId === excludeModelId) return false;
    if (modelId && excludedModelIdSet.has(modelId)) return false;
    return true;
  }, [excludedModelIdSet, excludeModelId, modelFilterId]);

  const clippingPlanes = React.useMemo(() => {
    const planes: THREE.Plane[] = [];
    if (clipLower != null) planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipLower));
    if (clipUpper != null) planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), clipUpper));
    return planes.length > 0 ? planes : null;
  }, [clipLower, clipUpper]);

  const outOfBoundsMaterial = React.useMemo(() => {
    if (!showOutOfBoundsOverlay || !outOfBoundsMin || !outOfBoundsMax) return null;

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        boundsMin: { value: outOfBoundsMin.clone() },
        boundsMax: { value: outOfBoundsMax.clone() },
        stripeFreq: { value: 0.22 },
        stripeAlpha: { value: 0.42 },
        stripeColor: { value: new THREE.Color(outOfBoundsStripeColor ?? '#b6ff2e') },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 boundsMin;
        uniform vec3 boundsMax;
        uniform float stripeFreq;
        uniform float stripeAlpha;
        uniform vec3 stripeColor;

        void main() {
          bool outside =
            vWorldPos.x < boundsMin.x || vWorldPos.x > boundsMax.x ||
            vWorldPos.y < boundsMin.y || vWorldPos.y > boundsMax.y ||
            vWorldPos.z < boundsMin.z || vWorldPos.z > boundsMax.z;

          if (!outside) discard;

          float stripeSeed = (vWorldPos.x + vWorldPos.y + vWorldPos.z) * stripeFreq;
          float band = step(0.5, fract(stripeSeed));
          vec3 colorA = stripeColor;
          vec3 colorB = vec3(1.0, 1.0, 1.0);
          vec3 color = mix(colorA, colorB, band);

          gl_FragColor = vec4(color, stripeAlpha);
        }
      `,
    });
  }, [outOfBoundsMax, outOfBoundsMin, outOfBoundsStripeColor, showOutOfBoundsOverlay]);

  React.useEffect(() => {
    return () => {
      outOfBoundsMaterial?.dispose();
    };
  }, [outOfBoundsMaterial]);

  // ── Interior support filtering ────────────────────────────────────────
  // When interiorView is active, build a set of support IDs whose contact
  // points are ON the cavity mesh surface (interior supports). Exterior
  // supports contact the outer shell, which is typically 1-3mm away from
  // the cavity surface — well beyond the threshold.
  //
  // Uses three-mesh-bvh's closestPointToPoint (O(log n) per query) for
  // exact distance-to-surface measurement. The BVH is built once on the
  // cavity geometry and cached on geometry.boundsTree.
  //
  // IMPORTANT: Support contact positions are in WORLD space, while the
  // cavity geometry is in the model's LOCAL space. We use the model's
  // world-inverse matrix to transform support positions into local space
  // before the BVH query.
  const interiorSupportIdSet = React.useMemo<Set<string> | null>(() => {
    if (!interiorView || !cavityGeometryByModelId || cavityGeometryByModelId.size === 0) return null;

    const ids = new Set<string>();
    const tempVec = new THREE.Vector3();
    const queryTarget = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 } as {
      point: THREE.Vector3;
      distance: number;
      faceIndex: number;
    };

    // Build BVH on cavity geometries for O(log n) closest-point queries
    const cavityBvhByGeometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry & { boundsTree?: { closestPointToPoint: Function } }>();
    for (const [, geometry] of cavityGeometryByModelId) {
      const g = geometry as THREE.BufferGeometry & { boundsTree?: { closestPointToPoint: Function }; computeBoundsTree?: () => void };
      if (!g.boundsTree && typeof g.computeBoundsTree === 'function') {
        g.computeBoundsTree();
      }
      cavityBvhByGeometry.set(geometry, g);
    }

    // Pre-compute face normals for each cavity geometry so we can determine
    // which side of the cavity surface a point lies on.
    const faceNormalsByGeometry = new Map<THREE.BufferGeometry, Float32Array>();
    for (const [, geometry] of cavityGeometryByModelId) {
      const posAttr = geometry.getAttribute('position');
      const indexAttr = geometry.getIndex();
      if (!posAttr) continue;
      const positions = posAttr.array as Float32Array;
      const indices = indexAttr ? (indexAttr.array as Uint16Array | Uint32Array) : null;

      const triCount = indices
        ? indices.length / 3
        : posAttr.count / 3;
      const normals = new Float32Array(triCount * 3);

      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const edge1 = new THREE.Vector3();
      const edge2 = new THREE.Vector3();
      const faceNormal = new THREE.Vector3();

      for (let i = 0; i < triCount; i++) {
        const i0 = indices ? indices[i * 3] : i * 3;
        const i1 = indices ? indices[i * 3 + 1] : i * 3 + 1;
        const i2 = indices ? indices[i * 3 + 2] : i * 3 + 2;
        a.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
        b.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
        c.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
        edge1.subVectors(b, a);
        edge2.subVectors(c, a);
        faceNormal.crossVectors(edge1, edge2).normalize();
        normals[i * 3] = faceNormal.x;
        normals[i * 3 + 1] = faceNormal.y;
        normals[i * 3 + 2] = faceNormal.z;
      }
      faceNormalsByGeometry.set(geometry, normals);
    }

    /**
     * Returns true if `pos` lies on the interior side of the cavity surface
     * or is very close to it (within the shell thickness).
     *
     * Finds the closest point on the cavity mesh, then compares the vector
     * from that point to `pos` against the face normal at the closest point.
     * - dot > 0  → pos is in same direction as normal → INSIDE cavity → show
     * - dot ≤ 0 but dist < SHELL_PROXIMITY_MM → near the cavity wall → show
     * - dot ≤ 0 and dist ≥ SHELL_PROXIMITY_MM → in solid material far from cavity → hide
     *
     * This is purely local — no watertightness or raycasting required.
     */
    const isOnInteriorSide = (pos: Vec3, modelId?: string): boolean => {
      const geometry = modelId ? cavityGeometryByModelId.get(modelId) : null;
      const target = geometry ?? (cavityGeometryByModelId ? Array.from(cavityGeometryByModelId.values())[0] : null);
      if (!target) return false;
      const g = cavityBvhByGeometry.get(target);
      if (!g?.boundsTree) return false;

      tempVec.set(pos.x, pos.y, pos.z);
      if (modelId && modelWorldInverseById) {
        const inv = modelWorldInverseById.get(modelId);
        if (inv) tempVec.applyMatrix4(inv);
      }
      queryTarget.distance = Infinity;
      queryTarget.faceIndex = -1;
      const result = g.boundsTree.closestPointToPoint(tempVec, queryTarget);
      if (!result || queryTarget.faceIndex < 0) return false;

      const normals = faceNormalsByGeometry.get(target);
      if (!normals || queryTarget.faceIndex * 3 + 2 >= normals.length) return false;

      // Vector from closest cavity point → support point
      const dx = tempVec.x - queryTarget.point.x;
      const dy = tempVec.y - queryTarget.point.y;
      const dz = tempVec.z - queryTarget.point.z;

      // Face normal at closest point (outward from cavity)
      const nx = normals[queryTarget.faceIndex * 3];
      const ny = normals[queryTarget.faceIndex * 3 + 1];
      const nz = normals[queryTarget.faceIndex * 3 + 2];

      const dot = dx * nx + dy * ny + dz * nz;

      // Cavity mesh normals point INTO the cavity (marching-cubes convention).
      // dot > 0  → point is inside the cavity void → definitely show
      // dot ≤ 0  → point is in the model wall or outside.
      //   dist < 1.5mm → on/near the INTERIOR wall (cavity-facing) → show
      //   dist ≥ 1.5mm → exterior wall or far outside → hide
      const INTERIOR_WALL_THRESHOLD_MM = 1.5;
      return dot > 0 || result.distance < INTERIOR_WALL_THRESHOLD_MM;
    };

    // A contact is interior when its placement surface says so, or when an
    // unstamped one sits on the cavity side. Takes `unknown` and narrows here,
    // since the seam hands over whichever field the descriptor declared.
    const isInteriorContact = (contact: unknown, modelId?: string): boolean => {
      const c = contact as { pos?: Vec3; placementSurface?: 'interior' | 'exterior' } | null | undefined;
      if (!c?.pos) return false;
      if (c.placementSurface === 'interior') return true;
      if (c.placementSurface === 'exterior') return false;
      return isOnInteriorSide(c.pos, modelId);
    };

    // Sample a segment shaft for cavity interior crossing. Both endpoints are
    // typically outside the cavity (tip at model surface, base at raft/parent).
    // The shaft may only pass through the cavity over a short fraction of its
    // length, so we sample at 10% increments to catch narrow crossings.
    const isAnySegmentPointInterior = (
      segs: readonly Segment[],
      modelId?: string,
    ): boolean => {
      for (const seg of segs) {
        if (seg.bottomJoint?.pos && isOnInteriorSide(seg.bottomJoint.pos, modelId)) return true;
        if (seg.topJoint?.pos && isOnInteriorSide(seg.topJoint.pos, modelId)) return true;

        const a = seg.bottomJoint?.pos;
        const b = seg.topJoint?.pos;
        if (a && b) {
          for (let i = 1; i <= 9; i++) {
            const t = i / 10;
            const mid: Vec3 = {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t,
            };
            if (isOnInteriorSide(mid, modelId)) return true;
          }
        }
      }
      return false;
    };

    // See `interiorSupportIds`: the descriptor answers every question here.
    return interiorSupportIds(supportState, isInteriorContact, isAnySegmentPointInterior);
  }, [
    interiorView,
    cavityGeometryByModelId,
    modelWorldInverseById,
    supportState,
  ]);

  const baseProxyByModel = React.useMemo(() => {
    // The snapshot is replaced on any change, so it alone decides a rebuild.
    if (
      sharedProxyCache
      && sharedProxyCache.supportStateRef === supportState
      && sharedProxyCache.hasSolidBottom === hasSolidBottom
      && sharedProxyCache.raftThickness === raftThickness
      && sharedProxyCache.includeDetailedPrimitives === includeDetailedPrimitives
      && sharedProxyCache.interiorSupportIdSet === interiorSupportIdSet
    ) {
      return sharedProxyCache.baseProxyByModel;
    }

    const byModel = collectProxyPrimitives(supportState, {
      includeDetailedPrimitives,
      interiorSupportIdSet,
    });

    sharedProxyCache = {
      supportStateRef: supportState,
      hasSolidBottom,
      raftThickness,
      includeDetailedPrimitives,
      interiorSupportIdSet,
      baseProxyByModel: byModel,
    };

    return byModel;
  }, [
    supportState,
    hasSolidBottom,
    raftThickness,
    includeDetailedPrimitives,
    interiorSupportIdSet,
  ]);

  const modelEntries = React.useMemo(() => {
    if (modelFilterId) {
      const modelKey = toModelKey(modelFilterId);
      const geometry = baseProxyByModel.get(modelKey);
      return geometry ? [[modelKey, geometry] as const] : [];
    }
    return Array.from(baseProxyByModel.entries());
  }, [baseProxyByModel, modelFilterId]);

  const visibleModelEntries = React.useMemo<VisibleModelEntry[]>(() => {
    const visible: VisibleModelEntry[] = [];
    for (const [modelKey, geometry] of modelEntries) {
      const modelId = fromModelKey(modelKey);
      if (!resolveModelVisible(modelId)) continue;

      visible.push({
        modelKey,
        modelId,
        geometry,
        zOffset: modelId ? (modelDropOffsetsById?.[modelId] ?? 0) : 0,
      });
    }
    return visible;
  }, [modelEntries, resolveModelVisible, modelDropOffsetsById]);

  const highlightedModelIdSet = React.useMemo(() => {
    const ids = new Set<string>();
    for (const id of selectedModelIds) ids.add(id);
    return ids;
  }, [selectedModelIds]);

  const effectiveHoverModelId = hoverModelId;

  const proxyOpacity = Math.max(0.05, Math.min(1, ghostOpacity));
  const proxyTransparent = proxyOpacity < 0.999;
  const hoverOverlayOpacity = React.useMemo(() => {
    const hoverAlpha = Math.max(0.05, Math.min(1, hoverTintStrength));
    return Math.max(0.05, Math.min(1, proxyOpacity * hoverAlpha));
  }, [hoverTintStrength, proxyOpacity]);

  const pointerHoverEnabled = enablePointerSelection && mode === 'prepare';
  const pointerSelectionEnabled = enablePointerSelection && mode === 'prepare' && !!onModelPointerSelect;
  const pointerDragStartEnabled = enablePointerSelection && mode === 'prepare';

  const reportModelDragStart = React.useCallback((modelId: string | undefined, event: ThreeEvent<PointerEvent>) => {
    if (!pointerDragStartEnabled || !onModelPointerDragStart) return;
    if (!modelId) return;
    if (hitCategoryRef.current === 'gizmo') return;
    const native = event.nativeEvent as PointerEvent | undefined;
    if (native?.ctrlKey || native?.metaKey || native?.shiftKey) return;
    if (event.button !== 0) return;
    onModelPointerDragStart(modelId, event.clientX, event.clientY);
  }, [onModelPointerDragStart, pointerDragStartEnabled]);

  const setSupportHoverModel = React.useCallback((nextModelId: string | null) => {
    if (hoverClearRafRef.current !== null) {
      cancelAnimationFrame(hoverClearRafRef.current);
      hoverClearRafRef.current = null;
    }

    if (lastSupportHoverModelIdRef.current === nextModelId) {
      return;
    }

    lastSupportHoverModelIdRef.current = nextModelId;
    emitSupportModelPointerHover(nextModelId);
  }, []);

  const scheduleSupportHoverClear = React.useCallback(() => {
    if (hoverClearRafRef.current !== null) return;

    hoverClearRafRef.current = requestAnimationFrame(() => {
      hoverClearRafRef.current = null;
      if (lastSupportHoverModelIdRef.current === null) return;
      lastSupportHoverModelIdRef.current = null;
      emitSupportModelPointerHover(null);
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (hoverClearRafRef.current !== null) {
        cancelAnimationFrame(hoverClearRafRef.current);
        hoverClearRafRef.current = null;
      }
      if (lastSupportHoverModelIdRef.current !== null) {
        lastSupportHoverModelIdRef.current = null;
        emitSupportModelPointerHover(null);
      }
    };
  }, []);

  React.useEffect(() => {
    if (pointerHoverEnabled) return;
    if (hoverClearRafRef.current !== null) {
      cancelAnimationFrame(hoverClearRafRef.current);
      hoverClearRafRef.current = null;
    }
    if (lastSupportHoverModelIdRef.current !== null) {
      lastSupportHoverModelIdRef.current = null;
      emitSupportModelPointerHover(null);
    }
  }, [pointerHoverEnabled]);

  const handleProxyHoverBoxMove = React.useCallback((modelId: string | undefined) => {
    setSupportHoverModel(modelId ?? null);
  }, [setSupportHoverModel]);

  const handleProxyBoxClick = React.useCallback((modelId: string | undefined) => {
    if (!pointerSelectionEnabled) return;
    if (!modelId) return;
    if (hitCategoryRef.current === 'gizmo') return;
    onModelPointerSelect?.(modelId);
  }, [onModelPointerSelect, pointerSelectionEnabled]);

  const handleProxyPointerOut = React.useCallback(() => {
    scheduleSupportHoverClear();
  }, [scheduleSupportHoverClear]);

  // The models drawn again on top of the base batch: the selected ones (their
  // own colour) and the hovered/marquee ones (a tint). A selection therefore
  // only mounts or drops one model's overlay instead of re-partitioning every
  // primitive in the scene, which is what a selection used to cost.
  const overlayEntries = React.useMemo<ProxyOverlayEntry[]>(
    () => computeProxyOverlayEntries({
      selectedModelIds: highlightedModelIdSet,
      hoverModelId: effectiveHoverModelId,
      marqueeCandidateModelIds,
      geometryByModel: baseProxyByModel,
      isModelVisible: resolveModelVisible,
      zOffsetByModelId: modelDropOffsetsById,
      selectionOpacity: proxyOpacity,
      hoverOpacity: hoverOverlayOpacity,
    }),
    [
      effectiveHoverModelId,
      marqueeCandidateModelIds,
      highlightedModelIdSet,
      resolveModelVisible,
      baseProxyByModel,
      modelDropOffsetsById,
      hoverOverlayOpacity,
      proxyOpacity,
    ],
  );

  // Every visible model's primitives in one set of batches, so the whole scene
  // draws with a constant number of draw calls regardless of model count. This
  // restores the "singular mesh" performance characteristic that was lost when
  // per-model groups were introduced in the ZIP Import / Batch Export refactor.
  const baseGeometry = React.useMemo(() => {
    const base: FlatProxyGeometry = { shafts: [], roots: [], joints: [], cones: [] };

    const appendShaft = (shaft: InstancedShaft, zOffset: number) => {
      if (Math.abs(zOffset) < 1e-6) {
        base.shafts.push(shaft);
        return;
      }
      const pushed: InstancedShaft = {
        ...shaft,
        start: { x: shaft.start.x, y: shaft.start.y, z: shaft.start.z + zOffset },
        end: { x: shaft.end.x, y: shaft.end.y, z: shaft.end.z + zOffset },
      };
      if (shaft.controlPoint1) pushed.controlPoint1 = { x: shaft.controlPoint1.x, y: shaft.controlPoint1.y, z: shaft.controlPoint1.z + zOffset };
      if (shaft.controlPoint2) pushed.controlPoint2 = { x: shaft.controlPoint2.x, y: shaft.controlPoint2.y, z: shaft.controlPoint2.z + zOffset };
      base.shafts.push(pushed);
    };

    const appendRoot = (root: InstancedRoot, zOffset: number) => {
      if (Math.abs(zOffset) < 1e-6) {
        base.roots.push(root);
        return;
      }
      base.roots.push({
        ...root,
        basePos: { x: root.basePos.x, y: root.basePos.y, z: root.basePos.z + zOffset },
      });
    };

    const appendJoint = (joint: InstancedJoint, zOffset: number) => {
      if (Math.abs(zOffset) < 1e-6) {
        base.joints.push(joint);
        return;
      }
      base.joints.push({
        ...joint,
        pos: { x: joint.pos.x, y: joint.pos.y, z: joint.pos.z + zOffset },
      });
    };

    const appendCone = (cone: InstancedContactCone, zOffset: number) => {
      if (Math.abs(zOffset) < 1e-6) {
        base.cones.push(cone);
        return;
      }
      base.cones.push({
        ...cone,
        pos: { x: cone.pos.x, y: cone.pos.y, z: cone.pos.z + zOffset },
      });
    };

    for (const entry of visibleModelEntries) {
      const { zOffset } = entry;

      for (const shaft of entry.geometry.shafts) appendShaft(shaft, zOffset);
      for (const root of entry.geometry.roots) appendRoot(root, zOffset);
      if (includeDetailedPrimitives) {
        for (const joint of entry.geometry.joints) appendJoint(joint, zOffset);
        for (const cone of entry.geometry.cones) appendCone(cone, zOffset);
      }
    }

    return base;
  }, [visibleModelEntries, includeDetailedPrimitives]);

  const hoverBoxes = React.useMemo<ProxyHoverBox[]>(
    () => computeProxyHoverBoxes(visibleModelEntries),
    [visibleModelEntries],
  );

  if (visibleModelEntries.length === 0) {
    return null;
  }

  const hasBase = baseGeometry.shafts.length > 0
    || baseGeometry.roots.length > 0
    || (includeDetailedPrimitives && (baseGeometry.joints.length > 0 || baseGeometry.cones.length > 0));

  return (
    <group>
      {hasBase && (
        <group key="proxy-base-batch">
          {baseGeometry.shafts.length > 0 && (
            <InstancedShaftGroup
              shafts={baseGeometry.shafts}
              color={DEFAULT_SUPPORT_COLOR}
              transparent={proxyTransparent}
              opacity={proxyOpacity}
              radialSegments={10}
              clippingPlanes={clippingPlanes}
              outOfBoundsMaterial={outOfBoundsMaterial}
            />
          )}
          {baseGeometry.roots.length > 0 && (
            <InstancedRootsGroup
              roots={baseGeometry.roots}
              color={DEFAULT_SUPPORT_COLOR}
              transparent={proxyTransparent}
              opacity={proxyOpacity}
              clippingPlanes={clippingPlanes}
              outOfBoundsMaterial={outOfBoundsMaterial}
            />
          )}
          {includeDetailedPrimitives && baseGeometry.joints.length > 0 && (
            <InstancedJointGroup
              joints={baseGeometry.joints}
              color={DEFAULT_SUPPORT_COLOR}
              transparent={proxyTransparent}
              opacity={proxyOpacity}
              clippingPlanes={clippingPlanes}
            />
          )}
          {includeDetailedPrimitives && baseGeometry.cones.length > 0 && (
            <InstancedContactConeGroup
              cones={baseGeometry.cones}
              color={DEFAULT_SUPPORT_COLOR}
              transparent={proxyTransparent}
              opacity={proxyOpacity}
              clippingPlanes={clippingPlanes}
            />
          )}
        </group>
      )}

      {overlayEntries.map((overlay) => (
        <group
          key={`proxy-overlay:${overlay.key}`}
          userData={{ modelId: overlay.modelId ?? null }}
          position={overlay.zOffset !== 0 ? [0, 0, overlay.zOffset] as [number, number, number] : undefined}
        >
          {overlay.geometry.shafts.length > 0 && (
            <InstancedShaftGroup
              shafts={overlay.geometry.shafts}
              color={overlay.color}
              emissive={overlay.emissive}
              emissiveIntensity={overlay.emissiveIntensity}
              transparent
              opacity={overlay.opacity}
              radialSegments={10}
              clippingPlanes={clippingPlanes}
            />
          )}

          {overlay.geometry.roots.length > 0 && (
            <InstancedRootsGroup
              roots={overlay.geometry.roots}
              color={overlay.color}
              emissive={overlay.emissive}
              emissiveIntensity={overlay.emissiveIntensity}
              transparent
              opacity={overlay.opacity}
              clippingPlanes={clippingPlanes}
            />
          )}

          {includeDetailedPrimitives && overlay.geometry.joints.length > 0 && (
            <InstancedJointGroup
              joints={overlay.geometry.joints}
              color={overlay.color}
              emissive={overlay.emissive}
              emissiveIntensity={overlay.emissiveIntensity}
              transparent
              opacity={overlay.opacity}
              clippingPlanes={clippingPlanes}
            />
          )}

          {includeDetailedPrimitives && overlay.geometry.cones.length > 0 && (
            <InstancedContactConeGroup
              cones={overlay.geometry.cones}
              color={overlay.color}
              emissive={overlay.emissive}
              emissiveIntensity={overlay.emissiveIntensity}
              transparent
              opacity={overlay.opacity}
              clippingPlanes={clippingPlanes}
            />
          )}
        </group>
      ))}

      {pointerHoverEnabled && hoverBoxes.map((box) => (
        <mesh
          key={`proxy-hover-box:${box.modelKey}`}
          position={box.position}
          scale={box.size}
          userData={{ modelId: box.modelId ?? null }}
          onPointerMove={() => handleProxyHoverBoxMove(box.modelId)}
          onPointerOut={handleProxyPointerOut}
          onClick={pointerSelectionEnabled ? () => handleProxyBoxClick(box.modelId) : undefined}
          onPointerDown={pointerDragStartEnabled ? (event) => reportModelDragStart(box.modelId, event) : undefined}
        >
          <boxGeometry args={[1, 1, 1]} />
          {/* Object stays visible so R3F still dispatches to it; the material
              paints nothing, so the box costs no draw call. */}
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}
