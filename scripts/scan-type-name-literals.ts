/**
 * Every support-type-name literal in `src/`, classified by what the literal does.
 *
 * ## Why this exists beside `scan-support-type-references.ts`
 *
 * That scanner counts every occurrence of a type's STEM anywhere in an
 * identifier, and its `--check --budget` ratchets the TOTAL. The total is not a
 * progress metric: it rose during the refactor that removed real coupling,
 * because deriving a concept adds registry-side mentions while deleting
 * scattered ones. A budget on it would penalise correct work.
 *
 * It is also blind in the direction that matters. Commit `1bd7bfa2` turned two
 * decision kinds into type-name literals in ARGUMENT position --
 * `placementOf('branch', …)`, `leafTypeId: 'leaf'` -- and the dispatch count did
 * not move. Those five literals were added and then removed with every existing
 * instrument reading exactly the same number.
 *
 * So this counts STRING LITERALS equal to a type id, and says what each one is
 * doing. A literal in a comparison is a rename hazard nothing catches; a literal
 * passed as an argument is a rename hazard the compiler catches; a literal in
 * the registry is the naming point. Those are different amounts of work and
 * different amounts of risk, and a single number cannot express that.
 *
 * ## Usage
 *
 *   npx tsx scripts/scan-type-name-literals.ts                summary by class
 *   npx tsx scripts/scan-type-name-literals.ts --lines        every site
 *   npx tsx scripts/scan-type-name-literals.ts --file X       one file
 *   npx tsx scripts/scan-type-name-literals.ts --json         machine readable
 *   npx tsx scripts/scan-type-name-literals.ts --check        ratchet (see BUDGET)
 *
 * Exit code is 1 only when `--check` fails.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORT_TYPES } from '../src/supports/supportTypeRegistry';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Paths whose type-name literals are allowed.
 *
 * The registry IS the naming point, and each type's own folder may name itself.
 * Generated files are built from the registry, so a literal there is a copy of
 * one that already exists in the registry.
 */
const EXEMPT = [
    'src/supports/supportTypeRegistry.ts',
    'src/supports/SupportTypes/',
    'generatedSupportRegistrations',
];

/**
 * The ratchet.
 *
 * Every number here must only ever move DOWN, in a commit that lowers it. If a
 * count rises, either the work regressed or the ceiling is wrong -- and the
 * second case needs a deliberate edit to this table, which is the point.
 *
 * `dispatch` is the one that matters most: those are the literals a rename does
 * NOT break, so nothing else catches them. `value` and `declaration` are rename
 * hazards the compiler or a drift check eventually catches.
 *
 * Measured at the commit that introduced this file. See
 * docs/dev/support-type-literal-plan.md for the staged plan that lowers them.
 */
const BUDGET = {
    dispatch: 39,
    declaration: 3,
    value: 175,
};

/**
 * A literal doing one of these things.
 *
 * - `dispatch`     branches on the name: `x === 'trunk'`, `case 'leaf'`. A
 *                  rename leaves a branch that never fires, silently.
 * - `declaration`  a set/array/const listing types. Drifts from the registry.
 * - `value`        passed as data: `getSupportEntity('trunk', id)`, `kind: 'leaf'`.
 * - `other-vocab`  the word is a DIFFERENT vocabulary -- an origin, a sizing
 *                  preset, a placement family. Not a hazard; must not be fixed.
 * - `object-key`   a `'trunk':` key in a lookup table.
 * - `comment`      prose.
 */
type LiteralClass = 'dispatch' | 'declaration' | 'value' | 'other-vocab' | 'object-key' | 'comment';

interface Site {
    path: string;
    line: number;
    cls: LiteralClass;
    /** The type id the literal spells. */
    literal: string;
    text: string;
}

/** Type ids, read from the registry so a new type is covered automatically. */
function typeIds(): string[] {
    return SUPPORT_TYPES.map((descriptor) => descriptor.id);
}

function classify(line: string, ids: string[]): LiteralClass {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        return 'comment';
    }

    // A word that belongs to another vocabulary. Checked FIRST, because these
    // lines also match the dispatch shape and must not be counted as targets.
    //   origin:        `origin === 'anchor'` -- SUPPORT_ORIGINS
    //   sizing preset: 'detail' | 'structure' | 'anchor'
    //   family:        `intent.family === 'leaf'`
    if (/origin\s*(?:===|!==)\s*['"](?:anchor|overhang|island|standalone)['"]/.test(line)) {
        return 'other-vocab';
    }
    if (/sizingPreset/.test(line) || /['"](?:detail|structure)['"]/.test(line)) {
        return 'other-vocab';
    }
    if (/\.family\s*(?:===|!==)/.test(line)) {
        return 'other-vocab';
    }

    // `x === 'trunk'`, `case 'leaf'`, `kind === 'brace'`
    if (new RegExp(`(?:===|!==)\\s*['"](?:${ids.join('|')})['"]`).test(line)) {
        return 'dispatch';
    }
    if (/^\s*case\s+['"]/.test(line)) return 'dispatch';

    // A declared list of types.
    if (/ReadonlySet<|readonly SupportTypeId|:\s*SupportTypeId\s*=|Set<SupportTypeId>/.test(line)) {
        return 'declaration';
    }

    if (/^\s*['"]\w+['"]\s*:/.test(line)) return 'object-key';

    return 'value';
}

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) walk(abs, acc);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(abs);
    }
    return acc;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
};

const ids = typeIds();
const literalPattern = new RegExp(`['"](${ids.join('|')})['"]`);
const only = value('--file');
const sites: Site[] = [];

for (const abs of walk(SRC)) {
    const path = relative(ROOT, abs).split(sep).join('/');
    if (EXEMPT.some((exempt) => path.includes(exempt))) continue;
    if (only && !path.includes(only)) continue;

    const lines = readFileSync(abs, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const match = literalPattern.exec(lines[i]);
        if (!match) continue;
        sites.push({
            path,
            line: i + 1,
            cls: classify(lines[i], ids),
            literal: match[1],
            text: lines[i].trim().slice(0, 110),
        });
    }
}

const counts: Record<string, number> = {};
for (const site of sites) counts[site.cls] = (counts[site.cls] ?? 0) + 1;

const byFile = new Map<string, Site[]>();
for (const site of sites) {
    const bucket = byFile.get(site.path) ?? [];
    bucket.push(site);
    byFile.set(site.path, bucket);
}

if (flag('--json')) {
    console.log(JSON.stringify({ total: sites.length, counts, sites }, null, 2));
} else if (flag('--lines')) {
    for (const site of sites) {
        console.log(`  ${site.cls.padEnd(12)} ${site.path}:${site.line}  ${site.text}`);
    }
} else {
    console.log(`${sites.length} type-name literals outside the registry and type folders\n`);
    for (const cls of ['dispatch', 'declaration', 'value', 'object-key', 'other-vocab', 'comment']) {
        const n = counts[cls] ?? 0;
        const note = cls === 'dispatch' ? '  <-- rename does NOT break these'
            : cls === 'other-vocab' ? '  (different vocabulary; do not "fix")'
                : '';
        console.log(`  ${String(n).padStart(4)}  ${cls}${note}`);
    }
    console.log('\n  by file (dispatch + declaration only, the targets):');
    const rows = [...byFile.entries()]
        .map(([path, list]) => [path, list.filter((s) => s.cls === 'dispatch' || s.cls === 'declaration')] as const)
        .filter(([, list]) => list.length > 0)
        .sort((a, b) => b[1].length - a[1].length);
    for (const [path, list] of rows) console.log(`  ${String(list.length).padStart(4)}  ${path}`);
}

if (flag('--check')) {
    let failed = false;
    for (const [cls, ceiling] of Object.entries(BUDGET)) {
        const actual = counts[cls] ?? 0;
        if (actual > ceiling) {
            console.error(`\nover budget: ${cls} = ${actual} > ${ceiling}`);
            failed = true;
        }
    }
    if (failed) {
        console.error('\nLower the ceiling in this file only in a commit that lowers the count.');
        process.exit(1);
    }
    console.log('\ntype-name literal budget: OK');
}
