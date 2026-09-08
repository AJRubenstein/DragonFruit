/**
 * Orientation advisor: suggest a build orientation that minimizes support
 * contact area, without ever auto-rotating. Curvy-style quality-weighted
 * cost (Ulu et al. 2021) plus a resin-required suction-cup penalty Curvy
 * lacks — its cost would happily invert a cupped part.
 *
 * Pure functions over triangle soup (no mesh store dependency) so the
 * solver is trivially testable. Simulated annealing over tilt (rotX) and
 * turntable (rotY) with a seeded PRNG → deterministic suggestions.
 * (Rotation about Z is omitted deliberately: Z is plate-up, so it cannot
 * change any normal.z and the cost would be blind to it.)
 */

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
    /** Weighted total the annealer minimizes. */
    cost: number;
}

export interface AdvisorOptions {
    /** Face is overhang when normal.z < -cos(angle). Default 45°. */
    selfSupportAngleDeg?: number;
    /** Extra weight per mm² of cup area. Default 2 (cups fail prints). */
    cupWeight?: number;
    /** Annealing iterations. Default 200. */
    iterations?: number;
    /** PRNG seed for deterministic suggestions. Default 1337. */
    seed?: number;
}

export interface OrientationSuggestion {
    rotXDeg: number;
    rotYDeg: number;
    baseline: OrientationCost;
    suggested: OrientationCost;
    /** Predicted contact-area change vs current orientation (negative = better). */
    deltaPercent: number;
}

/** Mulberry32 — deterministic PRNG for the annealer. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const DEFAULT_ANGLE_DEG = 45;
const CUP_FLAT_COS = 0.95;

/** Rotated normal z after Rx(a) then Ry(b) applied to unit (ux, uy, uz). */
function rotatedNz(ux: number, uy: number, uz: number, sa: number, ca: number, sb: number, cb: number): number {
    // Rx: y' = y·ca − z·sa; z1 = y·sa + z·ca. Ry preserves nothing here:
    // z' = −x·sb + z1·cb.
    return -ux * sb + (uy * sa + uz * ca) * cb;
}

/**
 * Cost of one orientation: rotate every triangle normal and accumulate
 * down-facing area past the self-support threshold, plus the cup proxy
 * (near-flat down-facing area) at extra weight.
 */
export function evaluateOrientationCost(
    mesh: AdvisorMesh,
    rotXRad: number,
    rotYRad: number,
    opts: AdvisorOptions = {},
): OrientationCost {
    const threshold = Math.cos(((opts.selfSupportAngleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180);
    const cupWeight = opts.cupWeight ?? 2;
    const { positions, index } = mesh;
    const triCount = index && index.length > 0 ? Math.floor(index.length / 3) : Math.floor(positions.length / 9);

    const sa = Math.sin(rotXRad);
    const ca = Math.cos(rotXRad);
    const sb = Math.sin(rotYRad);
    const cb = Math.cos(rotYRad);

    const v = (i: number): [number, number, number] => {
        const vi = index && index.length > 0 ? index[i] : i;
        return [positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]];
    };

    let overhangAreaMm2 = 0;
    let cupAreaMm2 = 0;
    for (let t = 0; t < triCount; t++) {
        const [ax, ay, az] = v(t * 3);
        const [bx, by, bz] = v(t * 3 + 1);
        const [cxp, cyp, czp] = v(t * 3 + 2);
        const ux = bx - ax;
        const uy = by - ay;
        const uz = bz - az;
        const wx = cxp - ax;
        const wy = cyp - ay;
        const wz = czp - az;
        // Normal = u × w; area = |n| / 2.
        const nx = uy * wz - uz * wy;
        const ny = uz * wx - ux * wz;
        const nz = ux * wy - uy * wx;
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
        if (area <= 0) continue;
        const nzr = rotatedNz(nx / (2 * area), ny / (2 * area), nz / (2 * area), sa, ca, sb, cb);
        if (nzr < -threshold) overhangAreaMm2 += area;

        if (nzr < -CUP_FLAT_COS) cupAreaMm2 += area;
    }

    return { overhangAreaMm2, cupAreaMm2, cost: overhangAreaMm2 + cupWeight * cupAreaMm2 };
}

/**
 * Suggest a better orientation via simulated annealing over (rotX, rotY).
 * Never returns worse than identity — the suggestion surface shows the
 * delta, and applying it stays the user's explicit choice.
 */
export function suggestOrientation(mesh: AdvisorMesh, opts: AdvisorOptions = {}): OrientationSuggestion {
    const iterations = opts.iterations ?? 200;
    const rand = mulberry32(opts.seed ?? 1337);
    const baseline = evaluateOrientationCost(mesh, 0, 0, opts);
    const wrapped = (a: number): number => {
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    };

    let bestX = 0;
    let bestY = 0;
    let bestCost = baseline.cost;
    let curX = 0;
    let curY = 0;
    let curCost = baseline.cost;
    // Step schedule 10° → ~0.5° over the run.
    for (let i = 0; i < iterations; i++) {
        const frac = i / Math.max(1, iterations);
        const temp = 1 - frac;
        const step = ((10 * Math.PI) / 180) * (1 - frac) + ((0.5 * Math.PI) / 180) * frac;
        const px = wrapped(curX + (rand() * 2 - 1) * step);
        const py = wrapped(curY + (rand() * 2 - 1) * step);
        const c = evaluateOrientationCost(mesh, px, py, opts).cost;
        if (c < curCost || rand() < Math.exp(-(c - curCost) / Math.max(1e-9, temp * Math.max(1, baseline.cost)))) {
            curX = px;
            curY = py;
            curCost = c;
            if (c < bestCost) {
                bestCost = c;
                bestX = px;
                bestY = py;
            }
        }
    }

    const toDeg = (a: number): number => Math.round(((a * 180) / Math.PI) * 10) / 10;
    const improved = bestCost < baseline.cost;
    const suggested = improved ? evaluateOrientationCost(mesh, bestX, bestY, opts) : { ...baseline };
    const deltaPercent =
        baseline.overhangAreaMm2 > 0
            ? ((suggested.overhangAreaMm2 - baseline.overhangAreaMm2) / baseline.overhangAreaMm2) * 100
            : 0;
    return {
        rotXDeg: improved ? toDeg(bestX) : 0,
        rotYDeg: improved ? toDeg(bestY) : 0,
        baseline,
        suggested,
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
 * position/index soup and runs the annealer. The UI layer calls this with
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
    return suggestOrientation(
        { positions, index: geometry.index ?? null },
        opts,
    );
}
