import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
    CONE_KNOT_HOST_TYPES,
    coneKnotHostType,
    isKnotHostId,
    knotHostId,
    parseKnotHostId,
    SPAN_KNOT_HOST_TYPES,
    spanKnotHostType,
    SUPPORT_TYPES,
} from '../supportTypeRegistry';

/**
 * A knot's pseudo-shaft prefix is declared once, by the type that owns it.
 *
 * These prefixes are STRINGS, so no type-level check can see them: a spelled-out
 * prefix survives a type rename and fails only at runtime. The last test scans
 * source for that.
 */

const SRC = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Files that may spell a prefix: the registry declares them, a type owns its own. */
function isAllowed(file: string): boolean {
    const rel = file.slice(SRC.length).replace(/\\/g, '/');
    if (rel.endsWith('/supports/supportTypeRegistry.ts')) return true;
    if (rel.includes('/__tests__/')) return true;
    // A type's own folder may name its own prefix.
    return /\/supports\/SupportTypes\/(Brace|Leaf)\//.test(rel);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) sourceFiles(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

test('every declared knot-host prefix round-trips through the registry', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.knotHostPrefix) continue;
        const id = knotHostId(descriptor.id, 'entity-1');
        assert.equal(id, `${descriptor.knotHostPrefix}entity-1`);
        assert.deepEqual(parseKnotHostId(id), { typeId: descriptor.id, entityId: 'entity-1' });
        assert.equal(isKnotHostId(id), true);
    }
});

test('a real segment id is not mistaken for a host id', () => {
    assert.equal(parseKnotHostId('segment-42'), null);
    assert.equal(isKnotHostId('segment-42'), false);
});

test('the two host kinds are told apart by what they declare', () => {
    // A span is selectable as a segment and declares a segment prefix too; a
    // cone host is a knot host only. Nothing here names a type.
    for (const typeId of SPAN_KNOT_HOST_TYPES) {
        const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
        assert.ok(descriptor.segmentSelectionPrefix, `${typeId} is a span host but declares no segment prefix`);
    }
    for (const typeId of CONE_KNOT_HOST_TYPES) {
        const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
        assert.equal(descriptor.segmentSelectionPrefix, undefined,
            `${typeId} is a cone host but declares a segment prefix`);
    }
    // The accessors assert "exactly one" rather than assuming it.
    assert.ok(coneKnotHostType());
    assert.ok(spanKnotHostType());
});

test('no source outside the registry spells a declared prefix', () => {
    const prefixes = SUPPORT_TYPES
        .flatMap((d) => [d.knotHostPrefix, d.segmentSelectionPrefix])
        .filter((p): p is string => !!p);
    assert.ok(prefixes.length > 0, 'no prefixes declared');

    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
        if (isAllowed(file)) continue;
        const source = readFileSync(file, 'utf8');
        for (const prefix of prefixes) {
            if (source.includes(prefix)) {
                offenders.push(`${file.slice(SRC.length)} spells ${JSON.stringify(prefix)}`);
            }
        }
    }

    assert.deepEqual(offenders, [],
        'build these ids with knotHostId and read them with parseKnotHostId; '
        + 'a spelled-out prefix survives a type rename and fails only at runtime');
});
