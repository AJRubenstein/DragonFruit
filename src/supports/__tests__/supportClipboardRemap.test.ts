import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { getSnapshot, resetStore } from '../state';
import {
  captureModelSupportsToClipboard,
  pasteModelSupportsFromClipboard,
  type SupportClipboardPayload,
} from '../PlacementLogic/supportClipboard';
import { readKickstands, seedKickstands } from './helpers/kickstandFixture';
import { collectionEntries, emptyPayload, entitiesIn, keyOf, owningTypeId, setCollection } from './helpers/typeCollections';
import { contactEndpointsFor, type SupportEntityFor, type SupportTypeId } from '../supportTypeRegistry';

const SOURCE_MODEL_ID = 'model-source';
const TARGET_MODEL_ID = 'model-target';

function makeVec3(x: number, y: number, z: number) {
  return { x, y, z };
}

function makeDiskProfile() {
  return {
    type: 'disk' as const,
    contactDiameterMm: 0.4,
    bodyDiameterMm: 1.2,
    lengthMm: 3,
    penetrationMm: 0.05,
    diskThicknessMm: 0.1,
    maxStandoffMm: 0.25,
    standoffAngleThreshold: Math.PI / 4,
  };
}

function makePayload(): SupportClipboardPayload {
  const sourceRootId = 'root-source';
  const sourceSegmentId = 'seg-source';
  const sourceJointBottomId = 'joint-bottom-source';
  const sourceJointTopId = 'joint-top-source';
  const sourceParentKnotId = 'knot-parent-source';
  const sourceEndKnotId = 'knot-end-source';
  const sourceBraceId = 'brace-source';

  // Each row is filled through the registry, keyed by the TYPE that declares the
  // collection -- so a rename reaches this fixture instead of breaking it, and the
  // entity is still checked against the type that id names.
  const payload = emptyPayload();
  payload.roots = [
    {
      id: sourceRootId,
      modelId: SOURCE_MODEL_ID,
      transform: {
        pos: makeVec3(0, 0, 0),
        rot: { x: 0, y: 0, z: 0, w: 1 },
      },
      diameter: 3,
      diskHeight: 0.8,
      coneHeight: 1.2,
    },
  ];
  setCollection(payload, 'trunk', [
    {
      id: 'trunk-source',
      modelId: SOURCE_MODEL_ID,
      rootId: sourceRootId,
      segments: [
        {
          id: sourceSegmentId,
          type: 'straight',
          diameter: 1,
          bottomJoint: {
            id: sourceJointBottomId,
            pos: makeVec3(0, 0, 1),
            diameter: 1.1,
          },
          topJoint: {
            id: sourceJointTopId,
            pos: makeVec3(0, 0, 8),
            diameter: 1.1,
          },
        },
      ],
      contactCone: {
        id: 'cone-trunk-source',
        pos: makeVec3(0, 0, 10),
        normal: makeVec3(0, 0, 1),
        profile: makeDiskProfile(),
        socketJointId: sourceJointTopId,
      },
    },
  ]);
  setCollection(payload, 'branch', [
    {
      id: 'branch-source',
      modelId: SOURCE_MODEL_ID,
      parentKnotId: sourceParentKnotId,
      segments: [
        {
          id: 'branch-seg-source',
          type: 'straight',
          diameter: 0.8,
        },
      ],
    },
  ]);
  setCollection(payload, 'leaf', [
    {
      id: 'leaf-source',
      modelId: SOURCE_MODEL_ID,
      parentKnotId: sourceParentKnotId,
      contactCone: {
        id: 'cone-leaf-source',
        pos: makeVec3(1, 0, 9),
        normal: makeVec3(0, 0, 1),
        profile: makeDiskProfile(),
        socketJointId: sourceJointTopId,
      },
    },
  ]);
  setCollection(payload, 'twig', []);
  setCollection(payload, 'stick', [
    {
      id: 'stick-source',
      modelId: SOURCE_MODEL_ID,
      segments: [
        {
          id: 'stick-seg-source',
          type: 'straight',
          diameter: 0.7,
          bottomJoint: {
            id: 'stick-j0-source',
            pos: makeVec3(0, 0, 2),
            diameter: 0.8,
          },
          topJoint: {
            id: 'stick-j1-source',
            pos: makeVec3(0, 0, 6),
            diameter: 0.8,
          },
        },
      ],
      contactConeA: {
        id: 'stick-cone-a-source',
        pos: makeVec3(0, 0, 1),
        normal: makeVec3(0, 0, 1),
        profile: makeDiskProfile(),
        socketJointId: sourceJointBottomId,
      },
      contactConeB: {
        id: 'stick-cone-b-source',
        pos: makeVec3(0, 0, 7),
        normal: makeVec3(0, 0, 1),
        profile: makeDiskProfile(),
        socketJointId: sourceJointTopId,
      },
    },
  ]);
  setCollection(payload, 'brace', [
    {
      id: sourceBraceId,
      modelId: SOURCE_MODEL_ID,
      startKnotId: sourceParentKnotId,
      endKnotId: sourceEndKnotId,
      profile: {
        diameter: 0.6,
      },
    },
  ]);
  payload.knots = [
    {
      id: sourceParentKnotId,
      parentShaftId: sourceSegmentId,
      t: 0.2,
      pos: makeVec3(0, 0, 3),
      diameter: 0.9,
    },
    {
      id: sourceEndKnotId,
      parentShaftId: `braceSegment:${sourceBraceId}`,
      t: 0.8,
      pos: makeVec3(0, 0, 5),
      diameter: 0.9,
    },
  ];
  payload.kickstandRoots = [
    {
      id: 'support-brace-root-source',
      modelId: SOURCE_MODEL_ID,
      transform: {
        pos: makeVec3(0, 0, 0),
        rot: { x: 0, y: 0, z: 0, w: 1 },
      },
      diameter: 2,
      diskHeight: 0.5,
      coneHeight: 0.8,
    },
  ];
  payload.kickstandKnots = [
    {
      id: 'support-brace-knot-source',
      parentShaftId: 'support-brace-seg-source',
      t: 0.5,
      pos: makeVec3(0, 0, 4),
      diameter: 0.7,
    },
  ];
  setCollection(payload, 'stump', []);
  setCollection(payload, 'kickstand', [
    {
      id: 'support-brace-source',
      modelId: SOURCE_MODEL_ID,
      rootId: 'support-brace-root-source',
      hostKnotId: 'support-brace-knot-source',
      hostSegmentId: sourceSegmentId,
      hostMinT: 0,
      segments: [
        {
          id: 'support-brace-seg-source',
          type: 'straight',
          diameter: 0.7,
          bottomJoint: {
            id: 'support-brace-j0-source',
            pos: makeVec3(0, 0, 2),
            diameter: 0.8,
          },
          topJoint: {
            id: 'support-brace-j1-source',
            pos: makeVec3(0, 0, 6),
            diameter: 0.8,
          },
        },
      ],
      profile: {
        bodyDiameterMm: 0.7,
        terminalStartDiameterMm: 0.7,
        terminalEndDiameterMm: 0.9,
      },
    },
  ]);

  return payload;
}

describe('support clipboard remap isolation', () => {
  beforeEach(() => {
    resetStore();
    seedKickstands({
      kickstands: {},
      roots: {},
      knots: {},
      selectedId: null,
    });
  });

  it('never keeps source graph IDs in pasted references', () => {
    const payload = makePayload();

    const sourceTransform = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    };

    const targetTransform = {
      position: new THREE.Vector3(10, 10, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    };

    const pastedCount = pasteModelSupportsFromClipboard(payload, TARGET_MODEL_ID, sourceTransform, targetTransform);
    assert.ok(pastedCount > 0);

    const state = getSnapshot();
    const kickstandState = readKickstands();

    // Walked, not listed. The list this replaces named fifteen collections by
    // hand and MISSED `stumps`, so a source stump id could collide with a pasted
    // one unnoticed; it also had to be edited whenever a type was added.
    const sourceIds = new Set<string>();
    const sourceJointIds = new Set<string>();
    for (const [key, entities] of collectionEntries(payload)) {
      for (const item of entities) {
        sourceIds.add(item.id);
        for (const segment of item.segments ?? []) {
          sourceIds.add(segment.id);
          if (segment.bottomJoint?.id) sourceJointIds.add(segment.bottomJoint.id);
          if (segment.topJoint?.id) sourceJointIds.add(segment.topJoint.id);
        }
      }
      // A type's contact endpoints are what it declares. Only the cone contacts
      // carry a joint, and the registry says which fields those are.
      const typeId = owningTypeId(key);
      if (!typeId) continue;
      for (const { kind, field } of contactEndpointsFor(typeId)) {
        if (kind !== 'cone') continue;
        for (const item of entities) {
          const contact = item[field] as { socketJointId?: string } | undefined;
          if (contact?.socketJointId) sourceJointIds.add(contact.socketJointId);
        }
      }
    }
    for (const item of payload.kickstandRoots) sourceIds.add(item.id);
    for (const item of payload.kickstandKnots) sourceIds.add(item.id);

    // The entity's own type comes from the type id, so this row never names a
    // shape a second time -- and a rename reaches it.
    const ofTarget = <T extends SupportTypeId>(typeId: T, source: object = state) =>
      entitiesIn<SupportEntityFor<T>>(source, keyOf(typeId)).filter((item) => item.modelId === TARGET_MODEL_ID);
    const targetTrunks = ofTarget('trunk');
    const targetBranches = ofTarget('branch');
    const targetLeaves = ofTarget('leaf');
    const targetSticks = ofTarget('stick');
    const targetBraces = ofTarget('brace');
    const targetKickstands = ofTarget('kickstand', kickstandState);

    assert.ok(targetTrunks.length > 0);
    assert.ok(targetBranches.length > 0);
    assert.ok(targetLeaves.length > 0);
    assert.ok(targetSticks.length > 0);
    assert.ok(targetBraces.length > 0);
    assert.ok(targetKickstands.length > 0);

    for (const trunk of targetTrunks) {
      assert.ok(!sourceIds.has(trunk.rootId));
      if (trunk.contactCone?.socketJointId) {
        assert.ok(!sourceJointIds.has(trunk.contactCone.socketJointId));
      }
      for (const segment of trunk.segments) {
        assert.ok(!sourceIds.has(segment.id));
        if (segment.bottomJoint?.id) assert.ok(!sourceJointIds.has(segment.bottomJoint.id));
        if (segment.topJoint?.id) assert.ok(!sourceJointIds.has(segment.topJoint.id));
      }
    }

    for (const branch of targetBranches) {
      assert.ok(!sourceIds.has(branch.parentKnotId));
      if (branch.contactCone?.socketJointId) {
        assert.ok(!sourceJointIds.has(branch.contactCone.socketJointId));
      }
    }

    for (const leaf of targetLeaves) {
      assert.ok(!sourceIds.has(leaf.parentKnotId));
      if (leaf.contactCone?.socketJointId) {
        assert.ok(!sourceJointIds.has(leaf.contactCone.socketJointId));
      }
    }

    for (const stick of targetSticks) {
      const cones = [stick.contactConeA, stick.contactConeB] as Array<{ socketJointId?: string } | undefined>;
      for (const cone of cones) {
        if (cone?.socketJointId) assert.ok(!sourceJointIds.has(cone.socketJointId));
      }
      for (const segment of stick.segments) {
        assert.ok(!sourceIds.has(segment.id));
      }
    }

    for (const brace of targetBraces) {
      assert.ok(!sourceIds.has(brace.startKnotId));
      assert.ok(!sourceIds.has(brace.endKnotId));
    }

    for (const knot of Object.values(state.knots)) {
      assert.ok(!sourceIds.has(knot.id));
      if (knot.parentShaftId.startsWith('leafCone:')) {
        const leafId = knot.parentShaftId.slice('leafCone:'.length);
        assert.ok(!sourceIds.has(leafId));
      } else if (knot.parentShaftId.startsWith('braceSegment:')) {
        const braceId = knot.parentShaftId.slice('braceSegment:'.length);
        assert.ok(!sourceIds.has(braceId));
      } else {
        assert.ok(!sourceIds.has(knot.parentShaftId));
      }
    }

    for (const kickstand of targetKickstands) {
      assert.ok(!sourceIds.has(kickstand.rootId));
      assert.ok(!sourceIds.has(kickstand.hostKnotId));
      assert.ok(!sourceIds.has(kickstand.hostSegmentId));
      for (const segment of kickstand.segments) {
        assert.ok(!sourceIds.has(segment.id));
      }
    }

    for (const root of Object.values(kickstandState.roots)) {
      assert.ok(!sourceIds.has(root.id));
    }

    for (const knot of Object.values(kickstandState.knots)) {
      assert.ok(!sourceIds.has(knot.id));
      assert.ok(!sourceIds.has(knot.parentShaftId));
    }
  });

  it('captures clipboard payload for source model', () => {
    const payload = makePayload();

    const sourceTransform = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    };

    const targetTransform = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    };

    pasteModelSupportsFromClipboard(payload, SOURCE_MODEL_ID, sourceTransform, targetTransform);
    const captured = captureModelSupportsToClipboard(SOURCE_MODEL_ID);

    assert.ok(captured);
    assert.ok((captured?.roots.length ?? 0) > 0);
    assert.ok((captured?.trunks.length ?? 0) > 0);
  });
});
