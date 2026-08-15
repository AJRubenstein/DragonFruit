# Registration Seams

Several subsystems expose a "register something, then the host dispatches to it"
pattern. The shape is consistent across all of them:

- A `registerX(...)` function that adds a claim/handler to a module-level registry
  and returns an **unregister closure**.
- The host picks what to invoke at dispatch time, usually by a predicate and/or
  priority.
- Consumers never import each other — they just register against the seam.

This page documents the non-history seams. Undo/redo registration is covered in
`dev/history-and-undo-redo.md`; plugin registration is covered by the plugin docs.

## Delete registry

`src/features/delete/deleteRegistry.ts` is a priority-ordered claim registry for
"what does Delete do right now". Each claim provides a predicate and an action.

```ts
export type DeleteHandler = () => void;

interface DeleteRegistryEntry {
  getCanDelete: () => boolean;
  performDelete: DeleteHandler;
  priority: number;
}

export function registerDeleteHandler(
  getCanDelete: () => boolean,
  performDelete: DeleteHandler,
  priority = 0,
): () => void;

export function getActiveDeleteHandler(): DeleteHandler | null;
export function triggerDelete(): boolean;   // runs the highest-priority enabled claim
```

`useDeleteHotkey` (`src/features/delete/useDeleteHotkey.ts`) bridges the
configurable `GLOBAL.DELETE` binding (default Backspace) and the fixed `Delete`
key to `triggerDelete()`. Priority wins over registration order. Examples:

- Cut tool seam: `ORGANIC_CUT_DELETE_PRIORITY = 200` (`useOrganicCutHotkeys.ts`)
  so Delete edits the cut seam instead of deleting the model.
- Delete selected models in prepare mode: priority `30`.
- "Select all models" deletion: priority `20`.
- Dispose a blob URL in the scene manager: priority `10`.

Delete is deliberately **not** history-tied: every Cut edit is pushed to the app
history, so the normal global undo/redo inverts it.

## Mesh geometry store

`src/supports/autoBracing/meshGeometryStore.ts` is a module-level `Map` of
modelId → `THREE` geometry/transform used by auto-brace clearance. The scene
manager registers/unregisters a model's geometry as it is loaded/unloaded:

```ts
registerMeshForAutoBrace(modelId, geometry, transform);
unregisterMeshForAutoBrace(modelId);
```

Same seam shape: registration is keyed, unregistration is a `Map.delete`, and
consumers read the store by id without importing the registering module.

## Writing a new seam

Follow the existing shape so it reads like the rest of the codebase:

- Keep the registry module-level and dependency-free (a `Set`/`Map` of entries).
- `registerX` takes the claim plus an optional priority and returns an unregister
  closure that removes exactly its own entry.
- Dispatch selects at call time (highest priority whose predicate is true, or a
  per-key lookup) — never at registration time.
- Prefer returning a plain `() => void` unregister (not a fancy token) so callers
  can hold it in a `useEffect` cleanup or a returned disposer.

## Related pages

- `dev/history-and-undo-redo.md`
- `dev/plugins-framework.md`
