import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildKnotIndex,
    knotFields,
    selectedIdsForType,
    type CollectionLookup,
    type SelectionInputs,
} from '../supportSelectionDerivation';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * Which entities a selection covers, per type.
 *
 * Replaces eight parallel memos in SupportRenderer. Rendering has no golden
 * coverage, so the derivation is pinned here instead -- it is a pure function
 * of five plain values.
 */

const COLLECTIONS: Record<string, Record<string, unknown>> = {
    trunks: { 'trunk-a': { id: 'trunk-a' }, 'trunk-b': { id: 'trunk-b' } },
    branches: {
        'branch-a': { id: 'branch-a', parentKnotId: 'knot-1' },
        'branch-b': { id: 'branch-b', parentKnotId: 'knot-1' },
        'branch-c': { id: 'branch-c', parentKnotId: 'knot-2' },
    },
    leaves: { 'leaf-a': { id: 'leaf-a', parentKnotId: 'knot-1' } },
    twigs: { 'twig-a': { id: 'twig-a' } },
    sticks: { 'stick-a': { id: 'stick-a' } },
    braces: { 'brace-a': { id: 'brace-a', startKnotId: 'knot-1', endKnotId: 'knot-2' } },
    anchors: { 'anchor-a': { id: 'anchor-a' } },
    kickstands: { 'ks-a': { id: 'ks-a', hostKnotId: 'knot-2' } },
};

const lookup: CollectionLookup = (key) => COLLECTIONS[key];
const index = buildKnotIndex(lookup);

const selection = (over: Partial<SelectionInputs> = {}): SelectionInputs => ({
    selectedSupportIdSet: new Set(),
    singleSelectedSupportId: null,
    useMultiSelectionDetail: false,
    selectedCategory: null,
    selectedId: null,
    ...over,
});

const ids = (typeId: string, over: Partial<SelectionInputs> = {}) =>
    [...selectedIdsForType(typeId as never, selection(over), lookup, index)].sort();

test('a single selection picks only its own type', () => {
    assert.deepEqual(ids('trunk', { singleSelectedSupportId: 'trunk-a' }), ['trunk-a']);
    assert.deepEqual(ids('branch', { singleSelectedSupportId: 'trunk-a' }), []);
});

test('a multi-selection resolves only with detail enabled', () => {
    const selected = new Set(['trunk-a', 'branch-a']);
    assert.deepEqual(
        ids('trunk', { selectedSupportIdSet: selected, useMultiSelectionDetail: true }),
        ['trunk-a'],
    );
    // Above the detail threshold the selection is drawn in bulk instead.
    assert.deepEqual(ids('trunk', { selectedSupportIdSet: selected }), []);
});

test('selecting a knot selects everything hanging from it', () => {
    const onKnot1 = { selectedCategory: 'knot', selectedId: 'knot-1' };
    assert.deepEqual(ids('branch', onKnot1), ['branch-a', 'branch-b']);
    assert.deepEqual(ids('leaf', onKnot1), ['leaf-a']);
    assert.deepEqual(ids('brace', onKnot1), ['brace-a']);
    assert.deepEqual(ids('trunk', onKnot1), [], 'a trunk hangs from no knot');
});

test('a brace is reached from either end knot', () => {
    assert.deepEqual(ids('brace', { selectedCategory: 'knot', selectedId: 'knot-1' }), ['brace-a']);
    assert.deepEqual(ids('brace', { selectedCategory: 'knot', selectedId: 'knot-2' }), ['brace-a']);
});

test('a kickstand is reached from its host knot, like any hosted type', () => {
    assert.deepEqual(ids('kickstand', { selectedCategory: 'knot', selectedId: 'knot-2' }), ['ks-a']);
});

test('a selected brace segment resolves back to the brace', () => {
    assert.deepEqual(
        ids('brace', { selectedCategory: 'segment', selectedId: 'braceSegment:brace-a' }),
        ['brace-a'],
    );
    // Only the type declaring the prefix answers.
    assert.deepEqual(
        ids('trunk', { selectedCategory: 'segment', selectedId: 'braceSegment:brace-a' }),
        [],
    );
});

test('a segment id with no declared prefix selects nothing', () => {
    assert.deepEqual(ids('brace', { selectedCategory: 'segment', selectedId: 'seg-ta' }), []);
});

test('single and knot selections union', () => {
    assert.deepEqual(
        ids('branch', { singleSelectedSupportId: 'branch-c', selectedCategory: 'knot', selectedId: 'knot-1' }),
        ['branch-a', 'branch-b', 'branch-c'],
    );
});

test('an id absent from the collection is not selected', () => {
    assert.deepEqual(ids('trunk', { singleSelectedSupportId: 'ghost' }), []);
});

test('the knot index covers exactly the knot-hosted types', () => {
    const hosted = SUPPORT_TYPES.filter((d) => knotFields(d).length > 0).map((d) => d.id).sort();
    assert.deepEqual(hosted, ['brace', 'branch', 'kickstand', 'leaf']);
    for (const typeId of hosted) assert.ok(index.get(typeId as never), `${typeId} should be indexed`);
});

test('every type answers without special-casing', () => {
    for (const descriptor of SUPPORT_TYPES) {
        assert.doesNotThrow(() => selectedIdsForType(descriptor.id, selection(), lookup, index));
    }
});
