import * as THREE from 'three';
import { bezierToLineSegments } from '@/supports/Curves/BezierUtils';
import { getModelIdForSupportEntityId } from '@/supports/state';
import { buildSupportExportGroup, type SupportExportContext } from '@/supports/exportGeometry/seam';
import { exportGroupName, getSupportTypeDescriptor, parseKnotHostId, SUPPORT_TYPES, type SupportTypeDescriptor, type SupportTypeId } from '@/supports/supportTypeRegistry';
import { getFinalSocketPosition } from '@/supports/SupportPrimitives/ContactCone';
import { calculateDiskThickness } from '@/supports/SupportPrimitives/ContactDisk/contactDiskUtils';
import { getRaftSettingsForModel } from '@/supports/Rafts/Crenelated/RaftState';
import type { Kickstand, KickstandBuildResult } from '@/supports/SupportTypes/Kickstand/types';
import type {
  Anchor,
  Brace,
  Branch,
  DragonfruitImportFormat,
  Knot,
  Leaf,
  Roots,
  Segment,
  Stick,
  SupportState,
  Trunk,
  Twig,
  Vec3,
} from '@/supports/types';
import { SupportGeometryGenerator } from './SupportGeometryGenerator';
import { getActiveMaterialProfile, getActivePrinterProfile } from '@/features/profiles/profileStore';
import { calculateTipOffset } from '@/supports/rendering/calculateTipOffset';

function getGlobalPenetrationMm(): number {
  const material = getActiveMaterialProfile();
  const printer = getActivePrinterProfile();
  if (material && printer) {
    const pxX = printer.pixelSize?.x ? printer.pixelSize.x / 1000 : (printer.buildVolumeMm?.width ?? 143) / (printer.display?.resolutionX ?? 2560);
    const pxY = printer.pixelSize?.y ? printer.pixelSize.y / 1000 : (printer.buildVolumeMm?.depth ?? 89) / (printer.display?.resolutionY ?? 1620);
    return calculateTipOffset(material.antiAliasingSettings, material.layerHeightMm, pxX, pxY);
  }
  return 0;
}

export interface ScopedSupportPayload {
  roots: Roots[];
  trunks: SupportState['trunks'][string][];
  branches: Branch[];
  leaves: Leaf[];
  twigs: Twig[];
  sticks: Stick[];
  braces: Brace[];
  anchors: Anchor[];
  knots: Knot[];
  kickstands: Kickstand[];
}

function hasAllowedModelId(allowedModelIds: ReadonlySet<string>, modelId: string | null | undefined): boolean {
  return typeof modelId === 'string' && allowedModelIds.has(modelId);
}

function firstAllowedModelId(
  allowedModelIds: ReadonlySet<string>,
  ...candidateIds: Array<string | null | undefined>
): string | null {
  for (const candidateId of candidateIds) {
    if (hasAllowedModelId(allowedModelIds, candidateId)) {
      return candidateId!;
    }
  }

  return null;
}

/** Resolves an entity id to its owning modelId. */
type ModelIdResolver = (id: string | null | undefined) => string | null;

/**
 * An O(1) `entityId -> modelId` resolver, backed by reverse indices built once
 * rather than scanning the graph per call. Index order mirrors
 * {@link getModelIdForSupportEntityId} so ambiguous ids resolve the same way.
 */
function createScopedModelIdResolver(
  supportState: SupportState,
): ModelIdResolver {
  // Ids reachable in the canonical resolver only via linear scans: segment and
  // joint ids, brace start/end knots, and kickstand host knots + segments.
  const scanModelId = new Map<string, string | null>();
  const registerScan = (id: string | null | undefined, modelId: string | null): void => {
    if (id && !scanModelId.has(id)) scanModelId.set(id, modelId);
  };
  const registerSegments = (segments: Segment[], modelId: string | null): void => {
    for (const segment of segments) {
      registerScan(segment.id, modelId);
      registerScan(segment.topJoint?.id, modelId);
      registerScan(segment.bottomJoint?.id, modelId);
    }
  };

  // Every type's shafts and the knots it hangs from, by declaration.
  for (const descriptor of SUPPORT_TYPES) {
    const collection = supportState[descriptor.location.key] as unknown as Record<string, Record<string, unknown>>;

    for (const entity of Object.values(collection ?? {})) {
      const modelId = (entity.modelId as string | undefined) ?? null;

      if (descriptor.hasSegments) {
        registerSegments(entity.segments as Segment[], modelId);
      }
      for (const edge of descriptor.edges) {
        if (edge.to !== 'knots' || edge.ownership !== 'hostedBy') continue;
        const knotId = entity[edge.field];
        if (typeof knotId === 'string') registerScan(knotId, modelId);
      }
    }
  }

  // Knot fallbacks: a knot inherits from a branch/leaf that names it as parent.
  const branchByParentKnot = new Map<string, string | null>();
  for (const branch of Object.values(supportState.branches)) {
    if (!branchByParentKnot.has(branch.parentKnotId)) branchByParentKnot.set(branch.parentKnotId, branch.modelId ?? null);
  }
  const leafByParentKnot = new Map<string, string | null>();
  for (const leaf of Object.values(supportState.leaves)) {
    if (!leafByParentKnot.has(leaf.parentKnotId)) leafByParentKnot.set(leaf.parentKnotId, leaf.modelId ?? null);
  }

  const resolve: ModelIdResolver = (id) => {
    if (!id) return null;

    if (id.startsWith('braceSegment:')) {
      return supportState.braces[id.slice('braceSegment:'.length)]?.modelId ?? null;
    }

    if (supportState.roots[id]) return supportState.roots[id].modelId ?? null;
    for (const descriptor of SUPPORT_TYPES) {
      const entity = (supportState[descriptor.location.key] as unknown as Record<string, { modelId?: string }>)[id];
      if (entity) return entity.modelId ?? null;
    }

    if (scanModelId.has(id)) return scanModelId.get(id) ?? null;

    const knot = supportState.knots[id];
    if (knot) {
      if (knot.parentShaftId) {
        const byParent = resolve(knot.parentShaftId);
        if (byParent) return byParent;
      }
      if (branchByParentKnot.has(id)) return branchByParentKnot.get(id) ?? null;
      if (leafByParentKnot.has(id)) return leafByParentKnot.get(id) ?? null;
    }

    return null;
  };

  return resolve;
}

function buildTwigDiskTipCenter(disk: Twig['contactDiskA']): Vec3 {
  const thickness = disk.diskLengthOverride ?? calculateDiskThickness(disk.surfaceNormal, disk.coneAxis, disk.profile);
  return {
    x: disk.pos.x + (disk.surfaceNormal.x * thickness),
    y: disk.pos.y + (disk.surfaceNormal.y * thickness),
    z: disk.pos.z + (disk.surfaceNormal.z * thickness),
  };
}

function addModelMetadata(object: THREE.Object3D, modelId: string | null | undefined) {
  object.userData = {
    ...object.userData,
    modelId: modelId ?? null,
  };
}

function appendConeGeometry(group: THREE.Group, cone: Leaf['contactCone']) {
  const pen = getGlobalPenetrationMm();
  const coneGroup = SupportGeometryGenerator.generateConeMesh(cone, pen);
  group.add(coneGroup);

  const diskGroup = SupportGeometryGenerator.generateContactDiskMesh(cone, pen);
  if (diskGroup.children.length > 0) {
    group.add(diskGroup);
  }
}

function appendStraightOrBezierShafts(
  group: THREE.Group,
  segment: Segment,
  start: Vec3,
  end: Vec3,
) {
  const meshes = SupportGeometryGenerator.generateSegmentShaftMeshes(
    segment,
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(end.x, end.y, end.z),
  );
  for (const mesh of meshes) {
    group.add(mesh);
  }
}

export function extractScopedSupportPayload(
  supportState: SupportState,
  modelIds: Iterable<string>,
): ScopedSupportPayload {
  const allowedModelIds = new Set(Array.from(modelIds).filter((modelId) => modelId.trim().length > 0));

  // Reverse-indexed resolver: O(1) per lookup after an O(N) build, versus the
  // canonical getModelIdForSupportEntityId which linear-scans the whole graph
  // per call. Called once per branch/leaf/brace/kickstand/knot below, so the
  // linear-scan form made this O(N²) — the multi-second autosave freeze.
  const resolveModelId = createScopedModelIdResolver(supportState);

  /**
   * Whether an entity belongs to a requested model.
   *
   * Its own `modelId` first, then the ids it links through -- a branch borrows
   * its parent knot's model, a kickstand its root's, its host knot's or its
   * host segment's. Those fall-backs are the type's declared `edges`, in
   * declared order. `roots` is excluded: following it would pull in a trunk
   * whose root carries a model the trunk does not.
   */
  const belongsToScope = (descriptor: SupportTypeDescriptor, entity: Record<string, unknown>): boolean => {
    const linked = descriptor.edges
      .filter((edge) => edge.to !== 'roots')
      .map((edge) => {
        const linkedId = entity[edge.field];
        return typeof linkedId === 'string' ? resolveModelId(linkedId) : null;
      });

    return firstAllowedModelId(
      allowedModelIds,
      entity.modelId as string | undefined,
      ...linked,
    ) !== null;
  };

  const scoped = <T>(typeId: SupportTypeId): T[] => {
    const descriptor = getSupportTypeDescriptor(typeId);
    const collection = (supportState as unknown as Record<string, unknown>)[descriptor.location.key] as Record<string, Record<string, unknown>> | undefined;
    return Object.values(collection ?? {}).filter((entity) => belongsToScope(descriptor, entity)) as T[];
  };

  const roots = Object.values(supportState.roots)
    .filter((item) => hasAllowedModelId(allowedModelIds, item.modelId));
  /**
   * The scoped lists, by type id.
   *
   * Nothing names a type here: the registry says which types exist, and
   * `location.key` is the collection / payload field name that is the wire
   * contract, so one walk fills both.
   */
  const scopedEntities: Record<SupportTypeId, unknown[]> = {} as Record<SupportTypeId, unknown[]>;
  for (const descriptor of SUPPORT_TYPES) scopedEntities[descriptor.id] = scoped(descriptor.id);

  /** Every scoped entity, with the descriptor that says what it is. */
  const scopedByType: Array<{ descriptor: SupportTypeDescriptor; entities: Record<string, unknown>[] }> =
    SUPPORT_TYPES.map((descriptor) => ({
      descriptor,
      entities: scopedEntities[descriptor.id] as unknown as Record<string, unknown>[],
    }));

  // Shafts carried by the scope: real segments, or a prefixed id for a type
  // that has none.
  const includedSegmentIds = new Set<string>();
  for (const { descriptor, entities } of scopedByType) {
    for (const entity of entities) {
      if (descriptor.segmentSelectionPrefix) {
        includedSegmentIds.add(`${descriptor.segmentSelectionPrefix}${entity.id as string}`);
        continue;
      }
      for (const segment of (entity.segments as Segment[] | undefined) ?? []) {
        includedSegmentIds.add(segment.id);
      }
    }
  }

  // Knots the scope hangs from, by declared `hostedBy knots` edges.
  const referencedKnotIds = new Set<string>();
  for (const { descriptor, entities } of scopedByType) {
    const knotFields = descriptor.edges
      .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy')
      .map((edge) => edge.field);
    if (knotFields.length === 0) continue;

    for (const entity of entities) {
      for (const field of knotFields) {
        const knotId = entity[field];
        if (typeof knotId === 'string') referencedKnotIds.add(knotId);
      }
    }
  }

  const knots = Object.values(supportState.knots)
    .filter((item) => {
      if (referencedKnotIds.has(item.id)) return true;
      if (includedSegmentIds.has(item.parentShaftId)) return true;
      // A knot riding a pseudo-shaft (a leaf's cone, a brace's span) carries
      // the type's declared prefix. Splitting it through the registry means no
      // literal here to fall out of step when a prefix changes.
      const host: { typeId: SupportTypeId; entityId: string } | null = parseKnotHostId(item.parentShaftId);
      if (host) {
        const owners = scopedEntities[host.typeId] as { id: string }[];
        return owners.some((owner) => owner.id === host.entityId);
      }
      return hasAllowedModelId(allowedModelIds, resolveModelId(item.id));
    });

  // The payload's field names ARE the collection keys -- one per declared type,
  // plus the two primitives -- so it is filled by walking the registry rather
  // than restated. Field ORDER follows the registry: the primitives bracket the
  // types because that is the order they are assigned in. Order is incidental
  // to every reader (they all index by name), but the payload golden records
  // it, so it is pinned deliberately rather than left to fall out.
  const payload = { roots } as ScopedSupportPayload;
  const byField = payload as unknown as Record<string, unknown>;
  for (const descriptor of SUPPORT_TYPES) {
    byField[descriptor.location.key] = scopedEntities[descriptor.id];
  }
  byField.knots = knots;
  return payload;
}

export function buildScopedSupportExportDocument(
  supportState: SupportState,
  modelIds: Iterable<string>,
  source = 'dragonfruit-voxl',
): DragonfruitImportFormat {
  const payload = extractScopedSupportPayload(supportState, modelIds);
  // A kickstand serialises as a bundle (`serialisedAsBundle`), so the document
  // nests its root and host knot rather than referencing them by id.
  const rootsById = new Map(payload.roots.map((item) => [item.id, item]));
  const knotsById = new Map(payload.knots.map((item) => [item.id, item]));

  const kickstandBuilds: KickstandBuildResult[] = payload.kickstands
    .map((kickstand) => {
      const root = rootsById.get(kickstand.rootId);
      const hostKnot = knotsById.get(kickstand.hostKnotId);
      if (!root || !hostKnot) return null;
      return { root, hostKnot, kickstand };
    })
    .filter((item): item is KickstandBuildResult => item !== null);

  return {
    version: 1,
    meta: {
      source,
      objectCenter: { x: 0, y: 0, z: 0 },
      updatedAt: Date.now(),
    },
    roots: payload.roots,
    trunks: payload.trunks,
    branches: payload.branches,
    leaves: payload.leaves,
    twigs: payload.twigs,
    sticks: payload.sticks,
    braces: payload.braces,
    anchors: payload.anchors,
    knots: payload.knots,
    kickstands: kickstandBuilds,
  };
}

export function buildScopedSupportGeometryGroup(
  supportState: SupportState,
  modelIds: Iterable<string>,
): THREE.Group {
  const payload = extractScopedSupportPayload(supportState, modelIds);
  const group = new THREE.Group();
  group.name = 'ScopedSupportExport';

  const context: SupportExportContext = {
    supportState,
    modelIdOf: getModelIdForSupportEntityId,
  };

  // Every type's own folder registers how it exports (see
  // supports/exportGeometry/seam.ts). Walking the registry is what keeps this
  // free of type names: a type that never registered would otherwise export
  // nothing, silently, so it throws instead.
  for (const descriptor of SUPPORT_TYPES) {
    const rows = (payload as unknown as Record<string, readonly { id: string }[]>)[descriptor.location.key] ?? [];
    for (const entity of rows) {
      const built = buildSupportExportGroup(descriptor.id, entity, context);
      if (!built) continue;
      built.name = exportGroupName(descriptor.id, entity.id);
      group.add(built);
    }
  }

  group.updateMatrixWorld(true);
  return group;
}
