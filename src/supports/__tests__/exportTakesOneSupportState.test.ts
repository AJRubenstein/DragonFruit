import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The export path takes one support state, not two.
 *
 * `KickstandState` was the last remnant of the deleted kickstand store: the
 * only per-type `State` interface in the codebase, threaded through the export
 * as a second parameter. Every caller passed the same object the first
 * parameter already held.
 */

const EXPORT_SRC = readFileSync(
    new URL('../../features/export/logic/supportExportReconstruction.ts', import.meta.url),
    'utf8',
);
const MANAGER_SRC = readFileSync(
    new URL('../../features/export/logic/ExportManager.ts', import.meta.url),
    'utf8',
);

test('no type has a State interface of its own', () => {
    // SupportState holds every collection; a per-type view is a second source
    // of truth for what a type owns.
    for (const descriptor of SUPPORT_TYPES) {
        const name = `${descriptor.id.charAt(0).toUpperCase()}${descriptor.id.slice(1)}State`;
        assert.ok(
            !EXPORT_SRC.includes(name),
            `the export still threads ${name}; it should take SupportState alone`,
        );
    }
});

test('the export functions take a single state parameter', () => {
    assert.ok(
        !/kickstandState:\s*KickstandState/.test(EXPORT_SRC),
        'a second kickstand state parameter is back',
    );
});

test('no caller manufactures a second snapshot', () => {
    // `const kickstandSnapshot = supportSnapshot` was the tell: the same object
    // passed twice to satisfy a parameter that never needed to exist.
    assert.ok(
        !/kickstandSnapshot/.test(MANAGER_SRC),
        'ExportManager still builds a separate kickstand snapshot',
    );
});
