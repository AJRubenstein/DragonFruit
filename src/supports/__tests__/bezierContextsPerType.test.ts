import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Bezier handle contexts are built once per shafted type.
 *
 * The manager has a generic loop over every `hasSegments` type, keyed by the
 * declared `bezierContextIdPrefix`. A second, hand-written kickstand loop sat
 * below it doing the same walk, so a kickstand joint collected its handles
 * twice -- at identical ids for the joint contexts.
 *
 * Brace keeps its own loop legitimately: `hasSegments` is false, so the generic
 * loop skips it and its handles come from two knot endpoints instead.
 */

const SOURCE = readFileSync(
    new URL('../Curves/BezierGizmo/BezierGizmoManager.tsx', import.meta.url),
    'utf8',
);

test('the generic loop covers every shafted type', () => {
    assert.match(
        SOURCE,
        /for \(const descriptor of SUPPORT_TYPES\) \{\s*\n\s*if \(!descriptor\.hasSegments\) continue;/,
        'the generic shafted loop is gone',
    );
});

test('kickstand is a shafted type, so the generic loop already handles it', () => {
    const kickstand = getSupportTypeDescriptor('kickstand');
    assert.equal(kickstand.hasSegments, true);
    assert.equal(kickstand.bezierContextIdPrefix, 'kickstand-');
});

test('kickstand still has a second loop, and the two disagree', () => {
    // Not yet removed: the generic loop anchors a missing first bottom joint at
    // the ROOT (kickstand declares `lower: plateRoot`), while the hand-written
    // loop below anchors it at the HOST KNOT. Deleting the duplicate would pick
    // one silently, so it needs a decision -- see the findings file.
    assert.ok(SOURCE.includes('of Object.values(state.kickstands)'));
    assert.equal(getSupportTypeDescriptor('kickstand').lower.kind, 'plateRoot');
});

test('brace keeps its own loop, and the registry says why', () => {
    // Not an oversight: no segments, so it is not what the generic loop walks.
    const brace = getSupportTypeDescriptor('brace');
    assert.equal(brace.hasSegments, false);
    assert.ok(SOURCE.includes('of Object.values(state.braces)'), 'brace should still have its own loop');
});
