import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBracePlacementPreviewBatch } from '../SupportTypes/Brace/bracePreviewBatch';
// What the renderer loads, which is what wires brace's builder into the seam.
import '../previewGeometry/registerBuiltinPreviewBuilders';
import { buildSegmentPreviewBatch } from '../previewGeometry/seam';

/**
 * The batch a brace's placement preview draws.
 *
 * This geometry used to sit in the shared `supportPlacementPreviewMath.ts` and
 * was imported by name into `SupportRenderer`. Moving it to brace's folder left
 * it with no test, so these are its first: the builder is a pure function of the
 * preview data, which is exactly what makes that possible.
 */

/** The diameter cap a caller supplies; a plain value keeps this test scene-free. */
const CAP = 1.2;
const CTX = { maxShaftDiameterMm: CAP };

const span = (diameterMm: number, z = 10) => ({
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 0, z },
    startDiameterMm: diameterMm,
    endDiameterMm: diameterMm,
});

test('an even span draws one straight shaft between two knots', () => {
    const batch = buildBracePlacementPreviewBatch('pv', span(1), CTX);
    assert.ok(batch, 'a real span produces a batch');
    assert.equal(batch.shafts.length, 1, 'one shaft');
    assert.equal(batch.taperedShafts.length, 0, 'not tapered, so no tapered shaft');
    assert.equal(batch.joints.length, 2, 'a knot at each end');
    assert.equal(batch.joints[0].pos.z, 0);
    assert.equal(batch.joints[1].pos.z, 10);
});

test('a span with mismatched ends draws a tapered shaft instead', () => {
    // The two snapped hosts can differ in diameter; one taper is smoother than
    // a stepped pair.
    const batch = buildBracePlacementPreviewBatch('pv', {
        ...span(1),
        endDiameterMm: 0.5,
    }, CTX);
    assert.ok(batch);
    assert.equal(batch.shafts.length, 0, 'no straight shaft');
    assert.equal(batch.taperedShafts.length, 1, 'one tapered shaft');
    const taper = batch.taperedShafts[0];
    assert.notEqual(taper.diameterStart, taper.diameterEnd, 'and the ends differ');
});

test('a zero-length span draws only the start knot', () => {
    // Before the second click, or while the two endpoints coincide, there is no
    // shaft to draw -- a zero-length one would render as a degenerate instance.
    const batch = buildBracePlacementPreviewBatch('pv', span(1, 0), CTX);
    assert.ok(batch);
    assert.equal(batch.shafts.length, 0);
    assert.equal(batch.taperedShafts.length, 0);
    assert.equal(batch.joints.length, 1, 'just the start knot');
});

test('a brace preview carries no root and no cone', () => {
    // It spans two existing hosts: nothing touches the plate and nothing lands
    // on a model, which is what makes it a segment-shaped preview.
    const batch = buildBracePlacementPreviewBatch('pv', span(1), CTX);
    assert.ok(batch);
    assert.deepEqual(batch.roots, [], 'no plate root');
    assert.deepEqual(batch.cones, [], 'no contact cone');
    assert.deepEqual(batch.disks, []);
});

test('the shaft diameter is clamped to the cap the caller supplies', () => {
    // The preview must not promise a shaft thicker than the finished support.
    const batch = buildBracePlacementPreviewBatch('pv', span(CAP * 10), CTX);
    assert.ok(batch);
    assert.ok(
        batch.shafts[0].diameter <= CAP + 1e-9,
        `preview shaft ${batch.shafts[0].diameter} stays within the cap ${CAP}`,
    );
});

test('a tiny span does not produce a zero-diameter shaft', () => {
    const batch = buildBracePlacementPreviewBatch('pv', span(0), CTX);
    assert.ok(batch);
    const drawn = batch.shafts.length > 0 || batch.taperedShafts.length > 0;
    assert.ok(drawn, 'a span with a real length still draws something');
    if (batch.shafts.length > 0) {
        assert.ok(batch.shafts[0].diameter > 0, 'never zero');
    }
});

test('the type registers its builder, so the renderer never names brace', () => {
    // The whole point of the move: `SupportRenderer` asks the seam by type id.
    const viaSeam = buildSegmentPreviewBatch('brace', 'pv', span(1), CTX);
    assert.ok(viaSeam, 'brace is reachable through the registry-shaped seam');
    assert.equal(viaSeam.id, 'pv', 'and the batch is the one the builder produced');
});

test('a type that registers no segment builder yields nothing', () => {
    assert.equal(buildSegmentPreviewBatch('trunk', 'pv', span(1), CTX), null);
});
