import type { SupportState, Vec3 } from '../../types';
import type { SupportData } from '../../rendering/SupportBuilder';
import type { SupportSettings } from '../../Settings/types';
import type { TrunkBuildResult } from '../../SupportTypes/Trunk/trunkBuilder';
import type { PlacedSupport, SupportTypeId } from '../../supportTypeRegistry';
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
        /**
         * A support is placed on this contact.
         *
         * ONE arm for every type. The placed support travels in the registry's
         * generic shape — `location.key` says which collection it joins and
         * `edges` says which primitives come with it — so the engine never names
         * the type it placed and there is no arm per type.
         */
        kind: 'place';
        /** The grid node it landed on, for logging. Empty when the build never
         * consults the grid (a type's own override). */
        nodeKey: GridNodeKey;
        placed: PlacedSupport;
        /** Preview and validation state, whatever built the support. */
        supportData?: SupportData;
    }
    | {
        /**
         * The placed support replaces the host occupying its grid node.
         *
         * Reports WHICH host yields, by declared type and id. The code that
         * removes it lives in that host type's own folder, reached through the
         * registry, because rehosting its attachments is that type's business.
         */
        kind: 'promote';
        hostTypeId: SupportTypeId;
        hostId: string;
        nodeKey: GridNodeKey;
        /** The support taking the node, in the same generic shape. */
        placed: PlacedSupport;
        /**
         * The member the host's own contact is preserved as.
         *
         * A promotion produces two things: the support now standing on the
         * node, and a member hanging off it that carries the ORIGINAL host's
         * contact — otherwise the surface the old host was holding is dropped.
         * Both travel in the same generic shape.
         */
        promotedMember?: PlacedSupport;
        /** Preview state for what is being placed. */
        supportData?: SupportData;
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
