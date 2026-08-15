import {
  getEnabledExperimentIds,
  subscribeToExperiments,
} from '@/features/experiments/experimentsRegistry';

/**
 * Mirrors the frontend's enabled-experiment set into the Tauri backend so gated
 * Rust commands can enforce the gate themselves (see `docs/dev/experiments-framework.md`,
 * "Gating Rust code"). The frontend owns the source of truth (localStorage) and
 * pushes it here; Rust stores it in `ExperimentsState` via the
 * `set_experiments_enabled` command.
 *
 * Desktop-only — a no-op in the plain web build (no `__TAURI_INTERNALS__`).
 */

type TauriCoreModule = typeof import('@tauri-apps/api/core');

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let tauriCorePromise: Promise<TauriCoreModule | null> | null = null;

async function loadTauriCore(): Promise<TauriCoreModule | null> {
  if (!isTauriRuntime()) return null;
  if (!tauriCorePromise) {
    tauriCorePromise = import('@tauri-apps/api/core').catch(() => null);
  }
  return tauriCorePromise;
}

async function pushEnabledExperimentsToNative(): Promise<void> {
  const core = await loadTauriCore();
  if (!core) return;
  try {
    await core.invoke('set_experiments_enabled', { enabled: getEnabledExperimentIds() });
  } catch (error) {
    console.warn('[ExperimentsNativeSync] Failed to sync experiments to native:', error);
  }
}

/**
 * Pushes the enabled-experiment set on startup and re-pushes whenever an
 * experiment is toggled. Returns an unsubscribe function (no-op off-desktop).
 */
export function syncExperimentsToNative(): () => void {
  if (!isTauriRuntime()) return () => {};
  void pushEnabledExperimentsToNative();
  return subscribeToExperiments(() => {
    void pushEnabledExperimentsToNative();
  });
}
