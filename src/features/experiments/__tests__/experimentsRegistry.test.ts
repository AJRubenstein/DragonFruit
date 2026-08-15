import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeGatedPluginIds,
  EXPERIMENTS_MANIFEST,
  getEnabledExperimentIds,
  getExperimentDefinition,
  getExperimentDefinitions,
  isExperimentEnabled,
  type ExperimentDefinition,
} from '@/features/experiments/experimentsRegistry';
import { GENERATED_BUILTIN_COMPLEX_PLUGIN_ID_ALLOWLIST } from '@/features/plugins/generatedBuiltinComplexPlugins';
import { getBuiltinComplexPluginDefinitions } from '@/features/plugins/builtinComplexPlugins';

test('experiments.json manifest declares version 1 with a non-empty experiments array', () => {
  assert.equal(EXPERIMENTS_MANIFEST.version, 1);
  assert.ok(Array.isArray(EXPERIMENTS_MANIFEST.experiments));
  assert.ok(EXPERIMENTS_MANIFEST.experiments.length > 0, 'expected at least one declared experiment');
});

test('experiment definitions expose non-empty ids, names and descriptions with valid status', () => {
  const definitions = getExperimentDefinitions();
  const seen = new Set<string>();

  for (const definition of definitions) {
    assert.ok(definition.id.trim().length > 0, `experiment "${definition.id}" must have an id`);
    assert.ok(definition.name.trim().length > 0, `experiment "${definition.id}" must have a name`);
    assert.ok(definition.description.trim().length > 0, `experiment "${definition.id}" must have a description`);
    assert.ok(typeof definition.defaultEnabled === 'boolean', `experiment "${definition.id}" must declare defaultEnabled`);
    assert.ok(!seen.has(definition.id), `duplicate experiment id "${definition.id}"`);
    seen.add(definition.id);
  }
});

test('plugin definitions gated behind a disabled experiment are hidden from the getter', () => {
  // No window → isExperimentEnabled returns defaultEnabled (false for chitubox-import).
  const ids = getBuiltinComplexPluginDefinitions().map((definition) => definition.id);
  assert.ok(ids.includes('lys-import'), 'released plugins must stay visible');
  assert.ok(!ids.includes('chitubox-import'), 'gated plugin must be hidden while its experiment is off');
});

test('every gatedPlugins id references an allowlisted builtin complex plugin', () => {
  const allowlist = new Set(GENERATED_BUILTIN_COMPLEX_PLUGIN_ID_ALLOWLIST);

  for (const definition of getExperimentDefinitions()) {
    for (const pluginId of definition.gatedPlugins ?? []) {
      assert.ok(allowlist.has(pluginId), `experiment "${definition.id}" gates unknown plugin "${pluginId}"`);
    }
  }
});

test('chitubox-import experiment is off by default and resolves via getExperimentDefinition', () => {
  const definition = getExperimentDefinition('chitubox-import');
  assert.ok(definition, 'expected chitubox-import experiment to be declared');
  assert.equal(definition.defaultEnabled, false);
  assert.ok(definition.gatedPlugins?.includes('chitubox-import'));
  assert.equal(isExperimentEnabled('chitubox-import'), false, 'no window / no saved override -> defaultEnabled');
});

test('isExperimentEnabled returns false for unknown experiment ids', () => {
  assert.equal(isExperimentEnabled('does-not-exist'), false);
});

test('getEnabledExperimentIds reflects default-enabled experiments when no window', () => {
  const enabled = getEnabledExperimentIds();
  assert.ok(Array.isArray(enabled));
  // chitubox-import is off by default, so nothing is enabled without a window.
  assert.ok(!enabled.includes('chitubox-import'));
  for (const id of enabled) {
    assert.equal(isExperimentEnabled(id), true);
  }
});

test('computeGatedPluginIds collects gated plugins of disabled experiments only', () => {
  const experiments: ExperimentDefinition[] = [
    { id: 'alpha', name: 'Alpha', description: 'a', defaultEnabled: false, gatedPlugins: ['plugin-a', 'plugin-b'] },
    { id: 'beta', name: 'Beta', description: 'b', defaultEnabled: true, gatedPlugins: ['plugin-c'] },
    { id: 'gamma', name: 'Gamma', description: 'c', defaultEnabled: false },
  ];

  const disabledOnly = computeGatedPluginIds(experiments, (id) => id === 'beta');
  assert.deepEqual([...disabledOnly].sort(), ['plugin-a', 'plugin-b']);

  const allEnabled = computeGatedPluginIds(experiments, () => true);
  assert.equal(allEnabled.size, 0);
});
