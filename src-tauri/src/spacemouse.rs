//! Phase 0 spike: 3DxWare navlib discovery + load probe.
//!
//! Goal: confirm the 3Dconnexion Navigation Library (navlib) can be located and
//! dynamically loaded on Windows and macOS, and that we degrade gracefully when
//! the 3DxWare driver is NOT installed (→ the frontend falls back to the
//! Gamepad-API path on those platforms, same as Linux/browser).
//!
//! This module intentionally does NOT yet call NlCreate or register accessors —
//! that is Phase 0b and requires the exact `navlib.h` ABI from the 3DxWare SDK.
//! Here we only: (1) find the library, (2) LoadLibrary/dlopen it, (3) probe that
//! the expected entry-point symbols resolve. We never *call* a resolved symbol.

use serde::Serialize;

/// Result of probing for the navlib runtime. Surfaced to the frontend so it can
/// choose native-vs-Gamepad routing, and so we can eyeball it during the spike.
#[derive(Debug, Clone, Serialize, Default)]
pub struct NavlibProbe {
    /// True only if a library loaded AND the core entry point (`NlCreate`) resolved.
    pub available: bool,
    /// The path/name we successfully loaded, if any.
    pub loaded_from: Option<String>,
    /// Entry-point symbols probed, and whether each resolved.
    pub symbols: Vec<SymbolProbe>,
    /// Candidates tried / failure reasons — spike diagnostics.
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SymbolProbe {
    pub name: String,
    pub resolved: bool,
}

/// Canonical navlib C entry points we expect. Names are best-known and are part
/// of what this spike VERIFIES against a real installed driver — if a name is
/// wrong it simply shows `resolved: false`, which is the signal to correct it
/// from `navlib.h` before 0b.
#[cfg(any(target_os = "windows", target_os = "macos"))]
const ENTRY_POINTS: &[&str] = &["NlCreate", "NlClose", "NlReadValue", "NlWriteValue"];

#[cfg(target_os = "macos")]
fn candidate_libraries() -> Vec<String> {
    // 3DxWare 10 for macOS installs the framework under /Library/Frameworks.
    vec![
        "/Library/Frameworks/3DconnexionNavLib.framework/3DconnexionNavLib".to_string(),
        "/Library/Frameworks/3DconnexionNavLib.framework/Versions/Current/3DconnexionNavLib"
            .to_string(),
    ]
}

#[cfg(target_os = "windows")]
fn candidate_libraries() -> Vec<String> {
    // Bare name first: the loader searches PATH + system dirs, and the 3DxWare
    // installer typically adds its dir to PATH. Absolute paths are fallbacks for
    // default install locations. NOTE: exact DLL name/dir is one of the unknowns
    // this spike confirms — adjust from the installed driver if these miss.
    let mut v = vec!["TDxNavLib.dll".to_string()];
    if let Ok(pf) = std::env::var("ProgramFiles") {
        v.push(format!(r"{pf}\3Dconnexion\3DxWare\3DxWinCore\Win64\TDxNavLib.dll"));
        v.push(format!(r"{pf}\3Dconnexion\3DxWare\3DxWinCore64\TDxNavLib.dll"));
    }
    v
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn probe() -> NavlibProbe {
    let mut out = NavlibProbe::default();

    for cand in candidate_libraries() {
        // Safety: loading a shared library runs its initializers. navlib is a
        // vendor driver lib and safe to load; we resolve-but-never-call symbols.
        match unsafe { libloading::Library::new(&cand) } {
            Ok(lib) => {
                let symbols: Vec<SymbolProbe> = ENTRY_POINTS
                    .iter()
                    .map(|name| {
                        let mut sym = name.as_bytes().to_vec();
                        sym.push(0); // libloading wants a NUL-terminated name
                        // Safety: we only take the pointer; type is a placeholder.
                        let resolved =
                            unsafe { lib.get::<unsafe extern "C" fn()>(&sym).is_ok() };
                        SymbolProbe { name: (*name).to_string(), resolved }
                    })
                    .collect();

                let core_ok = symbols.iter().any(|s| s.name == "NlCreate" && s.resolved);
                out.notes.push(format!("loaded: {cand}"));
                out.loaded_from = Some(cand);
                out.available = core_ok;
                out.symbols = symbols;
                return out;
            }
            Err(e) => out.notes.push(format!("load failed [{cand}]: {e}")),
        }
    }

    out.notes
        .push("navlib not found — frontend should use the Gamepad-API fallback".into());
    out
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn probe() -> NavlibProbe {
    NavlibProbe {
        available: false,
        notes: vec![
            "navlib is only supported on Windows/macOS; using Gamepad-API path".into(),
        ],
        ..Default::default()
    }
}

/// Frontend probe hook. Cheap, side-effect-free — safe to call on startup.
#[tauri::command]
pub fn spacemouse_native_probe() -> NavlibProbe {
    let result = probe();
    log::info!("[spacemouse] navlib probe: {result:?}");
    result
}
