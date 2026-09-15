/**
 * Finds every support type name used outside the registry, split by type.
 *
 * The vocabulary comes from the registry, so a new type is scanned
 * automatically. Comments and string bodies are blanked first: this counts
 * identifiers only. For literals use `scan-type-name-literals.ts`.
 *
 * Identifiers listed in NOT_THE_TYPE contain a stem but mean something else;
 * `--duds` prints them.
 *
 * Usage (needs tsx, as the registry is TypeScript):
 *   npx tsx scripts/scan-support-type-references.ts             summary by type and file
 *   npx tsx scripts/scan-support-type-references.ts --lines      every match
 *   npx tsx scripts/scan-support-type-references.ts --file X     one file
 *   npx tsx scripts/scan-support-type-references.ts --type stump one type
 *   npx tsx scripts/scan-support-type-references.ts --duds       what NOT_THE_TYPE excluded
 *   npx tsx scripts/scan-support-type-references.ts --json       machine readable
 *   npx tsx scripts/scan-support-type-references.ts --check --budget N
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SUPPORT_COLLECTION_KEYS,
    SUPPORT_TYPES,
} from '../src/supports/supportTypeRegistry';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const REGISTRY = 'src/supports/supportTypeRegistry.ts';

/**
 * Paths whose per-type names are allowed.
 *
 * A type's own folder may name that type -- renderers, builders, placement
 * controllers and rules live there by convention. `types.ts` declares the
 * entity interfaces the registry derives from. Everything else is in scope.
 */
const EXEMPT = [REGISTRY, 'src/supports/types.ts', 'src/supports/SupportTypes/'];

/** Identifiers holding a type's stem while meaning something else. Matched whole. */
const NOT_THE_TYPE = new Set([
    // Drag bias on the current segment, not the stick type.
    'stickiness',
    'CURRENT_SEGMENT_STICKINESS',
]);

interface Match { line: number; identifier: string; text: string; stem: string }
interface Entry { path: string; refs: number; lines: number; matches: Match[] }

/**
 * Type ids and their collection keys, read from the registry rather than
 * restated. Origins and the root/knot primitives are deliberately excluded:
 * `island`, `overhang` and `root` are also general geometry vocabulary, and
 * scanning them buries the real findings under thousands of false matches.
 */
function vocabulary(): Map<string, string> {
    const byStem = new Map<string, string>();
    for (const descriptor of SUPPORT_TYPES) {
        byStem.set(descriptor.id, descriptor.id);
        byStem.set(descriptor.location.key, descriptor.id);
    }
    // Shared primitives, not types.
    byStem.delete('roots');
    byStem.delete('knots');
    if (byStem.size === 0) throw new Error('registry exported no type names');
    return byStem;
}

/** The type a matched identifier belongs to: the longest stem it contains. */
function stemOf(identifier: string, byStem: Map<string, string>): string {
    const low = identifier.toLowerCase();
    let best = '';
    for (const stem of byStem.keys()) {
        if (low.includes(stem) && stem.length > best.length) best = stem;
    }
    return best;
}

/** Matches a stem inside an identifier, so `getTrunkById` counts as well as `trunk`. */
function buildPattern(stems: readonly string[]): RegExp {
    const alts = [...stems]
        .flatMap((s) => [s, s[0].toUpperCase() + s.slice(1), s.toUpperCase()])
        .sort((a, b) => b.length - a.length)
        .join('|');
    return new RegExp(`[A-Za-z0-9_$]*(?:${alts})[A-Za-z0-9_$]*`, 'g');
}

/** Blanks comments, preserving offsets and newlines so line numbers stay true. */
function blankComments(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            out += '  '; i += 2;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            out += c; i++;
            while (i < src.length) {
                if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
                if (src[i] === quote) { out += quote; i++; break; }
                out += src[i]; i++;
            }
            continue;
        }
        out += c; i++;
    }
    return out;
}

function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
};

const byStem = vocabulary();
const pattern = buildPattern([...byStem.keys()]);
const only = value('--file');
const onlyType = value('--type');
const files: Entry[] = [];
const duds: { path: string; line: number; identifier: string; text: string }[] = [];

for (const abs of walk(SRC)) {
    const path = relative(ROOT, abs).split(sep).join('/');
    if (path.includes('__tests__')) continue;
    // Generated modules name every type by construction -- the registration
    // loader lists one import per type folder. Counting them would make this
    // metric move with generated output rather than with hand-written code.
    if (/(^|\/)generated[A-Za-z]*\.tsx?$/.test(path)) continue;
    if (EXEMPT.some((e) => path === e || path.startsWith(e))) continue;
    if (only && !path.includes(only)) continue;

    const raw = readFileSync(abs, 'utf8');
    const rawLines = raw.split('\n');
    const matches: Match[] = [];
    blankComments(raw).split('\n').forEach((text, index) => {
        for (const m of text.matchAll(pattern)) {
            const line = rawLines[index]?.trim() ?? '';
            if (NOT_THE_TYPE.has(m[0])) {
                duds.push({ path, line: index + 1, identifier: m[0], text: line });
                continue;
            }
            const stem = stemOf(m[0], byStem);
            const type = byStem.get(stem) ?? stem;
            if (onlyType && type !== onlyType) continue;
            matches.push({ line: index + 1, identifier: m[0], text: line, stem: type });
        }
    });
    if (matches.length) files.push({ path, refs: matches.length, lines: rawLines.length, matches });
}

files.sort((a, b) => b.refs - a.refs);
const total = files.reduce((sum, f) => sum + f.refs, 0);

/** Reference count per type id, highest first. */
function byType(): [string, number][] {
    const counts = new Map<string, number>();
    for (const f of files) {
        for (const m of f.matches) counts.set(m.stem, (counts.get(m.stem) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

if (flag('--duds')) {
    console.log(`${duds.length} identifiers excluded by NOT_THE_TYPE\n`);
    for (const d of duds) {
        console.log(`  ${d.path}:${d.line}  ${d.identifier.padEnd(28)} ${d.text.slice(0, 80)}`);
    }
} else if (flag('--json')) {
    console.log(JSON.stringify({
        total, files: files.length, byType: Object.fromEntries(byType()),
        duds: duds.length, entries: files,
    }, null, 2));
} else if (flag('--lines')) {
    for (const f of files) {
        console.log(`\n${f.path}  (${f.refs})`);
        for (const m of f.matches) {
            console.log(`  ${String(m.line).padStart(5)}  ${m.identifier.padEnd(28)} ${m.text.slice(0, 90)}`);
        }
    }
} else {
    console.log(`${total} references across ${files.length} files`
        + (duds.length ? `  (${duds.length} excluded, see --duds)` : '') + '\n');
    console.log('  by type:');
    for (const [type, n] of byType()) console.log(`  ${String(n).padStart(5)}  ${type}`);
    console.log('\n  by file:');
    for (const f of files.slice(0, 30)) console.log(`  ${String(f.refs).padStart(5)}  ${f.path}`);
    const rest = files.slice(30);
    if (rest.length) {
        const n = rest.reduce((s, f) => s + f.refs, 0);
        console.log(`\n  ${String(n).padStart(5)}  … ${rest.length} more files`);
    }
}

if (flag('--check')) {
    const budget = Number(value('--budget') ?? Infinity);
    if (total > budget) {
        console.error(`\nover budget: ${total} > ${budget}`);
        process.exit(1);
    }
}
