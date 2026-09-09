import assert from 'node:assert/strict';
import test from 'node:test';

import {
    computeTriangleDetail,
    evaluateOrientationCost,
    generateM1Candidates,
    restingPoseCandidates,
    suggestOrientation,
    suggestOrientationForGeometry,
} from '../autoSupport/orientationAdvisor';

/** Unit down-facing square (area 1) in the XY plane. */
function downSquare(): { positions: number[]; index: number[] } {
    return {
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        index: [0, 2, 1, 0, 3, 2],
    };
}

/** Unit up-facing square (area 1). */
function upSquare(): { positions: number[]; index: number[] } {
    return {
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        index: [0, 1, 2, 0, 2, 3],
    };
}

/** 2 mm cube with outward winding. */
function cube(): { positions: number[]; index: number[] } {
    return {
        positions: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
        index: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5],
    };
}

/** 2×2×10 mm tower: cube topology stretched in Z. */
function tallBox(): { positions: number[]; index: number[] } {
    const c = cube();
    const positions = [...c.positions];
    for (let i = 2; i < positions.length; i += 3) positions[i] *= 5;
    return { positions, index: c.index };
}

test('down-facing square counts fully at identity', () => {
    const c = evaluateOrientationCost(downSquare(), 0, 0);
    assert.equal(c.overhangAreaMm2, 1, 'full area is overhang');
    assert.equal(c.cupAreaMm2, 1, 'flat-down area is cup');
    assert.equal(c.cost, 1 + 2 * 1, 'cost = overhang + cupWeight × cup');
    assert.equal(c.heightMm, 0, 'planar square has no height');
    assert.equal(c.footprintMm2, 1, '1×1 footprint');
});

test('up-facing square costs nothing', () => {
    const c = evaluateOrientationCost(upSquare(), 0, 0);
    assert.equal(c.overhangAreaMm2, 0);
    assert.equal(c.cupAreaMm2, 0);
    assert.equal(c.cost, 0);
});

test('flipping over removes the cost', () => {
    const c = evaluateOrientationCost(downSquare(), Math.PI, 0);
    assert.equal(c.overhangAreaMm2, 0, 'rotX 180° turns the face up');
});

test('sweep eliminates a fully down-facing plate', () => {
    const s = suggestOrientation(downSquare());
    assert.ok(s.deltaPercent < -90, `near-total improvement (got ${s.deltaPercent}%)`);
    assert.equal(s.suggested.overhangAreaMm2, 0);
});

test('sweep is deterministic across calls', () => {
    const a = suggestOrientation(downSquare(), { candidateCount: 32 });
    const b = suggestOrientation(downSquare(), { candidateCount: 32 });
    assert.deepEqual(a, b, 'same mesh → identical suggestion, no seed needed');
});

test('already-optimal geometry returns identity', () => {
    const s = suggestOrientation(upSquare());
    assert.equal(s.rotXDeg, 0);
    assert.equal(s.rotYDeg, 0);
    assert.equal(s.deltaPercent, 0);
});

test('sweep never regresses on a cube', () => {
    const s = suggestOrientation(cube(), { candidateCount: 48 });
    assert.ok(s.deltaPercent <= 0, `never worse than identity (got ${s.deltaPercent}%)`);
    assert.ok(Number.isFinite(s.rotXDeg) && Number.isFinite(s.rotYDeg), 'finite angles');
    assert.ok(s.suggested.cost <= s.baseline.cost, 'suggested costs no more than baseline');
});

test('candidate set holds identity and stays bounded', () => {
    const cands = generateM1Candidates(downSquare(), { candidateCount: 24, restingPoseCount: 4 });
    assert.ok(cands.length >= 25, `identity + sweep (got ${cands.length})`);
    assert.ok(cands.length <= 29, `bounded by resting cap (got ${cands.length})`);
    assert.deepEqual(cands[0], { rotXRad: 0, rotYRad: 0 }, 'identity leads so the result never regresses');
    assert.deepEqual(cands, generateM1Candidates(downSquare(), { candidateCount: 24, restingPoseCount: 4 }), 'deterministic');
});

test('resting poses find the six cube faces', () => {
    const poses = restingPoseCandidates(cube(), 6);
    assert.equal(poses.length, 6, `one pose per cube face (got ${poses.length})`);
    for (const p of poses) {
        assert.ok(Number.isFinite(p.rotXRad) && Number.isFinite(p.rotYRad), 'finite pose angles');
    }
});

test('geometry adapter rejects empty geometry and accepts soup', () => {
    assert.equal(suggestOrientationForGeometry({ attributes: {} }), null, 'no positions → null');
    assert.equal(
        suggestOrientationForGeometry({ attributes: { position: { array: [] } } }),
        null,
        'empty positions → null',
    );
    const s = suggestOrientationForGeometry({
        attributes: { position: { array: downSquare().positions } },
        index: downSquare().index,
    });
    assert.ok(s && s.deltaPercent < -90, 'indexed soup solves like the raw mesh');
});

test('supports objective beats naive upright on a tower', () => {
    const s = suggestOrientation(tallBox(), { objective: 'supports', candidateCount: 48 });
    assert.ok(s.suggested.cost < s.baseline.cost, `improves on upright (got ${s.suggested.cost} vs ${s.baseline.cost})`);
    assert.ok(s.deltaPercent <= -50, `substantial contact cut (got ${s.deltaPercent}%)`);
    assert.ok(Number.isFinite(s.rotXDeg) && Number.isFinite(s.rotYDeg), 'finite angles');
});

test('height objective lays the tower down', () => {
    const s = suggestOrientation(tallBox(), { objective: 'height', candidateCount: 48 });
    assert.ok(s.suggested.heightMm < s.baseline.heightMm, `shorter than upright (got ${s.suggested.heightMm} vs ${s.baseline.heightMm})`);
    assert.ok(s.suggested.heightMm <= 2.5, `near the 2 mm minimum (got ${s.suggested.heightMm})`);
    assert.ok(Number.isFinite(s.rotXDeg) && Number.isFinite(s.rotYDeg), 'finite angles');
});

test('height objective leaves flat parts flat', () => {
    const s = suggestOrientation(downSquare(), { objective: 'height' });
    assert.equal(s.rotXDeg, 0, 'any tilt adds height to a planar part');
    assert.equal(s.rotYDeg, 0);
});

/** Icosahedron (radius r): face normals cover the sphere, so no zero-cost pose exists. */
function icosahedron(radius: number): { positions: number[]; index: number[] } {
    const t = (1 + Math.sqrt(5)) / 2;
    const positions = [
        -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
        0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
        t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
    ].map((v) => v * radius);
    const index = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
        1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
        4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ];
    return { positions, index };
}

/** Icosahedron baked 30° off its symmetric pose, so identity is far from optimal. */
function tiltedIcosahedron(): { positions: number[]; index: number[] } {
    const m = icosahedron(2.5);
    const a = (30 * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const positions = [...m.positions];
    for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1];
        const z = positions[i + 2];
        positions[i + 1] = y * ca - z * sa;
        positions[i + 2] = y * sa + z * ca;
    }
    return { positions, index: m.index };
}

test('anchoring margin trades a little contact for a wider base', () => {
    const mesh = tiltedIcosahedron();
    const s = suggestOrientation(mesh, { candidateCount: 120 });
    // Floor via the public cost fn: cheapest coarse candidate.
    let minPrimary = Infinity;
    for (const c of generateM1Candidates(mesh, { candidateCount: 120 })) {
        const e = evaluateOrientationCost(mesh, c.rotXRad, c.rotYRad, {});
        if (e.cost < minPrimary) minPrimary = e.cost;
    }
    assert.ok(
        s.suggested.cost <= minPrimary * 1.05 + 0.5 + 1e-6,
        `de-opt stays inside the margin (got ${s.suggested.cost} vs floor ${minPrimary})`,
    );
    assert.ok(s.suggested.footprintMm2 > 80, `widest base wins (got ${s.suggested.footprintMm2})`);
    assert.ok(s.deltaPercent < 0, 'still a strict improvement over the baked tilt');
});

test('computeTriangleDetail scores folds, flats, and lone triangles', () => {
    const fold = computeTriangleDetail(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1],
        [0, 1, 2, 1, 0, 3],
        2,
        new Float64Array([0, 0, -1, -1, 0, 0]),
        new Float64Array([0.5, 0.5]),
    );
    assert.ok(Math.abs(fold[0] - 1) < 1e-9 && Math.abs(fold[1] - 1) < 1e-9, 'right-angle crease reads 1');
    const flat = computeTriangleDetail(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
        [0, 1, 2, 1, 3, 2],
        2,
        new Float64Array([0, 0, -1, 0, 0, -1]),
        new Float64Array([0.5, 0.5]),
    );
    assert.deepEqual([...flat], [0, 0], 'coplanar pair reads 0');
    const lone = computeTriangleDetail(
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
        [0, 1, 2],
        1,
        new Float64Array([0, 0, -1]),
        new Float64Array([0.5]),
    );
    assert.deepEqual([...lone], [0], 'boundary-only triangle reads 0');
});

test('scar equals overhang on featureless plates', () => {
    const c = evaluateOrientationCost(downSquare(), 0, 0, {});
    assert.equal(c.scarAreaMm2, c.overhangAreaMm2, 'no detail, nothing to scar');
});

test('scarring with zero weight matches supports ranking', () => {
    const a = suggestOrientation(downSquare(), { objective: 'scarring', scarWeight: 0 });
    const b = suggestOrientation(downSquare(), {});
    assert.deepEqual(a, b, 'zero weight degenerates to contact ranking');
});

test('scarring returns a valid never-worse suggestion', () => {
    const mesh = tiltedIcosahedron();
    const s = suggestOrientation(mesh, { candidateCount: 120, objective: 'scarring' });
    assert.ok(Number.isFinite(s.rotXDeg) && Number.isFinite(s.rotYDeg), 'finite angles');
    assert.ok(s.suggested.cost <= s.baseline.cost, 'never worse than identity');
    const again = suggestOrientation(mesh, { candidateCount: 120, objective: 'scarring' });
    assert.deepEqual(s, again, 'deterministic');
});
