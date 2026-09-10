import assert from 'node:assert/strict';
import test from 'node:test';

import { addSupportEntity, addTrunk, addTwig, getSnapshot, resetStore } from '../state';
import { SUPPORT_TYPES, updateSupportEntity } from '../supportTypeRegistry';
import type { Trunk, Twig } from '../types';

/**
 * Covers `hasEditableSettings`, the flag that decides whether adding an entity seeds
 * the settings-hex cache.
 *
 * The cache is private, but observable: an update that carries no
 * `settingsCodeHex` gets the cached one restored. Without this file the flag is
 * untestable and was, on first mutation check, entirely uncovered.
 */

const MODEL = 'model-a';

const segment = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const trunk = (settingsCodeHex?: string): Trunk => ({
    id: 'trunk-a',
    modelId: MODEL,
    rootId: 'root-a',
    segments: [segment('seg-ta')],
    ...(settingsCodeHex ? { settingsCodeHex } : {}),
}) as Trunk;

const twig = (settingsCodeHex?: string): Twig => ({
    id: 'twig-a',
    modelId: MODEL,
    segments: [segment('seg-wa')],
    ...(settingsCodeHex ? { settingsCodeHex } : {}),
}) as unknown as Twig;

test('adding a trunk with a settings hex seeds the cache', () => {
    // Trunk declares hasEditableSettings: true, so the add must store the hex and a
    // later update that omits one gets it back.
    resetStore();
    addTrunk(trunk('DEADBEEF'));
    updateSupportEntity('trunk', trunk(undefined));

    assert.equal(getSnapshot().trunks['trunk-a'].settingsCodeHex, 'DEADBEEF');
});

test('an explicit hex on update wins over the cached one', () => {
    resetStore();
    addTrunk(trunk('DEADBEEF'));
    updateSupportEntity('trunk', trunk('CAFEBABE'));

    assert.equal(getSnapshot().trunks['trunk-a'].settingsCodeHex, 'CAFEBABE');
});

test('a type without a settings hex caches nothing', () => {
    // Twig declares hasEditableSettings: false. Its hex round-trips through the
    // entity itself, never through the cache -- so omitting it on update
    // leaves it absent rather than resurrecting an old value.
    resetStore();
    addTwig(twig('DEADBEEF'));
    updateSupportEntity('twig', twig(undefined));

    assert.equal(getSnapshot().twigs['twig-a'].settingsCodeHex, undefined);
});

test('the types the settings menu can edit', () => {
    // Update deliberately when a type gains or loses editable settings: the flag
    // decides both what the sidebar can write and what seeds the hex cache.
    assert.deepEqual(
        SUPPORT_TYPES.filter((d) => d.hasEditableSettings).map((d) => d.id).sort(),
        ['branch', 'kickstand', 'leaf', 'trunk'],
    );
});

test('the cache buckets are derived, not hand-listed', () => {
    // A type gaining hasEditableSettings gets a bucket without anyone editing
    // state.ts, because the cache is built from EDITABLE_SUPPORT_TYPES.
    for (const descriptor of SUPPORT_TYPES.filter((d) => d.hasEditableSettings)) {
        assert.ok(
            descriptor.location.key,
            `${descriptor.id} must map to a collection for its cache bucket`,
        );
    }
});

test('an editable type seeds and restores its hex through the cache', () => {
    // The bucket exists for every editable type, not just the original three.
    resetStore();
    addSupportEntity('kickstand', {
        id: 'kickstand-a', modelId: MODEL, rootId: 'root-k',
        hostKnotId: 'knot-a', hostSegmentId: 'seg-ta',
        segments: [segment('seg-ka')], settingsCodeHex: 'DEADBEEF',
    } as never);
    updateSupportEntity('kickstand', {
        id: 'kickstand-a', modelId: MODEL, rootId: 'root-k',
        hostKnotId: 'knot-a', hostSegmentId: 'seg-ta',
        segments: [segment('seg-ka')],
    } as never);

    assert.equal(getSnapshot().kickstands['kickstand-a'].settingsCodeHex, 'DEADBEEF');
});
