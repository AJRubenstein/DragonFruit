import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SUPPORT_REMOVAL_SHAPES, SUPPORT_TYPES, SUPPORT_TYPE_COLLECTION } from '../supportTypeRegistry';

/**
 * The removal shapes are the single declaration of what a removal returns.
 *
 * Before this, each removeX restated its own shape in its signature, so the
 * registry and the function could disagree with nothing to catch it. These
 * check the declaration stays complete and that nothing re-declares it.
 */

test('every support type declares a removal shape', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const shape = SUPPORT_REMOVAL_SHAPES[descriptor.id];
        assert.ok(shape, `${descriptor.id} has no removal shape`);
        assert.equal(typeof shape.self, 'string');
        assert.ok(shape.self.length > 0, `${descriptor.id}.self must be a field name`);
    }
});

test('every type maps to the collection its entities live in', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            SUPPORT_TYPE_COLLECTION[descriptor.id],
            descriptor.location.key,
            `${descriptor.id} maps to the wrong collection`,
        );
    }
});

test('cascade fields name real collections', () => {
    const keys = new Set(SUPPORT_TYPES.map((d) => d.location.key));
    keys.add('roots');
    keys.add('knots');

    for (const [id, shape] of Object.entries(SUPPORT_REMOVAL_SHAPES)) {
        for (const collection of Object.keys(shape.cascade)) {
            assert.ok(keys.has(collection as never), `${id} cascades to unknown "${collection}"`);
        }
    }
});

test('the removers restate no shapes of their own', () => {
    // The whole point: a removeX that declares its own return type is a second
    // source of truth, and the two drift silently.
    const source = readFileSync(
        path.join(process.cwd(), 'src', 'supports', 'state.ts'),
        'utf8',
    );
    // Entity removers only. removeJoint / removeBranchJoint edit a shaft rather
    // than removing an entity, and their { before, after } shape is their own.
    const entityRemovers = SUPPORT_TYPES.map(
        (descriptor) => `remove${descriptor.id[0].toUpperCase()}${descriptor.id.slice(1)}`,
    );
    const restated = source
        .split('\n')
        .filter((line) => {
            const declared = line.match(/^export function (remove\w+)\([^)]*\):\s*\{/);
            return declared !== null && entityRemovers.includes(declared[1]);
        });

    assert.deepEqual(restated, [], 'these removers declare their own shape; derive it instead');
});

test('a plural cascade field means a list, a singular one means at most one', () => {
    // The runtime keys off this convention, so a rename that changes plurality
    // silently changes the shape a caller receives.
    assert.equal(SUPPORT_REMOVAL_SHAPES.twig.cascade.knots, 'knots');
    assert.equal(SUPPORT_REMOVAL_SHAPES.leaf.cascade.knots, 'knot');
    assert.deepEqual(SUPPORT_REMOVAL_SHAPES.brace.cascade.knots, ['startKnot', 'endKnot']);
});
