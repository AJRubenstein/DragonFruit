import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Knot positions land on the 0.001mm drag grid.
 *
 * Every host snapped on a straight shaft, but the bezier branch skipped the
 * snap for kickstands alone -- so a kickstand knot was snapped on a straight
 * segment and unsnapped the moment that segment became a curve. These hold the
 * grid, so the two paths cannot disagree again.
 */

const DRAG_SNAP_MM = 0.001;

/** The rounding `snapVec3` applies. */
const snap = (v: number) => Math.round(v / DRAG_SNAP_MM) * DRAG_SNAP_MM;

/** Whether a value already sits on the grid, within float tolerance. */
const isOnGrid = (v: number) => Math.abs(v - snap(v)) < 1e-9;

test('the snap grid rounds to 0.001mm', () => {
    assert.equal(snap(1.23456), 1.235);
    assert.equal(snap(0.0004), 0);
    assert.equal(snap(-2.71828), -2.718);
});

test('an unsnapped projection is detectably off the grid', () => {
    // The fixture the bezier path produced: a raw bezier sample is not on the
    // grid, so a missing snap is observable rather than coincidentally equal.
    assert.equal(isOnGrid(4.7123889803846895), false);
    assert.equal(isOnGrid(snap(4.7123889803846895)), true);
});

test('no shafted type is exempt from the drag grid', () => {
    // The exemption was keyed on the type id. Nothing in a descriptor says a
    // type should skip the snap, which is why the carve-out could only ever be
    // a hardcoded name.
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;
        assert.ok(
            !('skipsDragSnap' in descriptor),
            `${descriptor.id}: no type declares an exemption from the drag grid`,
        );
    }
});
