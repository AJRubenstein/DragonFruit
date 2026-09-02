import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
    SUPPORT_TYPES,
    createEmptySupportCollections,
    getSupportTypeDescriptor,
} from '../supportTypeRegistry';

/**
 * Pins the declared dependency graph to the entity interfaces it describes.
 *
 * The edges drive removal cascades, so a field renamed in `types.ts` without
 * updating its descriptor would not fail to compile -- `field` is a string --
 * it would just stop cascading, silently orphaning entities.
 */

const TYPES_SRC = readFileSync(
    path.join(process.cwd(), 'src', 'supports', 'types.ts'),
    'utf8',
);

/**
 * The body of `export interface X { ... }`, or null.
 *
 * Brace-counted rather than regex-matched: these interfaces contain nested
 * object literals, so a non-greedy match to the first `}` stops early and
 * silently returns a truncated body.
 */
function interfaceBody(name: string): string | null {
    const header = TYPES_SRC.indexOf(`export interface ${name} `);
    if (header === -1) return null;
    const open = TYPES_SRC.indexOf('{', header);
    if (open === -1) return null;

    let depth = 0;
    for (let i = open; i < TYPES_SRC.length; i++) {
        if (TYPES_SRC[i] === '{') depth++;
        else if (TYPES_SRC[i] === '}') {
            depth--;
            if (depth === 0) return TYPES_SRC.slice(open + 1, i);
        }
    }
    return null;
}

/** Whether `body` declares a property called `field`. */
function declaresField(body: string, field: string): boolean {
    return body.split('\n').some((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith(`${field}:`) || trimmed.startsWith(`${field}?:`);
    });
}

const INTERFACE_BY_TYPE_ID: Record<string, string> = {
    trunk: 'Trunk',
    branch: 'Branch',
    leaf: 'Leaf',
    twig: 'Twig',
    stick: 'Stick',
    brace: 'Brace',
    anchor: 'Anchor',
    kickstand: 'Kickstand',
};

test('every declared edge field exists on the entity interface', () => {
    for (const descriptor of SUPPORT_TYPES) {
        const interfaceName = INTERFACE_BY_TYPE_ID[descriptor.id];
        assert.ok(interfaceName, `no interface mapped for "${descriptor.id}"`);

        const body = interfaceBody(interfaceName);
        assert.ok(body, `interface ${interfaceName} not found in types.ts`);

        for (const edge of descriptor.edges) {
            assert.ok(
                declaresField(body, edge.field),
                `${descriptor.id} declares edge "${edge.field}" but ${interfaceName} has no such field`,
            );
        }
    }
});

test('every edge target is a real collection, or a segment', () => {
    const collections = new Set(Object.keys(createEmptySupportCollections()));
    for (const descriptor of SUPPORT_TYPES) {
        for (const edge of descriptor.edges) {
            assert.ok(
                edge.to === 'segment' || collections.has(edge.to),
                `${descriptor.id}.${edge.field} points at "${edge.to}", which is neither a collection nor 'segment'`,
            );
        }
    }
});

test('a type that owns a root declares the edge that says so', () => {
    // ownsRoot and the rootId edge are two statements of one fact; a type with
    // one and not the other would cull roots it still needs, or leak them.
    for (const descriptor of SUPPORT_TYPES) {
        const ownsRootEdge = descriptor.edges.some(
            (edge) => edge.to === 'roots' && edge.ownership === 'owns',
        );
        assert.equal(
            ownsRootEdge,
            descriptor.ownsRoot,
            `${descriptor.id}: ownsRoot=${descriptor.ownsRoot} but rootId edge ${ownsRootEdge ? 'present' : 'absent'}`,
        );
    }
});

test('the declared graph matches the known entity relationships', () => {
    // Cross-check the shapes, so a plausible-but-wrong edge (a brace declared as
    // OWNING its knots, say) fails here rather than by over-deleting in a cascade.
    const shape = (id: Parameters<typeof getSupportTypeDescriptor>[0]) =>
        getSupportTypeDescriptor(id).edges.map((e) => `${e.field}:${e.ownership}`);

    assert.deepEqual(shape('trunk'), ['rootId:owns']);
    assert.deepEqual(shape('branch'), ['parentKnotId:hostedBy']);
    assert.deepEqual(shape('leaf'), ['parentKnotId:hostedBy']);
    assert.deepEqual(shape('brace'), ['startKnotId:hostedBy', 'endKnotId:hostedBy']);
    assert.deepEqual(shape('kickstand'), [
        'rootId:owns',
        'hostKnotId:hostedBy',
        'hostSegmentId:hostedBy',
    ]);

    // Twigs, sticks and anchors link to nothing. That is why removing one
    // currently orphans any knot sitting on it -- see the cascade goldens.
    assert.deepEqual(shape('twig'), []);
    assert.deepEqual(shape('stick'), []);
    assert.deepEqual(shape('anchor'), []);
});

test('every descriptor declares an edges array', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.ok(Array.isArray(descriptor.edges), `${descriptor.id}.edges must be declared`);
    }
});
