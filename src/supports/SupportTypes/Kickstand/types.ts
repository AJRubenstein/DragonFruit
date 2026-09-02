import type { Branch, Brace, Knot, Leaf, Roots, Segment, SupportEntity, Vec3 } from '../../types';

export type KickstandHostKind = 'trunk' | 'branch';

export interface KickstandHostTarget {
    segmentId: string;
    supportKind: KickstandHostKind;
    t: number;
    pos: Vec3;
    diameterMm: number;
    minT?: number;
}

export interface KickstandPlacementLayout {
    firstJointHeightRatio: number;
    secondJointHeightRatio: number;
    minJointSpacingMm: number;
    minTerminalClearanceMm: number;
}

export interface Kickstand extends SupportEntity {
    rootId: string;
    hostKnotId: string;
    hostSegmentId: string;
    hostMinT: number;
    /**
     * @deprecated Superseded by `generatedBy` on SupportEntity, which every type
     * carries. Kept so scenes saved before the change still identify their
     * auto-generated kickstands; see migrateLegacyGeneratedBy in state.ts.
     */
    autoBracingGenerated?: boolean;
    segments: Segment[];
    profile: {
        bodyDiameterMm: number;
        terminalStartDiameterMm: number;
        terminalEndDiameterMm: number;
    };
}

export interface KickstandBuildInput {
    modelId: string;
    rootPos: Vec3;
    host: KickstandHostTarget;
    layoutOverrides?: Partial<KickstandPlacementLayout>;
}

export interface KickstandBuildResult {
    root: Roots;
    hostKnot: Knot;
    kickstand: Kickstand;
}

export interface KickstandRemoveResult {
    build: KickstandBuildResult;
    branches: Branch[];
    braces: Brace[];
    kickstands: KickstandBuildResult[];
    leaves: Leaf[];
    knots: Knot[];
}

export interface KickstandState {
    kickstands: Record<string, Kickstand>;
    roots: Record<string, Roots>;
    knots: Record<string, Knot>;
    selectedId: string | null;
}
