import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPORT_TYPES,
  SUPPORT_STATE_COLLECTIONS,
  SUPPORT_PRIMITIVE_COLLECTIONS,
  createEmptySupportCollections,
  countSupportCollections,
  SUPPORT_COLLECTION_KEYS,
  MODEL_ID_COLLECTION_KEYS,
  SUPPORT_STATE_TYPES,
  SHAFTED_COLLECTION_KEYS,
  getSupportTypeDescriptor,
  getSupportTypeBySelectionCategory,
} from '../supportTypeRegistry';
import * as actionTypes from '../history/actionTypes';

test('every support type is declared exactly once', () => {
  const ids = SUPPORT_TYPES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'a type is declared more than once');
  // Two descriptors sharing one collection would silently overwrite each other.
  const keys = SUPPORT_TYPES.map((d) => d.location.key);
  assert.equal(new Set(keys).size, keys.length, 'two types share a collection');
  // COMPLETENESS -- that the registry declares every type the second naming
  // point does, and no others -- is asserted against an independent source (the
  // folders on disk) by `supportTypeFolders.test.ts`, in both directions: every
  // registered type has a folder, and every folder belongs to a registered type.
  //
  // A hand-written list of the eight names used to sit here. It was a second
  // place a renamed type had to be edited by hand, and it duplicated ground the
  // folder test covers from a source that cannot drift with the registry.
});

test('history actions match what the builders produce', () => {
  // Descriptor and push site must spell a type's action the same way, or the
  // handler registered under one never sees what the other pushes.
  for (const descriptor of SUPPORT_TYPES) {
    assert.equal(descriptor.historyAdd, actionTypes.addAction(descriptor.id), `${descriptor.id} add`);
    assert.equal(descriptor.historyRemove, actionTypes.removeAction(descriptor.id), `${descriptor.id} remove`);
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


test('every type lives on SupportState', () => {
  assert.deepEqual(SUPPORT_TYPES.filter((d) => d.location.store !== 'support'), []);
  assert.equal(SUPPORT_STATE_TYPES.length, SUPPORT_TYPES.length);
});


test('empty collections cover every entity collection on SupportState', () => {
  const keys = Object.keys(createEmptySupportCollections()).sort();
  assert.deepEqual(keys, [
    'braces', 'branches', 'kickstands', 'knots', 'leaves', 'roots', 'sticks', 'stumps', 'trunks', 'twigs',
  ]);
});


test('selection resolves roots first, then support types in registry order', () => {
  const categories = SUPPORT_STATE_COLLECTIONS.map((c) => c.selectionCategory);
  // A root is a primitive, not a type, so it is named. Everything after it must
  // be the declared types IN ORDER, each selecting under its own id -- which is
  // what this pins, and it is the registration's own order that defines it.
  assert.equal(categories[0], 'root', 'roots resolve before any type');
  assert.deepEqual(
    categories.slice(1),
    SUPPORT_STATE_TYPES.map((d) => d.id),
    'each declared type selects under its own id, in registry order',
  );
});


test('every collection is either a support type or a declared primitive', () => {
    // The type system cannot check this: SUPPORT_TYPES is annotated, so its
    // location.key widens to the full union and Exclude<> always yields never.
    const covered = new Set<string>([
        ...SUPPORT_TYPES.map((d) => d.location.key),
        ...SUPPORT_PRIMITIVE_COLLECTIONS.map((c) => c.key),
    ]);
    const uncovered = Object.keys(createEmptySupportCollections()).filter((key) => !covered.has(key));
    assert.deepEqual(uncovered, [], 'add a descriptor or a primitive entry for these');
});

test('primitives are collections that are not support types', () => {
    assert.deepEqual(
        SUPPORT_PRIMITIVE_COLLECTIONS.map((c) => c.key).sort(),
        ['knots', 'roots'],
    );
});

test('the modelId walk covers everything except knots', () => {
    // A knot hangs off a shaft and carries no modelId of its own -- its model is
    // resolved from the host. Roots do carry one, so they are walked.
    const walked = new Set<string>(MODEL_ID_COLLECTION_KEYS);
    const all = Object.keys(createEmptySupportCollections());
    assert.deepEqual(all.filter((key) => !walked.has(key)), ['knots']);
});
