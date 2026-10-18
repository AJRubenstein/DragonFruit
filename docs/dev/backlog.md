# Backlog and Known Gotchas

A home for temporary rules, tradeoffs, gotchas, and desired architectural
directions that `AGENTS.md` references tersely. When `AGENTS.md` points here,
this page is the fleshed-out explanation. Add entries here when a rule is too
long for `AGENTS.md`, is expected to be lifted once an upstream change lands,
or is a known refactor we intend to do.

## Known cost: support batches are one mesh per geometry-parameter set

The support proxy batches group their instances into a mesh per **distinct
geometry parameter set**, quantized to 0.001 mm. For a scene whose support
dimensions vary continuously that degenerates into roughly one mesh per support,
and the frame pays for it in `projectObject` / `setProgram` /
`renderBufferDirect`, not in triangles.

Measured on `randombits-skeletuns (1)_DF_Scene.voxl` (17 models, 6.0M
triangles, 6482 shafts, 3260 joints, 1885 contact cones, 1109 roots), with the
app instrumented at the WebGL level:

| | value |
| --- | --- |
| draw calls per frame | **3282**, of which 3214 instanced |
| instanced meshes from the buckets | ~2600 |
| contact cones | 1885 instances -> **842 buckets** |
| roots / joints / shafts | 10 / 30 buckets / one mesh |
| frame rate | 53 fps, median frame 18.2 ms |

The cone key is
`profileType : contactRadius : bodyRadius : length : diskThickness : penetration`,
each at 0.001 mm — and **`penetration` varies continuously with the model
surface**, so almost every cone is its own bucket. Each bucket renders up to
three meshes (disk, body, tip) plus an overlay.

Coarsening the quantization is not enough: 0.05 mm still leaves 1035 meshes and
0.1 mm leaves 791, because the parameters genuinely differ. The direction is to
put the varying dimensions in the **instance matrix** (a unit cone scaled per
instance) so the cone batch is one mesh again. The caveat to solve with it is
the cone profile's slanted side normals: a non-uniform instance scale skews
them, since three has no per-instance normal matrix. A disk profile is a flat
disc whose normals are axial and unaffected; a cone profile is a 1-3 mm tip, so
the error may be acceptable, or the batch needs an inverse-scale normal in a
custom attribute.

For contrast, the same measurement on a plate of 18 poussin models (3.1M
triangles, one support profile each) is a handful of buckets and holds 165 fps —
which is what the scene above should reach.

**Fixed** by putting the dimensions in the instance matrix: the cone batch is
keyed on the tip's shape ratio alone, the primitives are unit-sized, and the
matrix carries the scale. three corrects instance normals for a non-uniform
scale (`defaultnormal_vertex`, "in lieu of a per-instance normal-matrix"), so the
frustum body shades correctly at any ratio. Measured on the same scene: **3282 ->
291 draw calls per frame, 53 -> 163 fps**, median frame 18.2 -> 6.1 ms.

## Known cost: a model selection rebuilt the raft

Selecting a model took 19 seconds on that scene, and the whole of it was the
crenellated raft's footprint clustering: 1109 roots, every pair asked whether the
segment between them clears the model, answered against every edge of the models'
plate footprint.

Two fixes, both measured on the same scene:

| | selection cost |
| --- | --- |
| as found | 18,861 ms (`segmentDistanceMm` 73%) |
| edges in a grid (`buildClearanceEdgeGrid`) | 937 ms |
| containment hoisted out of the pair loop | 685 ms |
| clearance no longer follows the live transform | **295 ms, all React** |

The last one is the interesting one. `plateClearanceTargets` substituted the
active model's *live* transform, which made it depend on `activeModelId`; the live
transform is also a frame behind a selection, so choosing a model rebuilt the
array twice — once with the previous model's transform — and with it the clearance,
every raft mesh and the clustering behind them. The clearance is where the models
stand, not where a gizmo drags them, so it now takes the stored transforms and the
outline display keeps its own live-transform targets.

Was: `bakedAoVersion` rode on the `models` entries, so each of the AO bakes that
run after a load replaced the `models` array and invalidated the clearance and the
raft with it — 17 rebuilds in the fifteen seconds after a load. It is a
per-geometry counter in `src/features/scene/bakedOcclusion.ts` now, subscribed to
by `StlMesh`; render-only state read by one component does not belong in the
scene array.

**And the last one, found by measuring the production build rather than the dev
server.** The clearance is keyed on the array of visible models, and a re-render
of a parent hands `RaftProxyMeshLayer` a *fresh array of the same models*, so
every selection rebuilt the plate footprint — Clipper offsets over all 17 models,
128-232 ms of blocking long tasks on a click. The dev server's element churn hid
it behind `jsxDEV`. `clearanceFor` caches the clearance at module level, keyed on
the *elements* (each model's own geometry and transform objects, which survive a
new array) rather than on the array, which also covers a remount.

Measured after: no long task on a selection change, worst frame 24-42 ms, and a
steady 165 fps with a 6.2 ms worst frame. Two lessons that generalise: an identity
key on a *container* is not the same as a key on its *contents*, and a dev-server
profile cannot tell you what a production build will do.

## Known cost: the out-of-bounds test walked every vertex, every drag frame

A model's world bounds come from its transform, and the precise path -
`computePreciseModelWorldBounds` in `src/utils/modelBounds.ts`, taken whenever a
model sits off the axes - walks every vertex to find the box. Its cache was keyed
on the *whole* transform, position included, so a drag produced a fresh key on
every frame and paid the walk again with it. Small models hid it; a complex one
paid it as a per-frame stall. The out-of-bounds indication reads those bounds
every frame of a gesture, which is how it surfaced.

Measured on a 750k-vertex mesh: **one walk 5.3 ms, so 5.8 ms per drag frame** -
over a third of a 16.7 ms budget, which is what "dragging a complex model is
sluggish" turned out to be. The same measurement after the fix is 0.004 ms per
frame.

**Fixed** by keying the walk on the orientation alone (`makeOrientationKey`:
rotation and scale) and adding the position to the box afterwards. A translation
moves every vertex by the same vector, so it moves the box by that vector and
changes nothing else - the walk is over the same points either way, and
translating a box is exact. The cache now survives the whole gesture. It is the
raft lesson again: the key covered the transform, but only part of the transform
was the *input* to the work.

## Known cost: a support hover re-derived the scene, and a selection remounted it

Selecting a support felt like it could take up to a second, and sometimes did.
Three things run off a single write to the support store, and two of them did not
depend on what changed.

**A hover writes the same store a selection does.** `setHoveredState` calls
`setState({ ...state, hoveredCategory, hoveredId })`, so the snapshot object is
new on every hover. Anything keyed on that *object* rather than on the
collections it reads re-ran for each one:

- The app root held `useSyncExternalStore(subscribeSupportState,
  getSupportSnapshot)`, so the whole page - and the scene canvas, which is a plain
  function component it renders as an element - re-rendered for a hover that
  changed neither the selection nor the braces that subscription was there for.
- `SupportRenderer`'s `selectionCollections` was keyed on the snapshot, so a hover
  rebuilt the knot index, the per-type selection sets and every batch partition,
  and with them every merged curved-tube geometry.

Measured: one `buildBatchedBezierTubes` merge over 2000 curved shafts (144k
vertices) is **36 ms** with the per-shaft sweep cache warm, and a hover paid it.

**A selection changes the colour partition, and the partition is the React key.**
`dimNonSelected` flips false to true on the first selection, and
`resolveSceneSupportColor` then returns a flat `#666666` for every support, so the
partition collapses from one bucket per model to one bucket. The group keys are
`scene-${typeId}-batch:${color}` and its three siblings, so every instanced group
unmounts and remounts, reallocating its instance buffers. That is the part that is
*sometimes*: it happens on the null-to-selected transition, not on every click.

**Fixed**: the app root subscribes to the selection and the braces collection
separately (`getSelectedId`, `getSelectedCategory` and the identity-cached
`getHomeSupportCollectionsSnapshot`), and `SupportRenderer`'s derivations carry
`supportCollectionRefs(state)` - the collections themselves - so a hover that
moves nothing they read no longer re-runs them.

**Still open**: `supportStateForBounds` in `SceneCanvas` reads the snapshot whole
and legitimately needs the hovered category and id, so it re-renders per hover by
design; narrowing that subscription to those two fields is the next step. The
colour-in-key remount is inherent to partitioning the batches into one mesh per
colour - the per-instance colour path the proxy groups already expose is what
removes it.

## Known cost: a preset switch re-rendered everything that reads a support setting

Pressing a preset hotkey while placing a support hitched. `setSettings` rebuilds
the whole settings object through `mergeWithDefaults`, so every consumer of
`subscribeToSettings` re-ran, and most of them read a field the switch had not
touched:

- `SceneCanvas` read exactly one value from the settings - the tip's contact
  diameter - but subscribed to the object, so the whole scene canvas and the tree
  under it re-rendered for a number that usually did not move.
- `ModelAttachedSupportLayer` read two debug flags as one question.
- `SupportRenderer` read four debug flags, one of them nested.
- `usePresetHotkeys` held six `useActionActive` subscriptions to find a rising
  edge, so the keypress alone re-rendered the settings sidebar - which holds the
  anatomy preview canvas - before the settings write re-rendered it again.

**Fixed**: each of those carries a snapshot of the values it actually reads, so a
write that leaves them alone costs no render, and the preset hook reads its rising
edges inside a single store subscription whose snapshot never changes, so a
keypress costs no render at all.

**Measured, and left alone**: the raft anatomy preview build is **1.3 ms** over
its five-circle pattern, so it is not the hitch. Still on this path, in order of
size: `setActivePreset` makes three synchronous `localStorage.setItem` calls, two
of them `JSON.stringify` - one stringifying the *entire preset collection* on a
switch that only moved `activePresetId`; `checkPresetDrift` runs four
`JSON.stringify` round-trips from a raw settings listener on every notify; and the
anatomy preview's own support-geometry memo depends on the whole settings object,
so it rebuilds twice (once from the settings render, once from the `liveConfig`
effect that follows it). Persistence is the one to treat carefully - it is
synchronous on purpose, and a deferred write trades durability for the frame.

## Known cost: a preset switch rebuilt the router's column map

Pressing a preset key while a placement preview was being hovered hitched. The
hover builds a candidate support per pointer move, and that runs the V3 router,
which asks `SDFCache.enableColumnMap` for a column clearance map. The map is
clearance-specific - built for one clearance and meaningless for any other - and
its build walks every vertex of the mesh: **tens of milliseconds**. The clearance
is `shaft.diameterMm / 2 + COLLISION_AVOIDANCE_MM`, which is exactly what a
preset changes, so the hover after each press rebuilt the whole map.

Measured with the app's own instrumentation (`__dfPerf.summary(20)`) while
cycling three presets: `trunk:build` at **avg 104.6 ms / max 541.2 ms** per hover
frame, with every instrumented sub-phase inside it (`router:cone-gate`,
`router:roots`, `router:standard`, `router:base`) at ~0.1 ms. The time was in the
map build, which nothing measured.

**Fixed** two ways, because the first alone still pays once per clearance:

- `SDFCache` keeps the maps it has built, most recently used first and bounded by
  the bytes they hold (`COLUMN_MAP_CACHE_BYTES`), so switching back to a preset
  reuses its map rather than rebuilding it.
- `prewarmPinnedPresetColumnMaps` builds the maps for the six pinned preset slots
  while the thread is idle, one per idle callback, so a switch finds its map
  already there. Its idle probe is guarded: a worker realm can expose a `window`
  that traps every property read - the auto-support worker's test builds one -
  and the run must not throw over an opportunistic prewarm.

The clearance and the cell size are each one function shared by the ask and the
prewarm, so a prewarmed map cannot miss the clearance the hover then asks for and
rebuild anyway.

## Decision: auto-support borrows its sizing band from a Support Studio preset

`src/supports/Settings/autoSupportPresets.ts` stores presets for the
`autoSupport` block — the policy an automatic placement run follows. The Support
Studio presets in `src/supports/Settings/presets.ts` stay what they are: the
geometry of a *manually placed* support, which excludes `autoSupport` from what
it saves. A Support Studio preset never carries auto-support settings, and an
auto-support preset carries nothing else.

They are separate stores, with separate lifecycles: slots, hotkeys and one
selection driving the whole settings panel, against a policy picked per run and
exported as its own file. One store owning both would make "preset" mean two
things in the panel that shows them. No shared storage, no shared state, no
shared ids.

**One deliberate exception, and it is the coupling the user chose.**
`autoSupport.sizingPreset` names a **Support Studio preset id** — the factory
`detail` / `structure` / `anchor` presets or any preset the user made — and the
run's sizing band (shaft, tip, roots) is that preset's own numbers, resolved at
run time by `activeSizingBand()` in
`src/supports/autoSupport/parameterSizing.ts`. So the auto-support side is the
only one that imports the other, and only to *read*: `getPresetById()` through
`resolveSizingBand()`, which falls back to the factory `structure` band for an id
that no longer resolves (a user can delete a preset an auto-support block still
names) and never throws. Nothing writes to a Support Studio preset from the
auto-support side.

The reason: the user asked "if we just derive sizing tiers from our regular
support presets, why even bother showing the sizing band UI?" — one place to
define how thick a support is, rather than a second set of seven numbers to keep
in step.

**The cost, stated plainly:** editing a manual preset changes what auto-support
prints. A user who tunes `detail` for hand-placed supports has retuned every
auto-support preset that names `detail`, and the panel's Sizing Tier control has
to say so (its tooltip does). The band table in `src/supports/autoSupport/settings.ts`
(`SIZING_BANDS`) is only a mirror of what the three factory presets carry, plus
the fallback; it is not the source of truth.

**Where a worker run resolves it.** The placement worker has no storage and
therefore no Support Studio presets beyond the factory ones, so it cannot resolve
an id the user made. The main thread resolves every band a run can name
(`resolvedSizingBandsForRun`: the run's own tier plus the three analytic tiers the
load budget weighs against) and hands the numbers over in the run request
(`AutoPlaceWorkerPayload.sizingBands`); the worker's `resolveSizingBand` reads
that table verbatim. The factory `structure` fallback for an id that names nothing
still applies, on the main thread, before the handover.

**Temporary until:** nothing — this is a decision. See
[`auto-support-presets.md`](auto-support-presets.md).

## Lingui + React Compiler: interpolating translations

**Do not** add interpolating `msg` translations inline inside a React component
or hook:

```ts
msg`${minutes} minutes`;   // ❌ inside a component/hook
```

React Compiler renames the interpolated locals in production builds
(`minutes` → `minutes_2`), which desyncs the message id from the compiled
catalog — production then renders the placeholder raw (`{minutes_2}`). Dev looks
fine and hides the bug.

**Rule:** translations that interpolate values live in **module-scope helper
functions** (e.g. the duration formatters in `src/app/page.tsx`), which React
Compiler leaves untouched.

**Temporary until:** Lingui moves to a Babel macro ordered before React Compiler.

## In progress: make the support system registry-driven

`src/supports/supportTypeRegistry.ts` **exists** and is load-bearing: one
descriptor per type, and every "for each support type / collection" walk derives
from it. `SupportState`'s collections, the modelId and shafted walks, root
ownership, the updater and knot-diameter slots, and several behaviour decisions
that used to be hardcoded type names now come from there.

**Adoption is partway.** Measured by `npm run scan:support-types`: **5,219
hand-written type references across 148 files**, down from 12,164. History
handlers, registration slots, the support primitives, the clipboard, geometry
export and most of `state.ts` are converted; `state.ts` (751),
`SupportRenderer.tsx` (457) and auto-placement (325) remain the largest
holdouts. Adding a type is therefore still partly manual — see
`dev/support-type-extension.md`, which marks each step.

**Quote the per-type rename test, not one headline.** `rename-test.py <type>`
is the goal mechanised, and the types differ: `branch` 16, `leaf` 14, `trunk` 3,
`anchor` 1, `stick` 0. Measuring on the easiest type alone reads as finished
when another is ten times worse. The detail lives in
`dev/support-type-literal-plan.md` §1.1.

Neither instrument alone is the picture: the rename test sees only what `tsc`
can prove, so a literal that survives a rename *without* a compile error is
invisible to it. Catching those needs a scan of every distinct token (736 of
them over 6,014 occurrences when last measured). Report both. A string literal
is invisible to BOTH: the knot-host prefixes needed a source scan.

**Remaining goal:** move the rest of the per-type threading behind the registry,
so the renderer, interaction manager and export derive their behaviour rather
than enumerating types. Deliberately out of scope for the registry itself:
renderers, builders and placement logic. It describes what a type IS, not how it
draws — putting behaviour in it turns a mechanical refactor into a rewrite.

**Do not do this refactor while adding a support type.** Still true, and still
the point: converting a hand-wired path and adding a new type at once means a
behaviour change and a migration land in the same diff, and neither can be
reviewed or bisected cleanly. Add the type through the current hand-wired path,
then convert separately. Registry work should land on its own with no behaviour
change.

**The rule that matters.** When code needs type-specific behaviour, derive it
from the registry or declare it as a descriptor property. Never subtract
(`.filter(id => id !== 'trunk')`): a new type silently joins or skips the set,
which is the exact failure the registry exists to prevent.

### Bugs found while converting

Converting each hand-written type list turned up defects where the list
disagreed with the registry. They are recorded in
[`support-registry-findings.md`](support-registry-findings.md) -- 22 still open
-- rather than here, because they are per-site detail rather than rules to
follow.

The rule they add up to is the one above: derive, never subtract. Two were
invisible to the whole suite AND every golden, so passing tests are not
evidence a flag is covered -- see AGENTS.md trap 4.

## Desired: route every native call through the IPC bridge

`src/features/slicing/tauri/nativeSlicerBridge.ts` is documented as the seam for
Tauri commands (`dev/tauri-ipc-bridge.md`), and it is where new wrappers belong.
It is not yet the only path: 84 direct `invoke(...)` call sites live in 29 other
modules, nine of them React components, reaching ~70 of the 107 native commands.

**Why it matters:** the command name is a plain string on the TS side, so nothing
type-checks it against Rust. Centralizing the calls is what would make a single
rename verifiable instead of a grep-and-pray.

**Goal:** every native command reached through a named wrapper, so the bridge is
the full inventory of the contract and a boundary check (in the style of
`scripts/check-plugin-boundaries.mjs`) can enforce it.

Do not attempt the migration as part of unrelated work — move a call site into
the bridge when you are already editing it, and leave the rest. The bulk move is
its own change, with no behavior difference.

## Desired: native twin optimization plan

A roadmap note, not a current runtime contract — previously
`dev/native-twin-optimization-plan.md`.

**Goal:** move toward a native scene twin in Rust so the frontend can send small
state diffs instead of repeatedly staging large geometry buffers during slicing
and export.

**Key constraints:** support editing in the frontend must stay smooth; support
fidelity must remain exact; the work should land after the stable beta path is
complete.

**Architecture direction:** frontend owns live interaction and preview; backend
owns canonical slice-ready state; model assets are loaded by identity rather
than resent repeatedly; support changes are transmitted as graph diffs with
stable IDs and resolved coordinates.

**Success criteria:** less bulk geometry IPC; better support-heavy export
performance; revision parity between frontend and twin before slicing/export.

## Import post-processing: what still blocks a scene load

A scene load pays these per model, synchronously, in `processGeometry`
(`src/hooks/useStlGeometry.ts`) — measured with
`npm run bench:import-postprocess` on a 500k-triangle non-indexed soup
(~1.5M vertices, the shape a VOXL-embedded mesh has):

| Phase                       | Cost     | Needed for                       |
| --------------------------- | -------- | -------------------------------- |
| `EdgesGeometry(30)` overlay | ~2139 ms | optional, default-off overlay    |
| flattening planes           | ~98 ms   | Place on Face                    |
| `computeVertexNormals`      | ~43 ms   | rendering                        |
| `computeBoundingBox`        | ~13 ms   | everything                       |
| BVH (`accelerateGeometry`)  | ~120 ms  | support placement raycasts       |

The overlay geometry is the whole problem: ~93% of the phase, and three times
larger than everything else combined. It is off by default, so it is now built
**only when the user has the overlay enabled** — `buildModelEdgeGeometry()` is
the single gate, called from `processGeometry` for imports (with the import
progress UI up, so the cost is where a load's cost belongs), from
`replaceModelGeometry` for geometry swaps, from the Split Supports path, and
from the scene's settings effect for models that were loaded while the setting
was off (one model per idle callback, cached on the geometry so it is built
exactly once).

Do not move this build off the import path into the overlay component: it
measured *worse*, not better — six 500k-triangle models went from one import
stall to 6 × ~1.9 s of post-load main-thread blocking (18 s of long tasks in a
browser profile, versus 5.5 s), because each model's `StlMesh` re-paid it on
mount and there is no shared cache at that layer.

**What remains, in value order:**

- **The container parse was 4.6 s on a 303 MB, 15-model scene, and is now 1.2 s
  (2.1 s in the dev webview).** (`parseVoxlBinaryV2`; measured through
  `scripts/dragonfruit-ts-cli.ts scene list-models` and the app's own
  `[voxl] inflated …` line: 66 ms to read the file, the rest to inflate the mesh
  chunks — 13 of them, 677 MB, ~1.0 s in Node and 2.06 s in the webview.) The
  chunks are independent zlib streams, so they now inflate four at a time with the
  platform's `DecompressionStream` instead of one at a time on the main thread.
  **Not `fflate`'s async pool, which is what this was first written with:** the
  webview reports `crossOriginIsolated`, and `fflate` then waits for its workers
  through `SharedArrayBuffer`/`Atomics`, blocking the main thread the pool was
  supposed to free. That cost 2.8-10 s of stalls at scene open and, once, a content
  process the watchdog had to declare dead — with blob workers accumulating (12 of
  them). The native stream is off-thread for real, streams instead of cloning each
  buffer back, and is faster besides (70 ms against 93 ms for 24 MB).
  What is left: the inflate itself (~650 MB/s aggregate, four streams), and one
  copy per chunk as the inflated bytes come back to the main thread — 677 MB of
  it. Both disappear if the *native loader* inflates: a VOXL's mesh chunks sit at
  known offsets in a file on disk, so `load_mesh_bytes` could take
  `(path, offset, length)` and inflate where it already parses, with nothing
  crossing into the JS heap at all. That is the next structural step if scene loads
  are attacked again.
- **The overlay build itself (~1.9 s per 500k-triangle model) is unavoidable
  main-thread work while the setting is on.** It is the only remaining
  multi-second op in the load path; a worker (the repo already runs workers for
  the 3MF loader) is the way to remove it, and would let the overlay be enabled
  without any import penalty.
- **BVH + flattening planes are still synchronous on the import path.** Both are
  already deferrable: `finalizeModelGeometryPostProcessing` in
  `src/features/scene/useSceneCollectionManager.ts` runs exactly these two in
  idle callbacks for geometry swaps, and `hasPendingBackgroundGeometryWork()`
  reports when that queue is still draining, so the UI can stay honest. Routing
  imports through the same seam would remove ~220 ms/model and shrink the
  "import finished" to "app responsive" gap. Measured on the 13-unique-mesh scene
  below they are **0.22-0.50 s and 0.17-0.40 s per model** — together about half of
  the main-thread work an import has left once the native side is off the critical
  path, which makes them the next step for a scene load (there is no worker to hand
  them to: `computeFlatteningPlanes` is plain geometry maths that could move to Rust,
  and `three-mesh-bvh` builds in JS over the position buffer).

- **VOXL original-mesh sidecars are resolved on the import path.** When a VOXL
  has no embedded `ORIG` chunk, `resolveOriginalRefSidecar` falls back to the
  model's on-disk `sourcePath` and `readSidecarFileBytes` fetches it. For a
  source that has moved or been re-exported (the common case after a repair
  round-trip) that is a real network attempt per model that can only 404 — noisy
  and awaited, though harmless (the loader falls back to the embedded preview).

### Measured: a 15-model VOXL scene (303 MB, 13 unique meshes, 782 MB of meshes)

Import cost, from the app's own log plus a Rust timing run (`E:/tmp` harness,
same code path as `load_mesh_bytes`):

| stage | per model | 13 models |
| --- | --- | --- |
| loader with the classify pass | 544-553 ms (725k-triangle model) | — |
| loader without it | 118-121 ms | ~1.5-5 s total |
| the classify pass itself | 430 ms measured; 641-1736 ms in the app log | **11.9 s** |
| AO bake (RTX 3080) | 0.38-1.21 s | 7.4 s |
| BVH build (JS) | 0.22-0.50 s | 3.8 s |
| flattening planes (JS) | 0.17-0.40 s | 2.9 s |
| DFMX decode + prep | 0.06-0.15 s | ~1.1 s |

Two conclusions from it. Every model in that file carries a `MODL.classification`
with a `pre.triangle_count` that matches the payload the loader builds exactly, and
the loader re-classified all thirteen anyway — the stored report was computed, then
overwritten by an identical one, for ~34% of the whole load. And the AO bakes, which
are the GPU's work, were awaited inside each model's prep, so they ran one model at
a time while the main thread was idle waiting on them.

### Fifth run: the bake takes the loader's mesh (11.1 s)

The other half of the same idea. The loader registers each model's refined mesh as it
encodes its payload and reports a token in the DFMX header; the bake names it and the
native side bakes that mesh directly, so neither the soup (430 MB a scene) nor the weld
(208 ms a bake, 2.7 s a scene) is paid. Measured on the same scene and build:

| | by range | + bake token |
| --- | --- | --- |
| build pass | 12.29-13.21 s | **9.72 s** |
| total | 13.51-13.68 s | **11.15 s** |
| soup uploads | 13 (430 MB) | **0** |
| welds | 13 | **0** |
| token bakes | — | 13 of 13 |

**The gate for it was a measurement, not a hope:** the loader welds at 1e-6 and the bake
re-weld the same soup at 1e-5, and on a real 725k-triangle model those produce the
identical vertex set (362,847) and a bit-identical field — rms 0.00000, max 0.00000 over
2.18M values. So skipping the weld changes nothing about the field, and the token path
is the same bake on the same mesh.

It is also the one of these four attempts that *helped* on wall clock, for the reason the
others did not: it removes work (a weld and an upload) rather than adding any. Two guards
keep it honest, and both are cheap: the token is recorded against the geometry's position
array and checked against the live one at bake time (a repair, a swap, a clone or a
rewrite invalidates it), and the native side refuses when its mesh's corner count
disagrees with the caller's. Either refusal — or an evicted token, the registry holds
eight — falls back to the soup, which is the path every other geometry takes.

### Fourth run: the mesh chunks stay in the file (13.5 s)

The container's mesh chunks are read by the *native* loader now (`load_mesh_range`), so
the parse no longer inflates anything for them — the descriptors come out of the
directory and the loader reads each range inside that model's own build. Measured on
the same scene and build:

| | eager parse | by range |
| --- | --- | --- |
| parse | 1.93-2.76 s | **164 ms** |
| build pass | 15.3-18.0 s | **13.21 s** |
| total | 18.2-20.0 s | **13.51 s** |
| JS mesh bytes held | 677 MB | 0 |
| per-model native read+inflate | — | 80-228 ms, pipelined |

Backwards compatible by construction: the byte path is the *default*
(`deferMeshChunks` is opt-in) and is what a source without a path still takes — a file
out of a zip has no range to give. The range arithmetic is pinned by reading a
descriptor back out of the file and comparing it to the bytes the eager parse hands
over, dedup included.

What is left of this idea is its other half: the AO bake still uploads its soup (430 MB
over a scene — now the largest single piece of traffic left, with the mesh payloads
down to 337 MB). The geometry could carry the same descriptor and the bake could read
the range instead, with two guards, because a stale descriptor means a subtly wrong
field: key the range by the *position array's identity* (a repair, a swap and a clone
all replace it; an in-place write must clear it), and have the native side refuse when
the mesh it re-derives is not the size the caller claims.

### Third run: where a scene load goes now (19.4 s)

The app logs one line per scene — `[voxl] load: parse …, build …, place …, commit …,
total …` — beside the per-model lines, all of it in `dragonfruit.log`. With the parse
parallel and four builds in flight, on the same 15-model scene:

| phase | measure |
| --- | --- |
| container parse | 2.0 s (13 chunks / 677 MB, four streams) |
| build pass | 17.3 s |
| ..native load | 3.4 s total (258 ms a model) |
| ..round trips | 49 s total (3.8 s a model) — the rest is wire + waiting |
| ..main thread | 6.1 s (prep 203 ms, BVH 228 ms, planes 39 ms a model) |
| ..AO bakes | 10.4 s total (800 ms a model), overlapped |
| placement | 3 ms |
| commit and state | 110 ms |

So the build pass is a *three*-way contention: the wire, one main thread that must
receive, decode, accelerate and measure every model, and the bakes' own CPU work
(each bake welds its soup and builds a BVH on the shared rayon pool). Raising
`VOXL_BUILD_CONCURRENCY` from 2 to 4 took the pass from 19.3 s to 17.1 s and is kept;
the remaining levers, in the order the numbers put them, are the payload volume (fewer
bytes a model — see the correction above), the main-thread work a model costs (the BVH
at 228 ms is the largest single piece), and the bakes' contention. Everything after
the `commit` line — fifteen geometries' upload, their BVHs and their AO attributes
reaching the GPU — is in none of these numbers.

### Second run: 35 s -> 21 s, and what is left

After the classification reuse and the parallel bakes, the same file loads in ~21 s
(app log, 13 unique models; no `classified in` line, and the bakes interleaved with
the other models' prep). The logged stages in that run are BVH 0.25-0.56 s and
flattening planes 0.15-0.39 s a model, and two of them were paying for a data
structure rather than for work:

- **The plane decimation loop keyed its grid cells with a string per vertex.** A
  `` `${cx},${cy},${cz}` `` built 2.6M times on an 869k-triangle model was 240 ms of
  the function's 250 ms. Cell indices taken relative to the grid's own corner pack
  into one integer key and produce the same cells: measured on the file's own
  meshes, 240 ms -> 50 ms there and 500 ms -> 108 ms on a 1.8M-triangle model.
- **`three-mesh-bvh`'s default leaf of 10 triangles costs a third more build time
  than it needs** — 287 ms against 466 ms, and 508 ms against 835 ms on the same
  two meshes — and asking for 32 was in this branch until `npm run
  bench:auto-supports -- --check` refused it. The build win is real, but a leaf is
  not a rendering detail: with a leaf of 32 the overhang-slab forest moves
  (entities 1754 -> 1757, roots 208 -> 209, probes 3671 -> 291) and the sloped
  cantilever spends 56 more probes. The router reads raycast results, and a coarser
  leaf hands it a different answer out of the same set of hits, so the forest
  follows the data structure. Reverted; the change that makes the forest
  independent of the tree is the one to land it with, and until then the build
  time stays. The plane grid's integer key above is unrelated and stays.

What that run did not account for was the gap between a model's native load
finishing and its prep starting: 0.2-1.8 s, scaling with the payload. Two phases are
now logged (`[loadMeshFile] native payload … round trip …` and
`[load_mesh_bytes] parsed, refined and encoded in …`), and a direct probe settles
what they are.

### The wire was never the problem, and compression was a dead end

Measured from the running app over CDP, invoking `read_print_file_bytes` on files
of known size — a plain command with no mesh work behind it:

| payload | round trip | rate |
| --- | --- | --- |
| 1 KB | 3 ms | fixed latency ~3 ms |
| 24 MB | 207-232 ms | ~110 MB/s |
| 96 MB | 674-742 ms | ~135 MB/s |

So the IPC is fast and its overhead is negligible, and the per-model 1.2-1.8 s in
the import is the **native command**, not the transfer: the JS timer starts before
`invoke`, so it encloses parse + refine + encode as well as the wire.

That said the payload did not matter — and **that reading was wrong**, because the
comparison used the wrong metric. What a 13-model build pass pays is the *aggregate*
volume over a shared channel, not what one model waits on. Measured with 13
concurrent 70 MB reads through the same command, the channel does **189 MB/s**; during
the import the effective rate is ~75 MB/s, because the wire and the single main thread
(receive, decode, BVH, planes) take turns rather than overlapping. A smaller payload
therefore cuts the transfer *and* the per-model receive, and the round-trip numbers
below are not the way to judge it.

Shrinking the
payload looked attractive while the wire was assumed slow: the soup is 72 bytes a
triangle (52-129 MB a model) and it deflates 2.7x at zlib level 1 on real geometry
(not the 7x a half-zeroed buffer suggests). It was implemented and measured end to
end — DFMX v2 with a zlib stream per body, verified on the same 13-model scene —
and it **lost**: the payloads fell 65.8 -> 24.2 MB and 129.1 -> 48.1 MB, yet the
round trip only moved 1664 -> 1425 ms, because the bytes were never the cost, while
`fflate` spent 0.5-1.3 s inflating each body back (and the encoder spent its own
time compressing). Reverted at the time — see the correction above for why that
verdict was wrong, and below for what the retry measured.

**The retry, with the native decompressor and the aggregate metric: build 17.3 s ->
15.4 s** (round trips 49.1 s -> 35.7 s, per-model payloads 65.8 -> 24.2 MB, 2.7x) on
the same scene, and that is in a *dev* build where `flate2` runs unoptimized — the
native column of the table below went 258 ms to 512 ms a model to buy the packing.
In a release build the encode is a fraction of that (36 ms per 868k-triangle model,
measured with Node's zlib), so the win is larger than what is recorded here. The
per-body inflate is `DecompressionStream` (see the fflate gotcha under the container
parse), four bodies at a time, and it added nothing measurable to the main thread
(prep 203 -> 235 ms a model, within noise).

**The bakes' concurrency is not the binding constraint either** (the third lever, as
first attacked). Their reported times swing 400 ms - 1.9 s for models of the same
size, which looks like CPU contention on the rayon pool the loads are refining on, so
they were gated to two in flight — the figure the idle sweep uses — and the build pass
went **15.36 -> 17.97 s**. Serially waiting for a bake slot costs more than any pool
thrashing it avoids: the work is real, it is just overlapped already. Reverted. What
that leaves is not the *concurrency* of the bakes but their *redundancy* — each one
welds a 3M-corner soup and builds a BVH over the same mesh the loader welded moments
earlier — and removing that needs the mesh to travel by reference rather than as a
re-uploaded soup (see the native-range step under the container parse).

**A scene load's wall time is noisy: two runs of the *same* build measured 15.35 s and
17.16 s (12%), and the log is shared, so a second instance on the same machine
contaminates both.** That does not touch the claims above that rest on a *mechanism*
being measured directly — 11.9 s of duplicate classification, payloads of 65.8 vs 24.2
MB, round trips summed at 49.1 s vs 35.7 s, 500-1100 ms of main-thread compression per
model, the parse at 4.6 s vs 1.2 s in Node — but it does put the one-line wall-clock
deltas (the packing's ~2 s, the extra build width's ~2 s, the bake gate's ~2.6 s) inside
the noise, and they should be read as "not worse, and less work on a resource the load
is short of" rather than as measured savings. Anything under two seconds here needs
three runs and a median; the `[voxl] load:` line makes that cheap to take.

**What a bake actually spends** (instrumented, 13 models, GPU path, dev build):

| phase | mean | sum |
| --- | --- | --- |
| weld the soup (`from_triangle_soup_with_corner_map`) | 208 ms | 2.7 s |
| tree + normals + kernel (`dragonfruit_ao_gpu::bake_smoothed`) | 518 ms | 6.7 s |
| expand the welded values back onto corners | 4 ms | 0.06 s |

And the tree is not what the `tree + normals + kernel` column is paying for: measured
in-crate on release builds, `Bvh::build` is **131 ms for 980k triangles** (27 ms at
245k, 294 ms at 2M), against 518 ms for that whole phase. The rest is the GPU upload,
the kernel, the readback and the smoothing pass — the occlusion itself, not overhead.
So of a bake's ~850 ms, the part the mesh-by-reference step would remove **is the weld
(2.7 s over a scene), the 430 MB upload, and at most 131 ms a model of tree** — and the
tree only if it is cached, which a scene cannot afford. The tree build and
kernel stay, and they are the next thing worth attacking on this lever: the tree is
rebuilt per bake over a mesh the loader had already indexed, and a resident cache for
it is 30-60 MB a model, which is not affordable for a scene. A cheaper build (a
coarser split than SAH) is the direction that does not cost memory; the field's
*values* do not depend on the tree, only the time the rays take.

**The rule both attempts produced: pack what the native side produces, never what the
renderer must pack.** The bake's soup upload was packed as well — 36 bytes a triangle,
430 MB across the scene, halved on the wire — and it *lost*: the build pass went
15.36 s -> 16.64 s, because `CompressionStream` in the webview cost 500-1100 ms a
model, on the main thread, which is the resource a load is short of, while the upload
it shrank was already overlapped with the mesh transfers. Native-side packing is nearly
free (tens of milliseconds in an optimized build) and its inflate runs off-thread;
packing in the renderer is the expensive direction.

What the numbers leave, in value order, is everything *off* the wire: the container
parse (4.6 s before any model work), the main-thread geometry work (BVH 0.25-0.50 s
and flattening planes 0.15-0.40 s a model, now well under a third of what they
were), and — in a dev build only — the shell being unoptimized, which is most of
that per-model native load (`Cargo.toml` keeps it that way deliberately: the mesh
crates are `opt-level = 3`, the shell is not, for incremental builds).

## STL imports: facets, missing normals, and a shuffled per-vertex attribute

Reported as mottling that appeared on STL imports and not on LYS ones, and
mistaken for broken baked ambient occlusion. Three separate causes, on the same
path, none of them in the occlusion estimator:

**1. The loader shaded the model with a normal the mesh does not have.**
The STL response encoder wrote one triangle's normal onto all three of its corners.
An STL has no vertex normals, so that looked faithful, but with
`flatShading={false}` three *interpolates* a constant and every face is lit by its
own orientation. Measured on `poussin.stl` (150k triangles, 75k welded vertices),
counting shared positions shaded by more than one normal: **74976 / 75000 and up
to 168° apart**. It was read as a defect at the time and the encoder was changed to
accumulate face normals over the already-welded mesh — and then, when that average
drew a forty-five degree ramp across every ninety degree crease, to average only
the faces within 60° of each corner's own.

**Both averages are reverted (issue #797).** They were a shading *look* baked into
the import, wrong twice over: they paint a smooth surface over the triangulation
the file describes, so a scan's facets and an imported edge both come out soft, and
they disagreed with the geometry a repair pass hands back — the renderer recomputes
*that* per face, so the same model changed its shading the moment it was repaired.
The encoder writes each triangle's own geometric normal onto its three corners
again, which `imported_normals_are_each_face_own_geometric_normal` pins. The
ambient-occlusion bake is untouched: it derives its own welded normals for the probe
fan (`vertex_occlusion`), and it was the only consumer that ever wanted an average.

This was *not* the mottling: rendering the same geometry through the app's
material with smooth and with per-face normals differs by **0.5-1.5% mean
brightness** even under a hard key light (measured in a headless render of the
real loader output), so the mosaic reading was about a shading difference smaller
than the report.

**2. A repaired geometry kept no normals at all.** The Manifold repair rewrote
positions and index in place and deleted the now-stale `normal` attribute, with a
comment saying the caller must recompute. It did not set
`nativeModifiedGeometry`, and STL loading passes `_skipComputeNormals: true`
because the loader "already computed them" — so `processGeometry` skipped the
recompute and the model shaded from a zeroed attribute. That is precisely the
imports that needed repair, which is to say the messy STLs, which is to say the
ones that look broken. Fixed by recomputing whenever the attribute is absent,
whatever the skip flag says.

**3. The bake's values were shuffled on indexed geometry.** The bake returns one
value per triangle corner in the order the soup was sent. A non-indexed geometry
*is* that soup, so the mapping is the identity; an indexed geometry's index buffer
is the *corner* order, so slot `s` draws value `s` at vertex `index.getX(s)`. The
code read it the other way round — `values[vertex] = cornerValues[index.getX(vertex)]`
— which is only correct when the index buffer is its own inverse. `MeshDefects`
repair switches the geometry from a soup to indexed (`setIndex`), so **every
repaired STL got its occlusion values shuffled**, and LYS imports, which arrive
clean and are never repaired, did not. That is the reported split exactly.

Fixed by walking the index buffer as slots. `bakedOcclusion.test.ts` covers the
non-self-inverse quad case: 3/3 with the fix, 2/3 against the previous mapping.

The lesson worth keeping: defects 1 and 2 live in the *geometry* and defect 3 in
the *attribute*, and all three present as "the per-vertex data is wrong". Before
disbelieving a per-vertex field, check what the geometry it is attached to
actually is — indexed or not, and whether it has normals at all.

## Gotcha: a Rust mesh result must be indexed against the geometry you sent

Any native command whose output is addressed *by element* — triangle ids,
per-vertex values, per-region masks — is a place this bug can appear, and it has
appeared four times now: the island scanner first, overhang classification
second, the ambient-occlusion bake third, and the same bake again when its request
was moved ahead of the BVH build. It is worth recognising, because the symptom
looks like a rendering or a maths problem and is neither.

**Symptom.** Misaligned triangles: the values are right for the mesh Rust saw and
wrong for the mesh on screen, so shading or masks land one element over, or in
patches that follow no feature of the model. The island scanner's version was
"disconnected speckles"; the AO bake's was facets that follow the triangulation, and
its second version was speckled shading on an imported mesh. It shows only on
*some* models, which is what makes it feel random.

**Four ways the Rust-side mesh diverges from the frontend's mesh:**

- **The shared staging buffer is process-wide mutable state.** Repair, hole
  punching, hollowing and the next import all write it. A command that stages a
  mesh, then reads it back later (an idle callback, an `await`), can find a
  *different* mesh there and compute values for that one.
- **Re-loading the file on the Rust side re-welds it.** The loader welds with its
  own epsilon and vertex order (`DEFAULT_MERGE_EPSILON`, `from_triangle_soup`),
  which need not match whatever produced the geometry the frontend renders.
  That is the island scanner's original bug: the sideloaded mesh's `triangleIds`
  pointed at the wrong triangles.
- **Welding the same soup twice, with different tolerances.** A bake that takes a
  soup welds it, and then rebuilds a corner-to-vertex map to expand its values
  back out must use the *same* weld for both directions. Two tolerances disagree
  about which corners are the same vertex, so the expansion reads one mapping's
  ids into a mesh built by the other.
- **The geometry's index moving while the request is in flight.** A command's
  values come back addressed against the mesh it was handed, and the mapping back
  onto the frontend's vertices has to use the corner table the request was built
  through — not `geometry.getIndex()` when the reply lands. Something as ordinary
  as building the BVH re-indexes a geometry (`three-mesh-bvh` indexes a soup it is
  given), and a bake started early to overlap that build mapped its values through
  the table that existed *afterwards*: the field landed one triangle over.
  `bakeOcclusionForGeometry` snapshots the table with the request and warns if the
  live one moved; a guard drops the values outright when the *positions* attribute
  is replaced under it, because those belong to a mesh that is no longer there.

**The rule.** Send the geometry in the request and return values in the geometry's
own order or index space. For indexed geometry, map back through the index buffer
so shared vertices share one value. Use staging only for commands that *produce*
or *transform* a mesh, where the output replaces the buffer and there is nothing
to index against. This is written up prescriptively in
`dev/tauri-ipc-bridge.md` under *Conventions to respect*; it is repeated here
because that is the document you read when writing a command, and this is the one
you read when something renders wrong.

**Cheapest guard when writing one of these commands:** assert the returned
element count against the geometry you sent (vertex count or triangle count), and
fail to "no result" rather than attaching a mismatched array. One weld per
pipeline, and a test that nudges coincident vertices apart by less than the weld
tolerance and asserts they still agree.

**A raw-body command cannot also take arguments** (Tauri: *"expected a value for
key … but the IPC call used a bytes payload"*). That is fine for this rule —
geometry in, values out — but it means any option has to travel in a request
header or stay a Rust constant. It cost a round trip to learn here, which is why
it is in `dev/tauri-ipc-bridge.md` under *Conventions to respect* too.

## Known: `computeAutoSupportPlan` is superlinear in support count, and runs on the main thread

A run places supports at roughly 4–9 ms each on a lattice (measured with the
plate fixture below), so a model that needs a few hundred supports is a couple of
seconds of *synchronous* work and the UI is frozen for the duration — the
"Generating Supports just hangs" report. The cost is not geometry kernels: a CPU
profile of a 417-support run attributes it to TS bookkeeping that rebuilds a
global structure per candidate or per host.

Fixed so far (all output-preserving, verified by hashing the produced brace set
before and after):

- `computeRegionCoverage` / `findUncoveredClusters` tested every footprint voxel
  against every tip — a 7000 mm² region is ~112k voxels. Now bucketed through
  `TipIndex` (`coverage.ts`), which walks only the nine cells a disc can reach.
- `buildGroupPairs` (`autoBracing/autoBrace.ts`) scanned *every* edge for every
  support in the two-axis pass, building a sorted string key per edge per
  support. Now indexed per support, with the redundancy sets cached.
- Footprint mask probes (`erodeFootprint`, `buildBoundaryPoints`, the cluster
  BFS) keyed cells with template-literal strings. Now `cellKey` in
  `voxelFootprint.ts` — numeric, so a probe allocates nothing.
- `collectFanShaftPoints` was rebuilt per candidate (up to three times) and per
  host inside the consolidation loop. Now built once per candidate and once per
  consolidation pass, filtered as pillars convert.
- The distance-field cell cache was a `Map`, and one placement asks it for
  hundreds of thousands of cells (the router walks a ~100 mm column at the cell
  floor and re-walks it for every step of its outward search). It is now a dense
  `Float32Array` over the model bounds with the `Map` as the fallback: ~15% off
  a long march, measured on a 120 mm column.
- `isContactConeBlocked` stepped the cone at a fixed 0.1 mm with the *uncached*
  exact query, and the router runs it for the straight cone plus up to 24
  deviations. It now sphere-traces the axis on the 1-Lipschitz property, which
  skips only points the fixed-step loop would also have found clear, so the
  verdict is unchanged and a cone in the open costs an order of magnitude fewer
  queries.

Still open, in the order a profile says they pay:

1. `generateGridCandidates` materialises the whole footprint as `{x,y,z}`
   objects (`footprintToPoints`) before eroding and walking it — 112k objects
   for a large region. The mask-native path is a typed-array API.
2. `fanLeafToHost` / `buildConsolidationBranch` call `getSupportTypeDescriptor`
   per candidate host sample, and their reach is a linear walk of the whole
   shaft pool. Registry lookups want hoisting; the pool wants a spatial index.
3. `computeForestDiameterProfile` deep-clones the forest with
   `structuredClone` — most of that phase's cost.
4. `isAutoBraceableShaftType` / `lateralStabiliserTypes` rebuild their
   filter+map+Set on every call, and they are called per sample.

**The responsiveness fix was architectural, not micro-optimisation.** The plan is
pure with respect to the stores it *writes* (one commit at the end), which is
what let it move to a worker thread; see
[Auto-Support Worker](auto-support-worker.md) for the protocol, the seeding
contract that keeps the two threads in agreement, and the cost of the mesh
transfer. What is still missing there is the progress/cancel surface: the run
no longer blocks the main thread, but the modal over it is indeterminate, so
the perceived freeze needs a percentage and a cancel action before it is gone.

Porting to Rust is not the next step: the profile above is dominated by
allocation and repeated walks of TS structures, which a Rust port would not
remove, and the pipeline is entangled with `three` geometry, three-mesh-bvh and
the support registry.

**Reproducing the numbers:** a slab of `W × L` leaning 60° from horizontal, one
hand-built `source: 'overhang'` island over its big face (plane, `triangleIds`,
voxel footprint), then time `computeAutoSupportPlan` with
`debugSkipAutoBracing: false`. 20×20 → 85 ms / 11 supports, 40×60 → 172 ms / 72,
60×90 → 383 ms / 158, 100×140 → 1548 ms / 417. Before the fixes above the last
row was 3593 ms; use the same fixture to check a further change pays.

## Known: the router's cost is the SDF march, and precomputing clearance does not pay

The joint search (`findEscapeJoint` in `src/supports/PlacementLogicV3/`) now
dominates a real run. Measured on a 505k-triangle sculpt with the island scan
feeding 166 islands: **32.9 s total, of which placement is 27.5 s and
`router:joint-search` is 23.0 s** — 2067 placements, 29.2 cones each (15.6
gated), 11.7 joint searches each, 24132 searches in all. Of those, **162 find a
joint (0.67%)**; 12427 end `never-cleared` and 11543 hit the probe budget.

Where the 23 s goes: 8790 probes per placement is **18.2M probes** and **107.9M
cell reads** — 5.9 reads per probe at ~213 ns each, which is main-memory latency
against the 32 MB open-addressed cell table. The **BVH queries are not the
cost**: this cache's own notes put a bounded fresh cell at 0.2 µs, so all 1.6M
of them are ~0.3 s, about 1% of the joint search. The reads come from the march
sampling at its `cellSize * 0.9` floor wherever the geometry is tight, which on
a sculpt is most of the time.

**Two thirds of all probes are spent proving a negative.** A `never-cleared`
search walks all 12 fan directions the full lateral envelope (0.5 mm steps out
to `maxLateralMm` 40 mm) and finds nothing: ~960 probes each, 12M of the 18.2M.

Three ways to replace the predicate with precomputed clearance were built and
measured; all three are rejected, and the numbers are here so they are not
re-derived:

1. **3D bitset over the scan's layers.** 216 MB at 0.05 mm, and **604 µs per
   column query against the march's 83 µs** — the query walks a 3D
   neighbourhood, so it loses to the thing it replaces.
2. **2.5D span prefilter** (per XY cell, the occupied Z range). 0.5 MB at
   0.25 mm and 377 ns per query, but only **252 of 4000 columns could be proved
   clear, and 76 of those were wrong** — a span merges separate Z passes of the
   model into one range, filling the free space between them, and the errors go
   both ways.
3. **Per-XY-column blocked-Z interval map** (Z exact, cone dilation rather than
   a slab, two-sided so a verdict can never disagree with the SDF). At 0.15 mm:
   build 6.8 s, 26 MB, 92.6% of probes settled, **8 wrong**. At 0.1 mm: build
   36.7 s, 59 MB, 94.7% settled, **14 wrong**. The build costs more than the
   23 s it would save, and "wrong" has to be zero because one wrong verdict
   moves a placement. The error budget has to absorb the query snapping to a
   cell centre, the surface sample snapping to a cell centre, and a triangle
   that only clips a cell contributing its whole Z range; tightening any of them
   costs resolution, and resolution costs build time quadratically.

Two related facts, both measured, that constrain any future attempt:

- The distance bound (`MARCH_DISTANCE_BOUND_MM`) is already doing its work: the
  same cache notes measure 3.1 µs for an *unbounded* fresh cell against 0.2 µs
  bounded, and that 14× is banked. Lowering the bound further buys little
  because fresh cells are ~1% of the run — but it is not free either, since the
  bound is also the only source of the distance *sign* for a cell more than the
  bound from any surface. A census of one real run's fresh cells found 74 of
  6200 (1.2%) capped and none of those inside the solid, but the box-with-cavity
  fixture does put capped cells inside, which is the case a naive cap breaks.
- The geometry really is in the way. On a dense sculpt most sockets have no
  clear vertical column anywhere in their lateral envelope, so the search is not
  failing from inefficiency — a faster predicate buys less than the numbers
  above suggest.

**Implication for the next attempt:** there are three levers and they are not
equally available. The *number of probes* is the biggest — two thirds of them
exist to prove "nothing clears in this direction", walking all 12 fan directions
the full lateral envelope. The *reads per probe* is next — the march's floor.
Both change which joint is found, so both change placements and need a quality
decision rather than a benchmark. The *cost of a read* is last and is
storage-shaped: the table is 4M slots for ~1.4M cells, and the obvious fixes
(denser, or coarser, or quantized) all move the field's resolution, which also
moves verdicts.

**Tried and rejected: settling the legs with a midpoint test.** A leg is one walk
step (0.61 mm) against a 0.7 mm clearance, so it is nearly a point, and the
midpoint's bounds widened by half the length settle it soundly both ways. It
measured **slower** — 204 ms against 185 ms on the router's own probes, with 11%
fewer reads but 4% *more* BVH queries: the legs' marches are already only two or
three samples, so the extra probe and lattice-gap arithmetic cost more than the
march it skipped, and the midpoint is often a cell the march would not have
touched. Do not re-try it without a profile showing the leg calls dominate.

What that leaves as the real cost: with `ColumnClearanceMap` in place a call
averages ~1.2 reads, so the ~1 µs a call costs is **not** the cache and not the
geometry — it is the call machinery and the walk's own per-step work (the escape
search builds a `{x, y, z}` object per step). Profile that before optimising
anything else here.

## Fixed: `segmentBlocked` reported a column clear that passes within clearance

Fixed by bounding each sample by its own distance to the lattice point the cache
answered for, and resolving that sample with an exact bounded point query only
where the bound cannot decide. The regression test is
`src/supports/__tests__/segmentBlockedQuantization.test.ts` — it sweeps tangent
segments that provably come within clearance and **fails on the old code (4 of
1680 reported clear) and passes on the new one**.

Two intermediate versions were tried and rejected, both recorded here because
each looked right: subtracting nothing (the original bug), and subtracting the
worst-case half-diagonal, which is sound but inflates the effective clearance by
60% and breaks `stickBridgeClearance.test.ts`'s 0.5 mm-shaft-in-a-0.8 mm-gap
case. The screen-then-ask version keeps the big steps in open space.

The first attempt asked exactly whenever `base - gap < clearance`, which fires on
every sample near geometry — where a march spends its time — and measured 23.9M
BVH queries against 1.6M, 2.9x the wall clock on a real run (95.9 s against
32.9 s). Making the test two-sided (settle `clear` above the band, `blocked`
below it, ask only between) brought that to 1.8x, and pairing it with
`ColumnClearanceMap` — which removes whole columns — turns the combination into a
win: **50% fewer reads, 28% fewer BVH queries, 34% faster than the original** on
the router's own probes.

The bug, for the record. `segmentBlocked` steps along the segment by `distance - clearance`
on the 1-Lipschitz property, but the distance it steps on comes from
`boundedDistanceAt`, which **quantizes the query to a 0.5 mm cell**
(`quantizeToCell` rounds) and answers for that cell's lattice point. The
Lipschitz argument needs the distance *at the sample point*: the true distance
there can be smaller by up to the distance to that lattice point, so a step can
carry the march past a region inside `clearance` and the segment comes back
clear. The comment above `MARCH_DISTANCE_BOUND_MM` argues the bound is exact —
that argument is about the *bound* (it is what lets the BVH prune, and it is
sound for the sign), but it assumes a point-exact distance, and this distance is
not.

Measured on the router's own probes (a 2000x250 torus knot, 502,251 vertices,
clearance 0.7 mm): of 4772 probes, **3 were reported clear with a point on the
segment 0.5976 mm from the model**. Verified with
`closestPointToPoint(point, target, 0, Infinity)` and cross-checked by a
brute-force scan of all 502,251 vertices (nearest 0.5990). `distanceAt` cannot
check this — it is quantized to the same grid, and reported 0.798 for that point.
Effect: a routed column can clip the model by up to a cell's quantization, on
0.06% of probes.

What remains approximate. The march's `minStep` floor (`cellSize * 0.9`) still
lets a point inside clearance sit between two samples whose bounds are both
clear, so `blocked` from the map can still exceed `blocked` from the march by
that residue — one probe in ~2800 in the measurement above. Closing it means
interval termination (prove `clear` from `min over samples (d) - spacing/2`, and
refine when that fails) rather than a smaller floor everywhere. Measure that
before building it.

## Measured: a vertex-ball column-clearance map (landed)

The router's columns all run from a walk point down to `rootTopZ`, which is
below the model, so a column is blocked exactly when the blocked set at that XY
has any element in `[rootTopZ, zTop]` — i.e. the whole Z-interval structure
collapses to its minimum. That is one scalar per XY cell, and it makes the build
a single min-push instead of the interval map's per-cell lists (which is why
that one took 6.8-36.7 s and this one does not).

The scalar has to be a *real* blocked Z to be usable, and the way to get one
without an error budget is to draw balls around **mesh vertices**: a vertex is
provably on the solid, so a ball of `clearance` around it is provably inside the
blocked set. Every earlier rasterized version had to bound how far a cell could
sit from the surface it stood for, and a triangle clipping a cell charges its
lowest vertex to a cell up to a triangle-width away — hundreds of times the
error the verdict can absorb.

Measured on the same knot (radius = clearance minus the query's half-cell snap):

| cell | build | memory | column probes settled | query |
|---|---|---|---|---|
| 0.3 mm | 57 ms | 0.2 MB | 94.1% | 0.24 µs |
| 0.2 mm | 88 ms | 0.5 MB | 94.8% | 0.13 µs |
| 0.1 mm | 301 ms | 1.8 MB | 95.8% | 0.13 µs |

`blocked` is sound by construction here, and it measurably works: against the
router's own probes it cut cell reads by 56%, and paired with the exact march the
stage's reads fell 50% and its time 34% against the original. It is landed —
`SDFCache.enableColumnMap` is opt-in and clearance-specific, and the router
turns it on in `calculateSmartPlacementV3`. It can never say `clear`: proving
nothing is within clearance needs completeness, and vertices are not complete.



## Steep-flat coverage: from carpet to brace

**Direction.** A steep flat (45–`STEEP_FLAT_MAX_ANGLE_DEG`, ≥ `STEEP_FLAT_MIN_AREA_MM2`)
is classified as an overhang region and then gets the same treatment as a
formation overhang: boundary ring plus grid infill, which carpets the whole
face. It prints fine by itself — the only thing contact on it buys is
**toppling resistance** — so a carpet is the wrong tool and a *brace* is the
right one. Measured on a cam-seal tool (58 mm tall, 97 % of its drag in the
steep band): a wall of supports climbed the sloped right face to ~40 mm, while
the pose's moment is dominated by a single patch near the top.

**Inputs, already shipped.** `OverhangRegion.drag_moment_mm3` (the patch's
`Σ A·sinθ·z`), `drag_dir_deg` (which way its drag pushes the part — the side
that lifts), `steep_flat`, and the pose totals from `compute_stability_report`
(`drag_moment_mm3`, `adhesion_ratio`, `margin_mm`). `scan_overhangs` logs the
top four regions by moment, so a placement rule can be judged against real
models before it ships.

**Shipped: brace instead of carpet** (rule 3). A `steepFlat` island keeps the
density grid at `STEEP_FLAT_SPACING_MULTIPLIER` (2.5) times the spacing — a
sparse field, not a carpet, and not bare either (removing the coverage outright
left a huge shoulder unsupported) — and `computeStabilizationAnchors` self-steers from the
report it measures: braces rank above the rest when they sit on the side the
part lifts (opposite `pushDirDeg`, the longest lever from the tipping edge),
they climb to `dragTopMm`, and a buttress is spaced `BUTTRESS_SPACING_MM`
(8 mm) rather than the 2.5 mm the continuous base line needs. The gate also
fires on the adhesion verdict with a deliberately conservative
`CONSERVATIVE_P_SIGMA = 0.05`.

Coverage is now gated on the pose's verdict rather than on the classification
alone (`needsToppleCoverage`): a steep wall on a part that stands on a wide
patch with its centroid well inside it gets nothing, which is what stopped a
squat cylinder coming back wrapped in a forest.

Still open: sizing the braces by the *deficit* rather than by rank, and the two
constants it needs.

**Blocker for anything sized rather than ranked.** `p/σ` is still uncalibrated,
and the adhesion side measures the *bare* part's bearing patch (151 mm² at
3.10 mm for the tool) — it does not model the braces themselves, and it does
not know about a raft, which would replace the model's own contact patch with
the raft footprint. Resolve the raft question before using any logged ratio as
a bound.

## Slicing must preserve closed meshes across build-volume boundaries

**Rule:** preserve the closed surface of any model intersecting the build volume,
including its outside portions. Only fully-outside models are excluded, using
`isBoundsDisjointFromVolume` in `src/utils/modelBounds.ts`. The export entry point
also checks the printer's volume, so callers cannot accidentally include a
disjoint model merely by omitting the UI's exclusion list.

`buildSolidSliceMeshForWasm` in `src/features/slicing/rasterLayerZipExport.ts`
collects complete model surfaces, then support surfaces and generated support/raft
geometry. `src/features/slicing/sliceExportOrchestrator.ts` stages their coordinates
unchanged as `raw_f32`, in both single-shot and chunked transfers. This uses twice
the transport bytes of `quantized_u16` but avoids its quantization allocation and
pass, and does not clamp coordinates to the printable volume.

The native rasterizer retains outside crossings when computing scanline winding,
then crops filled spans to the printable raster. Layer count limits build height;
it must not be implemented by clamping vertex Z coordinates either. For example,
a closed model crossing the +X plate edge still prints its in-plate portion, and
its outside exit crossing still determines where that portion is solid.

Clipping each surface triangle without adding caps opens the solid at the cut.
At the X borders this removes an entry or exit crossing: an isolated object can
disappear, and several objects can produce an inverted band through their gaps.
Zero XY projected area is not a valid reason to drop a 3D triangle: vertical walls
can have zero XY area while supplying essential winding crossings.

## Known: a scene history push snapshots the whole support state, twice

Every scene-level edit pushes a `{ before, after }` pair into
`sceneSnapshotRegistry` (`useSceneCollectionManager.ts`), and each half carries a
full deep copy of the support store — thousands of entities once a plate has been
auto-supported. `Confirm Duplicate` measured ~340 ms on a synthetic 20-model ×
150-support scene (9,000 entities) with 8 copies: ~130 ms for the two support
snapshots and ~195 ms for the per-copy support paste.

Fixed so far, measured with `npm run bench:duplicate-confirm` (same scene, best
of five runs):

- the snapshot copy walks plain data (`clonePlainData` in
  `src/utils/plainDataClone.ts`) instead of `structuredClone`, whose ~10 µs fixed
  cost per call dominates thousands of small records — ~2.8× faster on the same
  state;
- `cloneSupportState` installs the collection views over the copy instead of
  re-deriving them through `normaliseSupportState`, which walked the whole state
  twice more per snapshot;
- `pasteModelSupports` merges every target of one gesture into a single store
  write; the per-copy call rebuilt the store's whole index once per copy.

That scene and copy count now measures ~146 ms. Still open:

1. Both halves are full copies, so a duplicate adding N entities still pays
   2 × O(total support entities). A patch-shaped entry — the ids added, and the
   ids removed with their entities — would make it O(N) and delete the copies
   from the confirm path entirely.
2. `estimateSceneSnapshotRegistryBytes` counts geometry only, so support copies
   sit outside the ~300 MB eviction budget: 200 entries of a 9,000-entity state
   are retained with nothing accounting for them.
3. Undo copies the stored snapshot again (`applySceneSnapshot`), so a restore
   pays a third full copy.

## Known: Select-mode hover and selection pay per support

Outside support mode the supports draw through `SupportProxyMeshLayer`'s four
instanced batches, and R3F raycasts every instance of every mesh carrying a
hover handler on each pointer move. Measured with the app's three.js: ~0.11 µs
per instance, so ~3 ms per move at 5k supports, ~13 ms at 20k, which is a hover
that stutters and drags the frame rate down as a plate fills up. A selection
click paid its own O(total supports) pass: the base/highlighted split was
rebuilt, both `InstancedMesh`es were remounted (new geometry, new material, full
matrix upload) because each batch is keyed by its instance count, and both
batches then rewrote every instance matrix.

Fixed so far:

- hover, clicks and drag starts on the proxy batches go through a grid-indexed
  raycast (`src/supports/proxyHoverIndex.ts`): the supports are indexed into
  cells and a ray only tests the cells it crosses, so a hover costs O(cells)
  instead of the O(supports) three's per-instance walk paid. The hit stays per
  support, within a grab radius that scales with distance, so a support a
  fraction of a pixel wide is still grabbable. A box per model was tried first
  and rejected: it covers the gaps between supports and the model itself;
- a selection, and the hover tint with it, recolours the batch instances
  (`instanceColor`) instead of drawing one overlay per model. The tint is a
  computed colour that replaces the base, so a hovered support reads the same
  whether or not it is also selected. Curved shafts are merged one mesh per
  colour, so their colour takes the material route rather than a vertex
  attribute. Selecting all models costs one colour pass (~2 ms at 100k
  instances) with no extra meshes and no second draw of the same geometry. The
  colour pass is a separate layout effect from the matrices;
- the layouts stopped minting a `Vector3`/`Quaternion` per instance per pass
  (the cone batch ran six passes), and each curved shaft's swept tube is cached
  by the shaft object, so a re-layout merges cached tubes instead of building
  them again;
- the raft proxy geometries got a bounds tree: without one their raycast is a
  per-triangle walk paid per visible raft on every pointer move (measured ~7 ms
  for 20×5k triangles, ~50 ms for 20×20k, against ~0.12 ms with a tree);
- the world layer no longer drops the active model from its batches. It keeps it
  and zero-scales its instances (`isHidden`), so making a model active costs the
  instances whose state changed instead of a full re-layout of the plate. Curved
  shafts come from the visible set and are merged again, which is cheap now that
  each shaft's sweep is cached.

Still open:

1. `RaftProxyMeshLayer` and `SupportProxyMeshLayer` each hold a single-entry
   module cache keyed on the whole support-store snapshot, so any store write
   (including hover and selection writes) rebuilds every proxy primitive.
2. `sharedProxyCache`'s geometries are never disposed when the cache is
   replaced; the raft cache leaks its per-model geometries the same way.
3. A model drop offset (`modelDropOffsetsById`, live during a drag or a drop
   animation) re-appends every primitive in the scene with the offset, so the
   base batch rebuilds and re-uploads all of its matrices per frame. The offset
   belongs on the group transform, as the overlays already do it.

## Measured: where the baked AO's striping comes from, and what a GPU bake buys

The per-vertex bake's visible trouble is not the tessellation, and it is not the
ray count on the coarse cases either. Measured on two models, both axes against a
reference built from the mean of two 64-ray CPU fields, with "roughness" as the
mean absolute deviation from a vertex's one-ring average (the mesh-space form of
the striping a zoomed view shows):

| model | path | rays | bake | RMS vs reference | roughness |
| --- | --- | --- | --- | --- | --- |
| puck, 768,734 tris | shipped (CPU, fixed fan) | 8 | 0.50 s | 0.05542 | 0.03030 |
| | new CPU (turned fan) | 32 | 1.90 s | 0.02089 | 0.02341 |
| | new CPU (turned fan) | 64 | 3.84 s | **0.00769** | 0.01883 |
| | new CPU, + one graph pass | 64 | + graph | 0.02420 | **0.00871** |
| | GPU (fixed fan) | 8 | 41 ms | 0.05542 | 0.03030 |
| | GPU (turned fan) | 64 | 274 ms | 0.01313 | 0.01885 |
| | GPU, turned + one graph pass | 64 | + graph | 0.02513 | 0.00871 |
| poussin, 170,790 tris | shipped (CPU, fixed fan) | 8 | 0.07 s | 0.05336 | 0.03231 |
| | new CPU (turned fan) | 64 | 0.63 s | **0.00710** | 0.01899 |
| | new CPU, + one graph pass | 64 | + graph | 0.01951 | **0.00980** |
| | GPU (turned fan) | 64 | 52 ms | 0.01215 | 0.01901 |
| | GPU, turned + one graph pass | 64 | + graph | 0.02049 | 0.00981 |

The two levers are independent: **rays buy accuracy** (0.055 → 0.008 as 8 becomes
64) and **one mesh-graph pass buys smoothness** (0.030 → 0.009 roughness) at a
cost of some accuracy, because the pass averages the field's own sub-millimetre
variation along with the noise. Decorrelating the fan without a pass is strictly
worse than leaving it fixed at 8 rays (roughness 0.048 against 0.030) — that is
the grain a per-vertex rotation shipped once and had to be reverted for; it only
becomes worth it when a filter follows it, which the mesh graph provides and a
vertex cloud alone does not.

**The GPU bake is bit-identical to the CPU one at the same fan** (the fixed-8
rows above agree to five decimals on both models, and 384,324 vertices differ by
a mean of 0.000000, a maximum of 0.016 on one vertex — the fp grazing-ray class
the occlusion module already documents). What it is *not* is the 250× that the
brute-force throughput floor suggested: a naive WGSL BVH traversal gets about
**80 M rays/s** here (41 ms for 3.07 M rays, 274 ms for 24.6 M), so the win is
**9–14×**, not two orders of magnitude. That is the cost of incoherent dependent
loads: an 8 MB tree misses cache at every node visit, and a thread-per-ray walk
has little to hide it with. Closing that gap needs a cache-friendlier tree
(quantised nodes), ray batching, or hardware ray tracing.

**Hardware RT exists on this machine and wgpu cannot use it on Windows' default
backend.** `wgpu` sees the RTX 3080 three ways: Vulkan, which reports
`EXPERIMENTAL_RAY_QUERY` and acceleration structures true; Dx12 (three adapters)
and GL, which report both false; plus the `Microsoft Basic Render Driver` CPU
adapter. macOS has no path at all, in wgpu or on Apple silicon. So the ladder is:
a compute traversal everywhere, an optional ray-query fast path on Vulkan+RT, and
the CPU bake as the floor — with the CPU bake's own numbers above as what that
floor costs.

The unwrap remains the only part of a *textured* AO map that has no GPU story:
measured at 405 s bounded-chart on the puck, versus seconds for a decimated
proxy — while the texel bake over the same model is 394 M rays, which this
traversal would do in ~5 s and a ray-query path in well under one.
