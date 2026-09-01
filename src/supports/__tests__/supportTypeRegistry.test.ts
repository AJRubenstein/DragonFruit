import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPORT_TYPES,
  SUPPORT_STATE_COLLECTIONS,
  SUPPORT_PRIMITIVE_COLLECTIONS,
  createEmptySupportCollections,
  countSupportCollections,
  SUPPORT_COLLECTION_KEYS,
  MODEL_ID_TYPES,
  SUPPORT_STATE_TYPES,
  getSupportTypeDescriptor,
  getSupportTypeBySelectionCategory,
} from '../supportTypeRegistry';
import * as actionTypes from '../history/actionTypes';

test('every support type is declared exactly once', () => {
  const ids = SUPPORT_TYPES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...ids].sort(),
    ['anchor', 'brace', 'branch', 'kickstand', 'leaf', 'stick', 'trunk', 'twig'].sort(),
  );
});

test('history actions resolve to the exported constants', () => {
  const known = new Set<string>(Object.values(actionTypes));
  for (const descriptor of SUPPORT_TYPES) {
    assert.ok(known.has(descriptor.historyAdd), `${descriptor.id} add`);
    assert.ok(known.has(descriptor.historyRemove), `${descriptor.id} remove`);
  }
});

test('selection categories are unique and resolve back to their type', () => {
  const categories = SUPPORT_TYPES.map((d) => d.selectionCategory);
  assert.equal(new Set(categories).size, categories.length);
  for (const descriptor of SUPPORT_TYPES) {
    assert.equal(getSupportTypeBySelectionCategory(descriptor.selectionCategory)?.id, descriptor.id);
  }
});

test('primitive categories are not support types', () => {
  for (const category of ['root', 'joint', 'knot', 'segment', 'contactDisk', null, undefined]) {
    assert.equal(getSupportTypeBySelectionCategory(category), null);
  }
});

test('kickstand is a peer type, not a brace', () => {
  const kickstand = getSupportTypeDescriptor('kickstand');
  assert.equal(kickstand.selectionCategory, 'kickstand');
  assert.notEqual(kickstand.selectionCategory, getSupportTypeDescriptor('brace').selectionCategory);
});

test('every type lives on SupportState', () => {
  assert.deepEqual(SUPPORT_TYPES.filter((d) => d.location.store !== 'support'), []);
  assert.equal(SUPPORT_STATE_TYPES.length, SUPPORT_TYPES.length);
});

test('all types carry a modelId', () => {
  assert.equal(MODEL_ID_TYPES.length, SUPPORT_TYPES.length);
});

test('unknown type ids throw rather than resolving to undefined', () => {
  assert.throws(() => getSupportTypeDescriptor('sprocket' as never), /Unknown support type/);
});

test('empty collections cover every entity collection on SupportState', () => {
  const keys = Object.keys(createEmptySupportCollections()).sort();
  assert.deepEqual(keys, [
    'anchors', 'braces', 'branches', 'kickstands', 'knots', 'leaves', 'roots', 'sticks', 'trunks', 'twigs',
  ]);
});

test('empty collections start empty and are not shared between calls', () => {
  const first = createEmptySupportCollections();
  const second = createEmptySupportCollections();
  for (const value of Object.values(first)) assert.deepEqual(value, {});
  assert.notEqual(first.trunks, second.trunks);
});

test('selection resolves roots first, then support types in registry order', () => {
  assert.deepEqual(
    SUPPORT_STATE_COLLECTIONS.map((c) => c.selectionCategory),
    ['root', 'trunk', 'branch', 'leaf', 'twig', 'stick', 'brace', 'anchor', 'kickstand'],
  );
});

test('knots are a primitive collection, not a selection-order entry', () => {
  assert.ok(SUPPORT_PRIMITIVE_COLLECTIONS.some((c) => c.key === 'knots'));
  assert.ok(!SUPPORT_STATE_COLLECTIONS.some((c) => c.key === 'knots'));
});

test('kickstands are a walked SupportState collection like any other type', () => {
  assert.ok(SUPPORT_STATE_COLLECTIONS.some((c) => c.selectionCategory === 'kickstand'));
  assert.ok(Object.keys(createEmptySupportCollections()).includes('kickstands'));
});

test('collection keys cover every entity collection', () => {
  assert.deepEqual(
    [...SUPPORT_COLLECTION_KEYS].sort(),
    Object.keys(createEmptySupportCollections()).sort(),
  );
});

test('counts report every collection, including empty ones', () => {
  const counts = countSupportCollections(createEmptySupportCollections());
  assert.deepEqual(Object.keys(counts).sort(), [...SUPPORT_COLLECTION_KEYS].sort());
  for (const value of Object.values(counts)) assert.equal(value, 0);
});

test('counts reflect populated collections', () => {
  const snapshot = createEmptySupportCollections();
  snapshot.trunks = { 't-1': { id: 't-1' } } as never;
  assert.equal(countSupportCollections(snapshot).trunks, 1);
  assert.equal(countSupportCollections(snapshot).braces, 0);
});
