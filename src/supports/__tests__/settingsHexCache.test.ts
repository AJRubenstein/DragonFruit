import assert from 'node:assert/strict';
import test from 'node:test';

import { addTrunk, addTwig, getSnapshot, resetStore, updateTrunk, updateTwig } from '../state';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Trunk, Twig } from '../types';

/**
 * Covers `hasSettingsHex`, the flag that decides whether adding an entity seeds
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
    // Trunk declares hasSettingsHex: true, so the add must store the hex and a
    // later update that omits one gets it back.
    resetStore();
    addTrunk(trunk('DEADBEEF'));
    updateTrunk(trunk(undefined));

    assert.equal(getSnapshot().trunks['trunk-a'].settingsCodeHex, 'DEADBEEF');
});

test('an explicit hex on update wins over the cached one', () => {
    resetStore();
    addTrunk(trunk('DEADBEEF'));
    updateTrunk(trunk('CAFEBABE'));

    assert.equal(getSnapshot().trunks['trunk-a'].settingsCodeHex, 'CAFEBABE');
});

test('a type without a settings hex caches nothing', () => {
    // Twig declares hasSettingsHex: false. Its hex round-trips through the
    // entity itself, never through the cache -- so omitting it on update
    // leaves it absent rather than resurrecting an old value.
    resetStore();
    addTwig(twig('DEADBEEF'));
    updateTwig(twig(undefined));

    assert.equal(getSnapshot().twigs['twig-a'].settingsCodeHex, undefined);
});

test('exactly the settings-hex types declare the flag', () => {
    // The private cache is keyed 'trunk' | 'branch' | 'leaf'; a fourth type
    // setting the flag would index a bucket that does not exist.
    assert.deepEqual(
        SUPPORT_TYPES.filter((d) => d.hasSettingsHex).map((d) => d.id).sort(),
        ['branch', 'leaf', 'trunk'],
    );
});
