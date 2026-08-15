//! Runtime mirror of the frontend's Experiments state.
//!
//! The frontend owns the source of truth for experiment enablement (webview
//! `localStorage`) and pushes the set of enabled ids here via
//! `set_experiments_enabled`. Gated Rust commands can then enforce an
//! experiment gate themselves (defense in depth) with `is_experiment_enabled`,
//! rather than relying solely on the frontend choosing not to call them.
//!
//! See `docs/dev/experiments-framework.md` ("Gating Rust code").

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::State;

/// The set of experiment ids currently enabled in the frontend.
#[derive(Default)]
pub struct ExperimentsState(Mutex<HashSet<String>>);

/// Replaces the enabled-experiment set. Called by the frontend on startup and
/// whenever the user toggles an experiment (see
/// `src/features/experiments/syncExperimentsToNative.ts`).
#[tauri::command]
pub fn set_experiments_enabled(state: State<'_, ExperimentsState>, enabled: Vec<String>) {
    set_enabled(&state, enabled);
}

fn set_enabled(state: &ExperimentsState, enabled: Vec<String>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = enabled.into_iter().collect();
    }
}

/// Returns true when the given experiment id is enabled. Gated commands call
/// this at the top and return an error when it is false.
///
/// Currently unused by built-in commands (the chitubox gate is enforced in the
/// frontend), but it is the public seam a future gated Rust command reaches for.
#[allow(dead_code)]
pub fn is_experiment_enabled(state: &ExperimentsState, id: &str) -> bool {
    state
        .0
        .lock()
        .map(|guard| guard.contains(id))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_no_enabled_experiments() {
        let state = ExperimentsState::default();
        assert!(!is_experiment_enabled(&state, "chitubox-import"));
    }

    #[test]
    fn reflects_synced_enabled_ids() {
        let state = ExperimentsState::default();
        set_enabled(
            &state,
            vec!["alpha".to_string(), "chitubox-import".to_string()],
        );
        assert!(is_experiment_enabled(&state, "chitubox-import"));
        assert!(is_experiment_enabled(&state, "alpha"));
        assert!(!is_experiment_enabled(&state, "beta"));
    }

    #[test]
    fn replacing_clears_previous_ids() {
        let state = ExperimentsState::default();
        set_enabled(&state, vec!["alpha".to_string()]);
        set_enabled(&state, vec!["beta".to_string()]);
        assert!(!is_experiment_enabled(&state, "alpha"));
        assert!(is_experiment_enabled(&state, "beta"));
    }
}
