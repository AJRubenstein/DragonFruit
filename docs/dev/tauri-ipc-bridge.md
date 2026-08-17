# Tauri IPC and Native Bridge

The desktop app (Tauri) exposes ~80 native commands to the frontend. The **only**
TypeScript seam is `src/features/slicing/tauri/nativeSlicerBridge.ts` — it wraps
every command the web layer may call and centralizes the cross-language
conventions. Never `invoke` a command from a component; go through a named
wrapper here (or add one).

## How a command is wired

1. **Rust side** — declare `#[tauri::command] async fn cmd_name(args: SomeArgs) -> Result<T, String>`
   in `src-tauri/src/main.rs` (or a command module like `mesh_repair.rs`, `sdf.rs`,
   `network.rs`, `plugin_registry.rs`). Arguments are deserializable structs with
   `#[serde(rename_all = "camelCase")]` so TS keys map to snake_case fields.
   Register it in the single `tauri::generate_handler![…]` list (~`main.rs:4215`).
2. **TS side** — add a wrapper in `nativeSlicerBridge.ts`:

   ```ts
   export async function pickOpenFilesWithNativeDialog(
     category: NativeOpenDialogCategory,
     multiple = false,
     sceneExtensions?: string[],
   ): Promise<NativePickedOpenFile[]> {
     const core = await loadTauriCore();
     if (!core) throw new Error('…only available in DragonFruit Desktop (Tauri runtime).');
     return core.invoke<NativePickedOpenFile[]>('pick_open_files', {
       args: { category, multiple, ...(sceneExtensions !== undefined ? { sceneExtensions } : {}) },
     });
   }
   ```

   `loadTauriCore()` lazily imports `@tauri-apps/api/core` and gates on
   `__TAURI_INTERNALS__`, so the web build (no Tauri) can import the module
   safely and fail at call time with a clear message.

3. **Events** — long-running native work streams progress via Tauri events, e.g.
   `listen('slicer://progress', …)`. Wrappers that need progress expose a
   callback or a subscription rather than blocking on the invoke.

## Conventions to respect

- **camelCase in TS → snake_case in Rust.** `serde(rename_all = "camelCase")`
  on the args struct handles the field names; keep payloads flat.
- **Binary vs JSON.** Large binary payloads (mesh geometry, slice output) use a
  two-step staging protocol rather than a giant JSON argument. The bridge
  stages bytes (e.g. `x-mesh-stage-*` headers / chunk append commands) and then
  references them by path or id in the actual command.
- **Atomic writes.** File writes go through `scene_file_begin/commit/discard_atomic`
  so an interrupted save can't corrupt an existing file. Use these for any
  new write path, not `write_bytes_to_path` straight to a user file.
- **Single-flight write lock.** `runExclusiveNativeWrite` serializes process-wide
  writes. Two chunk sequences to different paths evict each other and re-truncate
  — writers must be single-flight.
- **Cancellation.** Long-running commands (slicing, SDF, A* pathfinding) support
  a cancel command (`cancel_slicing`, …). Always offer cancellation for anything
  that runs longer than a second.

## Dialog helpers

Native pickers are wrapped with explicit filter control:

- `pick_open_files` takes a `category` (`mesh`/`scene`/`bundle`). Scene dialogs
  accept an optional `sceneExtensions` override so gated file types (see
  `dev/experiments-framework.md`) are hidden from the filter.
- `pick_save_path` takes `defaultFilename` + `filters`.
- `local_backup_pick_directory` is a folder picker.

## Guardrails

- `npm run lint` / `tsc` catch TS wrapper drift.
- The `toNativeMetadataPayload` mapper is exported and covered by a crossing
  contract test — update the test when the metadata shape changes.
- `cargo check --manifest-path src-tauri/Cargo.toml` before touching the Rust side.

## Related pages

- `dev/experiments-framework.md` (dialog extension gating)
- `dev/backlog.md` (native twin optimization roadmap)
