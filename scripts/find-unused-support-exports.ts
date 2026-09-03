/**
 * Lists exports from the support system that nothing outside their own file
 * references.
 *
 * Candidates to investigate, NOT proof. Three known false-positive classes:
 * a type used only within its own file (the history payload interfaces feed
 * SupportHistoryPayloadMap next to them), dynamic or string-keyed access, and
 * re-export chains. Verify before deleting anything.
 *
 *   npx tsx scripts/find-unused-support-exports.ts
 *   npx tsx scripts/find-unused-support-exports.ts --dir src/supports/SupportTypes
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const args = process.argv.slice(2);
const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'src/supports';
const includeTests = args.includes('--count-tests');

function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
}

const rel = (abs: string) => relative(ROOT, abs).split(sep).join('/');
const isTest = (path: string) => path.includes('__tests__') || /\.test\.tsx?$/.test(path);

/** Exported names declared in a file, with the line they sit on. */
function exportsOf(src: string): { name: string; line: number }[] {
    const found: { name: string; line: number }[] = [];
    src.split('\n').forEach((text, index) => {
        const declared = text.match(
            /^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
        );
        if (declared) found.push({ name: declared[1], line: index + 1 });
    });
    return found;
}

const allFiles = walk(SRC);
const targets = walk(join(ROOT, dirArg));

// One pass over every file, so each is read once rather than per candidate.
const sources = new Map<string, string>();
for (const abs of allFiles) sources.set(rel(abs), readFileSync(abs, 'utf8'));

const unused: { path: string; name: string; line: number; testOnly: boolean }[] = [];

for (const abs of targets) {
    const path = rel(abs);
    if (isTest(path)) continue;
    const src = sources.get(path)!;

    for (const { name, line } of exportsOf(src)) {
        const pattern = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
        let production = 0;
        let tests = 0;

        for (const [otherPath, otherSrc] of sources) {
            if (otherPath === path) continue;
            if (!pattern.test(otherSrc)) continue;
            if (isTest(otherPath)) tests++;
            else production++;
        }

        if (production > 0) continue;
        if (tests > 0 && includeTests) continue;
        unused.push({ path, name, line, testOnly: tests > 0 });
    }
}

const byFile = new Map<string, typeof unused>();
for (const entry of unused) {
    const list = byFile.get(entry.path) ?? [];
    list.push(entry);
    byFile.set(entry.path, list);
}

const dead = unused.filter((u) => !u.testOnly).length;
console.log(`${dead} exports referenced nowhere, ${unused.length - dead} referenced only by tests\n`);

for (const [path, entries] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${path}  (${entries.length})`);
    for (const e of entries.sort((a, b) => a.line - b.line)) {
        console.log(`  ${String(e.line).padStart(5)}  ${e.name}${e.testOnly ? '   [tests only]' : ''}`);
    }
}
