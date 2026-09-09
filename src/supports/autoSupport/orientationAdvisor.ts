/**
 * Orientation advisor (M1 sweep-and-score, see `docs/dev/auto-orientation.md`):
 * suggest a build orientation that minimizes support contact area, without
 * ever auto-rotating. Curvy-style quality-weighted cost (Ulu et al. 2021)
 * plus a resin-required suction-cup penalty Curvy lacks — its cost would
 * happily invert a cupped part.
 *
 * The search is a deterministic candidate sweep, not an annealer: a
 * Fibonacci-sphere sweep over down-axes plus convex-hull resting poses
 * (largest hull faces stood on the plate — an approximation of the stable
 * set, not a full center-of-mass stability proof), always including the
 * current pose so the result never regresses, then coordinate-descent
 * refinement around the top-K. Same model, same result — no RNG. The
 * `objective` option picks what ranks first (`supports` contact area by
 * default, `height` for the fastest print). Under `supports`, primaries within
 * the anchoring margin of the minimum tie so a wider base wins a few extra
 * mm² of contact instead of balancing on a point.
 *
 * Pure functions over triangle soup (no mesh store dependency) so the
 * solver is trivially testable. (Rotation about Z is omitted deliberately:
 * Z is plate-up, so it cannot change any normal.z and the cost would be
 * blind to it.)
 */

import * as THREE from 'three';
import { ConvexHull } from 'three-stdlib';

export interface AdvisorMesh {
    /** Flat XYZ positions (mm, model space). */
    positions: ArrayLike<number>;
    /** Triangle indices into positions (3 per tri). Non-indexed if omitted. */
    index?: ArrayLike<number> | null;
}

/** Cost breakdown for one orientation (radians about X, then Y). */
export interface OrientationCost {
    /** Down-facing area past the self-support angle (mm²). */
    overhangAreaMm2: number;
    /** Near-flat down-facing area — suction-cup proxy (mm²). */
    cupAreaMm2: number;
    /** Z extent of the rotated mesh (mm). Primary under the height objective, tie-breaker otherwise. */
    heightMm: number;
    /** XY bounding-box area of the rotated mesh (mm²). Tie-breaker. */
    footprintMm2: number;
    /** Weighted total the search minimizes (overhang + cup terms). */
    cost: number;
}

/** What the sweep ranks first. `supports` minimizes contact area (the resin default); `height` minimizes Z extent (fastest print) and breaks ties by contact area. */
export type OrientationObjective = 'supports' | 'height';

export interface AdvisorOptions {
    /** Face is overhang when normal.z < -cos(angle). Default 45°. */
    selfSupportAngleDeg?: number;
    /** Extra weight per mm² of cup area. Default 2 (cups fail prints). */
    cupWeight?: number;
    /** Ranking objective. Default 'supports'. */
    objective?: OrientationObjective;
    /** Fibonacci-sphere candidate count. Default 120. */
    candidateCount?: number;
    /** Max convex-hull resting poses folded into the sweep. Default 12. */
    restingPoseCount?: number;
    /** Top-K coarse candidates refined by coordinate descent. Default 5. */
    refineTopK?: number;
}

export interface OrientationSuggestion {
    rotXDeg: number;
    rotYDeg: number;
    baseline: OrientationCost;
    suggested: OrientationCost;
    /** Predicted contact-area change vs current orientation (negative = better). */
    deltaPercent: number;
}

/** One sweep candidate: tilt (rotX) and turntable (rotY) in radians. */
export interface OrientationCandidate {
    rotXRad: number;
    rotYRad: number;
}

const DEFAULT_ANGLE_DEG = 45;
const CUP_FLAT_COS = 0.95;
const DEFAULT_FIBONACCI_COUNT = 120;
const DEFAULT_RESTING_POSES = 12;
const DEFAULT_REFINE_TOP_K = 5;
/** Poses closer than this (down-axis dot) dedupe — cos(5°). */
const DEDUP_COS = 0.9962;
/** Hull input cap — extremes survive grid decimation; interior points cannot pose. */
const HULL_POINT_CAP = 6000;
const DEG = Math.PI / 180;
const REFINEMENT_STEPS_RAD = [8 * DEG, 4 * DEG, 2 * DEG, 1 * DEG];

function wrapAngle(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

/** Per-triangle unit normals + areas, computed once per search. */
interface PreparedTriangles {
    normals: Float64Array;
    areas: Float64Array;
    triCount: number;
}

function prepareTriangles(mesh: AdvisorMesh): PreparedTriangles {
    const { positions, index } = mesh;
    const triCount = index && index.length > 0 ? Math.floor(index.length / 3) : Math.floor(positions.length / 9);
    const normals = new Float64Array(triCount * 3);
    const areas = new Float64Array(triCount);
    const hasIndex = !!index && index.length > 0;
    for (let t = 0; t < triCount; t++) {
        const ia = hasIndex ? (index as ArrayLike<number>)[t * 3] : t * 3;
        const ib = hasIndex ? (index as ArrayLike<number>)[t * 3 + 1] : t * 3 + 1;
        const ic = hasIndex ? (index as ArrayLike<number>)[t * 3 + 2] : t * 3 + 2;
        const ux = positions[ib * 3] - positions[ia * 3];
        const uy = positions[ib * 3 + 1] - positions[ia * 3 + 1];
        const uz = positions[ib * 3 + 2] - positions[ia * 3 + 2];
        const wx = positions[ic * 3] - positions[ia * 3];
        const wy = positions[ic * 3 + 1] - positions[ia * 3 + 1];
        const wz = positions[ic * 3 + 2] - positions[ia * 3 + 2];
        // Normal = u × w; area = |n| / 2.
        const nx = uy * wz - uz * wy;
        const ny = uz * wx - ux * wz;
        const nz = ux * wy - uy * wx;
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
        if (area <= 0) continue;
        areas[t] = area;
        normals[t * 3] = nx / (2 * area);
        normals[t * 3 + 1] = ny / (2 * area);
        normals[t * 3 + 2] = nz / (2 * area);
    }
    return { normals, areas, triCount };
}

/** Rotated normal z after Rx(a) then Ry(b) applied to unit (ux, uy, uz). */
function rotatedNz(ux: number, uy: number, uz: number, sa: number, ca: number, sb: number, cb: number): number {
    // Rx: y' = y·ca − z·sa; z1 = y·sa + z·ca. Ry preserves nothing here:
    // z' = −x·sb + z1·cb.
    return -ux * sb + (uy * sa + uz * ca) * cb;
}

function scoreParts(
    prep: PreparedTriangles,
    threshold: number,
    sa: number,
    ca: number,
    sb: number,
    cb: number,
): { overhang: number; cup: number } {
    let overhang = 0;
    let cup = 0;
    const { normals, areas, triCount } = prep;
    for (let t = 0; t < triCount; t++) {
        const area = areas[t];
        if (area <= 0) continue;
        const nzr = rotatedNz(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2], sa, ca, sb, cb);
        if (nzr < -threshold) overhang += area;
        if (nzr < -CUP_FLAT_COS) cup += area;
    }
    return { overhang, cup };
}

function measureBoundingBox(
    positions: ArrayLike<number>,
    sa: number,
    ca: number,
    sb: number,
    cb: number,
): { heightMm: number; footprintMm2: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i + 2 < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        // Rx(a) then Ry(b) — the same rotation the scorer applies to normals.
        const y1 = y * ca - z * sa;
        const z1 = y * sa + z * ca;
        const x2 = x * cb + z1 * sb;
        const z2 = -x * sb + z1 * cb;
        if (x2 < minX) minX = x2;
        if (x2 > maxX) maxX = x2;
        if (y1 < minY) minY = y1;
        if (y1 > maxY) maxY = y1;
        if (z2 < minZ) minZ = z2;
        if (z2 > maxZ) maxZ = z2;
    }
    if (minX === Infinity) return { heightMm: 0, footprintMm2: 0 };
    return { heightMm: maxZ - minZ, footprintMm2: (maxX - minX) * (maxY - minY) };
}

/**
 * Cost of one orientation: down-facing area past the self-support
 * threshold, plus the cup proxy (near-flat down-facing area) at extra
 * weight. Height and footprint are reported for tie-breaking upstream.
 */
export function evaluateOrientationCost(
    mesh: AdvisorMesh,
    rotXRad: number,
    rotYRad: number,
    opts: AdvisorOptions = {},
): OrientationCost {
    const threshold = Math.cos(((opts.selfSupportAngleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180);
    const cupWeight = opts.cupWeight ?? 2;
    const prep = prepareTriangles(mesh);
    const sa = Math.sin(rotXRad);
    const ca = Math.cos(rotXRad);
    const sb = Math.sin(rotYRad);
    const cb = Math.cos(rotYRad);
    const { overhang, cup } = scoreParts(prep, threshold, sa, ca, sb, cb);
    const { heightMm, footprintMm2 } = measureBoundingBox(mesh.positions, sa, ca, sb, cb);
    return { overhangAreaMm2: overhang, cupAreaMm2: cup, heightMm, footprintMm2, cost: overhang + cupWeight * cup };
}

/**
 * The model-space direction that ends up pointing at the plate under
 * R = Ry(b)·Rx(a) is d = (sin b, −cos b·sin a, −cos b·cos a); invert it
 * so a sampled down-axis becomes a tilt/turntable candidate.
 */
function downAxisToTilt(dx: number, dy: number, dz: number): OrientationCandidate {
    const cx = Math.min(1, Math.max(-1, dx));
    const rotYRad = Math.asin(cx);
    const rotXRad = Math.abs(cx) >= 1 - 1e-9 ? 0 : Math.atan2(-dy, -dz);
    return { rotXRad: wrapAngle(rotXRad), rotYRad: wrapAngle(rotYRad) };
}

function tiltToDownAxis(rx: number, ry: number): [number, number, number] {
    const cb = Math.cos(ry);
    return [Math.sin(ry), -cb * Math.sin(rx), -cb * Math.cos(rx)];
}

function fibonacciCandidates(count: number): OrientationCandidate[] {
    const n = Math.max(1, Math.floor(count));
    const golden = Math.PI * (3 - Math.sqrt(5));
    const out: OrientationCandidate[] = [];
    for (let i = 0; i < n; i++) {
        const z = 1 - ((i + 0.5) * 2) / n;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const t = golden * i;
        out.push(downAxisToTilt(r * Math.cos(t), r * Math.sin(t), z));
    }
    return out;
}

/**
 * Resting poses from the convex hull: group hull faces by coplanar normal,
 * rank by area, stand each large face on the plate. Degenerate input
 * (too few points, hull failure) yields no poses — the Fibonacci sweep
 * still covers the search.
 */
export function restingPoseCandidates(mesh: AdvisorMesh, maxPoses: number): OrientationCandidate[] {
    const { positions } = mesh;
    const vertCount = Math.floor(positions.length / 3);
    if (vertCount < 4 || maxPoses <= 0) return [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < vertCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    if (!(maxDim > 0)) return [];
    // Grid decimation: the hull only needs the extreme points.
    const cell = Math.max(maxDim / 50, 1e-6);
    const seen = new Set<string>();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < vertCount && points.length < HULL_POINT_CAP; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push(new THREE.Vector3(x, y, z));
    }
    if (points.length < 4) return [];
    let faces;
    try {
        faces = new ConvexHull().setFromPoints(points).faces;
    } catch {
        return [];
    }
    const groups = new Map<string, { nx: number; ny: number; nz: number; area: number }>();
    for (const face of faces) {
        const n = face.normal;
        const key = `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
        const corners: THREE.Vector3[] = [];
        let edge = face.edge;
        do {
            corners.push(edge.vertex.point);
            edge = edge.next;
        } while (edge !== face.edge);
        let area = 0;
        for (let i = 1; i + 1 < corners.length; i++) {
            const ux = corners[i].x - corners[0].x;
            const uy = corners[i].y - corners[0].y;
            const uz = corners[i].z - corners[0].z;
            const wx = corners[i + 1].x - corners[0].x;
            const wy = corners[i + 1].y - corners[0].y;
            const wz = corners[i + 1].z - corners[0].z;
            const nx = uy * wz - uz * wy;
            const ny = uz * wx - ux * wz;
            const nz = ux * wy - uy * wx;
            area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
        }
        const group = groups.get(key);
        if (group) group.area += area;
        else groups.set(key, { nx: n.x, ny: n.y, nz: n.z, area });
    }
    return [...groups.values()]
        .filter((g) => g.area > 1e-9)
        .sort((a, b) => b.area - a.area)
        .slice(0, Math.max(0, Math.floor(maxPoses)))
        .map((g) => {
            const len = Math.hypot(g.nx, g.ny, g.nz) || 1;
            return downAxisToTilt(g.nx / len, g.ny / len, g.nz / len);
        });
}

/**
 * The M1 coarse set: identity (current pose — the result never regresses),
 * the Fibonacci sweep, then resting poses that add a genuinely new
 * down-axis. Fixed order, no RNG: same mesh, same candidates.
 */
export function generateM1Candidates(mesh: AdvisorMesh, opts: AdvisorOptions = {}): OrientationCandidate[] {
    const fibCount = opts.candidateCount ?? DEFAULT_FIBONACCI_COUNT;
    const restingMax = opts.restingPoseCount ?? DEFAULT_RESTING_POSES;
    const out: OrientationCandidate[] = [{ rotXRad: 0, rotYRad: 0 }];
    const axes: Array<[number, number, number]> = [tiltToDownAxis(0, 0)];
    const tryAdd = (c: OrientationCandidate): void => {
        const d = tiltToDownAxis(c.rotXRad, c.rotYRad);
        for (const e of axes) {
            if (d[0] * e[0] + d[1] * e[1] + d[2] * e[2] > DEDUP_COS) return;
        }
        axes.push(d);
        out.push({ rotXRad: wrapAngle(c.rotXRad), rotYRad: wrapAngle(c.rotYRad) });
    };
    for (const c of fibonacciCandidates(fibCount)) tryAdd(c);
    for (const c of restingPoseCandidates(mesh, restingMax)) tryAdd(c);
    return out;
}

interface ScoredOrientation extends OrientationCandidate {
    primary: number;
    overhang: number;
    cup: number;
    heightMm: number;
    footprintMm2: number;
}

/** Epsilons for rank comparisons, scaled to the baseline so tiny meshes and huge ones behave alike. */
interface RankEps {
    primary: number;
    height: number;
}

/**
 * Anchoring margin: a minimum-contact pose often balances on a point with no
 * physical purchase. When supports are unavoidable, primaries within 5% of the
 * minimum (plus a 0.5 mm² floor, about one small support) tie, and the widest
 * base wins. Zero-support landscapes keep exact tie-breaks — a perfect print
 * is never tilted for anchoring it does not need.
 */
const ANCHOR_TOL = 0.05;
const ANCHOR_FLOOR_MM2 = 0.5;
const ANCHOR_MIN_PRIMARY = 1e-9;

/** Lexicographic rank: the objective first, then the other term, then near-identity. */
function compareScored(
    a: ScoredOrientation,
    b: ScoredOrientation,
    eps: RankEps,
    objective: OrientationObjective,
    preferFootprint: boolean,
): number {
    if (objective === 'height') {
        if (Math.abs(a.heightMm - b.heightMm) > eps.height) return a.heightMm < b.heightMm ? -1 : 1;
        if (Math.abs(a.primary - b.primary) > eps.primary) return a.primary < b.primary ? -1 : 1;
    } else {
        if (Math.abs(a.primary - b.primary) > eps.primary) return a.primary < b.primary ? -1 : 1;
        if (preferFootprint) {
            if (Math.abs(a.footprintMm2 - b.footprintMm2) > 1e-6) return a.footprintMm2 > b.footprintMm2 ? -1 : 1;
            if (Math.abs(a.heightMm - b.heightMm) > eps.height) return a.heightMm < b.heightMm ? -1 : 1;
        } else {
            if (Math.abs(a.heightMm - b.heightMm) > eps.height) return a.heightMm < b.heightMm ? -1 : 1;
        }
    }
    if (Math.abs(a.footprintMm2 - b.footprintMm2) > 1e-6) return a.footprintMm2 < b.footprintMm2 ? -1 : 1;
    const da = Math.abs(a.rotXRad) + Math.abs(a.rotYRad);
    const db = Math.abs(b.rotXRad) + Math.abs(b.rotYRad);
    if (Math.abs(da - db) > 1e-9) return da < db ? -1 : 1;
    return 0;
}

/**
 * Suggest a better orientation from the M1 sweep. Never returns worse than
 * identity — the suggestion surface shows the delta, and applying it stays
 * the user's explicit choice.
 */
export function suggestOrientation(mesh: AdvisorMesh, opts: AdvisorOptions = {}): OrientationSuggestion {
    const threshold = Math.cos(((opts.selfSupportAngleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180);
    const cupWeight = opts.cupWeight ?? 2;
    const objective = opts.objective ?? 'supports';
    const prep = prepareTriangles(mesh);
    const candidates = generateM1Candidates(mesh, opts);

    const scoreFull = (c: OrientationCandidate): ScoredOrientation => {
        const sa = Math.sin(c.rotXRad);
        const ca = Math.cos(c.rotXRad);
        const sb = Math.sin(c.rotYRad);
        const cb = Math.cos(c.rotYRad);
        const { overhang, cup } = scoreParts(prep, threshold, sa, ca, sb, cb);
        const { heightMm, footprintMm2 } = measureBoundingBox(mesh.positions, sa, ca, sb, cb);
        return { ...c, primary: overhang + cupWeight * cup, overhang, cup, heightMm, footprintMm2 };
    };
    const descend = (start: ScoredOrientation, eps: RankEps, obj: OrientationObjective, preferFootprint: boolean): ScoredOrientation => {
        let cur = start;
        for (const step of REFINEMENT_STEPS_RAD) {
            const neighbors = [
                { rotXRad: wrapAngle(cur.rotXRad + step), rotYRad: cur.rotYRad },
                { rotXRad: wrapAngle(cur.rotXRad - step), rotYRad: cur.rotYRad },
                { rotXRad: cur.rotXRad, rotYRad: wrapAngle(cur.rotYRad + step) },
                { rotXRad: cur.rotXRad, rotYRad: wrapAngle(cur.rotYRad - step) },
            ];
            for (const n of neighbors) {
                const s = scoreFull(n);
                if (compareScored(s, cur, eps, obj, preferFootprint) < 0) cur = s;
            }
        }
        return cur;
    };

    // Coarse pass: full score per candidate, ranked by the objective, so a
    // height search seeds refinement from short poses even when their
    // support cost is poor. Stable sort keeps ties in candidate order:
    // same mesh, same result.
    const scores = candidates.map((c) => scoreFull(c));
    const baseline = scores[0] ?? scoreFull({ rotXRad: 0, rotYRad: 0 });
    let minPrimary = Infinity;
    for (const s of scores) {
        if (s.primary < minPrimary) minPrimary = s.primary;
    }
    if (!Number.isFinite(minPrimary)) minPrimary = 0;
    const preferFootprint = objective === 'supports' && minPrimary > ANCHOR_MIN_PRIMARY;
    const gainEps = 1e-6 * Math.max(1, baseline.primary);
    const eps: RankEps = {
        primary: preferFootprint ? minPrimary * ANCHOR_TOL + ANCHOR_FLOOR_MM2 : gainEps,
        height: 1e-6 * Math.max(1, baseline.heightMm),
    };
    let best = baseline;
    for (let i = 1; i < scores.length; i++) {
        if (compareScored(scores[i], best, eps, objective, preferFootprint) < 0) best = scores[i];
    }

    // Refinement around the top-K coarse candidates by objective rank.
    const refineK = Math.max(0, Math.floor(opts.refineTopK ?? DEFAULT_REFINE_TOP_K));
    const order = scores.map((_, i) => i).sort((a, b) => compareScored(scores[a], scores[b], eps, objective, preferFootprint));
    for (const s of order.slice(0, Math.min(Math.max(1, refineK), order.length))) {
        const r = descend(scores[s], eps, objective, preferFootprint);
        if (compareScored(r, best, eps, objective, preferFootprint) < 0) best = r;
    }

    const toDeg = (a: number): number => Math.round(((a * 180) / Math.PI) * 10) / 10;
    const toCost = (s: ScoredOrientation): OrientationCost => ({
        overhangAreaMm2: s.overhang,
        cupAreaMm2: s.cup,
        heightMm: s.heightMm,
        footprintMm2: s.footprintMm2,
        cost: s.primary,
    });
    const improved =
        objective === 'height'
            ? best.heightMm < baseline.heightMm - eps.height
            : best.primary < baseline.primary - gainEps;
    const suggested = improved ? best : baseline;
    const deltaPercent =
        baseline.overhang > 0 ? ((suggested.overhang - baseline.overhang) / baseline.overhang) * 100 : 0;
    return {
        rotXDeg: improved ? toDeg(best.rotXRad) : 0,
        rotYDeg: improved ? toDeg(best.rotYRad) : 0,
        baseline: toCost(baseline),
        suggested: toCost(suggested),
        deltaPercent,
    };
}

/** Minimal BufferGeometry surface for the adapter (avoids a three import). */
export interface AdvisorGeometry {
    attributes: { position?: { array: ArrayLike<number> } | null };
    index?: ArrayLike<number> | null;
}

/**
 * Suggest an orientation directly from a render geometry: extracts the
 * position/index soup and runs the sweep. The UI layer calls this with
 * the active model's geometry and surfaces the returned delta; applying
 * the rotation stays an explicit user action through the scene transform
 * path (with its own history entry).
 */
export function suggestOrientationForGeometry(
    geometry: AdvisorGeometry,
    opts: AdvisorOptions = {},
): OrientationSuggestion | null {
    const positions = geometry.attributes?.position?.array;
    if (!positions || positions.length < 9) return null;
    return suggestOrientation({ positions, index: geometry.index ?? null }, opts);
}
