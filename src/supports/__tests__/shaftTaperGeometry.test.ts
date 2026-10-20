import assert from 'node:assert/strict';
import test from 'node:test';

import { braceSpanDiameters } from '../SupportTypes/Brace/braceSpanDiameters';
import { taperWidthAlong } from '../SupportPrimitives/Shaft/shaftTaperGeometry';
import { buildBatchedTaperedShafts, isTaperedBatchedShaft } from '../SupportPrimitives/Shaft/batchedTaperedShaftGeometry';
import { resolveCurvedShaftIndexForFace } from '../Curves/batchedBezierTubeGeometry';
import type { InstancedShaft } from '../SupportPrimitives/Shaft/InstancedShaftGroup';
import type { Brace, Knot } from '../types';

const knot = (diameter: number) => ({ diameter }) as Knot;
const brace = (diameter: number) => ({ profile: { diameter } }) as Brace;

test('a taper is shared out across the pieces of a curve', () => {
    // Five points, so four pieces spanning 2mm down to 1mm.
    const widthAt = taperWidthAlong(5, 2, 1);

    assert.equal(widthAt(0), 2);
    assert.equal(widthAt(2), 1.5);
    assert.equal(widthAt(4), 1);
});

test('a shaft with one width reads the same at every point', () => {
    const widthAt = taperWidthAlong(5, 2);

    assert.equal(widthAt(0), 2);
    assert.equal(widthAt(4), 2);
});

test('a single piece runs the whole taper', () => {
    const widthAt = taperWidthAlong(2, 2, 1);

    assert.equal(widthAt(0), 2);
    assert.equal(widthAt(1), 1);
});

test('a brace takes each end from its host knot, capped by the profile', () => {
    // A knot narrower than the profile pulls that end in; the joint offset is 0.1.
    const span = braceSpanDiameters(brace(2), knot(1.2), knot(2.5));

    assert.equal(Math.round(span.startDiameterMm * 1000) / 1000, 1.1);
    assert.equal(span.endDiameterMm, 2, 'the wider knot is capped by the profile');
    assert.equal(span.isTapered, true);
});

test('matching knots leave a brace uniform', () => {
    const span = braceSpanDiameters(brace(2), knot(2.5), knot(2.5));

    assert.equal(span.startDiameterMm, span.endDiameterMm);
    assert.equal(span.isTapered, false);
});

test('tapered shafts merge into one geometry whose faces map back', () => {
    const shafts: InstancedShaft[] = [
        { id: 'a', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 10 }, diameter: 2, diameterEnd: 1 },
        { id: 'b', start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 10 }, diameter: 3, diameterEnd: 1 },
    ];
    const merged = buildBatchedTaperedShafts(shafts, 12);

    assert.ok(merged, 'the shafts merge');
    assert.equal(merged.triangleRangeEnds.length, shafts.length, 'one face range each');
    for (let i = 0; i < shafts.length; i += 1) {
        const firstFace: number = i === 0 ? 0 : merged.triangleRangeEnds[i - 1];
        assert.equal(
            resolveCurvedShaftIndexForFace(merged.triangleRangeEnds, firstFace),
            i,
            `a face of ${shafts[i].id} resolves to it`,
        );
    }
});

test('a shaft with equal ends is not treated as tapering', () => {
    assert.equal(isTaperedBatchedShaft({ id: 'a', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 1 }, diameter: 2 }), false);
    assert.equal(isTaperedBatchedShaft({ id: 'b', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 1 }, diameter: 2, diameterEnd: 2 }), false);
    assert.equal(isTaperedBatchedShaft({ id: 'c', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 1 }, diameter: 2, diameterEnd: 1 }), true);
});
