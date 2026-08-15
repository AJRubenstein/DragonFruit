import experimentsJson from '@/config/experiments.json';

/**
 * Compile-time Experiments registry.
 *
 * Declares every experiment from `src/config/experiments.json` and tracks the
 * user's per-experiment enable state in localStorage, mirroring the
 * `*Preferences.ts` persistence pattern (storage key + cached raw-string read +
 * CustomEvent dispatch + subscribe returns unsubscribe).
 *
 * This module is intentionally a leaf: it imports only the manifest JSON and
 * browser APIs, so any feature — plugin registries, scene managers, panels —
 * can depend on it without creating cycles. Non-plugin features gate themselves
 * directly with `isExperimentEnabled(id)`; plugin-gated experiments list their
 * plugins in the manifest's `gatedPlugins` field.
 */

export type ExperimentDefinition = {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  /** Plugin ids hidden while this experiment is disabled. */
  gatedPlugins?: string[];
};

export type ExperimentsManifestFile = {
  version: number;
  experiments: ExperimentDefinition[];
};

export const EXPERIMENTS_ENABLED_STORAGE_KEY = 'dragonfruit-experiments-enabled';
export const EXPERIMENTS_CHANGED_EVENT = 'dragonfruit-experiments-changed';

function assertValidExperimentsManifest(input: unknown): asserts input is ExperimentsManifestFile {
  if (!input || typeof input !== 'object') {
    throw new Error('[Experiments] experiments.json must be an object.');
  }
  const manifest = input as Record<string, unknown>;
  if (manifest.version !== 1) {
    throw new Error(`[Experiments] Unsupported experiments.json version: ${String(manifest.version)}`);
  }
  if (!Array.isArray(manifest.experiments)) {
    throw new Error('[Experiments] experiments.json must declare an "experiments" array.');
  }
  const seen = new Set<string>();
  for (const entry of manifest.experiments) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('[Experiments] Each experiment must be an object.');
    }
    const experiment = entry as Record<string, unknown>;
    if (typeof experiment.id !== 'string' || !experiment.id.trim()) {
      throw new Error('[Experiments] Experiment missing a non-empty "id".');
    }
    if (seen.has(experiment.id)) {
      throw new Error(`[Experiments] Duplicate experiment id: "${experiment.id}".`);
    }
    seen.add(experiment.id);
    if (typeof experiment.name !== 'string' || !experiment.name.trim()) {
      throw new Error(`[Experiments] Experiment "${experiment.id}" is missing a non-empty "name".`);
    }
    if (typeof experiment.description !== 'string' || !experiment.description.trim()) {
      throw new Error(`[Experiments] Experiment "${experiment.id}" is missing a non-empty "description".`);
    }
    if (typeof experiment.defaultEnabled !== 'boolean') {
      throw new Error(`[Experiments] Experiment "${experiment.id}" is missing a boolean "defaultEnabled".`);
    }
    if (experiment.gatedPlugins !== undefined) {
      if (!Array.isArray(experiment.gatedPlugins)) {
        throw new Error(`[Experiments] Experiment "${experiment.id}" "gatedPlugins" must be an array.`);
      }
      for (const pluginId of experiment.gatedPlugins) {
        if (typeof pluginId !== 'string' || !pluginId.trim()) {
          throw new Error(`[Experiments] Experiment "${experiment.id}" has an invalid "gatedPlugins" entry.`);
        }
      }
    }
  }
}

const rawManifest = experimentsJson as unknown as ExperimentsManifestFile;
assertValidExperimentsManifest(rawManifest);

export const EXPERIMENTS_MANIFEST: ExperimentsManifestFile = rawManifest;

export const EXPERIMENT_DEFINITIONS: readonly ExperimentDefinition[] = Object.freeze(
  rawManifest.experiments.map((experiment) => Object.freeze({ ...experiment })),
);

export function getExperimentDefinitions(): readonly ExperimentDefinition[] {
  return EXPERIMENT_DEFINITIONS;
}

export function getExperimentDefinition(id: string): ExperimentDefinition | undefined {
  return EXPERIMENT_DEFINITIONS.find((definition) => definition.id === id);
}

/** Ids of all experiments currently enabled (saved override or default). */
export function getEnabledExperimentIds(): string[] {
  return EXPERIMENT_DEFINITIONS.filter((definition) => isExperimentEnabled(definition.id))
    .map((definition) => definition.id);
}

let cachedEnabledRaw: string | null | undefined;
let cachedEnabledRecord: Record<string, boolean> | null = null;

function readEnabledRecord(): Record<string, boolean> | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(EXPERIMENTS_ENABLED_STORAGE_KEY);
  } catch {
    return {};
  }

  if (cachedEnabledRaw === raw) {
    return cachedEnabledRecord;
  }

  if (!raw) {
    cachedEnabledRaw = null;
    cachedEnabledRecord = {};
    return cachedEnabledRecord;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const record: Record<string, boolean> = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'boolean') {
          record[key] = value;
        }
      }
    }
    cachedEnabledRaw = raw;
    cachedEnabledRecord = record;
    return record;
  } catch {
    cachedEnabledRaw = raw;
    cachedEnabledRecord = {};
    return cachedEnabledRecord;
  }
}

export function isExperimentEnabled(id: string): boolean {
  const definition = getExperimentDefinition(id);
  if (!definition) return false;

  const record = readEnabledRecord();
  if (record && id in record) {
    return record[id];
  }
  return definition.defaultEnabled;
}

export function setExperimentEnabled(id: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (!getExperimentDefinition(id)) return;

  const record = { ...(readEnabledRecord() ?? {}) };
  record[id] = enabled;
  const serialized = JSON.stringify(record);
  cachedEnabledRaw = serialized;
  cachedEnabledRecord = record;

  try {
    window.localStorage.setItem(EXPERIMENTS_ENABLED_STORAGE_KEY, serialized);
  } catch {
    // ignore storage failures
  }

  window.dispatchEvent(new CustomEvent(EXPERIMENTS_CHANGED_EVENT, { detail: { id, enabled } }));
}

export function subscribeToExperiments(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== EXPERIMENTS_ENABLED_STORAGE_KEY) return;
    cachedEnabledRaw = undefined;
    listener();
  };

  const onCustom = () => {
    cachedEnabledRaw = undefined;
    listener();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(EXPERIMENTS_CHANGED_EVENT, onCustom as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EXPERIMENTS_CHANGED_EVENT, onCustom as EventListener);
  };
}

/**
 * Pure helper (no `window`) mapping experiments to the plugin ids currently
 * hidden because their gating experiment is disabled.
 */
export function computeGatedPluginIds(
  experiments: readonly ExperimentDefinition[],
  isEnabled: (id: string) => boolean,
): Set<string> {
  const gated = new Set<string>();
  for (const experiment of experiments) {
    if (!experiment.gatedPlugins || experiment.gatedPlugins.length === 0) continue;
    if (isEnabled(experiment.id)) continue;
    for (const pluginId of experiment.gatedPlugins) {
      gated.add(pluginId);
    }
  }
  return gated;
}

export function getGatedPluginIdsForDisabledExperiments(): Set<string> {
  return computeGatedPluginIds(EXPERIMENT_DEFINITIONS, isExperimentEnabled);
}

export function isPluginGatedByDisabledExperiment(pluginId: string): boolean {
  return getGatedPluginIdsForDisabledExperiments().has(pluginId);
}
