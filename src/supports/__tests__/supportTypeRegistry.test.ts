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
  MODEL_ID_TYPES,
  SUPPORT_STATE_TYPES,
  SHAFTED_COLLECTION_KEYS,
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

test('hasSegments matches the actual entity shape', () => {
    // The flag is what shaft walks key off, so a wrong one silently skips a type.
    // Built from a real empty collection set plus a probe entity per type.
    const shafted = new Set(SHAFTED_COLLECTION_KEYS);
    for (const descriptor of SUPPORT_TYPES) {
        const key = descriptor.location.key;
        assert.equal(
            shafted.has(key as never),
            descriptor.hasSegments,
            `${descriptor.id}: hasSegments=${descriptor.hasSegments} but SHAFTED_COLLECTION_KEYS ${shafted.has(key as never) ? 'includes' : 'omits'} it`,
        );
    }
});

test('leaves and braces are the only types without segments', () => {
    // Not a walk, a fact: both attach via knots rather than carrying a shaft.
    assert.deepEqual(
        SUPPORT_TYPES.filter((d) => !d.hasSegments).map((d) => d.id).sort(),
        ['brace', 'leaf'],
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
