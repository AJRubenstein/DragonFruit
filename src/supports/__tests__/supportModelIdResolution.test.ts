import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';

/**
 * `SupportRenderer` resolves a support's model from its own `modelId`, then the
 * knots it hangs off. A hand-written chain covered seven of eight types and
 * omitted anchors, so an anchor id resolved to undefined and, under any model
 * filter, the anchor was treated as invisible.
 */

const SOURCE = readFileSync(new URL('../SupportRenderer.tsx', import.meta.url), 'utf8');
const CHAIN = SOURCE.slice(
    SOURCE.indexOf('const resolveSupportModelId'),
    SOURCE.indexOf('const isModelVisible'),
);

test('the resolver walks the registry rather than naming collections', () => {
    assert.match(CHAIN, /for \(const descriptor of SUPPORT_TYPES\)/, 'the resolver no longer walks the registry');

    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.id === 'kickstand') continue;
        assert.ok(
            !CHAIN.includes(`state.${descriptor.location.key}[supportId]`),
            `${descriptor.id} is looked up by name again; a ninth type would be missed`,
        );
    }
});

test('every type reaches the resolver through its declared collection', () => {
    // What the walk depends on: each descriptor names the collection its
    // entities live in, so none can be skipped.
    for (const descriptor of SUPPORT_TYPES) {
        assert.ok(descriptor.location.key, `${descriptor.id} declares no collection`);
    }
});

test('the knot fallbacks come from declared hostedBy edges', () => {
    // Branch, leaf and brace resolved their model through a parent knot in the
    // old chain; those are exactly their hostedBy edges onto knots.
    for (const id of ['branch', 'leaf'] as const) {
        const edges = getSupportTypeDescriptor(id).edges
            .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy');
        assert.ok(edges.length > 0, `${id} declares no hostedBy knot edge, so it cannot resolve via its host`);
    }

    const braceEdges = getSupportTypeDescriptor('brace').edges
        .filter((edge) => edge.to === 'knots' && edge.ownership === 'hostedBy');
    assert.equal(braceEdges.length, 2, 'a brace resolves through both its knots');
});

test('anchor carries its own modelId, which is why the omission stayed hidden', () => {
    // Callers pass entity.modelId first, so the missing lookup only bit an
    // anchor id resolved without one.
    const anchor = getSupportTypeDescriptor('anchor');
    assert.equal(anchor.carriesModelId, true);
    assert.equal(anchor.edges.length, 0, 'anchor has no edges, so it can only resolve via its own modelId');
});
