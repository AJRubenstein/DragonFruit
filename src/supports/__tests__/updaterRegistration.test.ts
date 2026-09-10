import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES, updateSupportEntity } from '../supportTypeRegistry';
import { addSupportEntity, getSnapshot, resetStore } from '../state';

/**
 * Every type registers an updater, and all but the three with bespoke bodies
 * take the generic one. A type added without an entry would otherwise reach
 * `updateSupportEntity` and silently do nothing.
 */

const SOURCE = readFileSync(new URL('../state.ts', import.meta.url), 'utf8');

test('every declared type has an updater registered', () => {
    resetStore();
    for (const descriptor of SUPPORT_TYPES) {
        const id = `${descriptor.id}-u`;
        addSupportEntity(descriptor.id, { id, modelId: 'm' } as never);
        assert.equal(
            updateSupportEntity(descriptor.id, { id, modelId: 'm2' } as never),
            true,
            `${descriptor.id} has no updater, so updates are dropped`,
        );
    }
});

test('only the bespoke three are listed by name', () => {
    // The list is the exception, so it must stay short. A fourth entry means a
    // type is being hand-wired again -- check whether the generic path suffices.
    const start = SOURCE.indexOf('const BESPOKE_UPDATERS');
    assert.ok(start > 0, 'the bespoke table is gone -- this test needs rewriting');
    const block = SOURCE.slice(start, SOURCE.indexOf('};', start));
    const listed = [...block.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]).sort();

    assert.deepEqual(listed, ['anchor', 'brace', 'leaf']);
});

test('no type has a hand-written update wrapper of its own', () => {
    // `updateTrunk(x)` and friends are gone; callers name the type as data.
    // A reintroduced wrapper is a second way to update one type, which drifts.
    for (const descriptor of SUPPORT_TYPES) {
        const name = `update${descriptor.id.charAt(0).toUpperCase()}${descriptor.id.slice(1)}`;
        if (['updateLeaf', 'updateBrace', 'updateAnchor'].includes(name)) continue;
        assert.ok(
            !SOURCE.includes(`export function ${name}(`),
            `${name} is back; callers should use updateSupportEntity('${descriptor.id}', entity)`,
        );
    }
});

test('the registration loop walks the registry', () => {
    assert.match(
        SOURCE,
        /for \(const descriptor of SUPPORT_TYPES\) \{\s*const bespoke = BESPOKE_UPDATERS\[descriptor\.id\]/,
        'updaters are no longer registered by walking the registry',
    );
});

test('an update reaches the store for a generic type', () => {
    // Proves the generic registration is wired, not merely present.
    resetStore();
    addSupportEntity('kickstand', { id: 'k1', modelId: 'm', segments: [] } as never);
    updateSupportEntity('kickstand', { id: 'k1', modelId: 'moved', segments: [] } as never);

    assert.equal(getSnapshot().kickstands['k1'].modelId, 'moved');
});
