import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { SupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * Which primitives a type's renderer draws, predicted from its declaration.
 *
 * No renderer draws anything unique -- all eight compose the same seven
 * components, and which ones follow from `hasSegments`, the endpoint kinds and
 * `contactFields`. This holds that, so a renderer cannot quietly start drawing
 * something its declaration does not imply.
 */

const PRIMITIVES = [
    'ShaftRenderer', 'BezierRenderer', 'JointRenderer',
    'RootsRenderer', 'KnotRenderer', 'ContactConeRenderer', 'ContactDiskRenderer',
] as const;

const capitalise = (id: string) => `${id[0].toUpperCase()}${id.slice(1)}`;

function rendererSource(typeId: string): string | null {
    const name = capitalise(typeId);
    const path = join(process.cwd(), 'src', 'supports', 'SupportTypes', name, `${name}Renderer.tsx`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** The primitives actually referenced as JSX in a renderer. */
function drawnBy(source: string): Set<string> {
    return new Set(PRIMITIVES.filter((p) => source.includes(`<${p}`)));
}

/** What the descriptor says the type is made of. */
function predictedFor(descriptor: SupportTypeDescriptor): Set<string> {
    const out = new Set<string>();

    if (descriptor.hasSegments) {
        out.add('ShaftRenderer').add('BezierRenderer').add('JointRenderer');
    }
    if (descriptor.lower.kind === 'plateRoot') out.add('RootsRenderer');
    if (descriptor.lower.kind === 'knot' || descriptor.upper.kind === 'knot') out.add('KnotRenderer');

    for (const field of descriptor.contactFields) {
        out.add(field.includes('Disk') ? 'ContactDiskRenderer' : 'ContactConeRenderer');
    }
    return out;
}

/**
 * Types whose renderer draws something its declaration does not imply, with
 * the reason. Both are wire-shape artefacts rather than rendering rules.
 */
const EXCEPTIONS: Record<string, { extra?: string[]; missing?: string[] }> = {
    // Spans two knots along a curve, so it draws a shaft without carrying segments.
    brace: { extra: ['ShaftRenderer', 'BezierRenderer'] },
    // Declares segments but always carries none, and owns an inline root the
    // shared roots pass never sees.
    anchor: { missing: ['ShaftRenderer', 'BezierRenderer', 'JointRenderer'], extra: ['RootsRenderer'] },
};

for (const descriptor of SUPPORT_TYPES) {
    test(`${descriptor.id}'s renderer draws what its declaration implies`, () => {
        const source = rendererSource(descriptor.id);
        if (!source) return; // no dedicated renderer for this type

        const drawn = predictedFor(descriptor);
        const exception = EXCEPTIONS[descriptor.id] ?? {};
        for (const p of exception.extra ?? []) drawn.add(p);
        for (const p of exception.missing ?? []) drawn.delete(p);

        assert.deepEqual(
            [...drawnBy(source)].sort(),
            [...drawn].sort(),
            `${descriptor.id} draws a different set than its declaration implies`,
        );
    });
}

test('no renderer draws a primitive the others do not', () => {
    // The claim the collapse rests on: there is no per-type geometry, only a
    // different selection from one shared set.
    for (const descriptor of SUPPORT_TYPES) {
        const source = rendererSource(descriptor.id);
        if (!source) continue;

        for (const drawn of drawnBy(source)) {
            assert.ok(
                (PRIMITIVES as readonly string[]).includes(drawn),
                `${descriptor.id} draws ${drawn}, which is not one of the shared primitives`,
            );
        }
    }
});

test('every exception names a type that still exists', () => {
    for (const typeId of Object.keys(EXCEPTIONS)) {
        assert.ok(
            SUPPORT_TYPES.some((d) => d.id === typeId),
            `the exception list names "${typeId}", which is no longer a type`,
        );
    }
});
