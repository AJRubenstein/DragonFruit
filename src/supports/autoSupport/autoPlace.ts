import * as THREE from 'three';
import type { CandidatePoint, AutoPlaceResult, AutoPlaceAnalytics, RejectReason, AutoSupportPlan, PlacementDiagnostics, FanLeafRefusal } from './types';
import type { SupportState, SupportOrigin } from '../types';
import type { AutoSupportSettings } from './settings';
import { normalizeAutoSupportSettings } from './settings';
import { generateCandidates, deduplicateCandidates } from './candidateGeneration';
import { generateGridCandidates } from './gridPlacement';
import { generatePoissonCandidates, computeRegionFlatnessDeg } from './poissonPlacement';
import { buildAnchorBands } from './anchorBands';
import {
    MAX_GAP_FILL_PASSES,
    buildGapFillCandidates,
    collectSupportTips,
    computeRegionCoverage,
} from './coverage';
import { sizeParameters, presetForArea } from './parameterSizing';
import type { ModelSizingContext } from './parameterSizing';
import { getSettings } from '../Settings/state';
import { getSnapshot, setSnapshot } from '../state';
import {
    draftAddRoot, draftAddTrunk, draftAddBranch, draftAddLeaf,
    draftAddKnot, draftAddAnchor, draftAddStick, draftAddTwig,
} from './supportDraft';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';
import { buildTrunkData } from '../SupportTypes/Trunk/trunkBuilder';
import { buildCavityStick } from '../SupportTypes/Trunk/useTrunkPlacement';
import { applyTrunkReplacement, planTrunkReplacement } from '../SupportTypes/Trunk/TrunkReplacement';
import { computeForestDiameterProfile } from '../SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter';
import { buildBranchData } from '../SupportTypes/Branch/branchBuilder';
import { buildLeafData } from '../SupportTypes/Leaf/leafBuilder';
import { decideGridPlacement } from '../PlacementLogic/Grid/gridPlacement';
import { calculateSmoothedNormal } from '../PlacementLogic/PlacementUtils';
import { isShaftBlocked } from '../PlacementLogic/CollisionAvoidance';
import { buildAutoBracedSnapshot } from '../autoBracing/autoBrace';
import { pushSupportHistory } from '../history/supportHistory';
import { SUPPORT_AUTO_PLACE } from '../history/actionTypes';
import { getKickstandSnapshot, setKickstandSnapshot } from '../SupportTypes/Kickstand/kickstandStore';
import type { KickstandState } from '../SupportTypes/Kickstand/types';
import { getModelMesh } from './meshStore';
import {
    ALREADY_SUPPORTED_RADIUS_MM,
    GRIDLESS_MERGE_RADIUS_MM,
    LEAF_FAN_RADIUS_MM,
    GRID_HOST_FAN_RADIUS_MM,
    LEAF_FAN_MAX_ANGLE_DEG,
} from './constants';

const LOG_PREFIX = '[AutoSupport]';

function round2(v: number): number { return Math.round(v * 100) / 100; }

// ---------------------------------------------------------------------------
// Mesh volume helper
// ---------------------------------------------------------------------------

/**
 * Exact volume (mm³) of a closed mesh via the signed tetrahedron sum around
 * the origin. Used for physics-informed sizing — replaces the bounding-box
 * volume, which wildly overestimates non-cubic models.
 */
function computeMeshVolumeMm3(mesh: THREE.Mesh): number {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return 0;
    const index = geo.index;
    let vol = 0;
    const addTri = (i0: number, i1: number, i2: number) => {
        const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
        const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
        const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);
        vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    };
    if (index) {
        for (let i = 0; i < index.count; i += 3) addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
        for (let i = 0; i < pos.count; i += 3) addTri(i, i + 1, i + 2);
    }
    return Math.abs(vol);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
    trunks: number,
    anchors: number,
    branches: number,
    leaves: number,
    sticks: number,
    rejected: number,
    changed: boolean,
    message: string,
): AutoPlaceResult {
    return {
        placedTrunks: trunks,
        placedAnchors: anchors,
        placedBranches: branches,
        placedLeaves: leaves,
        placedSticks: sticks,
        rejectedCandidates: rejected,
        changed,
        message,
    };
}

// ---------------------------------------------------------------------------
// Normal resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the real surface normal at a candidate's tip position by
 * raycasting against the model mesh — exactly the same way manual
 * placement obtains a surface normal from a click intersection.
 *
 * Primary ray goes UPWARD from just below the tip: a support contact sits on
 * the underside of an overhang, so the first surface hit is the contact face
 * itself, whose normal (pointing away from the model interior, i.e. downward)
 * is what the support tip must align with. A downward ray from above would hit
 * the model's TOP surface first, which is the wrong face for a support.
 *
 * Falls back to a downward ray (normal flipped) for top-surface contacts, and
 * finally to the candidate's placeholder normal when the mesh is unavailable
 * or both rays miss.
 */
function resolveSurfaceNormal(
    tipPos: CandidatePoint['tipPos'],
    mesh: THREE.Mesh | undefined,
): { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } } {
    if (!mesh) {
        return { point: tipPos, normal: { x: 0, y: 0, z: -1 } };
    }

    const raycaster = new THREE.Raycaster();

    // Primary: upward ray from just below the tip (underside contact).
    raycaster.set(new THREE.Vector3(tipPos.x, tipPos.y, tipPos.z - 2), new THREE.Vector3(0, 0, 1));
    const upHits = raycaster.intersectObject(mesh, false);
    if (upHits.length > 0) {
        const hit = upHits[0];
        const smoothed = calculateSmoothedNormal(hit);
        return {
            point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
            normal: smoothed,
        };
    }

    // Fallback: downward ray from above (top-surface contact), normal flipped
    // so the support still grows away from the face.
    raycaster.set(new THREE.Vector3(tipPos.x, tipPos.y, tipPos.z + 2), new THREE.Vector3(0, 0, -1));
    const downHits = raycaster.intersectObject(mesh, false);
    if (downHits.length > 0) {
        const hit = downHits[0];
        const smoothed = calculateSmoothedNormal(hit);
        return {
            point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
            normal: { x: -smoothed.x, y: -smoothed.y, z: -smoothed.z },
        };
    }

    // Fallback: keep the existing normal.
    return { point: tipPos, normal: { x: 0, y: 0, z: -1 } };
}

// ---------------------------------------------------------------------------
// Already-supported filter
// ---------------------------------------------------------------------------

/**
 * Remove candidates whose tip position is already covered by an
 * existing support (any trunk / branch / leaf / anchor contact cone).
 * Prevents stacking duplicate supports on repeated runs.
 */
function filterAlreadySupported(candidates: CandidatePoint[], draft: SupportState): CandidatePoint[] {
    const snapshot = draft;
    const existingTips: Array<{ x: number; y: number; z: number }> = [];

    for (const t of Object.values(snapshot.trunks)) {
        if (t.contactCone?.pos) existingTips.push(t.contactCone.pos);
    }
    for (const b of Object.values(snapshot.branches)) {
        if (b.contactCone?.pos) existingTips.push(b.contactCone.pos);
    }
    for (const l of Object.values(snapshot.leaves)) {
        if (l.contactCone?.pos) existingTips.push(l.contactCone.pos);
    }
    for (const a of Object.values(snapshot.anchors)) {
        if (a.contactCone?.pos) existingTips.push(a.contactCone.pos);
    }

    if (existingTips.length === 0) return candidates;

    const r2 = ALREADY_SUPPORTED_RADIUS_MM * ALREADY_SUPPORTED_RADIUS_MM;
    return candidates.filter(c => {
        for (const tip of existingTips) {
            const dx = c.tipPos.x - tip.x;
            const dy = c.tipPos.y - tip.y;
            const dz = c.tipPos.z - tip.z;
            if (dx * dx + dy * dy + dz * dz <= r2) return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------------
// Nearby-trunk merge (works even without grid mode)
// ---------------------------------------------------------------------------

interface MergeHost {
    trunkId: string;
    tipPos: { x: number; y: number; z: number };
}

// ---------------------------------------------------------------------------
// Leaf cone triangle collision
// ---------------------------------------------------------------------------

const _leafRaycaster = new THREE.Raycaster();

/** Check whether a leaf cone from `knotPos` to `cone` intersects the model.
 *  Raycasts from the knot toward a point just before the tip (offset inward
 *  along the surface normal), excluding the tip contact itself.  Returns true
 *  if the ray hits a model triangle before reaching the offset point. */
function leafConeCollides(
    knotPos: { x: number; y: number; z: number },
    cone: { pos: { x: number; y: number; z: number }; surfaceNormal?: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } },
    mesh: THREE.Mesh,
): boolean {
    // Ray from knot toward tip. The tip is ON the surface — the first
    // hit should be the tip surface at ~totalDist.  If the first hit
    // is significantly closer, there's geometry between shaft and tip.
    const dx = cone.pos.x - knotPos.x;
    const dy = cone.pos.y - knotPos.y;
    const dz = cone.pos.z - knotPos.z;
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (totalDist < 0.01) return false;
    const dir = new THREE.Vector3(dx / totalDist, dy / totalDist, dz / totalDist);

    // Cast two offset rays to account for cone thickness (~0.25mm).
    const n = cone.surfaceNormal ?? cone.normal;
    const perpX = dir.y * n.z - dir.z * n.y;
    const perpY = dir.z * n.x - dir.x * n.z;
    const perpZ = dir.x * n.y - dir.y * n.x;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
    const offsets = perpLen > 0.001
        ? [0, 0.25, -0.25]
        : [0];

    for (const off of offsets) {
        const sx = knotPos.x + (perpX / perpLen) * off;
        const sy = knotPos.y + (perpY / perpLen) * off;
        const sz = knotPos.z + (perpZ / perpLen) * off;
        _leafRaycaster.set(new THREE.Vector3(sx, sy, sz), dir);
        const hits = _leafRaycaster.intersectObject(mesh, false);
        if (hits.length > 0 && hits[0].distance < totalDist - 0.5) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Post-build collision verification
// ---------------------------------------------------------------------------

/** Check all segments of a built branch against the SDF. */
function branchCollidesWithSDF(
    branch: { segments: Array<{ bottomJoint?: { pos: { x: number; y: number; z: number } } | null; topJoint?: { pos: { x: number; y: number; z: number } } | null; diameter?: number }> },
    mesh: THREE.Mesh,
): boolean {
    for (const seg of branch.segments) {
        const start = seg.bottomJoint?.pos;
        const end = seg.topJoint?.pos;
        if (start && end) {
            const r = (seg.diameter ?? 1.0) / 2;
            if (isShaftBlocked(start, end, r, mesh)) return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Attachment capacity
// ---------------------------------------------------------------------------

/**
 * Count how many knots (branches + leaves) are attached to a trunk.
 * Does NOT count brace knots (they use braceSegment: prefix).
 */
function countAttachmentsOnTrunk(trunkId: string, draft: SupportState): number {
    const snapshot = draft;
    const trunk = snapshot.trunks[trunkId];
    if (!trunk) return 0;

    const segmentIds = new Set(trunk.segments.map(s => s.id));
    // Also match legacy knots that reference the trunk ID directly.
    segmentIds.add(trunkId);

    let count = 0;
    for (const knot of Object.values(snapshot.knots)) {
        if (segmentIds.has(knot.parentShaftId)) {
            count++;
        }
    }
    return count;
}

/** Returns true if the trunk has reached its attachment capacity. */
function isTrunkAtAttachmentCapacity(trunkId: string, limit: number, draft: SupportState): boolean {
    if (limit <= 0) return false;
    return countAttachmentsOnTrunk(trunkId, draft) >= limit;
}

// ---------------------------------------------------------------------------
// Nearby-trunk merge
// ---------------------------------------------------------------------------

/** Find the closest existing trunk (shaft or tip) within merge radius. */
function findMergeHost(
    tipPos: { x: number; y: number; z: number },
    modelId: string,
    draft: SupportState,
): MergeHost | null {
    const snapshot = draft;
    const r2 = GRIDLESS_MERGE_RADIUS_MM * GRIDLESS_MERGE_RADIUS_MM;
    let best: MergeHost | null = null;
    let bestDist2 = Infinity;

    for (const [id, trunk] of Object.entries(snapshot.trunks)) {
        if (trunk.modelId !== modelId) continue;

        // Check trunk tip (contact cone).
        const tp = trunk.contactCone?.pos;
        if (tp) {
            const dx = tipPos.x - tp.x;
            const dy = tipPos.y - tp.y;
            const dz = tipPos.z - tp.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= r2 && d2 < bestDist2) {
                bestDist2 = d2;
                best = { trunkId: id, tipPos: tp };
            }
        }

        // Also check segment joints (shaft body), preferring lower attachment.
        for (const seg of trunk.segments) {
            const jp = seg.bottomJoint?.pos ?? seg.topJoint?.pos;
            if (!jp) continue;
            const dx = tipPos.x - jp.x;
            const dy = tipPos.y - jp.y;
            const dz = tipPos.z - jp.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            // Slight preference for shaft body over tip (multiply by 0.9
            // so a shaft point at the same distance wins).
            const adjustedD2 = d2 * 0.9;
            if (adjustedD2 <= r2 && adjustedD2 < bestDist2) {
                bestDist2 = adjustedD2;
                best = { trunkId: id, tipPos: jp };
            }
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

/**
 * Run a single candidate through the standard placement pipeline:
 * resolve surface normal → buildTrunkData → decideGridPlacement → commit.
 *
 * When grid mode is disabled, we additionally check whether another
 * trunk already sits within {@link GRIDLESS_MERGE_RADIUS_MM} of this
 * candidate's tip.  If so, the candidate is routed as a branch off
 * that host instead of becoming a standalone trunk — preventing
 * clusters of near-identical vertical supports at the same XY.
 *
 * This is the same sequence used by manual placement clicks.
 * Returns the decision kind so the orchestrator can tally.
 */
function placeOneCandidate(
    candidate: CandidatePoint,
    draft: SupportState,
    _settingsOverride: Partial<AutoSupportSettings> | undefined,
    totalArea?: number,
    gridTrunkIds?: ReadonlySet<string>,
): { kind: string; draft: SupportState; kickstand?: KickstandState; rejectedReason?: RejectReason; preset?: 'detail' | 'structure' | 'anchor'; entityId?: string; stickCount?: number; fanRefusal?: FanLeafRefusal; mergeRefusal?: 'noHost' | 'rejected' } {
    const supportSettings = getSettings();
    const snapshot = draft;
    let d = draft;
    const mesh = getModelMesh(candidate.modelId) ?? undefined;

    // Grid points carry the region's exact surface position and normal (from
    // the classifier's own triangles, world space). Re-resolving via a
    // whole-mesh raycast hits the wrong face on sloped geometry (side walls
    // below the region face at the same XY), so trust the region data.
    const resolved = candidate.gridPoint && candidate.tipNormal && candidate.tipNormal.z < 0
        ? { point: candidate.tipPos, normal: candidate.tipNormal }
        : resolveSurfaceNormal(candidate.tipPos, mesh);
    const tipPos = resolved.point;
    const tipNormal = resolved.normal;

    // Determine preset band for analytics + empirical sizing.
    const area = candidate.islandAreaMm2;
    const preset = presetForArea(area);

    // ── Gridless merge check ──────────────────────────────────────
    // Density-grid points force standalone trunks (a flat region needs
    // independent supports, not a bush of branches off one shaft).
    let mergeHostFound = false;
    let fanRefusal: FanLeafRefusal | undefined;
    if (!supportSettings.grid?.enabled) {
        // Grid/poisson points fan into ISLAND trunks only (hosts not placed
        // from gridPoint candidates). Only ORGANIC Poisson + coverage-fill
        // points — flat-lattice grid infill and the anchor band stay
        // standalone (peel distribution). A pillar standing next to an island
        // trunk attaches as a leaf instead of duplicating it; grid points
        // never attach to other grid trunks.
        if (candidate.gridPoint && candidate.source === 'overhang' && gridTrunkIds
            && !candidate.anchorPoint && !candidate.id.startsWith('grid-')) {
            const auto = supportSettings.autoSupport ?? {};
            const islandPool = collectFanShaftPoints(draft)
                .filter((sp) => !gridTrunkIds.has(sp.trunkId));
            if (islandPool.length > 0) {
                const fan = fanLeafToTrunk(
                    tipPos,
                    candidate.modelId,
                    islandPool,
                    new Set(),
                    `auto-fan-${candidate.id}`,
                    auto.leafFanRadiusMm ?? LEAF_FAN_RADIUS_MM,
                    GRID_HOST_FAN_RADIUS_MM,
                    auto.leafFanMaxAngleDeg ?? LEAF_FAN_MAX_ANGLE_DEG,
                    auto.maxAttachmentsPerTrunk ?? 12,
                    draft,
                    mesh,
                    'overhang',
                );
                if (fan.ok) {
                    console.log(LOG_PREFIX,
                        `Leaf (grid→island) ${candidate.id} → trunk ${fan.trunkId} ` +
                        `dist=${fan.distMm.toFixed(1)}mm angle=${fan.angleDeg.toFixed(0)}°`);
                    return { kind: 'leaf', preset, draft: fan.draft };
                }
            }
        }
    }
    if (!supportSettings.grid?.enabled && !candidate.gridPoint) {
        // Overhang-derived candidates (sub-threshold, non-anchor regions)
        // attach via the regular leaf-fanning path — a standalone straight
        // trunk next to fan leaves reads as a misplaced island support. No
        // host in fan range → fall through to the merge/trunk fallbacks.
        if (candidate.source === 'overhang' && gridTrunkIds) {
            const auto = supportSettings.autoSupport ?? {};
            const fan = fanLeafToTrunk(
                tipPos,
                candidate.modelId,
                collectFanShaftPoints(draft),
                gridTrunkIds,
                `auto-fan-${candidate.id}`,
                auto.leafFanRadiusMm ?? LEAF_FAN_RADIUS_MM,
                GRID_HOST_FAN_RADIUS_MM,
                auto.leafFanMaxAngleDeg ?? LEAF_FAN_MAX_ANGLE_DEG,
                auto.maxAttachmentsPerTrunk ?? 12,
                draft,
                mesh,
                'overhang',
            );
            if (fan.ok) {
                console.log(LOG_PREFIX,
                    `Leaf (fan merge) ${candidate.id} → trunk ${fan.trunkId} ` +
                    `dist=${fan.distMm.toFixed(1)}mm angle=${fan.angleDeg.toFixed(0)}°`);
                return { kind: 'leaf', preset, draft: fan.draft };
            }
            fanRefusal = fan.reason;
        }
        let host = findMergeHost(tipPos, candidate.modelId, draft);
        // Island candidates never merge INTO grid trunks: at a junction the
        // island trunk should HOST the grid (the grid pillars convert to fan
        // leaves on it in the consolidation pass), not the reverse — a pillar
        // with a leaf still reads as a pillar.
        if (host && gridTrunkIds?.has(host.trunkId)) {
            host = null;
        }
        if (host) {
            mergeHostFound = true;
            // Find the best attachment point on the host trunk's shaft,
            // below the candidate's tip.  This matches the W-key sprout
            // behaviour: leaves/branches fan from the shaft body, not
            // from the contact tip.
            const hostTrunk = snapshot.trunks[host.trunkId];
            let bestKnotPos: { x: number; y: number; z: number } | null = null;
            let bestKnotSegmentId = '';

            // Best attachment: the junction where the shaft meets the
            // contact cone — the topJoint of the topmost segment.
            // For straight trunks this is just below the tip; for routed
            // trunks it's the socket joint before the cone.
            if (hostTrunk && hostTrunk.segments.length > 0) {
                const topSeg = hostTrunk.segments[hostTrunk.segments.length - 1];
                const jp = topSeg.topJoint?.pos;
                if (jp && jp.z < tipPos.z) {
                    bestKnotPos = jp;
                    bestKnotSegmentId = topSeg.id;
                }
            }
            // Fallback: any shaft joint below the tip.
            if (!bestKnotPos && hostTrunk) {
                for (const seg of hostTrunk.segments) {
                    const jp = seg.bottomJoint?.pos ?? seg.topJoint?.pos;
                    if (jp && jp.z < tipPos.z) {
                        if (!bestKnotPos || jp.z > bestKnotPos.z) {
                            bestKnotPos = jp;
                            bestKnotSegmentId = seg.id;
                        }
                    }
                }
            }
            const knotPos = bestKnotPos ?? host.tipPos;
            let knotDiameter = 1.0;
            if (hostTrunk && bestKnotSegmentId) {
                const seg = hostTrunk.segments.find(s => s.id === bestKnotSegmentId);
                if (seg?.diameter) knotDiameter = seg.diameter;
            }
            const parentKnot = {
                id: `auto-merge-${candidate.id}`,
                parentShaftId: bestKnotSegmentId || host.trunkId,
                pos: knotPos,
                diameter: knotDiameter + 0.1,
            };
            // Leaf decision: use tip-to-tip distance (host contact cone →
            // candidate tip), not shaft-knot distance.  This is the visual
            // span the leaf would bridge.
            const hostTip = hostTrunk?.contactCone?.pos ?? knotPos;
            const tipSpanMm = Math.sqrt(
                (tipPos.x - hostTip.x) ** 2 +
                (tipPos.y - hostTip.y) ** 2 +
                (tipPos.z - hostTip.z) ** 2,
            );
            const MAX_AUTO_LEAF_SPAN_MM = 8.0;
            if (tipSpanMm <= MAX_AUTO_LEAF_SPAN_MM) {
                // Knot attachment is on the shaft; angle check uses the
                // actual knot-to-tip geometry for the leaf cone.
                const hDist = Math.sqrt(
                    (tipPos.x - knotPos.x) ** 2 + (tipPos.y - knotPos.y) ** 2,
                );
                const vDist = tipPos.z - knotPos.z;
                if (vDist <= 0) {
                    console.log(LOG_PREFIX,
                        `Merge skip ${candidate.id}: knot above tip (kZ=${knotPos.z.toFixed(1)} tZ=${tipPos.z.toFixed(1)})`);
                } else if (vDist < 1.5) {
                    // Too shallow — fall through to branch.
                    console.log(LOG_PREFIX,
                        `Leaf (merge) ${candidate.id}: too shallow (vDist=${vDist.toFixed(1)}mm), trying branch...`);
                } else {
                    try {
                        const { leaf, supportData: sd } = buildLeafData({
                            tipPos,
                            surfaceNormal: tipNormal,
                            modelId: candidate.modelId,
                            parentKnot,
                            hostDiameterMm: parentKnot.diameter ?? 1.0,
                            mesh,
                        });
                        if (sd.error) {
                            console.log(LOG_PREFIX,
                                `Leaf (merge) ${candidate.id}: sd.error, trying branch...`);
                        } else if (mesh && leafConeCollides(parentKnot.pos, leaf.contactCone, mesh)) {
                            console.log(LOG_PREFIX,
                                `Leaf (merge) ${candidate.id}: triangle collision, trying branch...`);
                        } else {
                            const cap = supportSettings.autoSupport?.maxAttachmentsPerTrunk ?? 12;
                            if (isTrunkAtAttachmentCapacity(host.trunkId, cap, draft)) {
                                console.log(LOG_PREFIX,
                                    `Merge skip ${candidate.id}: host ${host.trunkId} at capacity (${cap} attachments)`);
                                // fall through to standalone trunk
                            } else {
                                d = draftAddKnot(d, parentKnot);
                                leaf.origin = candidate.source === 'overhang' ? 'overhang' : 'island';
                                d = draftAddLeaf(d, leaf);
                                const la = (Math.atan2(hDist, vDist) * 180) / Math.PI;
                                console.log(LOG_PREFIX,
                                    `Leaf (merge) ${candidate.id} → host ${host.trunkId} ` +
                                    `span=${tipSpanMm.toFixed(1)}mm angle=${la.toFixed(0)}° kZ=${knotPos.z.toFixed(1)}`);
                                return { kind: 'leaf', preset, draft: d };
                            }
                        }
                    } catch (_) {}
                }
            } else if (tipSpanMm > MAX_AUTO_LEAF_SPAN_MM && candidate.source !== 'overhang') {
                // Branch: requires upward angle from knot to tip. Only ISLAND
                // candidates branch here — overhang fanning is leaves by rule,
                // so an overhang single beyond leaf reach falls through and
                // the consolidation pass attaches it as a leaf where possible.
                const hDist2 = Math.sqrt(
                    (tipPos.x - knotPos.x) ** 2 + (tipPos.y - knotPos.y) ** 2,
                );
                const vDist2 = tipPos.z - knotPos.z;
                const mergeAngleDeg = (Math.atan2(hDist2, vDist2) * 180) / Math.PI;
                if (mergeAngleDeg > 50) {
                    console.log(LOG_PREFIX,
                        `Merge skip ${candidate.id}: angle too shallow (${mergeAngleDeg.toFixed(0)}° from vertical > 50°) span=${tipSpanMm.toFixed(1)}mm`);
                } else try {
                    const { branch, supportData: sd } = buildBranchData({
                        tipPos, tipNormal, modelId: candidate.modelId, parentKnot, mesh,
                    });
                    const collides = sd.error || (mesh && branchCollidesWithSDF(branch, mesh));
                    if (collides) {
                        console.log(LOG_PREFIX, `Branch (merge) ${candidate.id}: collision, falling back`);
                    } else {
                        const cap = supportSettings.autoSupport?.maxAttachmentsPerTrunk ?? 12;
                        if (isTrunkAtAttachmentCapacity(host.trunkId, cap, draft)) {
                            console.log(LOG_PREFIX,
                                `Merge skip ${candidate.id}: host ${host.trunkId} at capacity (${cap} attachments)`);
                            // fall through to standalone trunk
                        } else {
                            d = draftAddKnot(d, parentKnot);
                            // Branch fallback is island-only (overhang fanning
                            // is leaves) — the origin is always island here.
                            branch.origin = 'island';
                            d = draftAddBranch(d, branch);
                            const ma = (Math.atan2(hDist2, vDist2) * 180) / Math.PI;
                            console.log(LOG_PREFIX,
                                `Branch (merge) ${candidate.id} → host ${host.trunkId} ` +
                                `span=${tipSpanMm.toFixed(1)}mm angle=${ma.toFixed(0)}° kZ=${knotPos.z.toFixed(1)}`);
                            return { kind: 'branch', preset, draft: d };
                        }
                    }
                } catch (e) {
                    console.log(LOG_PREFIX,
                        `Merge branch failed for ${candidate.id}, falling back to trunk: ` +
                        `${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }
    }

    // Empirical sizing: grid cells carry their own cell area (each grid point
    // is a standalone trunk for one cell); merged clusters pass their summed
    // area so the trunk that absorbs several islands gets a small bump.
    const overrides = sizeParameters(
        candidate,
        candidate.gridPoint ? candidate.islandAreaMm2 : totalArea,
        supportSettings.autoSupport?.sizeScale ?? 1,
    );

    const trunkResult = buildTrunkData({
        tipPos,
        tipNormal,
        modelId: candidate.modelId,
        mesh,
        overrides,
        isPreview: false,
    });

    if (trunkResult.error) {
        // Cavity fallback: if the trunk can't reach the build plate, try
        // bridging to a lower surface with a Stick (model-to-model).
        if (trunkResult.error === 'COLLISION_WITH_MODEL' && mesh) {
            const cavityResult = buildCavityStick(tipPos, tipNormal, candidate.modelId, mesh);
            if (cavityResult) {
                if (cavityResult.kind === 'stick') {
                    d = draftAddStick(d, cavityResult.stick);
                    console.log(LOG_PREFIX,
                        `Stick (cavity) ${candidate.id} Z=${candidate.zHeight.toFixed(1)}mm`);
                    return { kind: 'stick', preset, draft: d };
                } else {
                    d = draftAddTwig(d, cavityResult.twig);
                    console.log(LOG_PREFIX,
                        `Twig (cavity) ${candidate.id} Z=${candidate.zHeight.toFixed(1)}mm`);
                    return { kind: 'twig', preset, draft: d };
                }
            }
        }
        const bbox = mesh ? new THREE.Box3().setFromObject(mesh) : null;
        console.log(LOG_PREFIX,
            `Rejected ${candidate.id}: trunk build error \"${trunkResult.error}\" ` +
            `tip=(${tipPos.x.toFixed(1)},${tipPos.y.toFixed(1)},${tipPos.z.toFixed(1)}) ` +
            `mesh=${mesh ? 'yes' : 'no'} ` +
            `bbox=${bbox ? `(${bbox.min.x.toFixed(0)},${bbox.min.y.toFixed(0)},${bbox.min.z.toFixed(0)})-(${bbox.max.x.toFixed(0)},${bbox.max.y.toFixed(0)},${bbox.max.z.toFixed(0)})` : 'none'}`);
        return { kind: 'reject', rejectedReason: 'trunk_build_error', preset, draft: d };
    }

    // Route through the standard grid placement engine.
    // This handles grid snapping, SDF collision checks, host-trunk
    // attachment (branch/leaf), anchor short-circuit, and rejection.
    const decision = decideGridPlacement({
        settings: supportSettings,
        snapshot,
        candidate: trunkResult,
        tipPos,
        tipNormal,
        modelId: candidate.modelId,
        mesh,
    });

    switch (decision.kind) {
        case 'place_trunk': {
            const trunkId = decision.trunkBuild.trunk.id;
            decision.trunkBuild.trunk.origin = candidate.gridPoint
                ? (candidate.anchorPoint ? 'anchor' : 'overhang')
                : (candidate.source === 'overhang' ? 'standalone' : 'island');
            d = draftAddRoot(d, decision.trunkBuild.root);
            d = draftAddTrunk(d, decision.trunkBuild.trunk);
            console.log(LOG_PREFIX,
                `Trunk ${candidate.id} (→ ${trunkId}) @ grid ${decision.nodeKey} ` +
                `area=${candidate.islandAreaMm2.toFixed(2)}mm² Z=${candidate.zHeight.toFixed(1)}mm ${preset}` +
                (fanRefusal ? ` fan:${fanRefusal}` : '') +
                (mergeHostFound ? ' merge:rejected' : ''));
            const mergeChecked = !supportSettings.grid?.enabled && !candidate.gridPoint;
            return {
                kind: 'trunk', preset, entityId: trunkId, draft: d,
                fanRefusal,
                mergeRefusal: mergeChecked ? (mergeHostFound ? 'rejected' : 'noHost') : undefined,
            };
        }

        case 'place_anchor':
            decision.anchor.origin = candidate.gridPoint
                ? (candidate.anchorPoint ? 'anchor' : 'overhang')
                : (candidate.source === 'overhang' ? 'standalone' : 'island');
            d = draftAddAnchor(d, decision.anchor);
            console.log(LOG_PREFIX, `Anchor ${candidate.id} Z=${candidate.zHeight.toFixed(1)}mm`);
            return { kind: 'anchor', preset, draft: d };

        case 'place_branch': {
            const cap = supportSettings.autoSupport?.maxAttachmentsPerTrunk ?? 12;
            if (isTrunkAtAttachmentCapacity(decision.hostTrunkId, cap, draft)) {
                console.log(LOG_PREFIX,
                    `Grid skip ${candidate.id}: host ${decision.hostTrunkId} at capacity (${cap})`);
                return { kind: 'reject', rejectedReason: 'grid_reject_other', preset, draft: d };
            }
            d = draftAddKnot(d, decision.knot);
            d = draftAddBranch(d, decision.branch);
            console.log(LOG_PREFIX,
                `Branch ${candidate.id} → host ${decision.hostTrunkId} ` +
                `grid ${decision.nodeKey}`);
            return { kind: 'branch', preset, draft: d };
        }

        case 'place_leaf': {
            const cap = supportSettings.autoSupport?.maxAttachmentsPerTrunk ?? 12;
            if (isTrunkAtAttachmentCapacity(decision.hostTrunkId, cap, draft)) {
                console.log(LOG_PREFIX,
                    `Grid skip ${candidate.id}: host ${decision.hostTrunkId} at capacity (${cap})`);
                return { kind: 'reject', rejectedReason: 'grid_reject_other', preset, draft: d };
            }
            d = draftAddKnot(d, decision.knot);
            d = draftAddLeaf(d, decision.leaf);
            console.log(LOG_PREFIX,
                `Leaf ${candidate.id} → host ${decision.hostTrunkId} ` +
                `grid ${decision.nodeKey}`);
            return { kind: 'leaf', preset, draft: d };
        }

        case 'replace_trunk': {
            // Same promote-to-trunk flow as manual placement: materialize the
            // promoted branch, plan the replacement, then apply it. The old
            // trunk's contact is preserved as a branch on the new trunk and
            // rehostable branches/leaves are re-attached — the old trunk is
            // never left orphaned at the node.
            const promoteKnot = decision.promoteKnot;
            const promoteBranch = decision.promoteBranch;
            if (!promoteKnot || !promoteBranch) {
                console.log(LOG_PREFIX,
                    `Replace skip ${candidate.id}: no promoted branch from grid engine`);
                return { kind: 'reject', rejectedReason: 'grid_reject_other', preset, draft: d };
            }
            d = draftAddKnot(d, promoteKnot);
            d = draftAddBranch(d, promoteBranch);
            const planned = planTrunkReplacement({
                snapshot: d,
                trunkIdToRemove: decision.hostTrunkId,
                mode: 'grid_promote_candidate_to_trunk',
                nodeKey: decision.nodeKey,
                promoteBranchId: promoteBranch.id,
            });
            const plan = planned?.plan;
            if (!plan) {
                console.log(LOG_PREFIX,
                    `Replace skip ${candidate.id}: replacement planner failed (host ${decision.hostTrunkId})`);
                return { kind: 'reject', rejectedReason: 'grid_reject_other', preset, draft: d };
            }
            // The replacement machinery (cascading rehosts, diameter profiles)
            // is store-bound and shared with manual promote — the plan phase
            // commits the draft so far, applies the replacement, and re-reads.
            // The run-level rollback guard + single history entry keep this
            // atomic for the user; a later worker pass will make it pure.
            setSnapshot(d);
            const ok = applyTrunkReplacement(
                { ...plan, trunkToAdd: decision.trunkBuild.trunk, rootToAdd: decision.trunkBuild.root },
                undefined,
                { skipHistory: true }, // the whole run is one undoable entry
            );
            d = ok ? getSnapshot() : d;
            if (!ok) {
                console.log(LOG_PREFIX,
                    `Replace skip ${candidate.id}: applyTrunkReplacement failed (host ${decision.hostTrunkId})`);
                return { kind: 'reject', rejectedReason: 'grid_reject_other', preset, draft: d };
            }
            console.log(LOG_PREFIX,
                `Replace trunk @ ${decision.nodeKey}: ` +
                `${candidate.id} (Z=${candidate.zHeight.toFixed(1)}) → host ${decision.hostTrunkId}`);
            return {
                kind: 'trunk', preset, entityId: decision.trunkBuild.trunk.id, draft: d,
                // the removal cascade can strip auto kickstands — re-sync the draft
                kickstand: structuredClone(getKickstandSnapshot()),
            };
        }

        case 'reject': {
            const reason: RejectReason =
                decision.reason === 'COLLISION_WITH_MODEL' ? 'grid_reject_collision' :
                decision.reason === 'NO_VALID_ATTACHMENT' || decision.reason === 'KNOT_ABOVE_TIP' ? 'grid_reject_no_attachment' :
                'grid_reject_other';
            console.log(LOG_PREFIX, `Rejected ${candidate.id}: ${decision.reason} (grid ${decision.nodeKey})`);
            return { kind: 'reject', rejectedReason: reason, preset, draft: d };
        }
    }
}

// ---------------------------------------------------------------------------
// runAutoPlace
// ---------------------------------------------------------------------------

/**
 * Run the complete auto-support pipeline using the standard placement engine.
 *
 * Each candidate is individually routed through
 * {@link decideGridPlacement}, the same function used by manual support
 * placement.  This guarantees that SDF collision checks, grid snapping,
 * host-trunk attachment rules, and anchor/branch/leaf auto-selection are
 * identical to the manual workflow.
 *
 * Candidates are processed in priority order (largest / lowest islands
 * first).  Because the state snapshot is refreshed after every commit,
 * later candidates see the supports placed by earlier ones, enabling
 * organic tree fan-out via grid occupancy — a subsequent candidate whose
 * preferred grid node is already occupied will automatically become a
 * branch or leaf of the existing trunk.
 */
/**
 * Compute the full auto-support pipeline against a LOCAL draft — no store
 * commits, no notify() — and return the plan: before/after state pair plus
 * analytics. This is the atomic-commit seam: the caller applies the plan with
 * one `setSnapshot` + `setKickstandSnapshot` + a single history entry, and a
 * later step can run this same function inside a Web Worker.
 *
 * The base states and mesh default to the live stores/model, but can be passed
 * explicitly (worker deserialization); settings are read from the live store.
 *
 * NOTE: the one store-coupled path is the grid promote (`replace_trunk`), which
 * runs the shared manual-promote machinery via a mid-run swap; the rollback
 * guard below keeps that atomic. Everything else — placement, gap-fill,
 * fanning, overhang coverage, bracing — is draft-only.
 */

export type FanShaftPoint = {
    trunkId: string;
    pos: { x: number; y: number; z: number };
    diameter: number;
};

/**
 * Pick the fanning host for an uncovered island.
 *
 * The nearest shaft point wins, but density-grid trunks are hosts only up
 * close (tight grid-host radius) — a long leaf from a grid shaft would sweep
 * across the grid forest and puncture sibling grid shafts. When the nearest
 * host is a grid trunk beyond the tight radius, fall back to the nearest
 * regular trunk (within the regular fan radius).
 */
export function pickFanHost(
    shaftPoints: FanShaftPoint[],
    gridTrunkIds: ReadonlySet<string>,
    target: { x: number; y: number; z: number },
    fanRadiusMm: number,
    gridHostFanRadiusMm: number,
): { sp: FanShaftPoint; dist2: number } | null {
    let best: FanShaftPoint | null = null;
    let bestDist2 = Infinity;
    let bestRegular: FanShaftPoint | null = null;
    let bestRegularDist2 = Infinity;

    for (const sp of shaftPoints) {
        const dx = target.x - sp.pos.x;
        const dy = target.y - sp.pos.y;
        const dz = target.z - sp.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestDist2) { bestDist2 = d2; best = sp; }
        if (!gridTrunkIds.has(sp.trunkId) && d2 < bestRegularDist2) {
            bestRegularDist2 = d2;
            bestRegular = sp;
        }
    }

    if (best && gridTrunkIds.has(best.trunkId) && bestDist2 > gridHostFanRadiusMm * gridHostFanRadiusMm) {
        best = bestRegular;
        bestDist2 = bestRegularDist2;
    }

    if (!best || bestDist2 > fanRadiusMm * fanRadiusMm) return null;
    return { sp: best, dist2: bestDist2 };
}

/** Squared distance between two 3D segments (closest points). */
function segmentDistanceSq(
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    p4: { x: number; y: number; z: number },
): number {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d1z = p2.z - p1.z;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y, d2z = p4.z - p3.z;
    const rx = p1.x - p3.x, ry = p1.y - p3.y, rz = p1.z - p3.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    let s = 0;
    let t = 0;
    if (a < 1e-9) {
        if (e < 1e-9) { /* both points */ } else { t = clamp01(f / e); }
    } else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e < 1e-9) {
            s = clamp01(-c / a);
        } else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z;
            const denom = a * e - b * b;
            if (denom !== 0) s = clamp01((b * f - c * e) / denom);
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = clamp01(-c / a); }
            else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
        }
    }

    const c1x = p1.x + d1x * s, c1y = p1.y + d1y * s, c1z = p1.z + d1z * s;
    const c2x = p3.x + d2x * t, c2y = p3.y + d2y * t, c2z = p3.z + d2z * t;
    const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * True when the straight leaf path (knot → tip) passes within the leaf
 * radius + shaft radius of ANY other trunk's shaft. The guarantee that fans
 * never puncture neighboring supports.
 */
export function leafPathCrossesSupports(
    knotPos: { x: number; y: number; z: number },
    tipPos: { x: number; y: number; z: number },
    leafRadiusMm: number,
    draft: SupportState,
    hostTrunkId: string,
): boolean {
    for (const [tid, trunk] of Object.entries(draft.trunks)) {
        if (tid === hostTrunkId) continue;
        for (const seg of trunk.segments) {
            const start = seg.bottomJoint?.pos;
            const end = seg.topJoint?.pos;
            if (!start || !end) continue;
            const shaftRadius = (seg.diameter ?? 1.0) / 2;
            const clearance = leafRadiusMm + shaftRadius;
            if (segmentDistanceSq(knotPos, tipPos, start, end) < clearance * clearance) return true;
        }
    }
    return false;
}

/** Shaft samples per segment for fanning host picking. */
const SHAFT_SAMPLES_PER_SEGMENT = 10;
/** Max leaf-fanning convergence passes. */
const MAX_FANNING_PASSES = 5;

/** Collect trunk shaft sample points from a snapshot — the fanning host pool. */
export function collectFanShaftPoints(draft: SupportState): FanShaftPoint[] {
    const shaftPoints: FanShaftPoint[] = [];
    for (const [tid, trunk] of Object.entries(draft.trunks)) {
        for (const seg of trunk.segments) {
            const start = seg.bottomJoint?.pos ?? { x: 0, y: 0, z: 1.5 };
            const end = seg.topJoint?.pos;
            if (!end) continue;
            const diameter = seg.diameter ?? 1.0;
            for (let i = 0; i <= SHAFT_SAMPLES_PER_SEGMENT; i++) {
                const t = i / SHAFT_SAMPLES_PER_SEGMENT;
                shaftPoints.push({
                    trunkId: tid,
                    pos: {
                        x: start.x + (end.x - start.x) * t,
                        y: start.y + (end.y - start.y) * t,
                        z: start.z + (end.z - start.z) * t,
                    },
                    diameter,
                });
            }
        }
    }
    return shaftPoints;
}

export type FanLeafResult =
    | { ok: true; draft: SupportState; trunkId: string; distMm: number; angleDeg: number }
    | { ok: false; reason: FanLeafRefusal };

/**
 * Attach a fan leaf from the nearest trunk shaft to `target` — the SHARED
 * fanning implementation. Used by the post-placement fanning pass (uncovered
 * islands) and by overhang-derived candidates during placement (they should
 * fan, not become standalone straight trunks).
 *
 * A fan leaf must never cross another support's shaft — the target stays
 * unsupported rather than impale anything.
 */
export function fanLeafToTrunk(
    target: { x: number; y: number; z: number },
    modelId: string,
    shaftPoints: FanShaftPoint[],
    gridTrunkIds: ReadonlySet<string>,
    knotIdPrefix: string,
    fanRadiusMm: number,
    gridHostFanRadiusMm: number,
    maxAngleDeg: number,
    maxAttachments: number,
    draft: SupportState,
    mesh: THREE.Mesh | undefined,
    origin?: SupportOrigin,
): FanLeafResult {
    // Single pass over the shaft pool: the nearest sample that is ELIGIBLE
    // (grid trunks host only up close) and geometrically VALID (not same-Z,
    // within the max angle from vertical) wins. The nearest sample alone is
    // not enough — it can sit at an unworkable angle while a slightly farther
    // one is a perfect fan host.
    let best: FanShaftPoint | null = null;
    let bestDist2 = Infinity;
    let bestAngleDeg = 0;
    let refusal: FanLeafRefusal = 'noHost';

    for (const sp of shaftPoints) {
        const isGrid = gridTrunkIds.has(sp.trunkId);
        const limit = isGrid ? gridHostFanRadiusMm : fanRadiusMm;
        const ddx = sp.pos.x - target.x;
        const ddy = sp.pos.y - target.y;
        const ddz = sp.pos.z - target.z;
        const dist2 = ddx * ddx + ddy * ddy + ddz * ddz;
        if (dist2 > limit * limit) continue;

        // The leaf must RISE: the host sample must sit below the target tip.
        // absVDist here was the bug — it let leaves attach from a sample ABOVE
        // the tip, hanging downward (upside-down leaves that read as shallow).
        const vDist = target.z - sp.pos.z;
        if (vDist < 0.01) {
            if (refusal === 'noHost') refusal = 'sameZ';
            continue;
        }
        const angleDeg = (Math.atan2(Math.sqrt(ddx * ddx + ddy * ddy), vDist) * 180) / Math.PI;
        if (angleDeg > maxAngleDeg) {
            if (refusal === 'noHost') refusal = 'angle';
            continue;
        }
        if (dist2 < bestDist2) {
            best = sp;
            bestDist2 = dist2;
            bestAngleDeg = angleDeg;
        }
    }
    if (!best) return { ok: false, reason: refusal };

    const sp = best;
    const parentKnot = {
        id: knotIdPrefix,
        parentShaftId: sp.trunkId,
        pos: sp.pos,
        diameter: sp.diameter + 0.1,
    };

    // SDF collision check: the straight path from knot to tip must be clear.
    if (mesh && isShaftBlocked(sp.pos, target, 0.2, mesh)) return { ok: false, reason: 'blocked' };

    let leaf;
    try {
        const resolved = resolveSurfaceNormal(target, mesh ?? undefined);
        const built = buildLeafData({
            tipPos: resolved.point,
            surfaceNormal: resolved.normal,
            modelId,
            parentKnot,
            hostDiameterMm: sp.diameter,
            mesh: mesh ?? undefined,
        });
        if (built.supportData.error) return { ok: false, reason: 'build' };
        leaf = built.leaf;
    } catch {
        return { ok: false, reason: 'build' };
    }

    if (leafPathCrossesSupports(
        parentKnot.pos,
        leaf.contactCone?.pos ?? target,
        0.25,
        draft,
        sp.trunkId,
    )) {
        return { ok: false, reason: 'cross' };
    }
    if (maxAttachments > 0 && isTrunkAtAttachmentCapacity(sp.trunkId, maxAttachments, draft)) {
        return { ok: false, reason: 'capacity' };
    }

    const next = draftAddKnot(draft, parentKnot);
    if (origin) leaf.origin = origin;
    return {
        ok: true,
        draft: draftAddLeaf(next, leaf),
        trunkId: sp.trunkId,
        distMm: Math.sqrt(bestDist2),
        angleDeg: bestAngleDeg,
    };
}

export function computeAutoSupportPlan(
    islands: DetectedIsland[],
    modelId: string,
    settingsOverride?: Partial<AutoSupportSettings>,
    baseState?: SupportState,
    baseKickstand?: KickstandState,
    mesh?: THREE.Mesh,
): AutoSupportPlan | null {
    // ------------------------------------------------------------------
    // 0. Settings
    // ------------------------------------------------------------------

    const autoSettings = normalizeAutoSupportSettings(settingsOverride ?? undefined);

    if (!autoSettings.enabled) {
        return null;
    }

    const before = baseState ?? structuredClone(getSnapshot());
    const kickstandBefore = baseKickstand ?? structuredClone(getKickstandSnapshot());
    let draft: SupportState = before;
    let kickstandDraft: KickstandState = kickstandBefore;

    // Trunks placed from density-grid cells — fanning hosts only up close.
    const gridTrunkIds = new Set<string>();

    // Early-exit no-op plan (no candidates / nothing to place): the run
    // reported as unchanged, so the caller commits nothing.
    const noopPlan = (result: AutoPlaceResult): AutoSupportPlan => ({
        before,
        kickstandBefore,
        support: draft,
        kickstand: kickstandDraft,
        analytics: {
            islandsCovered: 0,
            islandsUncovered: islands.length,
            presets: { detail: 0, structure: 0, anchor: 0 },
            rejectionReasons: {},
            areaCoverage: 0,
            distribution: { grid: 0, poisson: 0 },
        },
        result,
    });

    // The model mesh is needed by the grid phase (surface snapping) and the
    // placement pipeline (pathfinding + collision).
    const resolvedMesh: THREE.Mesh | undefined = mesh ?? (getModelMesh(modelId) ?? undefined);
    if (resolvedMesh) resolvedMesh.updateMatrixWorld();

    // ------------------------------------------------------------------
    // 1. Generate candidates
    // ------------------------------------------------------------------

    console.log(LOG_PREFIX, `Input: ${islands.length} islands from scan`);

    let candidates = generateCandidates(islands, autoSettings);
    candidates = candidates.map((c): CandidatePoint => ({ ...c, modelId }));

    // Candidate generation phase: large flat overhang regions become density
    // grids, anchor regions get the Poisson disk (dense perimeter + infill).
    // Each region's own single candidate is replaced by its generated set.
    // A generation failure must not kill the whole run — fall back to the
    // region's single candidate.
    const overhangIslands = islands.filter((i) => i.source === 'overhang');

    // Per-contact-patch anchor bands: regions within the band of their own
    // Z-cluster's lowest member get the densified treatment — the first-printed
    // underside of a fully-supported print (anchorBands.ts).
    const anchorBands = buildAnchorBands(
        overhangIslands,
        autoSettings.anchorBandHeightMm,
        autoSettings.anchorSpacingFactor,
    );
    const anchorIds = new Set(anchorBands.inBandIds);

    // Distribution dispatch: shape-driven. 'auto' = planar regions → dynamic
    // grid, organic/curved → Poisson disk (flatness metric); 'grid' / 'poisson'
    // force one distribution. The anchor band governs DENSITY only (via
    // anchorScaleById), never the distribution — a flat square underside is
    // planar and belongs on the grid at anchor density.
    const distributionMode = autoSettings.distributionMode;
    const threshold = autoSettings.gridAreaThresholdMm2;
    const eligible = overhangIslands.filter(
        (i) => anchorIds.has(i.id) || (i.areaMm2 ?? 0) >= threshold,
    );
    let distributionCounts: { grid: number; poisson: number } = { grid: 0, poisson: 0 };

    if (eligible.length > 0) {
        let generated: CandidatePoint[] = [];
        try {
            for (const island of eligible) {
                const flatness = distributionMode === 'auto' ? computeRegionFlatnessDeg(island) : 0;
                const organic = distributionMode === 'auto'
                    && flatness > autoSettings.poissonFlatnessThresholdDeg;
                const usePoisson = distributionMode === 'poisson' || organic;
                console.log(LOG_PREFIX,
                    `Dispatch ${island.id}: flatness=${flatness.toFixed(1)}° ` +
                    `(threshold ${autoSettings.poissonFlatnessThresholdDeg}°) → ${usePoisson ? 'poisson' : 'grid'} ` +
                    `${anchorIds.has(island.id) ? 'anchor ' : ''}area=${(island.areaMm2 ?? 0).toFixed(0)}mm²`);
                if (usePoisson) {
                    generated.push(...generatePoissonCandidates(
                        [island], autoSettings, anchorBands.scaleById, anchorIds,
                    ));
                    distributionCounts.poisson++;
                } else {
                    generated.push(...generateGridCandidates(
                        [island], autoSettings, anchorBands.scaleById, anchorIds,
                    ));
                    distributionCounts.grid++;
                }
            }
            generated = generated.map((c): CandidatePoint => ({ ...c, modelId }));
        } catch (e) {
            console.error(LOG_PREFIX,
                `Candidate generation failed — falling back to per-region candidates.`,
                e instanceof Error ? e.message : String(e));
        }
        const generatedRegionIds = new Set(eligible.map((i) => i.id));
        if (generated.length > 0) {
            candidates = [
                ...generated,
                ...candidates.filter((c) => !generatedRegionIds.has(c.id)),
            ];
        }
    }

    console.log(LOG_PREFIX,
        `Step 1/3: ${candidates.length} candidates generated ` +
        `(filtered from ${islands.length} islands, min area ${autoSettings.minIslandAreaMm2}mm², ` +
        `grid: ${autoSettings.areaPerSupportMm2}mm²/support @ ${autoSettings.gridAreaThresholdMm2}mm² threshold)` +
        (anchorBands.inBandIds.length > 0
            ? ` | anchor: ${anchorBands.clusterCount} clusters, ${anchorBands.inBandIds.length}/${overhangIslands.length} regions @ ${autoSettings.anchorSpacingFactor}×`
            : '') +
        ` | distribution: ${distributionCounts.grid} grid, ${distributionCounts.poisson} poisson`);

    if (candidates.length === 0) {
        return noopPlan(makeResult(0, 0, 0, 0, 0, 0, false, 'No viable support candidates found.'));
    }

    // ------------------------------------------------------------------
    // 2. Deduplicate
    // ------------------------------------------------------------------

    const beforeDedup = candidates.length;
    candidates = deduplicateCandidates(candidates, autoSettings);

    console.log(LOG_PREFIX,
        `Step 2/3: ${candidates.length} candidates after dedup ` +
        `(removed ${beforeDedup - candidates.length} within ${autoSettings.tipInfluenceRadiusMm}mm radius)`);

    if (candidates.length === 0) {
        return noopPlan(makeResult(0, 0, 0, 0, 0, 0, false, 'All candidates deduplicated — nothing to place.'));
    }

    // ------------------------------------------------------------------
    // 2b. Filter out already-supported positions
    // ------------------------------------------------------------------

    const beforeSupportFilter = candidates.length;
    candidates = filterAlreadySupported(candidates, draft);
    console.log(LOG_PREFIX,
        `Step 2b: ${candidates.length} candidates after support filter ` +
        `(removed ${beforeSupportFilter - candidates.length} already supported within ${ALREADY_SUPPORTED_RADIUS_MM}mm)`);

    if (candidates.length === 0) {
        return noopPlan(makeResult(0, 0, 0, 0, 0, 0, false,
            'All candidate positions already have supports.'));
    }

    // ------------------------------------------------------------------
    // 3. Place candidates through the standard pipeline
    // ------------------------------------------------------------------
    // Each candidate goes through resolveNormal → buildTrunkData →
    // decideGridPlacement.  State is committed after each placement so
    // subsequent candidates see existing supports (enabling organic
    // tree fan-out via grid occupancy).

    console.log(LOG_PREFIX,
        `Mesh for ${modelId}: ${resolvedMesh ? 'available (pathfinding + SDF active)' : 'UNAVAILABLE (supports route straight, no collision avoidance)'}`);

    const gridEnabled = getSettings().grid?.enabled;
    console.log(LOG_PREFIX,
        `Grid mode: ${gridEnabled ? 'ENABLED (supports share grid nodes, branch/leaf fan-out active)' : 'DISABLED (all supports become standalone trunks)'}`);

    // ── Model sizing context (mesh volume/top-Z for the debug analytics) ──
    let modelCtx: ModelSizingContext | undefined;
    if (resolvedMesh) {
        const bbox = new THREE.Box3().setFromObject(resolvedMesh);
        modelCtx = {
            modelVolumeMm3: computeMeshVolumeMm3(resolvedMesh),
            modelZMaxMm: bbox.max.z,
            totalCandidates: candidates.length,
        };
    }

    let placedTrunks = 0;
    let placedAnchors = 0;
    let placedBranches = 0;
    let placedLeaves = 0;
    let placedSticks = 0;
    let rejectedCount = 0;

    // Placement-path diagnostics: where each placed trunk came from and why
    // non-fanned candidates didn't fan/merge. Pure counts — no physics.
    const diagnostics: PlacementDiagnostics = {
        candidatesBySource: { voxel: 0, minima: 0, intersection: 0, overhang: 0 },
        candidatesByDistribution: { grid: 0, poisson: 0, single: 0 },
        trunksByKind: { poissonDisk: 0, gridInfill: 0, coverageFill: 0, standalone: 0 },
        fanRefusals: {},
        mergeRefusals: {},
    };
    // Trunk id → origin kind, so the consolidation pass can adjust the tallies
    // when it converts a standalone grid pillar into a fan leaf.
    const trunkOriginById = new Map<string, 'poissonDisk' | 'gridInfill' | 'coverageFill'>();

    // Analytics accumulators
    const presets = { detail: 0, structure: 0, anchor: 0 };
    const rejectionReasons: Record<string, number> = {};

    // Pre-compute cluster totals: for each candidate, sum the areas
    // of all candidates within merge radius.  Core trunks get sized
    // for their full cluster, not just their own tiny island.
    const clusterTotal = new Map<string, number>();
    const mergeR2 = GRIDLESS_MERGE_RADIUS_MM * GRIDLESS_MERGE_RADIUS_MM;
    for (const c of candidates) {
        let total = c.islandAreaMm2;
        for (const other of candidates) {
            if (other.id === c.id) continue;
            const dx = c.tipPos.x - other.tipPos.x;
            const dy = c.tipPos.y - other.tipPos.y;
            const dz = c.tipPos.z - other.tipPos.z;
            if (dx * dx + dy * dy + dz * dz <= mergeR2) {
                total += other.islandAreaMm2;
            }
        }
        clusterTotal.set(c.id, total);
    }

    // Step 3 is wrapped in a rollback guard: state is committed per-candidate,
    // so an uncaught failure mid-run would otherwise leave partial supports in
    // the store with no history entry to undo them.
    let analytics!: AutoPlaceAnalytics;
    try {
    // Per-candidate placement, shared by the main pass and the coverage
    // convergence (gap-fill) passes. Each placement advances the local draft
    // (no store commit) so later candidates see earlier supports.
    const placeOne = (candidate: CandidatePoint): string => {
        try {
            const result = placeOneCandidate(candidate, draft, settingsOverride, clusterTotal.get(candidate.id), gridTrunkIds);
            draft = result.draft;
            if (result.kickstand) kickstandDraft = result.kickstand;
            if (candidate.gridPoint && result.kind === 'trunk' && result.entityId) {
                gridTrunkIds.add(result.entityId);
            }
            switch (result.kind) {
                case 'trunk':   placedTrunks++; break;
                case 'anchor':  placedAnchors++; break;
                case 'branch':  placedBranches++; break;
                case 'leaf':    placedLeaves++; break;
                case 'stick':   placedSticks++; break;
                case 'reject':
                    rejectedCount++;
                    if (result.rejectedReason) {
                        rejectionReasons[result.rejectedReason] = (rejectionReasons[result.rejectedReason] ?? 0) + 1;
                    }
                    break;
            }
            if (result.preset) presets[result.preset]++;

            // Placement-path diagnostics: where each candidate ended up.
            diagnostics.candidatesBySource[candidate.source] =
                (diagnostics.candidatesBySource[candidate.source] ?? 0) + 1;
            if (candidate.gridPoint) {
                if (candidate.id.startsWith('perim-') || candidate.id.startsWith('poisson-')) {
                    diagnostics.candidatesByDistribution.poisson++;
                } else {
                    diagnostics.candidatesByDistribution.grid++;
                }
            } else {
                diagnostics.candidatesByDistribution.single++;
            }
            if (result.kind === 'trunk' && result.entityId) {
                if (candidate.gridPoint) {
                    if (candidate.id.startsWith('perim-') || candidate.id.startsWith('poisson-')) {
                        diagnostics.trunksByKind.poissonDisk++;
                        trunkOriginById.set(result.entityId, 'poissonDisk');
                    } else if (candidate.id.startsWith('fill-')) {
                        diagnostics.trunksByKind.coverageFill++;
                        trunkOriginById.set(result.entityId, 'coverageFill');
                    } else {
                        diagnostics.trunksByKind.gridInfill++;
                        trunkOriginById.set(result.entityId, 'gridInfill');
                    }
                } else {
                    diagnostics.trunksByKind.standalone++;
                }
            }
            if (result.fanRefusal) {
                diagnostics.fanRefusals[result.fanRefusal] = (diagnostics.fanRefusals[result.fanRefusal] ?? 0) + 1;
            }
            if (result.mergeRefusal) {
                diagnostics.mergeRefusals[result.mergeRefusal] = (diagnostics.mergeRefusals[result.mergeRefusal] ?? 0) + 1;
            }
            return result.kind;
        } catch (e) {
            rejectedCount++;
            rejectionReasons['exception'] = (rejectionReasons['exception'] ?? 0) + 1;
            console.warn(LOG_PREFIX,
                `Exception placing ${candidate.id}: ${e instanceof Error ? e.message : String(e)}`);
            return 'reject';
        }
    };

    for (const candidate of candidates) {
        placeOne(candidate);
    }

    // ── Overhang→tree consolidation (order-independent) ──────────────
    // A BARE overhang-origin trunk (organic Poisson, coverage fill,
    // sub-threshold single) whose tip is within the consolidation fan radius
    // of a valid host is converted into a fan leaf — whether the host placed
    // before or after it, the junction reads as a tree. The radius is wider
    // than the regular fanning radius (8 mm) so overhang trunks 5–8 mm from
    // an island trunk still merge; the ANGLE stays at the regular fan limit —
    // a near-horizontal leaf is not a support. Same-height pillars (vDist ≈ 0)
    // cannot fan at all and stay as their own trunks.
    const CONSOLIDATION_FAN_RADIUS_MM = 8;
    const conFanRadiusMm = Math.max(autoSettings.leafFanRadiusMm ?? LEAF_FAN_RADIUS_MM, CONSOLIDATION_FAN_RADIUS_MM);
    const conFanMaxAngleDeg = autoSettings.leafFanMaxAngleDeg ?? LEAF_FAN_MAX_ANGLE_DEG;
    let consolidated = 0;
    for (let pass = 0; pass < 3; pass++) {
        let convertedThisPass = 0;
        for (const tid of Object.keys(draft.trunks)) {
            // Convertible: organic Poisson disks, coverage fill, and
            // sub-threshold overhang singles — the overhang forest should
            // read as trees. Flat-lattice grid infill and the anchor band
            // stay independent (peel distribution), islands keep their trunks.
            const originKind = trunkOriginById.get(tid);
            const isConvertible = originKind === 'poissonDisk' || originKind === 'coverageFill'
                || draft.trunks[tid].origin === 'standalone';
            if (!isConvertible) continue;
            if (countAttachmentsOnTrunk(tid, draft) > 0) continue;
            const trunk = draft.trunks[tid];
            const tip = trunk.contactCone?.pos;
            if (!tip) continue;
            const pruned: SupportState = {
                ...draft,
                trunks: { ...draft.trunks },
                roots: { ...draft.roots },
            };
            delete pruned.trunks[tid];
            delete pruned.roots[trunk.rootId];
            const pool = collectFanShaftPoints(pruned);
            if (pool.length === 0) break;
            const fan = fanLeafToTrunk(
                tip,
                modelId,
                pool,
                new Set(),
                `auto-con-${tid}-p${pass}`,
                conFanRadiusMm,
                GRID_HOST_FAN_RADIUS_MM,
                conFanMaxAngleDeg,
                autoSettings.maxAttachmentsPerTrunk,
                pruned,
                resolvedMesh ?? undefined,
                'overhang',
            );
            if (!fan.ok) continue;
            draft = fan.draft;
            gridTrunkIds.delete(tid);
            const origin = originKind ?? 'standalone';
            diagnostics.trunksByKind[origin]--;
            placedTrunks--;
            placedLeaves++;
            consolidated++;
            convertedThisPass++;
        }
        if (convertedThisPass === 0) break;
    }
    if (consolidated > 0) {
        console.log(LOG_PREFIX,
            `Overhang consolidation: ${consolidated} standalone trunks merged into fan trees`);
    }

    // ── Anchor tree merging ────────────────────────────────────────
    // Professional reference (official models): the underside is anchored
    // with ~4 mm root spacing and dense branching (118 tips / 28 roots),
    // NOT a 1:1 pillar forest. Merge bare anchor trunks into branching
    // trees — the nearest anchor host within the root spacing hosts the
    // member's tip as a BRANCH rising from its shaft. Branches must be
    // STEEP (≤ 30° from vertical = ≥ 60° above horizontal): the app's
    // stability checker flags horizontal angles as unable to hold
    // overhangs, and a 50°-shallow branch triggered exactly that.
    // Capacity-bound; grid infill and islands untouched.
    const ANCHOR_TREE_ROOT_SPACING_MM = 4.0;
    const ANCHOR_TREE_MAX_ANGLE_DEG = 30;
    let anchorMerged = 0;
    for (let pass = 0; pass < 3; pass++) {
        let mergedThisPass = 0;
        for (const tid of Object.keys(draft.trunks)) {
            if (draft.trunks[tid].origin !== 'anchor') continue;
            if (countAttachmentsOnTrunk(tid, draft) > 0) continue;
            const trunk = draft.trunks[tid];
            const tip = trunk.contactCone?.pos;
            if (!tip) continue;
            const pruned: SupportState = {
                ...draft,
                trunks: { ...draft.trunks },
                roots: { ...draft.roots },
            };
            delete pruned.trunks[tid];
            delete pruned.roots[trunk.rootId];
            const maxAttachments = autoSettings.maxAttachmentsPerTrunk;
            let bestHost: string | null = null;
            let bestSample: FanShaftPoint | null = null;
            let bestScore = Infinity;
            for (const [hid, host] of Object.entries(pruned.trunks)) {
                if (host.origin !== 'anchor') continue;
                if (maxAttachments > 0 && countAttachmentsOnTrunk(hid, pruned) >= maxAttachments) continue;
                for (const seg of host.segments) {
                    const start = seg.bottomJoint?.pos ?? { x: 0, y: 0, z: 1.5 };
                    const end = seg.topJoint?.pos;
                    if (!end) continue;
                    const diameter = seg.diameter ?? 1.0;
                    for (let i = 0; i <= 10; i++) {
                        const t = i / 10;
                        const sx = start.x + (end.x - start.x) * t;
                        const sy = start.y + (end.y - start.y) * t;
                        const sz = start.z + (end.z - start.z) * t;
                        const vDist = tip.z - sz;
                        if (vDist < 1.5) continue;
                        const hDist = Math.hypot(tip.x - sx, tip.y - sy);
                        if (hDist > ANCHOR_TREE_ROOT_SPACING_MM) continue;
                        const ang = (Math.atan2(hDist, vDist) * 180) / Math.PI;
                        if (ang > ANCHOR_TREE_MAX_ANGLE_DEG) continue;
                        const dist = Math.hypot(hDist, vDist);
                        if (dist < bestScore) {
                            bestScore = dist;
                            bestHost = hid;
                            bestSample = { trunkId: hid, pos: { x: sx, y: sy, z: sz }, diameter };
                        }
                    }
                }
            }
            if (!bestHost || !bestSample) continue;
            const parentKnot = {
                id: `auto-anchor-tree-${tid}-p${pass}`,
                parentShaftId: bestHost,
                pos: bestSample.pos,
                diameter: bestSample.diameter + 0.1,
            };
            try {
                const resolved = resolveSurfaceNormal(tip, resolvedMesh ?? undefined);
                const { branch, supportData: sd } = buildBranchData({
                    tipPos: resolved.point,
                    tipNormal: resolved.normal,
                    modelId,
                    parentKnot,
                    mesh: resolvedMesh ?? undefined,
                });
                if (sd.error) continue;
                if (leafPathCrossesSupports(parentKnot.pos, branch.contactCone?.pos ?? tip, 0.25, pruned, bestHost)) continue;
                draft = draftAddKnot(pruned, parentKnot);
                branch.origin = 'anchor';
                draft = draftAddBranch(draft, branch);
                gridTrunkIds.delete(tid);
                const kind = trunkOriginById.get(tid);
                if (kind) diagnostics.trunksByKind[kind]--;
                placedTrunks--;
                placedBranches++;
                anchorMerged++;
                mergedThisPass++;
            } catch {
                continue;
            }
        }
        if (mergedThisPass === 0) break;
    }
    if (anchorMerged > 0) {
        console.log(LOG_PREFIX,
            `Anchor tree merging: ${anchorMerged} pillar trunks merged into branching anchors (~4 mm roots)`);
    }

    const fmtRefusals = (r: Record<string, number | undefined>): string => {
        const entries = Object.entries(r).filter(([, v]) => v !== undefined) as Array<[string, number]>;
        return entries.length === 0 ? 'none' : entries.map(([k, v]) => `${k}=${v}`).join(', ');
    };
    console.log(LOG_PREFIX,
        `Placement: ${diagnostics.trunksByKind.poissonDisk} poisson-disk, ${diagnostics.trunksByKind.gridInfill} grid-infill, ` +
        `${diagnostics.trunksByKind.coverageFill} coverage-fill, ${diagnostics.trunksByKind.standalone} standalone trunks ` +
        `| fan refusals: ${fmtRefusals(diagnostics.fanRefusals)} | merge refusals: ${fmtRefusals(diagnostics.mergeRefusals)}`);

    // ── Coverage convergence (gap-fill) ─────────────────────────────
    // Footprint-aware: an overhang region is covered when its projected
    // footprint is covered by tips, not just its centroid. Under-covered
    // regions get additional standalone trunks at uncovered footprint
    // clusters (the gridPoint path — region normal, no wrong-face raycast),
    // iterating until the coverage target is met or nothing more places.
    let gapFilledTrunks = 0;
    for (let pass = 0; pass < MAX_GAP_FILL_PASSES; pass++) {
        const tips = collectSupportTips(getSnapshot());
        const gapCandidates = buildGapFillCandidates(overhangIslands, autoSettings, tips)
            .map((c): CandidatePoint => ({ ...c, modelId }));
        if (gapCandidates.length === 0) break;
        let placedThisPass = 0;
        for (const c of gapCandidates) {
            const kind = placeOne(c);
            if (kind === 'trunk' || kind === 'anchor') placedThisPass++;
        }
        gapFilledTrunks += placedThisPass;
        if (placedThisPass === 0) break;
    }
    if (gapFilledTrunks > 0) {
        console.log(LOG_PREFIX, `Coverage convergence: ${gapFilledTrunks} gap-fill trunks placed`);
    }

    console.log(LOG_PREFIX,
        `Step 3/3: ${placedTrunks}T ${placedAnchors}A ${placedBranches}B ${placedLeaves}L ${placedSticks}S — ${rejectedCount} rejected ` +
        `| presets: detail=${presets.detail} structure=${presets.structure} anchor=${presets.anchor}`);

    // ── Coverage analytics ────────────────────────────────────────
    const snapshot = draft;
    const supportedIds = new Set<string>();
    const SUPPORT_COVERAGE_RADIUS_MM = 4.0;
    const covR2 = SUPPORT_COVERAGE_RADIUS_MM * SUPPORT_COVERAGE_RADIUS_MM;

    // Collect all support tips from the post-placement snapshot.
    const allTips: Array<{ x: number; y: number; z: number }> = [];
    for (const t of Object.values(snapshot.trunks)) {
        if (t.contactCone?.pos) allTips.push(t.contactCone.pos);
    }
    for (const b of Object.values(snapshot.branches)) {
        if (b.contactCone?.pos) allTips.push(b.contactCone.pos);
    }
    for (const l of Object.values(snapshot.leaves)) {
        if (l.contactCone?.pos) allTips.push(l.contactCone.pos);
    }
    for (const a of Object.values(snapshot.anchors)) {
        if (a.contactCone?.pos) allTips.push(a.contactCone.pos);
    }

    let coveredArea = 0;
    let totalArea = 0;
    for (const island of islands) {
        const area = island.areaMm2 ?? 0;
        totalArea += area;
        // FOOTPRINT coverage: the fraction of the region's contact voxels
        // within the support radius of a tip (the gap-fill's own measure).
        // The old centroid heuristic under-counted big regions — a 20×20
        // grid read 1% covered — which sent the fanning pass after
        // already-supported surfaces (redundant "floating" leaves).
        let fraction: number;
        if (island.contactVoxels && island.contactVoxels.length > 0) {
            fraction = computeRegionCoverage(island, allTips, SUPPORT_COVERAGE_RADIUS_MM);
        } else {
            // No footprint (minima islands): centroid proximity fallback.
            let hit = false;
            for (const tip of allTips) {
                const dx = island.contact.x - tip.x;
                const dy = island.contact.y - tip.y;
                const dz = island.contact.z - tip.z;
                if (dx * dx + dy * dy + dz * dz <= covR2) {
                    hit = true;
                    break;
                }
            }
            fraction = hit ? 1 : 0;
        }
        coveredArea += area * fraction;
        if (fraction >= 0.9) supportedIds.add(island.id);
    }

    // ── Sizing debug info ───────────────────────────────────────────
    let sizingDebug: AutoPlaceAnalytics['sizingDebug'];
    if (modelCtx && candidates.length > 0) {
        const weightG = modelCtx.modelVolumeMm3 * 0.0011;
        const areas = candidates.map(c => c.islandAreaMm2);
        areas.sort((a, b) => a - b);
        const minArea = areas[0];
        const maxArea = areas[areas.length - 1];
        const avgArea = areas.reduce((s, a) => s + a, 0) / areas.length;
        const zMax = Math.max(...candidates.map(c => c.zHeight), 1);
        // Sample min/max/avg candidates for shaft diameter range.
        const makeSample = (area: number, z: number): CandidatePoint => ({
            id: 'dbg', tipPos: { x: 0, y: 0, z: 0 }, tipNormal: { x: 0, y: 0, z: -1 },
            modelId: '', source: 'voxel', islandAreaMm2: area,
            zHeight: z, priority: 0,
        });
        const sMin = sizeParameters(makeSample(minArea, 10), undefined, getSettings().autoSupport?.sizeScale ?? 1);
        const sMax = sizeParameters(makeSample(maxArea, zMax), undefined, getSettings().autoSupport?.sizeScale ?? 1);
        const sAvg = sizeParameters(makeSample(avgArea, zMax / 2), undefined, getSettings().autoSupport?.sizeScale ?? 1);
        sizingDebug = {
            modelVolumeMm3: Math.round(modelCtx.modelVolumeMm3),
            estimatedWeightG: round2(weightG),
            totalCandidates: modelCtx.totalCandidates,
            // Honest mass share: total model weight divided by the number of
            // placed supports. A load share, not a force estimate.
            weightPerSupportG: round2(placedTrunks > 0 ? weightG / placedTrunks : 0),
            avgIslandAreaMm2: round2(avgArea),
            // Anchor-layer stats (per-contact-patch bands, anchorBands.ts):
            // counts and projected area only — no force/load values.
            anchorClusterCount: anchorBands.clusterCount,
            anchorInBandRegions: anchorBands.inBandIds.length,
            anchorLayerAreaMm2: round2(
                anchorBands.inBandIds.length > 0
                    ? overhangIslands.reduce(
                        (sum, i) => sum + (anchorBands.inBandIds.includes(i.id) ? (i.areaMm2 ?? 0) : 0),
                        0,
                    )
                    : 0,
            ),
            distributionGridRegions: distributionCounts.grid,
            distributionPoissonRegions: distributionCounts.poisson,
            standaloneTrunks: diagnostics.trunksByKind.standalone,
            poissonDiskTrunks: diagnostics.trunksByKind.poissonDisk,
            gridInfillTrunks: diagnostics.trunksByKind.gridInfill + diagnostics.trunksByKind.coverageFill,
            shaftDiameterRange: {
                min: round2(sMin.shaftDiameterMm ?? 0),
                max: round2(sMax.shaftDiameterMm ?? 0),
                avg: round2(sAvg.shaftDiameterMm ?? 0),
            },
            tipContactRange: {
                min: round2(sMin.tipContactDiameterMm ?? 0),
                max: round2(sMax.tipContactDiameterMm ?? 0),
                avg: round2(sAvg.tipContactDiameterMm ?? 0),
            },
        };
    }

    analytics = {
        islandsCovered: supportedIds.size,
        islandsUncovered: islands.length - supportedIds.size,
        presets,
        rejectionReasons,
        areaCoverage: totalArea > 0 ? coveredArea / totalArea : 0,
        distribution: distributionCounts,
        placement: diagnostics,
        sizingDebug,
    };

    console.log(LOG_PREFIX,
        `Coverage: ${analytics.islandsCovered}/${islands.length} islands (${(analytics.areaCoverage * 100).toFixed(0)}% of area). ` +
        `${analytics.islandsUncovered} islands uncovered.`);

    // ── Post-placement leaf fanning (iterative convergence) ──────────
    const fanRadiusMm = autoSettings.leafFanRadiusMm ?? LEAF_FAN_RADIUS_MM;
    const fanMaxAngleDeg = autoSettings.leafFanMaxAngleDeg ?? LEAF_FAN_MAX_ANGLE_DEG;

    console.log(LOG_PREFIX,
        `Leaf fanning: ${analytics.islandsUncovered} uncovered islands, ${placedTrunks} trunks available. ` +
        `Max ${MAX_FANNING_PASSES} passes, fan radius ${fanRadiusMm}mm, max angle ${fanMaxAngleDeg}°.`);

    for (let pass = 0; pass < MAX_FANNING_PASSES && analytics.islandsUncovered > 0; pass++) {
        const shaftPoints = collectFanShaftPoints(draft);
        if (shaftPoints.length === 0) {
            console.log(LOG_PREFIX, `Leaf fanning pass ${pass}: no shaft points — breaking.`);
            break;
        }

        let fannedCount = 0;

        let skippedDist = 0;
        let skippedAngle = 0;
        let skippedSameZ = 0;
        let skippedCross = 0;
        let skippedOther = 0;

        for (const island of islands) {
            if (supportedIds.has(island.id)) continue;
            const fan = fanLeafToTrunk(
                { x: island.contact.x, y: island.contact.y, z: island.contact.z },
                modelId,
                shaftPoints,
                gridTrunkIds,
                `auto-fan-${island.id}-p${pass}`,
                fanRadiusMm,
                GRID_HOST_FAN_RADIUS_MM,
                fanMaxAngleDeg,
                autoSettings.maxAttachmentsPerTrunk,
                draft,
                resolvedMesh ?? undefined,
                island.source === 'overhang' ? 'overhang' : 'island',
            );
            if (!fan.ok) {
                if (fan.reason === 'noHost') skippedDist++;
                else if (fan.reason === 'angle') skippedAngle++;
                else if (fan.reason === 'sameZ') skippedSameZ++;
                else if (fan.reason === 'cross') skippedCross++;
                else skippedOther++;
                continue;
            }
            draft = fan.draft;
            fannedCount++;
            supportedIds.add(island.id);
            coveredArea += (island.areaMm2 ?? 0);
            console.log(LOG_PREFIX,
                `Leaf (fan p${pass}) ${island.id} → trunk ${fan.trunkId} ` +
                `dist=${fan.distMm.toFixed(1)}mm angle=${fan.angleDeg.toFixed(0)}°`);
        }

        if (fannedCount > 0) {
            placedLeaves += fannedCount;
            analytics.islandsCovered += fannedCount;
            analytics.islandsUncovered -= fannedCount;
            analytics.areaCoverage = totalArea > 0 ? coveredArea / totalArea : 0;
            console.log(LOG_PREFIX,
                `Leaf fanning pass ${pass}: ${fannedCount} leaves, ` +
                `${analytics.islandsUncovered} islands still uncovered.`);
        } else {
            console.log(LOG_PREFIX,
                `Leaf fanning pass ${pass}: 0 leaves — ` +
                `${skippedDist} too far (>${fanRadiusMm}mm), ` +
                `${skippedAngle} angle too steep (>${LEAF_FAN_MAX_ANGLE_DEG}°), ` +
                `${skippedSameZ} same Z (can't attach), ` +
                `${skippedCross} crossing another support, ` +
                `${skippedOther} blocked/build/capacity.`);
            break;
        }
    }

    // ── Overhang surface coverage ──────────────────────────────────
    // Large flat overhangs need more than one support to distribute
    // peel forces evenly.  Use the island's contactVoxels footprint
    // to place additional supports across the surface.
    const OVERHANG_AREA_THRESHOLD_MM2 = 1.5;
    const OVERHANG_GRID_SPACING_MM = 2.5;

    const islandById = new Map(islands.map(i => [i.id, i]));
    let overhangSupportsPlaced = 0;

    for (const [tid, trunk] of Object.entries(draft.trunks)) {
        // Find which island this trunk was placed for by matching tip
        // proximity to island contact positions.
        const tip = trunk.contactCone?.pos;
        if (!tip) continue;
        let bestIsland: DetectedIsland | null = null;
        let bestDist2 = Infinity;
        for (const island of islands) {
            const dx = tip.x - island.contact.x;
            const dy = tip.y - island.contact.y;
            const dz = tip.z - island.contact.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestDist2) { bestDist2 = d2; bestIsland = island; }
        }
        if (!bestIsland) continue;

        // Overhang regions are gridded by the grid phase — the legacy
        // overhang-coverage pass is for flat voxel islands only.
        if (bestIsland.source === 'overhang') continue;

        const area = bestIsland.areaMm2 ?? 0;
        const voxels = bestIsland.contactVoxels;
        if (area < OVERHANG_AREA_THRESHOLD_MM2 || !voxels || voxels.length < 3) continue;

        // Compute bounding box of contact voxels.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of voxels) {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x;
            if (v.y > maxY) maxY = v.y;
        }
        const width = maxX - minX;
        const height = maxY - minY;
        if (width < OVERHANG_GRID_SPACING_MM && height < OVERHANG_GRID_SPACING_MM) continue;

        // Place a grid of support points across the footprint.
        const cols = Math.max(2, Math.round(width / OVERHANG_GRID_SPACING_MM));
        const rows = Math.max(2, Math.round(height / OVERHANG_GRID_SPACING_MM));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const gx = minX + (width * (c + 0.5)) / cols;
                const gy = minY + (height * (r + 0.5)) / rows;

                // Check if this grid point is within the voxel footprint
                // (simple containment: near any contact voxel).
                let inFootprint = false;
                for (const v of voxels) {
                    const dx = gx - v.x;
                    const dy = gy - v.y;
                    if (dx * dx + dy * dy <= OVERHANG_GRID_SPACING_MM * OVERHANG_GRID_SPACING_MM) {
                        inFootprint = true;
                        break;
                    }
                }
                if (!inFootprint) continue;

                // Skip the centroid (already covered by the trunk tip).
                const cDist = (gx - bestIsland.contact.x) ** 2 + (gy - bestIsland.contact.y) ** 2;
                if (cDist < 1.0) continue;

                // Place as a branch from the existing trunk.
                try {
                    const overhangTip = { x: gx, y: gy, z: bestIsland.contact.z };
                    const resolved = resolveSurfaceNormal(overhangTip, mesh);
                    const knotPos = trunk.segments[trunk.segments.length - 1]?.topJoint?.pos ?? tip;
                    const parentKnot = {
                        id: `auto-overhang-${bestIsland.id}-${r}-${c}`,
                        parentShaftId: tid,
                        pos: knotPos,
                        diameter: (trunk.segments[trunk.segments.length - 1]?.diameter ?? 1.0) + 0.1,
                    };
                    const bm: THREE.Mesh | undefined = resolvedMesh ?? undefined;
                    const { branch, supportData: sd } = buildBranchData({
                        tipPos: resolved.point,
                        tipNormal: resolved.normal,
                        modelId,
                        parentKnot,
                        mesh: bm,
                    });
                    if (!sd.error) {
                        const ohCap = autoSettings.maxAttachmentsPerTrunk;
                        if (isTrunkAtAttachmentCapacity(tid, ohCap, draft)) {
                            continue;
                        }
                        // The tips are voxel-island footprints — island origin.
                        branch.origin = 'island';
                        draft = draftAddKnot(draft, parentKnot);
                        draft = draftAddBranch(draft, branch);
                        overhangSupportsPlaced++;
                        placedBranches++;
                    }
                } catch (_) {
                    // Skip this grid point.
                }
            }
        }

        if (overhangSupportsPlaced > 0) {
            console.log(LOG_PREFIX,
                `Overhang coverage: ${overhangSupportsPlaced} additional branches placed for flat surfaces.`);
        }
    }
    } catch (e) {
        // Safety net: the promote path can mid-run swap the store, so restore
        // the pre-run snapshots on failure. Everything else never commits, so
        // this is the only path that can leave anything behind.
        console.error(LOG_PREFIX,
            `Auto-support failed mid-run — rolling back.`,
            e instanceof Error ? e.message : String(e));
        setSnapshot(before);
        setKickstandSnapshot(kickstandBefore);
        return null;
    }

    const changed =
        placedTrunks > 0 ||
        placedAnchors > 0 ||
        placedBranches > 0 ||
        placedLeaves > 0 ||
        placedSticks > 0;

    // ------------------------------------------------------------------
    // 4. Forest resize pass — re-derive every trunk's stepwise diameter
    //    profile from its final attachment tree (a trunk carrying four
    //    branches gets thicker; a lone trunk stays at its placed diameter).
    // ------------------------------------------------------------------

    if (changed) {
        try {
            const resized = computeForestDiameterProfile(draft);
            if (resized !== draft) {
                draft = resized;
                console.log(LOG_PREFIX, 'Forest resize pass applied (branch-loaded trunks thickened).');
            }
        } catch (e) {
            console.warn(LOG_PREFIX,
                `Forest resize failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ------------------------------------------------------------------
    // 5. Auto-bracing (draft-only, folded into the plan)
    // ------------------------------------------------------------------

    if (changed && !autoSettings.debugSkipAutoBracing) {
        console.log(LOG_PREFIX, 'Running auto-brace...');
        try {
            const braceResult = buildAutoBracedSnapshot(draft, getSettings().autoBracing, kickstandDraft);
            draft = braceResult.snapshot;
            kickstandDraft = braceResult.kickstand;
            console.log(LOG_PREFIX, `Auto-brace: ${braceResult.message}`);
        } catch (e) {
            console.warn(LOG_PREFIX,
                `Auto-brace failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
    } else if (changed) {
        console.log(LOG_PREFIX, 'Auto-brace skipped (debug setting).');
    }

    const result: AutoPlaceResult = {
        ...makeResult(
            placedTrunks,
            placedAnchors,
            placedBranches,
            placedLeaves,
            placedSticks,
            rejectedCount,
            changed,
            `Placed ${placedTrunks} trunks, ${placedAnchors} anchors, ${placedBranches} branches, ${placedLeaves} leaves, ${placedSticks} sticks. ` +
            `${rejectedCount} rejected. Coverage: ${analytics.islandsCovered}/${islands.length} islands (${(analytics.areaCoverage * 100).toFixed(0)}%).`,
        ),
        analytics,
    };

    return {
        before,
        kickstandBefore,
        support: draft,
        kickstand: kickstandDraft,
        analytics,
        result,
    };
}

/**
 * Run auto-support end-to-end: compute the plan, then commit it as ONE
 * atomic store update + ONE undoable history entry (supports + braces +
 * kickstands together).
 */
export function runAutoPlace(
    islands: DetectedIsland[],
    modelId: string,
    settingsOverride?: Partial<AutoSupportSettings>,
): AutoPlaceResult {
    const plan = computeAutoSupportPlan(islands, modelId, settingsOverride);
    if (!plan) {
        return makeResult(0, 0, 0, 0, 0, 0, false, 'Auto-support is disabled.');
    }

    if (plan.result.changed) {
        setSnapshot(plan.support);
        setKickstandSnapshot(plan.kickstand);
        try {
            pushSupportHistory({
                type: SUPPORT_AUTO_PLACE,
                payload: {
                    before: plan.before,
                    after: plan.support,
                    kickstandBefore: plan.kickstandBefore,
                    kickstandAfter: plan.kickstand,
                },
            });
            console.log(LOG_PREFIX, 'History entry pushed — undo available.');
        } catch (e) {
            console.warn(LOG_PREFIX,
                `History push failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return plan.result;
}
