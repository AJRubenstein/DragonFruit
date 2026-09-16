/**
 * The rename probe, mechanised.
 *
 * Answers the question this refactor exists to answer: can a type be renamed by
 * editing the REGISTRY alone? It edits the two naming points as competently as a
 * person would -- the registry's own per-type tables included, since those are
 * part of that file -- then compiles and reports where the rest of the tree still
 * spells the type.
 *
 * Renaming one naming point and not the other is not a weaker version of this; it
 * is a DIFFERENT measurement. It collapses the derived entity mapping to `unknown`
 * and manufactures errors far from any real site.
 *
 * Usage: node --import tsx local-only/rename-probe.ts <type> [<newId>]
 * Always reverts: the probe is a measurement, never a commit.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , typeId, newIdArg] = process.argv;
if (!typeId) throw new Error('usage: rename-probe.ts <type> [<newId>]');
const newId = newIdArg ?? `${typeId}z`;

const REPO = process.cwd();
const REGISTRY = 'src/supports/supportTypeRegistry.ts';
const TYPES = 'src/supports/types.ts';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The collection a type's entities live in, read from the registry, not guessed. */
function collectionOf(source: string, id: string): string {
    const at = source.indexOf(`id: '${id}',`);
    if (at === -1) throw new Error(`${id} not found in the registry`);
    const key = source.slice(at).match(/key: '([a-zA-Z]+)'/);
    if (!key) throw new Error(`${id}: no collection key within its descriptor`);
    return key[1];
}

const registryBefore = readFileSync(`${REPO}/${REGISTRY}`, 'utf8');
const typesBefore = readFileSync(`${REPO}/${TYPES}`, 'utf8');
const collection = collectionOf(registryBefore, typeId);
const Type = capitalize(typeId);
const NewType = capitalize(newId);
const plural = capitalize(collection);
console.log(`renaming ${typeId} -> ${newId}  (entity ${Type}, collection ${collection} -> ${collection}z)`);

/** Every way a type id can appear as CODE: quoted, or as a property key. */
function renameIdForms(source: string, from: string, to: string): string {
    // `stick:` as a property key at ANY indentation or after `{` / `,`.
    const keyPattern = new RegExp(`(^|[\\s{,])${from}:(?=\\s|$)`, 'gm');
    return source
        // 'stick' / "stick" as a string literal.
        .split(`'${from}'`).join(`'${to}'`)
        .split(`"${from}"`).join(`"${to}"`)
        .replace(keyPattern, `$1${to}:`);
}

try {
    // --- naming point 1: the registry -------------------------------------
    // The registry declares per-type facts in type-keyed tables, so a competent
    // rename edits those here. What the probe then measures is the REST of the
    // tree, which is the point.
    let registry = registryBefore;
    registry = registry.replace(`id: '${typeId}',`, `id: '${newId}',`);
    registry = renameIdForms(registry, typeId, newId);
    // The descriptor's collection and its label.
    if (!process.env.KEEP_COLLECTION) registry = registry.split(`'${collection}'`).join(`'${collection}z'`);
    if (!process.env.KEEP_COLLECTION) registry = registry.replace(`label: '${plural}',`, `label: '${plural}z',`);
    writeFileSync(`${REPO}/${REGISTRY}`, registry);

    // --- naming point 2: types.ts -----------------------------------------
    let types = typesBefore;
    types = renameIdForms(types, typeId, newId);
    types = types.split(`${Type}Fields`).join(`${NewType}Fields`);
    types = types.split(`type ${Type} =`).join(`type ${NewType} =`);
    types = types.split(` ${Type};`).join(` ${NewType};`);
    types = types.split(` ${Type}[]`).join(` ${NewType}[]`);
    if (!process.env.KEEP_COLLECTION) {
        // The collection's own name, everywhere in this file: as a KEY in
        // SupportEntityByCollection, and as the literal VALUE in
        // SupportCollectionByType and SupportEntityAny's derivation.
        types = types.split(`'${collection}'`).join(`'${collection}z'`);
        const collectionKey = new RegExp(`(^|[\\s{,])${collection}:(?=\\s|$)`, 'gm');
        types = types.replace(collectionKey, `$1${collection}z:`);
        // The optional WIRE-FORMAT key (`sticks?: Stick[]`), which is what an
        // import payload carries and what the plugin converters read.
        types = types.split(`    ${collection}?: `).join(`    ${collection}z?: `);
    }
    writeFileSync(`${REPO}/${TYPES}`, types);

    execSync('rm -f tsconfig.tsbuildinfo', { cwd: REPO, shell: 'bash' });
    let out = '';
    try {
        out = execSync('npx tsc --noEmit -p tsconfig.json', { cwd: REPO, encoding: 'utf8' });
    } catch (error) {
        out = (error as { stdout?: string }).stdout ?? '';
    }

    const errors = out.split('\n').filter((line) => line.includes('error TS'));
    const byFile = new Map<string, number>();
    for (const line of errors) {
        const file = line.replace(/\(\d+,\d+\):.*$/, '').trim();
        byFile.set(file, (byFile.get(file) ?? 0) + 1);
    }

    const buckets: Record<string, string[]> = { exempt: [], plugins: [], tests: [], production: [] };
    for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
        const entry = `${String(count).padStart(3)}  ${file}`;
        if (file.includes(`SupportTypes/${Type}/`)) buckets.exempt.push(entry);
        else if (file.startsWith('plugins/')) buckets.plugins.push(entry);
        else if (/\.test\.tsx?$/.test(file) || file.includes('__tests__') || file.includes('local-only/')) buckets.tests.push(entry);
        else buckets.production.push(entry);
    }

    const sum = (rows: string[]) => rows.reduce((n, r) => n + Number(r.trim().split(/\s+/)[0]), 0);
    console.log(`\nTOTAL ERRORS: ${errors.length}`);
    for (const [name, rows] of Object.entries(buckets)) {
        console.log(`\n--- ${name}: ${sum(rows)} across ${rows.length} files ---`);
        for (const row of rows) console.log(`  ${row}`);
    }
    console.log(`\nHEADLINE: ${errors.length} total | ${sum(buckets.exempt)} exempt | `
        + `${sum(buckets.plugins)} plugins | ${sum(buckets.tests)} tests | ${sum(buckets.production)} production`);
} finally {
    writeFileSync(`${REPO}/${REGISTRY}`, registryBefore);
    writeFileSync(`${REPO}/${TYPES}`, typesBefore);
    execSync('rm -f tsconfig.tsbuildinfo', { cwd: REPO, shell: 'bash' });
    console.log('\nreverted');
}
