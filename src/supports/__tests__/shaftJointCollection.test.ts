import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Which of a segment's joints the renderer draws.
 *
 * Five near-identical memos differed in one thing: trunk, branch and kickstand
 * collect the top joint only, twig and stick collect both. That split is
 * `segmentsCarryBothJoints`.
 */

const SHAFTED_WITH_JOINTS = ['trunk', 'branch', 'twig', 'stick', 'kickstand'] as const;

test('the joint rule follows segmentsCarryBothJoints', () => {
    const bothEnds = SHAFTED_WITH_JOINTS
        .filter((id) => getSupportTypeDescriptor(id).segmentsCarryBothJoints);
    const topOnly = SHAFTED_WITH_JOINTS
        .filter((id) => !getSupportTypeDescriptor(id).segmentsCarryBothJoints);

    assert.deepEqual([...bothEnds].sort(), ['stick', 'twig']);
    assert.deepEqual([...topOnly].sort(), ['branch', 'kickstand', 'trunk']);
});

test('a hosted shaft takes its lower end from its host, not a joint', () => {
    // Which is why trunk, branch and kickstand skip the bottom joint: it is a
    // render artefact, and the real lower end is the root or host knot.
    for (const id of ['trunk', 'branch', 'kickstand'] as const) {
        const descriptor = getSupportTypeDescriptor(id);
        assert.equal(descriptor.segmentsCarryBothJoints, false);
        assert.ok(
            descriptor.lower.kind === 'plateRoot' || descriptor.lower.kind === 'knot',
            `${id} lower should be a host, got ${descriptor.lower.kind}`,
        );
    }
});

test('a self-contained shaft has a real joint at both ends', () => {
    for (const id of ['twig', 'stick'] as const) {
        const descriptor = getSupportTypeDescriptor(id);
        assert.equal(descriptor.segmentsCarryBothJoints, true);
        assert.ok(
            descriptor.lower.kind === 'cone' || descriptor.lower.kind === 'disk',
            `${id} lower should be a contact`,
        );
    }
});

test('every shafted type answers the question', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;
        assert.equal(typeof descriptor.segmentsCarryBothJoints, 'boolean', descriptor.id);
    }
});
