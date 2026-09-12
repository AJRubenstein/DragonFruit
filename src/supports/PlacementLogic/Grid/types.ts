import type { Branch, Knot, Leaf, SupportState, Vec3 } from '../../types';
import type { SupportData } from '../../rendering/SupportBuilder';
import type { SupportSettings } from '../../Settings/types';
import type { TrunkBuildResult } from '../../SupportTypes/Trunk/trunkBuilder';
import type { SupportTypeId } from '../../supportTypeRegistry';
import type * as THREE from 'three';

export type GridNodeKey = string;

export type GridPlacementRejectReason =
    | 'KNOT_ABOVE_TIP'
    | 'ANCHOR_BELOW_ROOT'
    | 'NO_HOST_SEGMENT'
    | 'MODEL_MISMATCH'
    | 'NO_VALID_ATTACHMENT'
    | 'COLLISION_WITH_MODEL';

export type GridPlacementDecision =
    | {
        kind: 'place_trunk';
        trunkBuild: TrunkBuildResult;
        nodeKey: GridNodeKey;
    }
    | {
        kind: 'replace_trunk';
        nodeKey: GridNodeKey;
        /** The declared type of the host being replaced, so the caller asks the
         * registry for that type's promotion rather than assuming a trunk. */
        hostTypeId: SupportTypeId;
        /** The host this promotion removes -- genuinely a trunk, by name: the
         * engine builds every candidate as one. */
        trunkToRemoveId: string;
        trunkBuild: TrunkBuildResult;
        promoteKnot: Knot;
        promoteBranch: Branch;
        oldTrunkKnot: Knot | null;
        oldTrunkBranch: Branch | null;
    }
    | {
        kind: 'place_branch';
        nodeKey: GridNodeKey;
        /** The host's declared type and id, so a caller indexes its collection. */
        hostTypeId: SupportTypeId;
        hostId: string;
        knot: Knot;
        branch: Branch;
        supportData: SupportData;
    }
    | {
        kind: 'place_leaf';
        nodeKey: GridNodeKey;
        /** The host's declared type and id, so a caller indexes its collection. */
        hostTypeId: SupportTypeId;
        hostId: string;
        knot: Knot;
        leaf: Leaf;
        supportData: SupportData;
    }
    | {
        /**
         * A type that OVERRODE the default trunk build for its claimed band.
         *
         * Carries the type id rather than a named field, so the engine can
         * return what a type's own registered builder produced without knowing
         * which type it was or what shape its entity has.
         */
        kind: 'place_typed_support';
        typeId: SupportTypeId;
        entity: { id: string };
        supportData: SupportData;
    }
    | {
        kind: 'reject';
        nodeKey: GridNodeKey;
        reason: GridPlacementRejectReason;
        trunkBuild?: TrunkBuildResult;
        /** Optional ghost preview for rejections that already built geometry
         * (e.g. anchors). Carries the reject reason as `error` so the hover
         * tooltip renders. */
        supportData?: SupportData;
    };

export interface DecideGridPlacementArgs {
    settings: SupportSettings;
    snapshot: SupportState;
    candidate: TrunkBuildResult;
    tipPos: Vec3;
    tipNormal: Vec3;
    modelId: string;
    mesh?: THREE.Mesh;
    /** When true, skip expensive click-time-only checks (e.g. full segment raycasts). */
    isPreview?: boolean;
}
