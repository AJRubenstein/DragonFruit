import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateOrientationCost, suggestOrientation, suggestOrientationForGeometry } from '../autoSupport/orientationAdvisor';

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

test('down-facing square counts fully at identity', () => {
    const c = evaluateOrientationCost(downSquare(), 0, 0);
    assert.equal(c.overhangAreaMm2, 1, 'full area is overhang');
    assert.equal(c.cupAreaMm2, 1, 'flat-down area is cup');
    assert.equal(c.cost, 1 + 2 * 1, 'cost = overhang + cupWeight × cup');
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

test('suggestion eliminates a fully down-facing plate', () => {
    const s = suggestOrientation(downSquare(), { iterations: 200 });
    assert.ok(s.deltaPercent < -90, `near-total improvement (got ${s.deltaPercent}%)`);
    assert.equal(s.suggested.overhangAreaMm2, 0);
});

test('suggestions are deterministic for the same seed', () => {
    const a = suggestOrientation(downSquare(), { seed: 42 });
    const b = suggestOrientation(downSquare(), { seed: 42 });
    assert.deepEqual(a, b, 'same seed → identical suggestion');
});

test('already-optimal geometry returns identity', () => {
    const s = suggestOrientation(upSquare());
    assert.equal(s.rotXDeg, 0);
    assert.equal(s.rotYDeg, 0);
    assert.equal(s.deltaPercent, 0);
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
