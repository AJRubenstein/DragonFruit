# Adding a New Support Type

The support system is **partly registry-driven**. `src/supports/supportTypeRegistry.ts`
now holds one descriptor per type and is the single source of truth for what a
type *is* — but it does not yet make a new type work on its own. Most of the
integration points below are still hand-written, so adding a type still means
threading it through them.

Read the split this way: **declaring** a type is registry work; **wiring** it is
still manual. Steps below are marked accordingly.

The existing types are `Trunk`, `Branch`, `Leaf`, `Twig`, `Stick`, `Brace`,
`Anchor`, `Kickstand`.

> **Scale check.** `state.ts` alone carries ~498 hand-written per-type references
> across 64 functions against 8 registry-derived call sites. The registry is real
> and load-bearing, but adoption is early — do not assume a step is automatic
> because the registry exists. Grep before you trust.

> ⚠️ **Do not convert hand-wired paths to the registry while adding your type.**
> Use the manual path each step describes, even where it is obviously ripe for
> conversion. Mixing the two puts a new feature and a behaviour-preserving
> refactor in one diff, which cannot be reviewed or bisected cleanly. Note what
> you hit, add the type, convert afterwards. See the registry entry in
> [Backlog](backlog.md).

Three reference shapes, by complexity:

- **Stick** — the floor: only `StickRenderer.tsx` + `stickBuilder.ts`, no
  placement UX (created as a cavity fallback inside trunk/branch placement).
- **Leaf** — the canonical *fully placeable* template: renderer + builder +
  placement-state store + page-level placement hook + canvas controller.
- **Kickstand** — the "owns its own barrel" template
  (`SupportTypes/Kickstand/index.ts`). Its entity interface now lives in the
  central `types.ts` like every other type, and `kickstandStore.ts` is a thin
  adapter over `SupportState` rather than a store of its own. Do **not** copy the
  adapter for a new type; declare yours centrally and read `SupportState`
  directly.

This page walks through adding a new type `Gadget` (avoid the existing names).
Every numbered step below is required unless marked *optional*.

## 1. Type definitions — `src/supports/types.ts` *(registry-driven)*

Each entity is its own interface extending `SupportEntity` (the base
`{ id, modelId, settingsCodeHex }`). `Knot` is the exception — it hangs off a
shaft and carries no `modelId`, so its model is derived from its host.

- Add the entity interface next to the other support entity interfaces in
  `src/supports/types.ts`. It must be **JSON-serializable** (it round-trips
  through save/load).
- Add one line to `SupportEntityByCollection`: `gadgets: Gadget;`. That is the
  only place a collection is named. `SupportCollectionName`, `SupportCollections`
  and `SupportState` are all derived from it — do **not** add a
  `Record<string, Gadget>` field to `SupportState` by hand, as older revisions of
  this page instructed.
- `DragonfruitImportFormat` (`src/supports/types.ts`): this is a **flat,
  non-discriminated** structure — one plain array per type. `roots`, `trunks`,
  `branches`, `leaves`, `braces`, `knots` are required; the others optional. Add
  `gadgets?: Gadget[]`.

## 1b. Registry descriptor — `src/supports/supportTypeRegistry.ts` *(registry-driven)*

Add `'gadget'` to `SupportTypeId` and one descriptor to `SUPPORT_TYPES`. This is
what makes every derived walk see the type. Beyond identity
(`id`, `label`, `location`, `selectionCategory`, `historyAdd`, `historyRemove`),
you must answer each behaviour flag — they have no defaults, and a test asserts
every descriptor declares all of them:

| Flag | Ask |
| ---- | --- |
| `carriesModelId` | Do instances own a `modelId`? |
| `hasSegments` | Do instances have real shafts? |
| `contactFields` | Which contact primitive fields, in order? |
| `segmentsCarryBothJoints` | Does each segment carry both its joints, or do endpoints come from a root / parent knot / neighbour? |
| `hasDedicatedSnapPass` | Does the type get its own snap loop in `supportPathTargets.ts`? |
| `hasContactDiskLengthOverride` | Does a joint drag strip `diskLengthOverride` from its contact cone? |
| `ownsEditHistoryEntry` | Does its gizmo record its own before/after entry? |
| `ownsRoot` | Do instances own a `Roots` entry via `rootId`? |

⚠️ `ownsRoot` is not optional bookkeeping: roots no entity claims get culled every
render, so a type that owns roots and forgets this flag has them deleted out from
under it.

If the store must call back into your type, register a slot rather than importing
`state.ts` from the registry (that would be an initialisation cycle):
`registerSupportUpdater` for the update function, `registerKnotDiameterRule` if
knots on your shaft are sized specially (twigs taper, so they do).

## 2. The per-type directory — `src/supports/SupportTypes/Gadget/` *(hand-wired)*

The required piece is the renderer. Everything else is optional depending on
whether the type is user-placeable.

- `GadgetRenderer.tsx` — `React.memo` component typed against the entity. The
  renderer pulls live drag-preview geometry via `usePartDragUpdate<Gadget>('gadget', id)`,
  resolves hover via `useHighlight(...)`, and commits edits via
  `captureSupportEditSnapshot()` / `pushSupportEditHistory()` (see the Stick
  renderer).
- *Placeable only*: `gadgetBuilder.ts` (geometry/state builder), a
  placement-state store, a `useGadgetPlacement` hook, and a
  `GadgetPlacementController` mounted in `SceneCanvas.tsx`.
- `index.ts` barrels are **optional** — only Anchor and Kickstand have one.

## 3. Rendering — `src/supports/SupportRenderer.tsx` *(hand-wired)*

There is no switch — `SupportRenderer.tsx` hand-wires one block per type:

1. Import the renderer.
2. Add a `renderGadgetList` memo (pattern `renderStickList`) and a
   `selectedGadgetIds` memo.
3. *Optional*: add a scene-batched shaft map (`stickShaftsBySupport` pattern) so
   unselected straight shafts render via `InstancedShaftGroup`.
4. Add the JSX block rendering `<GadgetRenderer .../>` (plus the batched-group
   block if step 3).
5. *Optional*: add the type to the render-lookup worker for primitive picking.
   Anchors skip the worker entirely (handled by a fallback loop), so it's not
   required for selectability.

## 4. History — `src/supports/history/` *(hand-wired)*

1. `actionTypes.ts` — add a `SUPPORT_ADD_GADGET` / `SUPPORT_REMOVE_GADGET`
   constant pair, a `SupportGadgetPayload { gadget }` interface, and two entries
   in `SupportHistoryPayloadMap`. The map type-checks every push and handler;
   `SupportHistoryActionType` derives from it.
2. `useSupportHistoryHandlers.ts` — registration is **all-in-one**: the single
   `registerSupportHistoryHandlers()` registers every type in one array. Add
   add/remove entries (pattern `SUPPORT_ADD_STICK` / `SUPPORT_REMOVE_STICK`),
   inverting each other: undo of add → `removeGadget`, undo of remove →
   `addGadget`. The hook is bound at the app root (`app/page.tsx`).

Drag/edit undo does **not** need per-type handlers — renderer-initiated edits
ride `SUPPORT_EDIT_REPLACE` with whole-`SupportState` snapshots
(`history/supportEditHistory.ts`), which is fully generic.

## 5. Store and serialization — `src/supports/state.ts` *(mostly hand-wired)*

This is the heaviest step and the least converted: ~498 hand-written per-type
references across 64 functions. Expect to touch most of the list below.

- `initialState` — **nothing to do.** It spreads
  `createEmptySupportCollections()`, which derives from the registry.
- CRUD — `addGadget`, `updateGadget`, `removeGadget` (return a deep-cloned
  snapshot for undo, pattern `removeStick`).
- `SelectionCategory` union + `getSelectionLookupCache` + `resolveSelectionCategory`
  — add gadget segments/joints/contactDisks and the `state.gadgets[id]` branch.
- `loadFromImportFormat` / `mergeFromImportFormat` — populate `gadgets` guarded
  like the optional arrays.
- `isolateImportedSupportPayload` — remap primitive ids inside the entity so
  imported payloads don't collide.
- `transformSupportsForModel` / `setSnapshot` — walk gadgets if they must move
  with a model transform.

## 6. Export — `src/features/export/logic/supportExportReconstruction.ts` *(hand-wired)*

- Include gadgets in `extractScopedSupportPayload`.
- Add `gadgets` to `buildScopedSupportExportDocument`'s returned format.
- Add a `buildGadgetGroup(...)` and append it in `buildScopedSupportGeometryGroup`.

## 7. Interaction — only for user-placeable types *(hand-wired)*

`src/features/supports/useSupportInteractionManager.ts` has **no tool registry** —
wiring is explicit:

- Invoke `useGadgetPlacement()` alongside the other placement hooks and route
  its callbacks through `resolvePlacementRouting()`.
- Add the category to `resolveSupportCategoryFromSnapshot`, `collectAllSupportIds`,
  `deleteSelectionByCategoryAndId`, **and `canDeleteSelection`**. ⚠️ Still true as
  of this revision: `canDeleteSelection` enumerates seven categories and omits
  `anchor`, so anchors are deletable but the gate blocks single-selection Delete.
  Add your category to both places.

  This is the textbook case for the registry: an enumerated list of type names in
  a conditional, where forgetting one is silent. It wants a declared descriptor
  flag rather than a ninth `||` — but **not in your diff**. Add the `||`, note the
  line, convert it separately.
- Mount `<GadgetPlacementController />` in `SceneCanvas.tsx` under `mode === 'support'`,
  and add a `SUPPORTS` hotkey binding + resolver entry if it's hotkey-triggered.

## Optional integrations (only if the feature is wanted)

- **Proxy picking** (`SupportProxyMeshLayer.tsx`) — cached refs + per-type reads
  for raycast selection in prepare mode.
- **Model-link cascade** (`SupportModelLinker.tsx`) — if gadgets should be removed
  when their model is deleted, add to the collections tuple and removal logic.
- **Home snapshot caching** (`supportSnapshotHelpers.ts`) — add `'gadgets'` to
  `HomeSupportCollectionsSnapshot` if home-scene caching should include it.
- **Settings cards / anatomy preview** — only for types that need a settings UI.

## Minimal checklist (bare, render-only Gadget)

1. `types.ts` — entity interface, one line in `SupportEntityByCollection`, format field
2. `supportTypeRegistry.ts` — `SupportTypeId` + descriptor with all eight behaviour flags
3. `SupportTypes/Gadget/GadgetRenderer.tsx` (+ `gadgetBuilder.ts` if it has geometry)
4. `SupportRenderer.tsx` — import, render list, selected set, JSX block
5. `state.ts` — add/update/remove, SelectionCategory, lookup cache, import/merge/isolate
   (**not** `initialState` — that derives from the registry)
6. `actionTypes.ts` + `useSupportHistoryHandlers.ts` — add/remove handlers
7. `useSupportInteractionManager.ts` — category resolution, delete path, can-delete
8. `supportExportReconstruction.ts` — scoped payload, export document, geometry group

After wiring, run the registry tests — they fail loudly on a half-declared type:

```
node --import tsx --test "src/supports/__tests__/*.test.ts"
```

`registryIsSingleSourceOfTruth.test.ts` and `registryBehaviourFlags.test.ts` check
that every collection is covered and every flag declared. On Windows use the
double-quoted glob above; `npm test` single-quotes it and matches nothing under
cmd.exe.

## Related pages

- `dev/support-system.md`
- `dev/history-and-undo-redo.md`
