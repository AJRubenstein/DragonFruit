import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CURRENT_SUPPORT_DEFAULTS_VERSION,
    SUPPORT_DEFAULT_MIGRATIONS,
    SUPPORT_DEFAULTS_VERSION_KEY,
    applySupportDefaultMigrations,
    readWrittenDefaultsVersion,
} from '../Settings/defaultMigrations';
import { createDefaultAutoSupportSettings } from '../autoSupport/settings';
import type { AutoSupportSettings } from '../autoSupport/settings';
import { createDefaultAutoBracingSettings } from '../autoBracing/settings';
import type { AutoBracingSettings } from '../autoBracing/settings';

/**
 * The default-migration table is the record of a shipped default having moved.
 * These tests hold three things: the entries stay true to the code, the rule
 * moves only values this app shipped, and both store load paths actually apply
 * them (the last two run the real modules against a stubbed localStorage).
 */

type MigratableBlock = {
    autoSupport?: Partial<AutoSupportSettings>;
    autoBracing?: Partial<AutoBracingSettings>;
};

const DEFAULTS_BY_SECTION = {
    autoSupport: createDefaultAutoSupportSettings(),
    autoBracing: createDefaultAutoBracingSettings(),
};

/** What the code ships for the key a migration names. */
function shippedDefault(migration: (typeof SUPPORT_DEFAULT_MIGRATIONS)[number]): unknown {
    return migration.section === 'autoSupport'
        ? DEFAULTS_BY_SECTION.autoSupport[migration.key]
        : DEFAULTS_BY_SECTION.autoBracing[migration.key];
}

test('every migration names a real key and ends on the value the code ships', () => {
    for (const migration of SUPPORT_DEFAULT_MIGRATIONS) {
        const shipped = shippedDefault(migration);
        assert.notEqual(
            shipped,
            undefined,
            `${migration.section}.${migration.key} is not a setting any more: drop the entry`,
        );
        assert.equal(
            shipped,
            migration.to,
            `${migration.section}.${migration.key} ships ${String(shipped)}, but the table migrates to ${String(migration.to)}`,
        );
        assert.notEqual(
            migration.from,
            migration.to,
            `${migration.section}.${migration.key} migrates a value to itself`,
        );
        assert.ok(migration.version > 0, 'a migration belongs to a batch above 0');
        assert.ok(
            migration.version <= CURRENT_SUPPORT_DEFAULTS_VERSION,
            'a migration cannot belong to a batch above the current one',
        );
    }
});

test('a shipped default moves to the new one, a chosen value does not', () => {
    const block: MigratableBlock = {
        autoSupport: { areaPerSupportMm2: 8, leafFanMaxAngleDeg: 60, enabled: false },
        autoBracing: { initialPattern: 'zigZag', braceDiameterMm: 0.6, patternIntervalMm: 10 },
    };

    const migrated = applySupportDefaultMigrations(block, 0);

    // Both were the shipped defaults, so they follow the new ones.
    assert.equal(migrated.autoSupport?.areaPerSupportMm2, 10);
    assert.equal(migrated.autoSupport?.leafFanMaxAngleDeg, 45);
    // Zig Zag was a default the app shipped, so it moves with the ladder.
    assert.equal(migrated.autoBracing?.patternIntervalMm, 8);
    assert.equal(migrated.autoBracing?.initialPattern, 'crossDiagonal');
    // `enabled: false` and 0.6 were never defaults: they are the user's, and stay.
    assert.equal(migrated.autoSupport?.enabled, false);
    assert.equal(migrated.autoBracing?.braceDiameterMm, 0.6);
});

test('a block written at the current batch is left exactly as it was', () => {
    const block: MigratableBlock = { autoBracing: { braceDiameterMm: 0.7, initialPattern: 'zigZag' } };

    const migrated = applySupportDefaultMigrations(block, CURRENT_SUPPORT_DEFAULTS_VERSION);

    assert.equal(migrated, block, 'a current block is returned by identity, not rewritten');
});

test('migrating copies: the caller’s block is never mutated', () => {
    const block: MigratableBlock = { autoBracing: { braceDiameterMm: 0.7 } };
    const before = JSON.stringify(block);

    applySupportDefaultMigrations(block, 0);

    assert.equal(JSON.stringify(block), before, 'the input block must survive untouched');
});

test('a block without the section, or without the key, is left alone', () => {
    const block: MigratableBlock = { autoSupport: { enabled: true } };

    const migrated = applySupportDefaultMigrations(block, 0);

    assert.deepEqual(migrated, block);
});

test('the version read off a blob defaults to 0 when it is missing or malformed', () => {
    assert.equal(readWrittenDefaultsVersion(null), 0);
    assert.equal(readWrittenDefaultsVersion({}), 0, 'a blob from before versioning gets every entry');
    assert.equal(readWrittenDefaultsVersion({ [SUPPORT_DEFAULTS_VERSION_KEY]: 'two' }), 0);
    assert.equal(readWrittenDefaultsVersion({ [SUPPORT_DEFAULTS_VERSION_KEY]: 2 }), 2);
});

test('the store’s load path migrates a saved block and keeps what the user chose', async () => {
    const stored = {
        // No version field: a blob written before this table existed.
        autoSupport: {
            ...createDefaultAutoSupportSettings(),
            areaPerSupportMm2: 8, // the shipped default, so it follows the migration
            leafFanMaxAngleDeg: 50, // never a default: the user's angle
            leafFanRadiusMm: 5, // below the constraint floor: clamped on load, table or not
        },
        autoBracing: { ...createDefaultAutoBracingSettings(), initialPattern: 'zigZag', braceDiameterMm: 0.55 },
        shaft: { diameterMm: 0.8 },
    };
    const storage = new Map<string, string>([['support-settings', JSON.stringify(stored)]]);
    const globals = globalThis as unknown as { localStorage?: unknown };

    globals.localStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
    };

    const { getSettings, saveSettingsToLocalStorage } = await import('../Settings/state');
    const settings = getSettings();

    assert.equal(settings.autoSupport.areaPerSupportMm2, 10, 'the old default followed the new one');
    assert.equal(settings.autoBracing.initialPattern, 'crossDiagonal', 'the old pattern followed the new one');
    assert.equal(settings.autoSupport.leafFanMaxAngleDeg, 50, 'a chosen angle is kept');
    assert.equal(settings.autoBracing.braceDiameterMm, 0.55, 'a chosen brace diameter is kept');
    assert.equal(settings.autoSupport.leafFanRadiusMm, 8, 'the constraint floor raises 5, not the table');

    // The version must not ride into the live block, and a save must stamp it.
    assert.ok(
        !(SUPPORT_DEFAULTS_VERSION_KEY in (settings as unknown as Record<string, unknown>)),
        'the batch is a wire field, not a setting',
    );
    saveSettingsToLocalStorage();
    const written = JSON.parse(storage.get('support-settings') ?? '{}') as Record<string, unknown>;
    assert.equal(written[SUPPORT_DEFAULTS_VERSION_KEY], CURRENT_SUPPORT_DEFAULTS_VERSION);
});

test('the preset load path migrates a stored factory preset, and leaves a user’s own alone', async () => {
    // Stored copies from before the bracing and fan-radius changes, exactly what
    // a preview install carries: a factory preset and a preset the user made.
    const staleBracing = { ...createDefaultAutoBracingSettings(), initialPattern: 'singleDiagonal', braceDiameterMm: 0.7 };
    const staleAutoSupport = { ...createDefaultAutoSupportSettings(), areaPerSupportMm2: 8 };
    const storedPresets = {
        byId: {
            structure: {
                id: 'structure',
                name: 'Structure',
                isBuiltIn: false,
                pinnedSlot: 2,
                settings: {
                    autoSupport: staleAutoSupport,
                    autoBracing: staleBracing,
                    roots: { diameterMm: 3.5 },
                },
            },
            // `detail` states its own density, so its stored 8 is a design decision
            // even though 8 was also the old global default. It inherits bracing,
            // so that block still follows the table.
            detail: {
                id: 'detail',
                name: 'Detail',
                isBuiltIn: false,
                settings: {
                    autoSupport: { areaPerSupportMm2: 8 },
                    autoBracing: { ...staleBracing },
                },
            },
            'custom-mine': {
                id: 'custom-mine',
                name: 'Mine',
                isBuiltIn: false,
                settings: {
                    autoSupport: { ...staleAutoSupport },
                    autoBracing: { ...staleBracing },
                },
            },
        },
        allIds: ['structure', 'custom-mine'],
        activePresetId: 'structure',
    };
    const storage = new Map<string, string>([['support-presets-v1', JSON.stringify(storedPresets)]]);
    // `presets.ts` reads through `window`, and a preset test has no DOM.
    Object.assign(globalThis, {
        window: {},
        localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, value); },
            removeItem: (key: string) => { storage.delete(key); },
        },
    });

    const { getPresetById } = await import('../Settings/presets');
    const structure = getPresetById('structure');
    const detail = getPresetById('detail');
    const mine = getPresetById('custom-mine');

    assert.ok(structure && detail && mine, 'every preset is still there');

    // `structure` inherits its density and its bracing from the defaults, so both
    // follow the table; its root diameter is its own and stays.
    assert.equal(structure.settings.autoSupport.areaPerSupportMm2, 10, 'the inherited density followed the default');
    assert.equal(structure.settings.autoBracing.braceDiameterMm, 1, 'the inherited brace followed the default');
    assert.equal(structure.settings.autoBracing.initialPattern, 'crossDiagonal', 'the inherited pattern followed the default');
    assert.equal(structure.settings.autoBracing.patternIntervalMm, 8, 'the inherited interval followed the default');
    assert.equal(structure.settings.roots.diameterMm, 3.5, 'a customized value inside the factory preset is kept');
    assert.equal(structure.pinnedSlot, 2, 'arrangement is the user’s, not the migration’s');

    // `detail` states its density (16), so a stored 8 is its design, not the old
    // default: the table must not retune a preset's own number.
    assert.equal(detail.settings.autoSupport.areaPerSupportMm2, 8, 'a density the preset states itself must survive the table');
    assert.equal(detail.settings.autoBracing.braceDiameterMm, 1, 'the bracing it inherits still follows the default');

    // A preset the user made is their artifact: its block is what they configured,
    // so the table does not reach into it even though the values are the old defaults.
    assert.equal(mine.settings.autoSupport.areaPerSupportMm2, 8, 'a user preset is not migrated');
    assert.equal(mine.settings.autoBracing.braceDiameterMm, 0.7, 'a user preset keeps its brace diameter');
    assert.equal(mine.settings.autoBracing.initialPattern, 'singleDiagonal', 'a user preset keeps its pattern');
});
