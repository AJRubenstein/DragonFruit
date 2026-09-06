import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The placement-owner union is drawn from the registry, not spelled out.
 *
 * It was `'none' | 'branch' | 'brace' | 'leaf' | 'kickstand'` -- four type
 * names the rename test could not see, because nothing tied them to
 * `SupportTypeId`. Renaming one of those types left the union stale and still
 * compiling. It is now an `Extract` over `SupportTypeId`, so a renamed member
 * collapses to `never` and every use fails.
 */

const HOTKEY_TYPES = join(
    process.cwd(), 'src', 'supports', 'interaction', 'shared', 'placement',
    'hotkeys', 'supportPlacementHotkeyTypes.ts',
);

test('the placement owner union derives from SupportTypeId', () => {
    const source = readFileSync(HOTKEY_TYPES, 'utf8');
    assert.match(
        source,
        /export type SupportPlacementOwner =[^;]*Extract<SupportTypeId,/,
        'SupportPlacementOwner must be drawn from SupportTypeId, not written out',
    );
});

test('every placement owner names a type that still exists', () => {
    const source = readFileSync(HOTKEY_TYPES, 'utf8');
    const union = source.match(/export type SupportPlacementOwner =([^;]*);/)?.[1] ?? '';
    const named = [...union.matchAll(/'(\w+)'/g)].map((m) => m[1]).filter((n) => n !== 'none');

    assert.ok(named.length > 0, 'the union should name the placeable types');
    for (const name of named) {
        assert.ok(
            SUPPORT_TYPES.some((d) => d.id === name),
            `SupportPlacementOwner names "${name}", which is no longer a support type`,
        );
    }
});

test('every type with a placement preview is a placement owner', () => {
    // A type gaining `hasPlacementPreview` without joining the union cannot be
    // routed to, so its hotkey silently does nothing.
    const source = readFileSync(HOTKEY_TYPES, 'utf8');
    const union = source.match(/export type SupportPlacementOwner =([^;]*);/)?.[1] ?? '';

    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasPlacementPreview) continue;
        // Trunk places by direct click rather than through a hotkey owner.
        if (descriptor.id === 'trunk') continue;
        assert.ok(
            union.includes(`'${descriptor.id}'`),
            `${descriptor.id} has a placement preview but is not a placement owner`,
        );
    }
});
