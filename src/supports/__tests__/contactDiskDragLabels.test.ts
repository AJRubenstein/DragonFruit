import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The history label a tip drag pushes, derived from the registry.
 *
 * Six renderers wrote `Move <type> tip` out by hand. The shared session builds
 * it from `singular`, so this holds that the two agree.
 */

test('every hand-written tip-drag label matches the registry singular', () => {
    const derived = new Set(SUPPORT_TYPES.map((d) => `Move ${d.singular} tip`));

    const files = globSync('src/supports/**/*.{ts,tsx}');
    const found = new Set<string>();

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/pushSupportEditHistory\('(Move \w+ tip)'/g)) {
            found.add(match[1]);
        }
    }

    for (const label of found) {
        assert.ok(derived.has(label), `"${label}" is not derivable from any type's singular`);
    }
});
