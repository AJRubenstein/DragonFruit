import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The scene mounts placement controllers from a table rather than four named
 * imports. Nothing renders SceneCanvas in tests, so this reads the source: a
 * type added to the table but never mounted, or a controller file that stops
 * being referenced, would otherwise be silent.
 */

const TABLE = readFileSync(new URL('../placementControllers.ts', import.meta.url), 'utf8');
const SCENE = readFileSync(
    new URL('../../components/scene/SceneCanvas/SceneCanvas.tsx', import.meta.url),
    'utf8',
);

test('the table keys are declared support types', () => {
    const ids = new Set(SUPPORT_TYPES.map((d) => d.id));
    const keys = [...TABLE.matchAll(/^ {4}(\w+): \w+PlacementController,$/gm)].map((m) => m[1]);

    assert.ok(keys.length > 0, 'no controller entries found -- this test needs rewriting');
    for (const key of keys) {
        assert.ok(ids.has(key as never), `${key} is in the controller table but is not a support type`);
    }
});

test('every controller in the table is imported', () => {
    const keys = [...TABLE.matchAll(/^ {4}\w+: (\w+PlacementController),$/gm)].map((m) => m[1]);

    for (const component of keys) {
        assert.match(
            TABLE,
            new RegExp(`import \\{ ${component} \\} from`),
            `${component} is in the table but never imported`,
        );
    }
});

test('the scene mounts controllers from the table, not by name', () => {
    // The thing this replaced. A reintroduced direct mount would drift.
    assert.match(SCENE, /PLACEMENT_CONTROLLER_TYPES\.map/, 'the scene no longer mounts from the table');

    for (const component of ['BranchPlacementController', 'LeafPlacementController',
        'BracePlacementController', 'KickstandPlacementController']) {
        assert.ok(
            !SCENE.includes(`<${component}`),
            `${component} is mounted by name again; it should come from the table`,
        );
    }
});

test('trunk has no mounted controller', () => {
    // It declares hasPlacementPreview but places through the interaction
    // manager, so that flag cannot stand in for having a controller.
    assert.ok(
        !/^ {4}trunk:/m.test(TABLE),
        'trunk gained a controller entry -- check whether hasPlacementPreview now matches the table',
    );
});
