import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Knot hosts are derived, not listed.
 *
 * `useKnotInteraction` and `KnotGizmo` each carried their own union of host
 * types, and the two disagreed -- one had six entries, the other four, and
 * neither matched the registry. A ninth type joined neither.
 */

const PRIMITIVES = path.join(process.cwd(), 'src', 'supports', 'SupportPrimitives', 'Knot');
const read = (file: string) => readFileSync(path.join(PRIMITIVES, file), 'utf8');

/** A union of three or more quoted type ids, which is what a hand-written list looks like. */
const HANDWRITTEN_UNION = /'[a-z]+'(\s*\|\s*'[a-z]+'){2,}/g;

test('the knot primitives declare no hand-written type unions', () => {
    for (const file of ['useKnotInteraction.ts', 'KnotGizmo.tsx']) {
        const source = read(file).replace(/\/\/[^\n]*/g, '');
        const found = [...source.matchAll(HANDWRITTEN_UNION)]
            .map((match) => match[0])
            .filter((union) => SUPPORT_TYPES.some((d) => union.includes(`'${d.id}'`)));

        assert.deepEqual(found, [], `${file} lists support types by hand; derive from the registry`);
    }
});

test('every type with segments can host a dragged knot', () => {
    // Anchors were absent from the segment->host map, so a knot on an anchor
    // shaft could not be dragged while every other shafted type's could.
    const source = read('useKnotInteraction.ts');
    const constructed = new Set(
        [...source.matchAll(/containerType: '([a-zA-Z]+)'/g)].map((m) => m[1]),
    );

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;
        assert.ok(
            constructed.has(descriptor.id),
            `${descriptor.id} declares segments but is never built as a knot host`,
        );
    }
});

test('a leaf cone is the only knot host that is not a support type', () => {
    // hostsAShaft() reads as "not a leafCone", which is only correct while
    // leafCone is the sole non-type host. A second one silently joins the
    // shafted branch.
    const source = read('useKnotInteraction.ts');
    const hosts = [...source.matchAll(/containerType: '([a-zA-Z]+)'/g)].map((m) => m[1]);
    const registered = new Set(SUPPORT_TYPES.map((d) => d.id as string));

    const nonTypes = [...new Set(hosts)].filter((host) => !registered.has(host));
    assert.deepEqual(nonTypes, ['leafCone']);
});
