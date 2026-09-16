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
 * Every reference is classified by WHAT WOULD FIX IT, because the three answers
 * are different work -- see `KIND_HELP`. `--kind <k>` lists one class.
 *
 * Usage (needs tsx, as the registry is TypeScript):
 *   npx tsx scripts/scan-support-type-references.ts             summary by kind, type and file
 *   npx tsx scripts/scan-support-type-references.ts --lines      every match
 *   npx tsx scripts/scan-support-type-references.ts --file X     one file
 *   npx tsx scripts/scan-support-type-references.ts --type stump one type
 *   npx tsx scripts/scan-support-type-references.ts --kind coupling   one class
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

/**
 * What kind of work each class needs. The counts are only useful split this way:
 * a hand-written list and a local variable name are both "a type name outside
 * the registry" and neither is fixed the same way.
 */
const KIND_HELP: Record<ReferenceKind, string> = {
    coupling: 'a walk, list or field access over a type -- DERIVE from the registry',
    'per-type-file': 'the file is about one type -- MOVE it into SupportTypes/<Type>/',
    vocabulary: 'a name in shared code that depends on no type -- fixed only by moving its owner',
    wiring: 'an import of a type\'s own module -- the seam working, no action',
};

type ReferenceKind = 'coupling' | 'per-type-file' | 'vocabulary' | 'wiring';

/**
 * Folders holding one type's code while sitting outside `SupportTypes/`.
 *
 * A path segment equal to a type's capitalised name means the file is that
 * type's, wherever it lives -- `AnatomyPreview/PreviewTypes/Brace/` is a brace
 * folder as much as `SupportTypes/Brace/` is.
 */
function isPerTypeFile(path: string, stems: Iterable<string>): boolean {
    const segments = path.split('/');
    for (const stem of stems) {
        const folder = stem[0].toUpperCase() + stem.slice(1);
        if (segments.includes(folder)) return true;
        const base = segments[segments.length - 1];
        if (base.toLowerCase().startsWith(stem) || base.startsWith(folder)) return true;
    }
    return false;
}

/**
 * Whether this line reaches a type's DATA rather than merely naming something.
 *
 * A collection walk, a collection field, a typed record or a store access all
 * depend on the type existing under that name; a local, a ref or a handler does
 * not. The first class is derivable, the second is not.
 */
function isCoupling(line: string, collectionKeys: ReadonlySet<string>): boolean {
    if (/Object\.(values|keys|entries)\s*\(/.test(line)) return true;
    if (/\b(state|snapshot|draft|payload|next|cloned|supportState)\s*[.[]/.test(line)) return true;
    for (const key of collectionKeys) {
        if (new RegExp(`[.\\[]\\s*['"\`]?${key}\\b`).test(line)) return true;
        if (new RegExp(`\\b${key}\\s*:`).test(line)) return true;
    }
    return false;
}

interface Match { line: number; identifier: string; text: string; stem: string; kind: ReferenceKind }
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
const typeStems = new Set(SUPPORT_TYPES.map((descriptor) => descriptor.id));
const collectionKeys = new Set(SUPPORT_TYPES.map((descriptor) => descriptor.location.key));
const only = value('--file');
const onlyType = value('--type');
const onlyKind = value('--kind') as ReferenceKind | null;
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

    const perTypeFile = isPerTypeFile(path, typeStems);
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
            // An import naming a type's own module is the registration seam
            // doing its job, not a reference to remove.
            const kind: ReferenceKind = /^\s*(import|export)\b.*\bfrom\b|^\s*import\s*['"]/.test(line)
                ? 'wiring'
                : perTypeFile
                    ? 'per-type-file'
                    : isCoupling(line, collectionKeys) ? 'coupling' : 'vocabulary';
            if (onlyKind && kind !== onlyKind) continue;
            matches.push({ line: index + 1, identifier: m[0], text: line, stem: type, kind });
        }
    });
    if (matches.length) files.push({ path, refs: matches.length, lines: rawLines.length, matches });
}

files.sort((a, b) => b.refs - a.refs);
const total = files.reduce((sum, f) => sum + f.refs, 0);

/** Reference count per kind, in the order the work should be done. */
function byKind(): [ReferenceKind, number][] {
    const counts = new Map<ReferenceKind, number>();
    for (const f of files) {
        for (const m of f.matches) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    }
    const order: ReferenceKind[] = ['coupling', 'per-type-file', 'vocabulary', 'wiring'];
    return order.filter((k) => counts.has(k)).map((k) => [k, counts.get(k) ?? 0]);
}

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
        total, files: files.length,
        byKind: Object.fromEntries(byKind()), byType: Object.fromEntries(byType()),
        duds: duds.length, entries: files,
    }, null, 2));
} else if (flag('--lines')) {
    for (const f of files) {
        console.log(`\n${f.path}  (${f.refs})`);
        for (const m of f.matches) {
            console.log(`  ${String(m.line).padStart(5)}  ${m.kind.padEnd(14)} ${m.identifier.padEnd(28)} ${m.text.slice(0, 74)}`);
        }
    }
} else {
    console.log(`${total} references across ${files.length} files`
        + (duds.length ? `  (${duds.length} excluded, see --duds)` : '') + '\n');
    console.log('  by kind:');
    for (const [kind, n] of byKind()) {
        console.log(`  ${String(n).padStart(5)}  ${kind.padEnd(14)} ${KIND_HELP[kind]}`);
    }
    console.log('\n  by type:');
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
