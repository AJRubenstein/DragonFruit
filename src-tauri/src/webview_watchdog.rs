//! Detects a dead web content process and offers to bring the window back.
//!
//! WebKit gives each content process a hard memory ceiling — 16 GB on macOS —
//! and kills it on the spot when it cannot shrink below it. The app process
//! survives, so the window stays open, empty and grey, with no error anywhere
//! the user can see. That is what a "DragonFruit just froze" report looks like
//! from the outside.
//!
//! The webview pings this module while it is alive. Silence means one of two
//! things — the process is gone, or the main thread is busy in a long
//! synchronous pass — and from here the two are indistinguishable. So the
//! grace period is deliberately long, and recovery is never automatic: a
//! reload would discard the user's scene, which is the wrong trade to make on
//! a guess. We ask instead, and a busy webview that catches up cancels the
//! whole thing by simply pinging again.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Silence after which the webview is presumed dead. Well above any plausible
/// main-thread stall — the island scan's synchronous passes used to hold the
/// thread for tens of seconds before they learned to yield.
const GRACE_PERIOD: Duration = Duration::from_secs(90);

/// How often the watchdog looks at the clock.
const POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct WebviewLiveness {
    /// Milliseconds since the epoch of the last ping; 0 before the first one.
    last_seen_ms: AtomicU64,
    /// Set once the user has been asked, so a dead webview prompts only once.
    prompted: AtomicBool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl WebviewLiveness {
    fn record_ping(&self) {
        self.last_seen_ms.store(now_ms(), Ordering::Relaxed);
        // A webview that speaks again was only busy, not dead. Re-arm so a
        // later death still prompts.
        self.prompted.store(false, Ordering::Relaxed);
    }

    /// Milliseconds of silence, or None before the first ping has ever arrived
    /// (startup, or a build with the frontend half missing — neither is a
    /// crash, and neither should raise a dialog).
    fn silence_ms(&self) -> Option<u64> {
        let last = self.last_seen_ms.load(Ordering::Relaxed);
        if last == 0 {
            return None;
        }
        Some(now_ms().saturating_sub(last))
    }
}

/// Called by the webview on a timer. Cheap by design: one atomic store.
#[tauri::command]
pub async fn webview_heartbeat(
    state: tauri::State<'_, WebviewLiveness>,
) -> Result<(), String> {
    state.record_ping();
    Ok(())
}

/// Starts the watchdog. Safe to call once, from `setup()`.
pub fn spawn(app: crate::DragonFruitAppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;

            use tauri::Manager;
            let Some(state) = app.try_state::<WebviewLiveness>() else {
                continue;
            };
            let Some(silence_ms) = state.silence_ms() else {
                continue;
            };
            if silence_ms < GRACE_PERIOD.as_millis() as u64 {
                continue;
            }
            // compare_exchange so a slow dialog cannot stack a second one.
            if state
                .prompted
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                continue;
            }

            log::error!(
                "[webview-watchdog] No heartbeat for {} s — the web content process is presumed dead. Offering a reload.",
                silence_ms / 1000
            );
            offer_reload(app.clone());
        }
    });
}

/// Asks, on the main thread, and reloads only if the user agrees.
fn offer_reload(app: crate::DragonFruitAppHandle) {
    let dialog_app = app.clone();
    let result = app.run_on_main_thread(move || {
        use tauri::Manager;

        let choice = rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Error)
            .set_title("DragonFruit stopped responding")
            .set_description(
                "The display process ran out of memory and was shut down by the system. \
                 Reloading restores the window, but unsaved changes to the scene are lost.\n\n\
                 Reload now?",
            )
            .set_buttons(rfd::MessageButtons::YesNo)
            .show();

        if choice != rfd::MessageDialogResult::Yes {
            log::info!("[webview-watchdog] Reload declined.");
            return;
        }

        let Some(window) = dialog_app.get_webview_window("main") else {
            log::error!("[webview-watchdog] No 'main' window to reload.");
            return;
        };
        match window.eval("window.location.reload()") {
            Ok(()) => log::info!("[webview-watchdog] Reload requested."),
            Err(error) => log::error!("[webview-watchdog] Reload failed: {error}"),
        }
    });

    if let Err(error) = result {
        log::error!("[webview-watchdog] Could not reach the main thread: {error}");
    }
}
