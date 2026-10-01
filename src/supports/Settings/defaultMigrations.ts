/**
 * Code-default changes that an existing install has to follow.
 *
 * The settings store persists a whole block, so every key an install ever wrote
 * carries a *value*. Loading is `{ ...codeDefaults, ...stored }`, which means a
 * stored value wins forever: change a default in code and every install that ever
 * saved keeps the old one. `AUTO_BRACING_CONSTRAINTS.braceDiameterMm` moving
 * 0.7 to 1 mm reached new installs only; an install with a saved block kept
 * 0.7 mm and looked like the code had not changed.
 *
 * A default is the *shipped* value for a key nobody has touched, and the two are
 * only distinguishable if a value equal to the current default counts as "not a
 * choice". That is the rule here, one entry per change:
 *
 * - A stored key equal to `from` holds a value this app shipped, so it moves to `to`.
 * - Any other value is a user's choice (or a preset's) and is left alone.
 *
 * It is the rule `presets.ts` already applies by hand for one key family
 * (`migrateLegacyPresetAutoSupport`), generalized so the next default change does
 * not need another one-off. Adding an entry is deliberate and reviewable: it is
 * the record of a default having moved, and the test beside this module fails if
 * an entry's `to` drifts from the value the code actually ships.
 *
 * The alternative — freezing a full defaults snapshot per version and diffing —
 * needs no entries, but hides the decision inside a 200-key blob instead of one
 * line per changed key. The table is the smaller thing to review.
 *
 * Both persisted blobs carry the batch they were written at
 * (`supportDefaultsVersion`); a blob without one is version 0, which gets every
 * entry.
 */
import type { AutoBracingSettings } from '../autoBracing/settings';
import type { AutoSupportSettings } from '../autoSupport/settings';

/**
 * A leaf whose shipped default changed. `section` + `key` are checked against
 * the settings types, so a renamed key breaks the build rather than silently
 * migrating nothing.
 */
export type SupportDefaultMigration = {
    /** Batch number. A blob written at version N receives every entry above N. */
    version: number;
    /** The block the leaf lives in. */
    section: 'autoSupport' | 'autoBracing';
    /** The leaf inside that block. */
    key: string;
    /** The value the app shipped for this leaf before this batch. */
    from: string | number | boolean;
    /** The value it ships now. */
    to: string | number | boolean;
};

type AutoSupportMigration = SupportDefaultMigration & {
    section: 'autoSupport';
    key: keyof AutoSupportSettings;
    from: AutoSupportSettings[keyof AutoSupportSettings];
    to: AutoSupportSettings[keyof AutoSupportSettings];
};

type AutoBracingMigration = SupportDefaultMigration & {
    section: 'autoBracing';
    key: keyof AutoBracingSettings;
    from: AutoBracingSettings[keyof AutoBracingSettings];
    to: AutoBracingSettings[keyof AutoBracingSettings];
};

/**
 * Every shipped default change, oldest batch first.
 *
 * Version 1 — the auto-support sizing terms (`leafFanMaxAngleDeg` c2234f2,
 * `areaPerSupportMm2` 893ffea). An install that materialized the old numbers
 * would otherwise keep them while the band-derived sizing around them moved on.
 *
 * Version 2 — the bracing ladder (4903cb1 made Zig Zag the default for both
 * pattern dropdowns, 8a9176d moved it to Cross Diagonal and retuned the brace and
 * its interval). Both older patterns are listed: an install can be pinned at the
 * pre-4903cb1 pattern as easily as at Zig Zag.
 *
 * A default that a *constraint* already forces needs no entry: `leafFanRadiusMm`
 * moved 5 to 8 with `MIN_LEAF_FAN_RADIUS_MM`, and `normalizeAutoSupportSettings`
 * clamps any stored 5 up to that floor on every load, so an entry here would only
 * describe work the clamp has already done.
 */
export const SUPPORT_DEFAULT_MIGRATIONS: readonly (AutoSupportMigration | AutoBracingMigration)[] = [
    { version: 1, section: 'autoSupport', key: 'leafFanMaxAngleDeg', from: 60, to: 45 },
    { version: 1, section: 'autoSupport', key: 'areaPerSupportMm2', from: 8, to: 10 },
    { version: 2, section: 'autoBracing', key: 'initialPattern', from: 'singleDiagonal', to: 'crossDiagonal' },
    { version: 2, section: 'autoBracing', key: 'initialPattern', from: 'zigZag', to: 'crossDiagonal' },
    { version: 2, section: 'autoBracing', key: 'repeatingPattern', from: 'singleDiagonal', to: 'crossDiagonal' },
    { version: 2, section: 'autoBracing', key: 'repeatingPattern', from: 'zigZag', to: 'crossDiagonal' },
    { version: 2, section: 'autoBracing', key: 'braceDiameterMm', from: 0.7, to: 1 },
    { version: 2, section: 'autoBracing', key: 'patternIntervalMm', from: 10, to: 8 },
];

/** The batch a save stamps into the blob it writes. */
export const CURRENT_SUPPORT_DEFAULTS_VERSION = SUPPORT_DEFAULT_MIGRATIONS.reduce(
    (highest, migration) => Math.max(highest, migration.version),
    0,
);

/** The wire field both persisted blobs carry the batch under. */
export const SUPPORT_DEFAULTS_VERSION_KEY = 'supportDefaultsVersion';

/**
 * The version a parsed blob was written at. Absent, or not a number, is 0: the
 * blob predates the stamp, so every entry applies.
 */
export function readWrittenDefaultsVersion(blob: unknown): number {
    if (blob !== null && typeof blob === 'object' && SUPPORT_DEFAULTS_VERSION_KEY in blob) {
        const value = (blob as Record<string, unknown>)[SUPPORT_DEFAULTS_VERSION_KEY];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return 0;
}

/**
 * Apply every entry newer than the version the block was written at. A value
 * that is not the old default is left exactly as it is, and the input is never
 * mutated: a migrated block is a copy, so a caller that rejects the result has
 * changed nothing.
 *
 * `options.skip` holds `section.key` paths whose owner *states* the value rather
 * than inheriting the default — a factory preset that sets its own density, for
 * instance. The inference above ("equals the old default" means "shipped") only
 * holds for a value nobody claims, so a stated key is never migrated.
 */
export function applySupportDefaultMigrations<
    T extends { autoSupport?: Partial<AutoSupportSettings>; autoBracing?: Partial<AutoBracingSettings> },
>(block: T, writtenAtVersion: number, options: { skip?: ReadonlySet<string> } = {}): T {
    const due = SUPPORT_DEFAULT_MIGRATIONS.filter(
        (migration) => migration.version > writtenAtVersion
            && !options.skip?.has(`${migration.section}.${migration.key}`),
    );
    if (due.length === 0) return block;

    let migrated = { ...block } as T;
    for (const migration of due) {
        const section = migrated[migration.section];
        if (section === null || section === undefined || typeof section !== 'object') continue;

        const sectionCopy: Record<string, unknown> = { ...(section as Record<string, unknown>) };
        if (sectionCopy[migration.key] !== migration.from) continue;

        sectionCopy[migration.key] = migration.to;
        migrated = { ...migrated, [migration.section]: sectionCopy };
    }
    return migrated;
}
