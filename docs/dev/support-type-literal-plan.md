# Removing support-type literals — the next stages

**Goal:** a support type's name appears in exactly one place — the registry's
`SupportFieldsByType` — plus that type's own folder. Renaming `stick` to `sticky`
becomes a one-line registry edit with every stale reference a compile error.

This is the plan for the remaining work. It is grounded in a fresh measurement of
every type-name literal in `src/`, classified by what the literal *does*.

Companion: `docs/dev/support-type-extension.md` (how to add a type),
`docs/dev/support-registry-findings.md` (defects found along the way).
Machine-readable inventory: `lysdiag/type-literals.json` (never committed).

---

## 1. Where we are

### 1.0 Already done (so this plan stands alone)

The refactor so far, on `test/supportrefactorexperiment`, 28 commits from
`844051ed`. Each is a *concept moved into the registry*, which is the pattern the
stages below repeat:

- **Host concept derived.** `canBeGridHost` + `GRID_HOST_TYPES`; a host travels as
  `(hostTypeId, hostId)` so every lookup indexes its own collection.
- **Removal shapes derived.** `SUPPORT_REMOVAL_SHAPES` drives the removal payload.
- **Export geometry seam.** `registerSupportExportGroup` + a load-time
  completeness check; eight `build<Type>Group` moved to their type folders.
- **Preview geometry seam.** `registerSegmentPreviewBatchBuilder`, registered from
  the render layer.
- **Sidebar vocabulary derived.** `sidebarPanels.ts` + `anatomyPreviewRegistry.ts`;
  the old SupportKind union and its KINDS_META table deleted.
- **Placement stores unified** onto one `createPlacementStore` primitive.
- **History actions derived** from the type id.
- **Auto-placement overrides registered.** `replacedByHigherContact` +
  `registerHostPromotion`; `registerContactOverride` for the anchor's own build;
  `hasOrigin` gating origin stamping. Each backed by a load-time error.
- **One derived placement shape.** `PlacedSupport` as a mapped union on `typeId`
  (`SupportEntityFor<T>`), so narrowing gives the entity's real type.

**Notable negative result:** the `SUPPORT_KINDS` failure — flags whose bodies were
inline `if`s in the sidebar, so nothing tied them to the registry and they
drifted. This is why §3's mechanism has five mandatory parts, including the
load-time error.

### 1.1 Baseline

**Measured at `9cd87c63`.** Excludes `supportTypeRegistry.ts` (the naming
point) and generated files. Each type's own `SupportTypes/<Type>/` folder is
counted separately and **conceded** — a type is allowed to name itself.

| shape | outside `SupportTypes/` | inside (conceded) | what it is |
| ----- | --- | --- | --- |
| **dispatch** | 50 | 9 | `x === 'trunk'`, `case 'leaf'`, `kind === 'brace'` — a branch on the name |
| **value** | 190 | 61 | the name passed as data: `getSupportEntity('trunk', id)`, `kind: 'leaf'` |
| **declaration** | 5 | 0 | a table/set listing types |
| **total** | **245** | 70 | |

Progress on the metric that was being tracked: **literal dispatch outside
`SupportTypes/` is 74 → 50** since the refactor began.

### 1.2 A measurement failure worth reading first

`lysdiag/tools/dispatch-metric.py` counts only `=== 'type'` / `!== 'type'`.

That is **not the shape the regressions actually take.** In `1bd7bfa2` the grid
engine's two decision kinds (place_leaf, place_branch) were turned into
type-name literals spelled at five sites — `placementOf('branch', …)`,
`leafTypeId: 'leaf'` — all in *argument position*. The dispatch metric did not
move: still exactly 50. Five literals were added, then removed in `9cd87c63`, and
the number never changed.

**Consequence:** the headline number this project has been tracking cannot see
the most likely regression. It reads as coverage while measuring one narrow
syntax form.

`lysdiag/tools/type-literal-metric.py` (new) counts and classifies **every**
string literal equal to a type id. Use it from here. Both are described in §7.

---

## 2. What counts as a target

Not every literal is a defect. The test is whether the literal is a **rename
hazard** — i.e. renaming the type in the registry would leave this site silently
wrong or failing to compile.

**Targets** (a rename must reach them, or compilation must break):

- **Dispatch** — the site *chooses behaviour* by name. Renaming leaves a branch
  that never fires, with no compile error on a string compare.
- **Value into a store/renderer API** — `getSupportEntity('trunk', id)`,
  `renderDetailFor('trunk')`. A rename makes the lookup miss at runtime.
- **Declaration** — a hand-maintained table of types. Drifts from the registry
  silently. (This is exactly how `SUPPORT_KINDS` failed.)

**Not targets** (conceded, with the reason):

- A literal in the registry itself. It *is* the naming point.
- A literal inside that type's own folder. The type is allowed to know its name —
  `trunkRegistration.ts` registering `'trunk'` is correct.
- A **different vocabulary** that reuses the word. Verified individually:
  `origin === 'anchor'` (`SUPPORT_ORIGINS`), `sizingPreset === 'anchor'` (a sizing
  tier, not a support type), `intent.family === 'leaf'` (a placement family).
  These must not be "fixed" — they are four values that happen to share a
  spelling, and conflating them is its own bug.
- A literal in a **comment**.

---

## 3. The five root causes

The literals are symptoms. Each has an API or a structure underneath it, and
fixing that structure removes a whole class at once. Ordered by volume.

### A. Store accessors take a type name to mean "the collection of that type" — **~45 sites**

> **Partly retargeted after executing the first half — read this before starting.**
>
> Executed: `updateSupportEntity(entity)` (derived from the entity's own `typeId`)
> and `getSupportEntity(id)` (derived via a registry-resolver slot) both work, and
> the explicit forms are now GENERIC, so `getSupportEntity('branch', id)` returns
> a `Branch` instead of `unknown`. That removed **14 unsafe `as X | null` casts**
> across 5 files — a real win, and the reason to keep going.
>
> But it corrected an assumption: **for `getSupportEntity`, the type id is
> LOAD-BEARING for static typing.** The one-argument form can only return the
> union `SupportEntityAny`, so a caller that needs `branch.segments` would have to
> narrow by hand — reintroducing a dispatch literal. Dropping the type argument
> there trades a value-position literal for a dispatch literal and loses safety:
> strictly worse. Converting those 14 sites that way broke 10 type errors, which
> is how the assumption was caught.
>
> So the honest target for this class splits:
>   - **`update*` / `replace*` / `apply*`** — the entity carries `typeId`, the
>     argument adds nothing, and removing it is a strict win. **Converted.**
>   - **`get*` by id** — the argument provides the static type. Keep it. The win
>     there is the typed return, not literal removal.
>   - **`addSupportEntity`** — genuinely needs the type (the entity is new).
>   - **`resolveSegmentEndpoints` / `splitSupportShaft`** — the caller already has
>     the entity; these want the entity-takes-its-own-type treatment.

Exact API list and count (outside `SupportTypes/`):

| API | sites | example |
| --- | --- | --- |
| `getSupportEntity(typeId, id)` | 14 | `getSupportEntity('branch', branchId)` |
| `updateSupportEntity(typeId, entity)` | 9 | `updateSupportEntity('trunk', newTrunk)` |
| `addSupportEntity(typeId, entity)` | 8 | `addSupportEntity('anchor', anchor)` |
| `removeSupportEntity(typeId, id)` | 8 | `removeSupportEntity('leaf', leafId)` |
| `replaceSupportEntity(typeId, entity)` | 3 | |
| `applySupportEntityUpdate(typeId, entity)` | 3 | |
| `resolveSegmentEndpoints(typeId, …)` | 10 | |
| `splitSupportShaft(typeId, …)` | 2 | |

**These are the single biggest class, and the fix already exists.**

Every entity the store hands out carries `typeId` (`SupportEntity.typeId`), and
`getSupportTypeOf(id)` already reads it. So the parameter is redundant information
the caller is forced to re-state — and re-stating it is where the literal comes
from.

**Mechanism:**

1. Overload each accessor to accept the entity alone and read `entity.typeId`:
   `updateSupportEntity(entity)`, `replaceSupportEntity(entity)`,
   `applySupportEntityUpdate(entity)`, `splitSupportShaft(entity, …)`.
   Keep the explicit-type form internally; it stays the primitive.
2. For lookups by id (`getSupportEntity(id)`, `resolveSegmentEndpoints(id, …)`),
   resolve the type through `getSupportTypeOf(id)`, which already exists and
   already has the load-time fallback for unstamped entities.
3. `addSupportEntity` genuinely needs the type — the entity may not exist yet.
   It stays typed, but its *callers* should hold the type in a variable rather
   than repeat a literal; most already do.

**Risk:** low, but not zero. `getSupportTypeOf` falls back to scanning collections
for unstamped entities. Overloading `getSupportEntity` to accept `(id)` changes
its first-argument meaning — a call passing a type id would silently become a
lookup of an entity with that id. Mitigate by making the arity explicit in the
signature (`getSupportEntity(id)` as a distinct overload is ambiguous with
`getSupportEntity(typeId, id)` only when called with one arg — TypeScript accepts
both, so a one-arg call is unambiguous by arity). **Verify with the rename test
plus a mutation that makes `getSupportTypeOf` return null.**

**Size:** ~45 sites across 12 files, mostly mechanical.

### B. Renderer family dispatch — **~18 sites**

`SupportRenderer.tsx` calls one function per type in a fixed list:

```
renderDetailFor('trunk')  renderDetailFor('branch')  renderDetailFor('leaf') …
renderSceneBatchedShafts('trunk', sceneBatchedShaftsOf('trunk'))
groupRootsForSceneBatch('trunk', …)
selectedOf('trunk')
```

**Mechanism:** one loop over `SUPPORT_TYPES`, gated by declared flags that already
exist or are near-derivable — `hasSegments` (does it have shafts to batch),
`shaftTaper`, `batchesShaft`, `batchesContactCones`, `hasOrigin`, `lower`/`upper`.
A type that declares no shaft renders in the detail path automatically.

**Risk:** medium — this is the render hot path, and a wrong flag silently drops a
type's geometry from the scene. **Verify with the existing scene/export goldens
plus a per-type presence assertion** (every type with `hasSegments` must appear in
the batched output). The goldens cover geometry, not render call order.

**Size:** ~18 sites in 1–2 files, but needs a flag audit first.

### C. Behaviour dispatch inside interaction logic — **50 sites**

This is the remainder, spread thin. Each needs the pattern already established:
**a declared flag, a registered implementation in the owning folder, and a
load-time error if a flag is declared without one.**

| file | sites | what it dispatches on | likely mechanism |
| --- | --- | --- | --- |
| `Knot/useKnotInteraction.ts` | 7 | the knot's **host container type** | `containerType === 'brace' \| 'trunk' \| 'twig'` behaviour dispatch (curve span, elastic-preview fast path, twig cone persistence) — the host *resolution* side is already registry-driven (§4) |
| `autoBracing/autoBrace.ts` | 6 | `supportKind === 'trunk'` while a generic `isAutoBraceable` flag already exists | **this one is a real inconsistency** — see §6 |
| `Curves/BezierGizmo/BezierGizmoManager.tsx` | 5 | which type's curve is being edited | a declared "editsCurve" flag or a registered curve resolver |
| `Settings/*` (sidebar, anatomy canvas, TrunkPreview) | 10 | which panel/kind is active | partly done (`sidebarPanels.ts`); the remaining `activePanel === 'trunk'` checks are UI layout, and may legitimately stay |
| `interaction/jointDragPreview{,Math}.ts` | 5 | `preview.kind === 'trunk' \| 'kickstand'` | the preview payload should carry a registry-resolved id, or a declared "dragPreviewShape" |
| `autoSupport/autoPlace.ts` | 4 | placement outcomes | mostly in the signature/test-message path |
| `app/page.tsx`, `useSupportInteractionManager.ts`, `presets.ts`, `settings.ts`, `autoBracingHotkey.ts` | 7 | assorted | per-site |

**Mechanism per site, in the established order:**
1. Name the concept (`canBeGridHost`, `replacedByHigherContact`, `hasOrigin`).
2. `register<Concept>` in the owning type's folder.
3. Lookup in the default path.
4. Load-time error in `state.ts` when a type declares the flag and registers
   nothing (`typesMissingHostPromotion`, `typesMissingContactOverride` are the
   pattern).
5. A test in `__tests__/typeRegistrations.test.ts` asserting the missing-list is
   empty.

**Rule that makes it safe (do not break it):** *a flag must select a registered
implementation, not gate an inline branch.* `SUPPORT_KINDS` failed because its
flags' bodies were `if`s in the sidebar, so nothing tied them to the registry and
they drifted. Every override gets all five parts above.

**Risk:** high per site — these are behaviour changes with no compile-time
safety net on the string compare. **Verify each by mutation**: flip the flag, or
delete the registration, and confirm a named test fails.

**Size:** 50 sites, but they are 5+ distinct concepts, not 50 independent edits.
Expect ~6–8 concepts.

### D. Payload fields carrying a type id — **~32 sites**

`kind: 'trunk'`, `typeId: 'brace'`, `supportKind: 'trunk'`, `family: 'leaf'` on
data structures. These are values, not dispatch — but each is a rename hazard and
several are the *source* of the dispatch in C.

**Mechanism:** where the payload was produced by a registry lookup, carry the
looked-up id rather than re-spelling it. Where a discriminant exists only to be
compared, replace it with the declared flag that already answers the question.

**Do not** convert these to `SupportTypeId`-typed unions without checking the
comparison sites — a payload field typed as a union still needs a literal to
construct.

### E. Declarations — **3 sites**

`gridPlacement.ts`'s two localized constants, and `sidebarPanels.ts`'s
`TYPE_PANELS`. Mostly done.

> **`TYPE_PANELS` is NOT a target — verified, not assumed.** The plan's earlier
> hypothesis was that it derives from `sidebarTab` + `hasEditableSettings`.
> Measuring the actual flag values disproves it:
>
> | type | hasEditableSettings | sidebarTab | in `TYPE_PANELS` |
> | --- | --- | --- | --- |
> | trunk | true | trunk | yes |
> | branch | true | trunk | yes |
> | leaf | true | trunk | yes |
> | twig | **false** | trunk | **yes** |
> | stick | **false** | stick | **yes** |
> | brace | false | trunk | no |
> | anchor | false | trunk | no |
> | kickstand | **true** | trunk | **no** |
>
> It is not `hasEditableSettings` (twig and stick are in with `false`; kickstand
> is out with `true`), and not `sidebarTab`. The documented reason holds: which
> panels the sidebar OFFERS is a UI decision.
>
> It is also not a rename hazard: the list is annotated `readonly SupportTypeId[]`,
> so renaming a type in the registry is a COMPILE ERROR here, not a silent stale
> entry. That is the good case — the compiler catches it — and it is why this list
> is a declaration rather than a defect.
>
> Left as is, with the reasoning recorded so it is not "fixed" later.

---

## 4. Staging

Each stage is independently shippable and independently verifiable. Order is by
ratio of volume removed to risk taken.

**Progress: stages 0, 1 (first half), 4 (host resolution) and 5 done. Literal dispatch 50 → 39.**

| stage | work | sites | risk | status |
| --- | --- | --- | --- | --- |
| **0** | Metric + CI ratchet (`scan-type-name-literals.ts`) | 0 | none | **done** |
| **1a** | Store WRITE accessors derive from the entity; getters gain a typed return | ~45 | low | **done** — 14 casts deleted |
| **1b** | `resolveSegmentEndpoints` / `splitSupportShaft` take the entity | ~12 | low | **deferred** — the remaining literals sit inside `preview.kind === 'trunk'` branches, so removing them is stage 6 work, not stage 1 (see §3A) |
| **2** | `TYPE_PANELS` derives from the registry | — | — | **closed, not a target** (see §3E) |
| **3** | Renderer family loop | ~18 | medium | pending |
| **4** | Knot-host resolution through the registry | ~10 | medium | **done (host resolution)** — see the correction below; the 7 `containerType ===` sites are behaviour dispatch, not host resolution, and sit in stage 6 |
| **5** | `autoBrace` uses its flag; `branch` made reachable | 6 | medium | **done** — dispatch 44 → 39 |
| **6** | Remaining concepts, one at a time | ~30 | high each | pending |
| **7** | Payload fields | ~32 | low–medium | pending |

**Stage 4 correction, from doing it.** The stage was described as "the knot's
`parentShaftId` should resolve to `(typeId, entity)` through the registry" and
priced at 7 sites. That half is now done: `findHost` and the drag diameter path
spelled out `'braceSegment:'` plus `getSupportEntities<Brace>('brace')`, which is
a prefix string neither the rename test nor the literal metric sees. Both now use
`parseKnotHostId` / `parsePrefixedSegmentId`, which read the declared prefix. The
**7 dispatch sites** the metric reports in `useKnotInteraction.ts`, though, are
`containerType === 'brace' | 'trunk' | 'twig'` comparisons — behaviour dispatch on
an already-resolved type, not host resolution. They belong to stage 6.

**Do not parallelise stage 6.** Each concept needs the whole-run signature and the
rename test to move under it; two landing together make a failure ambiguous.

### 4.1 What stages 0/1a/5 taught that changes the rest

1. **A "declared but unread" flag looks exactly like a false one.** `branch`
   declared `isAutoBraceable: true` for as long as anyone can remember while six
   literal filters discarded it. Nothing failed; the smoke alarm was simply not
   wired. Any flag this plan adds needs a test asserting its effect, not its
   value.
2. **The type argument to a store READ accessor is load-bearing.** It is what
   gives the caller a typed entity. Removing it trades a value literal for a
   dispatch literal. Chase the CASTS there, not the literals. (§3A)
3. **A list of types is not automatically a defect.** `TYPE_PANELS` is annotated,
   so a rename is a compile error — the compiler does the job the metric would
   have been standing in for. (§3E)
4. **Beware a test that passes for the wrong reason.** The stage-5 reachability
   test first used a scene containing a trunk, so `skippedSupportCount > 0` was
   satisfied by the trunk and it passed under the old literal too. A
   branches-only scene makes the filter the only possible cause. Mutating the fix
   back out is what exposed it.

---

## 5. Instrumentation

### 5.1 Two metrics, and which to trust

- `lysdiag/tools/dispatch-metric.py` — counts `=== 'type'` only. **Keep for
  continuity, but do not treat as the target.** It misses value-position
  literals entirely (§1.1).
- `lysdiag/tools/type-literal-metric.py` — **new.** Counts every string literal
  equal to a type id and classifies it `dispatch` / `value` / `declaration` /
  `other-vocab` / `object-key` / `comment`, splitting outside vs. inside a type's
  own folder. Supports `--json` and `--verbose`.

Both must run from the DragonFruit repo root.

### 5.2 The ratchet

Whatever CI exists today should gain:

1. `type-literal-metric.py --json` writes the inventory.
2. A gate that **fails when the outside-`SupportTypes` total rises** above a
   committed ceiling, per category.
3. The ceiling only ever moves down in a commit that lowers it.

A ratchet, not a target: this codebase has already added five literals while a
metric watched and said nothing.

### 5.3 The rename test

`lysdiag/tools/rename-test.py <type>` renames one type in `types.ts` only and
counts `tsc` errors in three buckets (registry / own folder / real work), then
reverts. It is the *semantic* check — it catches a literal that compilation
actually breaks on.

Its blind spot: a string literal in a comparison does **not** break compilation.
That is why the metric ratchet in §5.2 is needed alongside it, and why every
concept in stage C is verified by mutation rather than by the rename test.

---

## 6. Two defects already visible in the inventory

Found while measuring; fix as part of the stages that touch them.

**`autoBrace` filters with its flag but branches on names.** `isAutoBraceable` IS
read — it builds the sample pool — but the dispatch sites that follow still
compare the sample's own `supportKind` against a type name:

```
buildSupportSamples(...).filter(s => s.supportKind === 'trunk')
groupedSupports.forEach(g => g.forEach(s => { if (s.supportKind === 'trunk') …
groupMembers.filter((s) => s.supportKind === 'trunk')
groupMembers.filter((s) => s.supportKind === 'kickstand')
trunkSamples.filter(s => s.modelId === modelId && s.supportKind === 'trunk')
if (lowS.supportKind === 'trunk' && highS.supportKind === 'trunk')
```

So the pool is registry-derived and the *behaviour over it* is not. These are
mostly "is this a shafted host" (`canBeGridHost` / `hasSegments`) and one
kickstand case (`lateralStabiliserTypes()`). Earlier work converted the auto-brace
**purge** to walk the declared types and found the same split. Stage 5.

**`branch` declares `isAutoBraceable: true` but is unreachable in both auto-bracing
passes.** Pre-existing, recorded in the findings doc. Stage 5 must decide whether
to make it reachable or correct the flag — the flag currently lies, and a lying
flag is worse than a literal because it looks derived.

---

## 7. Verification discipline

The rule this project has learned the hard way, restated because every stage
below leans on it:

> **A mutation that looks uncaught may not have applied, and a test can pass for
> the wrong reason.**

Three instances so far:

- `MAX_FANNING_PASSES` lives in `autoPlace.ts`, not `constants.ts` — a mutation
  edited a string that was not there and reported a gap that did not exist.
- The first fan-angle test used a 6.02 mm span, which took the **branch** path, so
  the branch's angle gate refused it and the leaf gate under test never ran.
- `placementOf` was given a second, looser overload. TypeScript silently fell
  through to it, so `placementOf('trunk', leaf)` compiled clean. Caught only by
  writing the negative case with `@ts-expect-error` and noticing every directive
  came back **unused**.

Therefore, for every stage:

1. **Verify the mutation target exists and the file changed** before drawing a
   conclusion.
2. **Verify which path ran**, not just that the test passed.
3. For anything expressed as a type, **write the negative case** — the bad call
   that must not compile — and confirm it fails. A signature that looks strict and
   checks nothing is the failure mode this codebase keeps producing.

### Required gates per stage

- `npx tsc --noEmit -p tsconfig.json` clean.
- Full suite (903 tests) + goldens (50), **including untracked test files** —
  `git ls-files` silently skips them.
- `npm run check:docs` (103 documents).
- Gated lint, `--max-warnings 0`.
- The whole-run signature (`__tests__/autoPlaceSignature.test.ts`) unchanged for
  any stage that touches placement.
- The metric ratchet from §5.2 does not rise.

---

## 8. Decisions (answered)

1. **`branch.isAutoBraceable`** — **make it reachable.** The flag is right and the
   passes are wrong. Stage 5.
2. **The kickstand-on-branch behaviour** — **not a bug, leave it.** A
   branch-hosted kickstand legitimately does not stabilise that column, so the
   extra placement is the desired conservative direction (over-supported, never
   under-supported). Closed in the findings doc so nobody "fixes" it later.
3. **The `activePanel === 'trunk'` checks, and the word `trunk` for the menu.**
   **The menu label was a mistake — relabelled to "Support Info".** Done: the tab
   carries the contact cone, cone angle and root settings that apply to supports
   generally, so "Trunk" was wrong on its face.

   The *id* still says `trunk`, deliberately: it is the `sidebarTab` value every
   non-tool type declares, so renaming it reaches the registry's `SidebarTab`
   type and every descriptor — a type-name literal in a place that is not a type.
   That is a real instance of the class this plan exists to remove, and it is
   tracked below rather than smuggled into a label change.

   The remaining `activePanel === 'trunk'` **checks** are a separate question and
   stay open: they branch on which panel is showing, which is UI layout. Settle
   when stage 6 reaches that file.
4. **`computeAndApplySupportDiameterProfile`** — **no seam needed.** It is a
   geometry routine, not a type; importing it across folders is not the defect
   this plan is about. Left as is. (The uncovered add-side repair in §6 stands on
   its own as a test gap.)

### 8.1 Newly tracked: `sidebarTab` names a type but is not one

`SupportTypeDescriptor.sidebarTab: 'trunk' | 'raft' | 'grid' | 'stick'` — the
value `'trunk'` here means "the shared support-info tab", not the trunk type. Two
of the four values (`raft`, `grid`) are *tools*, and one (`stick`) is both a type
and its own page.

This is the §2 "different vocabulary" case, except it is not benign: the label
change above showed it reads as the trunk's own page to anyone looking at the UI.
Wants a SupportSidebarTab vocabulary with names that describe the PAGES
("supportInfo", "raft", "grid", "bracing"), declared in the registry. Low risk,
touches every descriptor plus `sidebarPanels.ts`.

---

## 9. What "done" looks like

- `type-literal-metric.py` reports **0 dispatch** and **0 declaration** outside
  `SupportTypes/`.
- The remaining value-position literals are all either (a) inside a type's own
  folder, (b) a documented different vocabulary, or (c) an `addSupportEntity` call
  where the type genuinely does not exist yet.
- `rename-test.py` reports **0 "real work"** errors for every one of the eight
  types. Current standing, measured at `9cd87c63`:

  | type | honest remaining | | type | honest remaining |
  | --- | --- | --- | --- | --- |
  | trunk | 76 | | stick | 19 |
  | branch | 99 | | twig | 13 |
  | leaf | 71 | | anchor | **4** |
  | brace | 38 | | kickstand | 28 |

  **348 total**, against a registry that accounts for ~26 of each type's errors
  legitimately. The `anchor` figure of 4 is the signal that its conversion
  (stage 4 of the completed work) actually landed — it was comparable to the
  others beforehand.
- The ratchet in CI holds the numbers, so the next instance of §1.1 is caught by
  a gate rather than by a person noticing.
