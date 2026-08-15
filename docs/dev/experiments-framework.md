# Experiments Framework

DragonFruit ships unfinished or early-access features behind an **Experiments**
gate. A feature gated behind a disabled experiment is hidden from the UI and
runtime behavior until the user opts in via **Settings → Experiments**.

The gate is general-purpose. It covers:

- **Regular in-app features** (e.g. a future native auto-support engine), which
  check `isExperimentEnabled(id)` at their own decision points.
- **Plugin-gated features** (e.g. the `chitubox-import` plugin), which declare
  their plugin ids in the manifest's `gatedPlugins` field and are filtered out
  of the plugin registries automatically.

## Declaring an experiment

Every experiment is declared in `src/config/experiments.json`, which is bundled
into the build at compile time. Fields:

| Field            | Type       | Description                                                    |
| ---------------- | ---------- | -------------------------------------------------------------- |
| `id`             | `string`   | Stable machine id that gating code references.                 |
| `name`           | `string`   | Human-readable name shown in the Settings tab.                 |
| `description`    | `string`   | What the feature does, including experimental caveats.         |
| `defaultEnabled` | `boolean`  | Whether the experiment starts enabled for new users. Usually `false`. |
| `gatedPlugins`   | `string[]` | Optional. Plugin ids hidden while this experiment is disabled. |

```json
{
  "version": 1,
  "experiments": [
    {
      "id": "chitubox-import",
      "name": "Chitubox File Import",
      "description": "Enable importing .chitubox project files. Lacks comprehensive testing and may not work with all files.",
      "defaultEnabled": false,
      "gatedPlugins": ["chitubox-import"]
    }
  ]
}
```

Adding an entry is all that is needed to surface a new experiment in the
Settings tab and the registry — the tab renders from the manifest, so no UI
change is required per experiment.

## Runtime registry

`src/features/experiments/experimentsRegistry.ts` is the runtime API. It is a
**leaf module**: it imports only the manifest JSON and browser APIs, so any
feature can depend on it without creating import cycles. Keep it that way —
never import from `@/features/plugins/...` or other features into it.

| Function                                            | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `getExperimentDefinitions()`                        | All declared experiments (frozen, validated).            |
| `getExperimentDefinition(id)`                       | A single experiment, or `undefined`.                     |
| `isExperimentEnabled(id)`                           | Whether the experiment is on (saved override, else `defaultEnabled`). |
| `setExperimentEnabled(id, enabled)`                 | Persist the user's toggle and notify subscribers.        |
| `subscribeToExperiments(listener)`                  | Subscribe to toggle changes; returns an unsubscribe fn.  |
| `getGatedPluginIdsForDisabledExperiments()`         | Plugin ids currently hidden by a disabled experiment.    |
| `isPluginGatedByDisabledExperiment(pluginId)`       | Whether a plugin is hidden by a disabled experiment.     |

User toggles persist to `localStorage` under `dragonfruit-experiments-enabled`.

## Gating a regular in-app feature

At the feature's decision point, check `isExperimentEnabled(id)` and
short-circuit when it returns `false`:

```ts
import { isExperimentEnabled } from '@/features/experiments/experimentsRegistry';

export function isNativeAutoSupportsAvailable(): boolean {
  return isExperimentEnabled('native-auto-supports');
}
```

## Gating a plugin

Declare the plugin id(s) in the experiment's `gatedPlugins`. The plugin registry
getters then filter them automatically:

- `getBuiltinComplexPluginDefinitions()` — `src/features/plugins/builtinComplexPlugins.ts`
- `getBuiltinComplexPluginFileTypeHandlers()` — `src/features/plugins/builtinComplexPluginFileTypeHandlers.ts`

Consumers must read through these getters, not the raw
`GENERATED_BUILTIN_COMPLEX_PLUGIN_DEFINITIONS` const, or the gate is bypassed.
The chitubox gate also hides `.chitubox` from the native open dialog: the
frontend passes `getNativeSceneDialogExtensions()` (from
`src/features/import-export/fileHandling.ts`) to the Rust `pick_open_files`
command, which uses that list for the "Scene Files" filter.

## Constraints

- **Reload semantics.** Gating is evaluated at module load / first render.
  Toggling an experiment requires a reload to take effect; the Settings tab
  says so.
- **Leaf registry.** `experimentsRegistry.ts` must stay a leaf module (no
  imports from the plugins feature or other features).
- **Read the manifest through the getters.** Module-level extension lists in
  `pluginFileTypeExtensions.ts` and `fileHandling.ts` derive from the filtered
  getter so they stay in lockstep with the gate.

## Settings UI

Settings → Experiments renders one card per experiment with an ON/OFF toggle.
Entering the tab first shows an ORA no-warranty / no-liability disclaimer modal
(rendered via a portal); the tab content is revealed only after the user
acknowledges.

## Verification

- `npm run test` — registry tests live at `src/features/experiments/__tests__/experimentsRegistry.test.ts`
- `npx tsc --noEmit`
- `cargo check --manifest-path src-tauri/Cargo.toml` — when touching the native dialog override

## Related pages

- `dev/plugins-framework.md`
