import * as THREE from 'three';
import { convexHull2d } from '@/supports/Rafts/Crenelated/geometry/convexHull2d';

/**
 * Stabilization: a model that prints fine on its own can still fail because
 * nothing holds it — a corner resting on a point, or a long edge on a line.
 * Formation overhang detection never sees these (the faces are steep enough
 * to print), so a separate pass scores how the oriented mesh bears on the
 * build plate and emits anchor contacts along the low edge skeleton to
 * broaden a deficient base.
 *
 * Pure geometry, deterministic: welded edge graph + bearing hull + surface
 * centroid, then teeth sampled along every low edge at fixed spacing. No RNG,
 * no slicing.
 */

/** Low surface within this height of the minimum counts as the bearing locus. */
const BEARING_BAND_MM = 2.0;
/** A projected bearing hull smaller than this (mm²) is a point/edge/sliver —
 *  unstable regardless of where the centroid sits. */
const MIN_BEARING_AREA_MM2 = 4.0;
/** The projected centroid may sit up to this far outside the bearing hull
 *  before the pose is declared unstable. */
const MARGIN_MM = 2.0;
/** Tooth spacing (mm) along the low edges. */
const SPACING_MM = 2.5;
/** Most anchors one run emits. */
const MAX_ANCHORS = 12;
/** When the part already rests on a low edge, flank teeth climb only this far
 *  up the faces (mm) — enough to brace sideways without climbing the part. */
const FLANK_RISE_MM = 4.0;
/** When the part rests on a lone point (no bearing edge), teeth climb the
 *  radiating edges this far (mm) to reach the widest base points. */
const CORNER_RISE_MM = 12.0;
/** Above this many vertices, skip the pass entirely (memory/latency guard). */
const VERT_CAP = 3_000_000;

export interface StabilizationAnchor {
    x: number;
    y: number;
    z: number;
}

/**
 * Compute stabilization anchors for a mesh (matrixWorld must be current).
 * Returns an empty array when the pose is stable — the common case, so a
 * flat-printed model changes nothing.
 */
export function computeStabilizationAnchors(mesh: THREE.Mesh): StabilizationAnchor[] {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geometry.getAttribute('position');
    if (!posAttr || posAttr.itemSize !== 3 || posAttr.count < 3 || posAttr.count > VERT_CAP) return [];
    const positions = posAttr.array as ArrayLike<number>;
    const indexAttr = geometry.getIndex();
    const index = indexAttr ? (indexAttr.array as ArrayLike<number>) : null;
    const triCount = index ? Math.floor(indexAttr!.count / 3) : Math.floor(posAttr.count / 3);
    if (triCount <= 0) return [];

    const e = mesh.matrixWorld.elements;
    const toX = (x: number, y: number, z: number): number => e[0] * x + e[4] * y + e[8] * z + e[12];
    const toY = (x: number, y: number, z: number): number => e[1] * x + e[5] * y + e[9] * z + e[13];
    const toZ = (x: number, y: number, z: number): number => e[2] * x + e[6] * y + e[10] * z + e[14];

    // Welded graph: unique world vertices + unique edges, built in one pass
    // over the triangles alongside the surface-centroid accumulation.
    const weld = new Map<string, number>();
    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    const edges = new Set<string>();
    const vertexAt = (li: number): number => {
        const x = positions[li];
        const y = positions[li + 1];
        const z = positions[li + 2];
        const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
        let id = weld.get(key);
        if (id === undefined) {
            id = vx.length;
            weld.set(key, id);
            vx.push(toX(x, y, z));
            vy.push(toY(x, y, z));
            vz.push(toZ(x, y, z));
        }
        return id;
    };
    const link = (a: number, b: number): void => {
        if (a === b) return;
        edges.add(a < b ? `${a},${b}` : `${b},${a}`);
    };

    let comX = 0;
    let comY = 0;
    let totalArea = 0;
    for (let t = 0; t < triCount; t++) {
        const ia = (index ? index[t * 3] : t * 3) * 3;
        const ib = (index ? index[t * 3 + 1] : t * 3 + 1) * 3;
        const ic = (index ? index[t * 3 + 2] : t * 3 + 2) * 3;
        const a = vertexAt(ia);
        const b = vertexAt(ib);
        const c = vertexAt(ic);
        link(a, b);
        link(b, c);
        link(c, a);

        const ax = toX(positions[ia], positions[ia + 1], positions[ia + 2]);
        const ay = toY(positions[ia], positions[ia + 1], positions[ia + 2]);
        const bx = toX(positions[ib], positions[ib + 1], positions[ib + 2]);
        const by = toY(positions[ib], positions[ib + 1], positions[ib + 2]);
        const cx = toX(positions[ic], positions[ic + 1], positions[ic + 2]);
        const cy = toY(positions[ic], positions[ic + 1], positions[ic + 2]);
        const area = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
        if (area <= 0) continue;
        totalArea += area;
        comX += area * (ax + bx + cx) / 3;
        comY += area * (ay + by + cy) / 3;
    }

    let zMin = Infinity;
    for (const z of vz) {
        if (z < zMin) zMin = z;
    }
    if (!Number.isFinite(zMin)) return [];
    if (totalArea > 0) {
        comX /= totalArea;
        comY /= totalArea;
    }

    // Bearing locus: projected hull of the low surface.
    const bearing: THREE.Vector2[] = [];
    for (let i = 0; i < vx.length; i++) {
        if (vz[i] - zMin <= BEARING_BAND_MM) bearing.push(new THREE.Vector2(vx[i], vy[i]));
    }
    const hull = convexHull2d(bearing);

    // Stable = enough bearing area AND the centroid over (or within a margin
    // of) that area. Either failing means the part can tip.
    if (hull.length >= 3 && hullArea(hull) >= MIN_BEARING_AREA_MM2 && insideOrNear(comX, comY, hull)) {
        return [];
    }

    // Unstable: lay teeth along the low edge skeleton. Two regimes — an
    // edge/face contact already gives a low line, so teeth go along it plus a
    // short flank up each face; a lone point has no line, so teeth climb the
    // radiating edges to the widest base points (a tripod).
    const isBearing = (id: number): boolean => vz[id] - zMin <= BEARING_BAND_MM;
    const bearingEdges: Array<[number, number]> = [];
    const climbEdges: Array<[number, number]> = [];
    for (const edgeKey of edges) {
        const sep = edgeKey.indexOf(',');
        const a = parseInt(edgeKey.slice(0, sep));
        const b = parseInt(edgeKey.slice(sep + 1));
        const ba = isBearing(a);
        const bb = isBearing(b);
        if (ba && bb) bearingEdges.push([a, b]);
        else if (ba || bb) climbEdges.push([a, b]);
    }

    const cell = SPACING_MM;
    const best = new Map<string, StabilizationAnchor>();
    const put = (x: number, y: number, z: number): void => {
        const key = `${Math.round(x / cell)},${Math.round(y / cell)}`;
        const existing = best.get(key);
        if (!existing || z < existing.z) best.set(key, { x, y, z });
    };
    const emitEdge = (a: number, b: number, riseCap: number): void => {
        const lo = vz[a] <= vz[b] ? a : b;
        const hi = lo === a ? b : a;
        const lx = vx[lo];
        const ly = vy[lo];
        const lz = vz[lo];
        const hx = vx[hi];
        const hy = vy[hi];
        const hz = vz[hi];
        if (lz - zMin > riseCap) return;
        const len = Math.hypot(hx - lx, hy - ly, hz - lz);
        if (len <= 1e-9) return;
        const steps = Math.floor(len / SPACING_MM);
        for (let k = 0; k <= steps; k++) {
            const t = (k * SPACING_MM) / len;
            const z = lz + (hz - lz) * t;
            if (z - zMin > riseCap + 1e-9) break;
            put(lx + (hx - lx) * t, ly + (hy - ly) * t, z);
        }
    };

    if (bearingEdges.length > 0) {
        // Edge/face contact: the bearing line is the stance; flanks are short.
        for (const e of bearingEdges) emitEdge(e[0], e[1], Infinity);
        for (const e of climbEdges) emitEdge(e[0], e[1], FLANK_RISE_MM);
        const all = [...best.values()].sort((a, b) => a.z - b.z);
        return all.slice(0, MAX_ANCHORS);
    }
    // Lone point: climb the radiating edges for a wide tripod, spreading the
    // cap across the z range so the widest vertices are reached.
    for (const e of climbEdges) emitEdge(e[0], e[1], CORNER_RISE_MM);
    const all = [...best.values()].sort((a, b) => a.z - b.z);
    if (all.length <= MAX_ANCHORS) return all;
    const anchors: StabilizationAnchor[] = [];
    for (let i = 0; i < MAX_ANCHORS; i++) {
        anchors.push(all[Math.floor((i * (all.length - 1)) / (MAX_ANCHORS - 1))]);
    }
    return anchors;
}

function hullArea(hull: THREE.Vector2[]): number {
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
        const p = hull[i];
        const q = hull[(i + 1) % hull.length];
        area += p.x * q.y - q.x * p.y;
    }
    return Math.abs(area) / 2;
}

/** True when (px,py) is inside the CCW hull or within MARGIN of its edge. */
function insideOrNear(px: number, py: number, hull: THREE.Vector2[]): boolean {
    let minDepth = Infinity;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len = Math.hypot(ex, ey) || 1;
        const nx = -ey / len;
        const ny = ex / len;
        const depth = (px - a.x) * nx + (py - a.y) * ny;
        if (depth < minDepth) minDepth = depth;
    }
    return minDepth >= -MARGIN_MM;
}
