import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

import {
    getSnapshot,
    loadFromImportFormat,
    mergeFromImportFormat,
    reassignAllSupportModelIds,
    resetStore,
    transformAllSupportsForSingleModel,
    transformSupportsForModel,
} from '../state';
import { buildCharacterisationFixture, identityTransform } from './fixtures/supportFixture';

/**
 * GOLDEN-MASTER TESTS for the support store.
 *
 * The companion characterisation tests assert hand-picked properties ("this
 * entity moved by 10"). That only protects what someone thought to assert --
 * roughly 19 assertions against a fixture whose trunk alone has 38 fields.
 *
 * These tests take the other approach: run an operation, serialise the ENTIRE
 * resulting store, and compare it byte-for-byte against a recorded baseline. Any
 * field that changes -- including ones nobody thought about -- fails the diff.
 *
 * Recording the baseline:
 *
 *     UPDATE_GOLDEN=1 npx tsx --test src/supports/__tests__/supportStateGoldenMaster.test.ts
 *
 * Record BEFORE refactoring, with the code known-good. Then refactor and run
 * normally: a passing run means the refactor is behaviour-preserving over every
 * field of every entity, which is the guarantee a mechanical refactor needs.
 *
 * If a diff appears after a refactor, it is a regression until proven otherwise.
 * Re-record only once the change is understood and intended, so the update shows
 * up as a reviewable diff of the .json baseline rather than an invisible edit.
 */

// Resolved from cwd rather than import.meta.dirname: tsx transpiles this to
// CJS, where import.meta.dirname is undefined.
const GOLDEN_DIR = path.join(process.cwd(), 'src', 'supports', '__tests__', '__golden__');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

/**
 * Stable JSON: object keys sorted recursively, floats rounded.
 *
 * Key order otherwise depends on insertion order, which a refactor may legally
 * change while preserving behaviour -- that would produce noisy false failures.
 * Rounding absorbs float drift from matrix maths being applied in a different
 * (but equivalent) order; 6dp is far finer than any geometry we care about.
 */
function stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const normalise = (v: unknown): unknown => {
        if (typeof v === 'number') {
            if (!Number.isFinite(v)) return String(v);
            const r = Math.round(v * 1e6) / 1e6;
            return Object.is(r, -0) ? 0 : r;
        }
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v as object)) return '[circular]';
        seen.add(v as object);
        if (Array.isArray(v)) return v.map(normalise);
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(v as Record<string, unknown>).sort()) {
            out[key] = normalise((v as Record<string, unknown>)[key]);
        }
        return out;
    };
    return JSON.stringify(normalise(value), null, 2);
}

/**
 * The whole store, minus interaction state.
 *
 * selectedId/hoveredId/selectedCategory are deliberately excluded: they are
 * transient UI state, not the data a collection-walking refactor touches.
 */
function serialiseStore(): string {
    const s = getSnapshot();
    return stableStringify(canonicaliseGeneratedIds({
        roots: s.roots,
        trunks: s.trunks,
        branches: s.branches,
        leaves: s.leaves,
        twigs: s.twigs,
        sticks: s.sticks,
        braces: s.braces,
        anchors: s.anchors,
        knots: s.knots,
        kickstands: s.kickstands,
    }));
}

/**
 * Replace generated uuids with stable placeholders.
 *
 * `mergeFromImportFormat` re-ids incoming entities so a merged payload cannot
 * collide with what is already in the store. Those ids are fresh every run, so a
 * raw snapshot of a merge is never byte-stable. Mapping each uuid to `uuid-N` in
 * first-encounter order keeps the STRUCTURE under test -- how many entities, what
 * references what -- while dropping the randomness.
 *
 * Numbering is assigned on a FIRST PASS in structural order (collection, then
 * entity, then field) rather than during the sorted-key walk. Sorting by raw uuid
 * would order entities differently every run -- the uuids themselves change --
 * which shifts the numbering and produces spurious diffs.
 */
function canonicaliseGeneratedIds(value: unknown): unknown {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const mapping = new Map<string, string>();
    const canon = (id: string): string => {
        if (!UUID_RE.test(id)) return id;
        let mapped = mapping.get(id);
        if (!mapped) {
            mapped = `uuid-${mapping.size + 1}`;
            mapping.set(id, mapped);
        }
        return mapped;
    };
    // Pass 1: assign numbers in structural (insertion) order, which reflects the
    // order entities were created rather than their random ids.
    const assign = (v: unknown): void => {
        if (typeof v === 'string') { canon(v); return; }
        if (v === null || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(assign); return; }
        for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
            canon(key);
            assign(val);
        }
    };
    assign(value);

    // Pass 2: rewrite using the mapping fixed above.
    const walk = (v: unknown): unknown => {
        if (typeof v === 'string') return canon(v);
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(walk);
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(v as Record<string, unknown>).sort()) {
            out[canon(key)] = walk((v as Record<string, unknown>)[key]);
        }
        return out;
    };
    return walk(value);
}

/** Compare against the recorded baseline, or record it when UPDATE_GOLDEN=1. */
function assertMatchesGolden(name: string, actual: string): void {
    if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
    const file = path.join(GOLDEN_DIR, `${name}.json`);

    if (UPDATE) {
        writeFileSync(file, actual, 'utf8');
        return;
    }

    assert.ok(
        existsSync(file),
        `No golden baseline for "${name}". Record one with:\n`
        + `  UPDATE_GOLDEN=1 npx tsx --test src/supports/__tests__/supportStateGoldenMaster.test.ts`,
    );

    const expected = readFileSync(file, 'utf8');
    if (actual !== expected) {
        // Point at the first differing line: a whole-store diff is unreadable in
        // assertion output, and the first divergence is usually enough to place it.
        const a = actual.split('\n');
        const e = expected.split('\n');
        let i = 0;
        while (i < a.length && i < e.length && a[i] === e[i]) i++;
        assert.fail(
            `Store diverged from golden baseline "${name}" at line ${i + 1}:\n`
            + `  expected: ${e[i] ?? '(end of file)'}\n`
            + `  actual:   ${a[i] ?? '(end of file)'}\n`
            + `If this change is intended, re-record with UPDATE_GOLDEN=1 and review the .json diff.`,
        );
    }
}

test('golden: freshly loaded fixture', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    assertMatchesGolden('load', serialiseStore());
});

test('golden: after reassignAllSupportModelIds', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    reassignAllSupportModelIds('model-target');
    assertMatchesGolden('reassign-all-model-ids', serialiseStore());
});

test('golden: after transformAllSupportsForSingleModel (pure Z translation)', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    transformAllSupportsForSingleModel(identityTransform(0), identityTransform(10));
    assertMatchesGolden('transform-all-translate-z', serialiseStore());
});

test('golden: after transformAllSupportsForSingleModel (rotation + scale)', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    transformAllSupportsForSingleModel(
        {
            position: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            scale: new THREE.Vector3(1, 1, 1),
        },
        {
            // Rotation and non-uniform scale exercise the normal-matrix paths that
            // a pure translation leaves untouched (cone axes, surface normals).
            position: new THREE.Vector3(3, -2, 4),
            rotation: new THREE.Euler(0.3, 0.2, 0.5),
            scale: new THREE.Vector3(1.25, 1.25, 1.25),
        },
    );
    assertMatchesGolden('transform-all-rotate-scale', serialiseStore());
});

test('golden: after transformSupportsForModel (one model of two)', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    // The per-model path is the one with real per-type variation (graph-connected
    // twigs/sticks, leaves resolved through their parent knot). Recording it now
    // means the harder second phase of the refactor has a baseline waiting.
    transformSupportsForModel('model-a', identityTransform(0), identityTransform(6));
    assertMatchesGolden('transform-for-model-a', serialiseStore());
});

test('golden: after mergeFromImportFormat with an owner model id', () => {
    resetStore();
    loadFromImportFormat(buildCharacterisationFixture());
    // Exercises reconcileSupportModelIds, which walks every collection and is a
    // prime candidate for the descriptor rewrite.
    mergeFromImportFormat(buildCharacterisationFixture(), 'owner-model');
    assertMatchesGolden('merge-with-owner', serialiseStore());
});
