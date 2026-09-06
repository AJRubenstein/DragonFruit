import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * A renderer reads its own `typeId` from the entity, falling back to its own.
 *
 * The fallback is load-bearing, not defensive: builders construct entities
 * without a stamp -- only the store stamps, on write -- so a placement preview
 * reaches its renderer unstamped and would otherwise resolve `undefined` as a
 * preview key. This holds the shape, so the fallback is not "cleaned up" into a
 * bare read on the assumption that everything is stamped.
 */

function rendererSource(typeId: string): string | null {
    const name = `${typeId[0].toUpperCase()}${typeId.slice(1)}`;
    const path = join(process.cwd(), 'src', 'supports', 'SupportTypes', name, `${name}Renderer.tsx`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

for (const descriptor of SUPPORT_TYPES) {
    const source = rendererSource(descriptor.id);
    if (!source) continue;
    if (!source.includes('typeId')) continue;

    test(`${descriptor.id}'s renderer falls back to its own type id`, () => {
        // `<entity>.typeId ?? '<id>'` -- the literal is allowed here: this file
        // is the type's own folder, which is where naming it is permitted.
        const pattern = new RegExp(`typeId\\s*\\?\\?\\s*'${descriptor.id}'`);
        assert.match(
            source,
            pattern,
            `${descriptor.id}: renderer must fall back to its own type id for unstamped previews`,
        );
    });
}

test('builders do not stamp typeId, which is why the fallback exists', () => {
    // If a builder ever stamps, the fallback becomes dead and this should be
    // revisited rather than left as a second source of truth.
    const stampingBuilders: string[] = [];
    for (const descriptor of SUPPORT_TYPES) {
        const name = `${descriptor.id[0].toUpperCase()}${descriptor.id.slice(1)}`;
        const dir = join(process.cwd(), 'src', 'supports', 'SupportTypes', name);
        for (const file of [`build${name}.ts`, `${descriptor.id}Builder.ts`]) {
            const path = join(dir, file);
            if (!existsSync(path)) continue;
            if (/typeId\s*:/.test(readFileSync(path, 'utf8'))) stampingBuilders.push(file);
        }
    }
    assert.deepEqual(stampingBuilders, []);
});
