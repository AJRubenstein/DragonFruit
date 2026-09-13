# Removing support-type literals — the next stages

**Goal:** a support type's name appears in exactly one place — the registry's
`SupportFieldsByType` — plus that type's own folder. Renaming `stick` to `sticky`
becomes a one-line registry edit with every stale reference a compile error.

This is the plan for the remaining work. It is grounded in a fresh measurement of
every type-name literal in `src/`, classified by what the literal *does*.

**Three documents, no overlap:**

- **this file** — what is left to convert, and in what order
- `docs/dev/support-type-extension.md` — how to add a ninth type
- `docs/dev/support-registry-findings.md` — what is still broken (open only;
  resolved rows are archived outside the repo)

Tools live in `lysdiag/tools/` and are never committed.

---

## 1. Where we are

### 1.0 Already done (so this plan stands alone)

Each item below is a *concept moved into the registry* — the pattern the stages
repeat:

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

**Measured at `7012c6a2`.** Excludes `supportTypeRegistry.ts` (the naming
point) and generated files. Each type's own `SupportTypes/<Type>/` folder is
counted separately and **conceded** — a type is allowed to name itself.

Three instruments, and none of them alone is the picture:

**Re-measured after stage 3** (§4). Previous readings, kept for the delta, are
in the *was* column.

| instrument | what it answers | now | was |
| ---------- | --------------- | --- | --- |
| `rename-test.py <type>` | what a real `tsc` rename breaks, per type | 236 total | 280 |
| `inventory.py` + `report.py` | every token containing a type name | **6,836** occurrences, 780 tokens | 6,955 / 778 |
| `npm run scan:support-types` | the headline reference metric | **5,837** across 152 files | 5,909 |
| `type-literal-metric.py` | every string literal equal to a type id | 134 value outside `SupportTypes`, 16 dispatch, 5 declaration | 163 / 16 / 5 |
| `npm run check:support-literals` | the same, with the ratchet | 121 value, 12 dispatch, 3 declaration | 149 / 10 / 3 |

Three readings moved up or held still while the defect count fell, and each is
expected rather than a regression:

- **Occurrences down, distinct tokens up 2.** Stage 1 deletes one type-named
  identifier (`KickstandHostKind`) and adds three (`KICKSTAND_HOST_TYPES`,
  `KickstandHostTypeId`, one local interface) in the consumer that previously
  spelled the pair out. All three resolve through the registry, so a rename
  reaches them; the token count is the wrong lens for that.
- **The rename test rose for `trunk` (55 → 56) and `kickstand` (12 → 14).** Those
  are sites that were *silently* wrong and now fail to compile — the union
  members they name no longer exist, so the assignment and the `===` comparison
  are errors. See §3B. A rise here is the stage working.
- **`check:support-literals` reports 12 dispatch where it reported 10**, because
  its `.family ===` exemption was wrong (§2, §3B) and is removed. The two lines it
  hid are real dispatch.

**The rename test is the goal mechanised, but it is not the whole picture.** It
only sees what the compiler can prove. A literal that survives a rename *without*
a compile error is invisible to it and is exactly the dangerous case — that is
what the inventory is for. Report both, always.

#### The rename test, per type

Run for all eight, not just the convenient one:

| type | honest remaining | was |
| ---- | ---: | ---: |
| branch | **91** | 112 |
| leaf | 51 | 67 |
| trunk | 46 | 55 |
| brace | 17 | 17 |
| kickstand | 14 | 12 |
| stick | 10 | 10 |
| twig | 5 | 5 |
| anchor | 2 | 2 |
| **total** | **236** | 280 |

**Read this table before quoting a headline.** The refactor has largely been
measured on `stick`, which is the easiest type and now sits at 10. `branch` is
over ten times worse. A claim that the work is "nearly done" is true only of
whichever type was measured; it has never been true of the set.

`branch` is worst because it is both a support type and half the placement
vocabulary (`branchFamily`, `place_branch`, fan kinds). `trunk` is high because
it is the default tool. Neither is a surprise — but neither shows up if `stick`
is the only number reported.

#### What a real rename does, and what it misses

Renaming `branch` → `branchy` at the naming point and compiling: **145 errors
across 31 files**, concentrated in `autoPlace.ts` (28), the registry itself (23,
legitimately), `useKnotInteraction.ts` (15) and `KnotGizmo.tsx` (9).

**Fixed in stage 1.** Three things used to compile clean and were therefore
**silently wrong**: `SupportPlacementFamily`, `KickstandHostKind`,
`RemoveJointByIdResult` — all hand-written unions whose members are type ids
(§3B). That was the class to fear: not the 145 errors, which announce
themselves, but the three that did not. Each now fails to compile on a rename —
the `branch` → `branchy` run leaves `supportPlacementHotkeyResolver` and
`supportPlacementRouting` with `TS2322`/`TS2367` on `'branch'`, and `state.ts`
with `'branch'` not assignable to the narrowed joint-removal union.

### 1.2 A measurement failure worth reading first

`lysdiag/tools/dispatch-metric.py` counts only `=== 'type'` / `!== 'type'`.

That is **not the shape the regressions actually take.** In `1bd7bfa2` the grid
engine's two decision kinds (place_leaf, place_branch) were turned into
type-name literals spelled at five sites — `placementOf('branch', …)`,
`leafTypeId: 'leaf'` — all in *argument position*. The dispatch metric did not
move at all. Five literals were added, then removed, and the number never
changed.

**Consequence:** a dispatch-only count cannot see the most likely regression. It
reads as coverage while measuring one narrow syntax form.

`lysdiag/tools/type-literal-metric.py` counts and classifies **every** string
literal equal to a type id. Both tools are described in §6.

**The same failure has a second form, and it is the one that bit this plan.** A
count can be correct and still be reasoned away afterwards. The inventory *did*
itemise `supportPlacementRouting.ts`; the error was a classification call that
labelled it "placement family vocabulary — not dispatch", which then hardened
into a formal concession in §2. A wrong concession is worse than a missed count:
every later pass skips the site *on purpose*. When classifying a literal as
out-of-scope, apply the rename question in §2 and record the answer.

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
- A **different vocabulary** that reuses the word — but only where the value is
  genuinely not a type id. Two qualify: `origin === 'anchor'`
  (`SUPPORT_ORIGINS`, a placement provenance) and `sizingPreset === 'anchor'`
  (a sizing tier). Renaming the anchor type must leave both alone.
- A literal in a **comment**.

**How to tell a real separate vocabulary from a disguised type id:** ask whether
renaming the type *should* change this value. An origin stays `'anchor'` when
the anchor type becomes `anchory`; a placement family named after the leaf type
does not. When the answer is "it should change", the union is a type-id subset
and must be derived — not conceded.

> **Correction (a previous revision of this section got one wrong).**
> `intent.family === 'leaf'` was listed here as a separate vocabulary. It is not.
> `SupportPlacementFamily` in `supportPlacementHotkeyTypes.ts` is a
> hand-written union — `'none' | 'branchFamily' | 'leaf' | 'kickstand'` — whose
> `'leaf'` and `'kickstand'` members *are* support type ids. Rename `leaf` and
> the `intent.family` comparison in `resolveSupportPlacementRouting` silently
> stops matching, with no compile error.
>
> Four lines above it, `SupportPlacementOwner` gets this right via
> `Extract<SupportTypeId, …>`, so a rename produces 4 errors there and 0 on the
> family. Same file, same concept, opposite safety. The derivation template is
> already in the registry: `ModelSurfaceGestureTypeId` is a mapped type filtered
> by a descriptor flag. See §3B.

---

## 3. The root causes

**Measured at `7660b273`** by `lysdiag/tools/` plus a real `branch` → `branchy`
rename (145 compile errors across 31 files). Counts below are live sites —
outside the registry, `types.ts`, a type's own folder, and tests.

| cause | live sites | what it is |
| ----- | ---: | --- |
| **A. Store accessors taking a type name** | 32 | `resolveSegmentEndpoints('trunk', entity, …)` — the name identifies an entity the caller already holds |
| **B. Unions that are type-id subsets** | 3 hazards | hand-written unions whose members are type ids; no compile error on rename |
| **C. Behaviour dispatch** | 17 | `x === 'trunk'`, `case 'leaf'` |
| **D. Value literals (everything else)** | 148 | the name passed as data: `draftAddEntity(d, 'branch', b)`, `kind: 'leaf'` |
| **E. Declarations** | 1 | `TYPE_PANELS` — annotated, so a rename IS a compile error. Not a defect |
| **F. Per-type identifiers** | ~1,410 distinct | `branchId`, `leafHotkeyActive`, `isLeafPlacementActive`. **No instrument catches these** |

Renderer family dispatch (a cause in earlier revisions) is **done** —
`SupportRenderer.tsx` holds zero dispatch literals.

---

### A. Store accessors take a type name to mean "the entity's type" — **stage 2 done, 12 of ~32 sites**

The caller has the entity. Passing its type name alongside is a second source of
truth that a rename cannot reach.

`resolveSegmentEndpoints` and `splitSupportShaft` were the concentration — 12
literal calls, 8 of them in `state.ts`:

```ts
resolveSegmentEndpoints('trunk', trunkRef.trunk, firstSeg, 0, { root: trunkRef.root })
resolveSegmentEndpoints('branch', branchRef.branch, lastSeg, n, { hostKnot: parentKnot })
```

**Fixed:** both now take the entity and read its own `typeId`
(`resolveSupportTypeIdOf`, which falls back to the store's membership scan for an
entity that lost the field). The type-id parameter is gone, so the literal has
nowhere to live. `resolveShaftAnchor` keeps its `typeId` — its callers hold the
type but not the shaft — and `resolveShaftSegments`/`useShaftSegments` dropped
theirs, resolving from the entity instead.

**It surfaced a real defect, which the goldens caught.** `mergeFromImportFormat`
wrote incoming entities into the store *unstamped*, unlike `loadFromImportFormat`,
which stamps `typeId` on every entity it reads. Nothing noticed while readers
took the type explicitly; with the entity as the source, the knot-geometry pass
that runs before `setState` resolved nothing and a knot's diameter came out `1`
instead of `1.1`. The merge path now stamps per descriptor, like load. Both
halves are pinned by mutation: returning null from `resolveSupportTypeIdOf` fails
11 tests, and removing the merge stamping fails the `merge-with-owner` golden.

**Stage 3 closed the rest of that shape where the caller holds the entity.**
Seven `updateSupportEntity(typeId, entity)` calls became `updateSupportEntity(entity)`
(a spread or a `getSupportEntity` result, so the entity carries its own type), and
`updateSupportEntity`'s entity overload is generic now so a full entity is
accepted rather than a stripped `{ id }`. The convention test was widened to
match: a resolver takes `typeId: SupportTypeId` **or** an entity carrying
`typeId?`, and the explicit form is asserted to still exist.

**What is left of this shape is not a plain literal — it is typed dispatch.**
`getSupportEntity('trunk', id)` inside the joint-drag arm *carries the narrowing*:
swapping it for `getSupportEntity(owner.typeId, id)` loses the arm's `Trunk` type
and produces six errors. Same for `commitJointDragSupport('trunk', …)` and
`publishJointDragSupportPreview('trunk', …)`, whose `kind` selects the payload type
from a mapped union. A rename reaches all of these (the compiler rejects the
stale id), so they are cause D, not cause A. Converting them is stage 6 work:
the arm has to stop being per-type before its literal can go.

The deprecated `add<Type>` / `update<Type>` / `remove<Type>` wrappers in `state.ts`
are the other remainder, and are debt markers: each names its type on purpose, and
removing one means migrating its callers first.

### B. Unions that are type-id subsets — **done, stage 1**

The silent class. A hand-written union whose members are type ids produced **no
compile error** on rename — proven, not assumed: the `branch` → `branchy` run
left all three untouched.

| union | where | verdict |
| ----- | ----- | ------- |
| `SupportPlacementFamily` | `supportPlacementHotkeyTypes.ts` | **fixed** — type-id members are `Extract<SupportTypeId, 'leaf' \| 'kickstand'>` |
| `KickstandHostKind` | `SupportTypes/Kickstand/types.ts` | **fixed** — deleted; hosts are `KickstandHostTypeId`, derived from `KICKSTAND_HOST_BY_TYPE` |
| `RemoveJointByIdResult` | `state.ts` | **fixed** — a mapped union on `JointRemovalTypeId`, built from `JOINT_REMOVAL_BY_TYPE` |
| `SupportPlacementOwner` | `supportPlacementHotkeyTypes.ts` | correct — `Extract<SupportTypeId, …>`, produced 5 errors on rename |
| `SizingPreset` | `parameterSizing.ts` | legitimate — a sizing tier that happens to spell `'anchor'` |
| `SidebarTab` | `sidebarPanels.ts` | separate question — `'trunk'` here means the shared support-info tab, not the type. See §7 |

**`KickstandHostKind` showed the concession rule has a hole.** A type's own folder
may name itself — but when a union declared there is imported and used elsewhere,
the concession stops applying and nothing flagged it. It is gone: the host set is
now a registry fact (`hostsKickstand` + `KICKSTAND_HOST_BY_TYPE`), the guard is
`isKickstandHostType`, and `kickstandSnapTargets.ts` walks `KICKSTAND_HOST_TYPES`
instead of naming two collections.

**How the fix reads.** The template was already in the registry —
`ModelSurfaceGestureTypeId` is a mapped type filtered by a literal flag map:

```ts
export const KICKSTAND_HOST_BY_TYPE = {
    trunk: true, branch: true, leaf: false, /* … one entry per type … */
} as const satisfies Record<SupportTypeId, boolean>;

export type KickstandHostTypeId = {
    [K in SupportTypeId]: (typeof KICKSTAND_HOST_BY_TYPE)[K] extends true ? K : never;
}[SupportTypeId];
```

The map is a second spelling of a descriptor flag, so
`__tests__/derivedTypeSubsets.test.ts` holds it to `descriptor.hostsKickstand`
(and `JOINT_REMOVAL_BY_TYPE` to `hasSegments && !segmentsCarryBothJoints`), with
`@ts-expect-error` negatives for `'leaf'` as a host and `'twig'` as
joint-removable: widening either union makes the directive unused, which is a
compile error. Both mutations were run and both fail.

`'branchFamily'` is a genuine family name (branch + brace share a mode) and
stays, producing no literal.

**The rename test rose for two types, and that is the stage working.** `trunk`
55 → 56 and `kickstand` 12 → 14: those are sites that were silently wrong and
are now compile errors. `state.ts` reports `'"kickstand"' is not assignable to
type '"trunk" | "branch"'` at the joint-removal return, and
`supportPlacementRouting.ts` reports the `intent.family === 'kickstand'`
comparison as having no overlap. Neither was visible to any instrument before.

**Also reclassified:** `scripts/scan-type-name-literals.ts` carried a
`.family ===` exemption that called these lines "other vocabulary". After the
derivation they are dispatch, and the exemption hid them; it is removed. The
budget is ratcheted to the newly measured counts (`dispatch` 12, `declaration` 3,
`value` 137).

**How to find more:** `rg "^export type \w+ = '"` and apply the §2 rename
question to each member. That sweep also found the inline `kind: 'leaf' |
'branch'` union spelled at four sites in `autoPlace.ts`, now the registry-typed
`AttachmentKind`; and the render lookup's `activePreviewSupport.kind: 'trunk' |
'branch' | 'kickstand'`, which nothing read — removed rather than derived.

### C. Behaviour dispatch — **17 sites**

Down from 50. What is left is concentrated in the settings UI, not the engine:

```
 4  Settings/SupportSidebar.tsx
 4  Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx
 3  Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx
 2  autoSupport/autoPlace.ts          (one is origin === 'anchor' — not a type)
 2  interaction/.../supportPlacementRouting.ts
 1  autoSupport/settings.ts
 1  Settings/presets.ts
```

The two in `supportPlacementRouting.ts` are cause B's symptom — fix the union and
they follow. The anatomy-preview cluster is a UI question: which preview to draw
is arguably a panel decision, but it is spelled with type names today.

### D. Value literals — **148 sites**

Everything not dispatch. Mostly `draftAddEntity(d, 'branch', branch)` (6 in
`autoPlace.ts`) and `kind: 'leaf'` results. `PlacementOutcomeKind` is already
`SupportTypeId | 'reject'`, so the *type* is derived and only the call sites
spell names.

Lower priority than A–C: most are argument-position and a rename reaches them
through the derived parameter type. Verify that per call site rather than
assuming it.

### E. Declarations — **1, and it is not a defect**

`TYPE_PANELS` in `sidebarPanels.ts` is `readonly SupportTypeId[]`, so a rename is
a compile error. Which panels the sidebar offers is a UI decision that matches no
descriptor flag (twig and stick are in with `hasEditableSettings: false`;
kickstand is out with `true`).

Left as is. The compiler catches drift, which is the bar.

### F. Per-type identifiers — **~1,410 distinct, invisible to every instrument**

`branchId` (74 occurrences), `leafId` (70), `isLeafPlacementActive`,
`leafHotkeyActive`, `kickstandRoots`, `selectedTrunkIds`. A type name inside a
longer identifier is still a type name — each is a place a ninth type is
silently absent.

Neither the rename test nor any literal count sees these. Only
`lysdiag/tools/inventory.py` does.

**Worked example:** `SceneCanvas.tsx` holds **zero** type-id literals, yet takes
`isBranchPlacementActive`, `isLeafPlacementActive`, `isBracePlacementActive`,
`isKickstandPlacementActive` plus four tip/hover positions — then rebuilds them
into `Partial<Record<SupportTypeId, boolean>>`, generic from there on. Renaming a
type breaks nothing there and no metric moves.

Behind it: four placement hooks whose fields `useSupportInteractionManager` fans
into flat per-type names. Collapsing it means passing the record — a design
change, not a rename. **Do not expect a number to move when this lands.**

> **A measured counter-example, before any "deduplication".** Removing the eight
> `selectedTrunkIds` / `selectedStickIds` aliases in `SupportRenderer` took the
> rename test from 71 to **74** — it moved one declaration into many use sites.
> An alias declared once and used often is already the collapsed form. Re-measure
> after every conversion.

---

## 4. Staging

Ordered by ratio of volume removed to risk taken. Each stage is independently
shippable and independently verifiable.

| stage | work | cause | sites | risk | status |
| --- | --- | --- | ---: | --- | --- |
| **1** | Derive the three hazard unions from the registry | B | 3 | low | **done** — see §3B; three silent classes now fail to compile, test at `__tests__/derivedTypeSubsets.test.ts` |
| **2** | `resolveSegmentEndpoints` / `splitSupportShaft` take the entity | A | 12 | low | **done** — the type-id parameter is gone; see §3A, including the merge defect it surfaced |
| **3** | The rest of cause A's accessors | A | 7 | low | **done** — the entity-form writers; the remainder is typed dispatch (stage 6) and deprecated wrappers. See §3A |
| **4** | Settings/anatomy-preview dispatch | C | 11 | medium | pending — needs a UI decision first, see below |
| **5** | Value literals in argument position | D | 148 | low each | pending |
| **6** | Per-type prop and hook names | F | ~1,410 | high | pending — design change, no metric moves |

**Stages 1 and 2 have landed.** Stage 1 was the silent class — a rename left
those unions compiling and wrong; stage 2 removed the type-id parameter from the
endpoint readers, which is what made their call sites reach a rename at all. Both
are recorded in §3 with the mutations that pin them.

**Stage 4 is blocked on a question, not on effort.** `SupportSidebar` and the
anatomy previews dispatch on type name to choose which preview to draw. That may
legitimately be a panel decision rather than a type decision — settle it before
converting, or the conversion encodes the wrong model.

**Stage 6 will not move any number.** Track it by the prop signature.

### Done

| work | evidence |
| ---- | -------- |
| **Entity-form writers (stage 3)** | Seven `updateSupportEntity(typeId, entity)` calls took the entity; the entity overload is generic so a full entity is accepted. The convention test now pins both legal resolver forms |
| **Endpoint readers take the entity (stage 2)** | `resolveSegmentEndpoints` / `splitSupportShaft` have no type-id parameter and no literal call site. Found and fixed a real defect on the way: `mergeFromImportFormat` did not stamp `typeId`, so the knot-geometry pass diverged (caught by the `merge-with-owner` golden) |
| **Hazard unions derived (stage 1)** | `SupportPlacementFamily`, `KickstandHostKind`, `RemoveJointByIdResult` all fail to compile on a rename; `hostsKickstand` + `KICKSTAND_HOST_BY_TYPE` + `JOINT_REMOVAL_BY_TYPE` in the registry, held to their flags by `__tests__/derivedTypeSubsets.test.ts` |
| Renderer family loop | `SupportRenderer.tsx` holds zero dispatch literals; detail renderers register from their own folders |
| History actions derived | strings and payload-map entries come from the type id |
| Export geometry seam | `registerSupportExportGroup` + load-time completeness check |
| Preview geometry seam | `registerSegmentPreviewBatchBuilder` |
| Placement stores unified | one `createPlacementStore` primitive |
| Host concept derived | `canBeGridHost` + `GRID_HOST_TYPES` |
| Removal shapes derived | `SUPPORT_REMOVAL_SHAPES` |
| Auto-bracing reads its flag | `isAutoBraceableShaftType`; `branch` reaches both passes |
| Knot-host resolution | `KnotHostType` is `SupportTypeId \| 'leafCone'`, derived once |
| Sidebar vocabulary | `sidebarPanels.ts` + `anatomyPreviewRegistry.ts`; `SUPPORT_KINDS` deleted |
| Auto-placement overrides registered | each backed by a load-time error |
| One derived placement shape | `PlacedSupport` as a mapped union on `typeId` |

**Notable negative result:** the `SUPPORT_KINDS` failure — flags whose bodies
were inline `if`s in the sidebar, so nothing tied them to the registry and they
drifted. That is why a registry mechanism needs a load-time error, not just a
declaration.

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

### 5.2 The ratchet — **shipped**

`npm run check:support-literals` (`scripts/scan-type-name-literals.ts --check`,
wired into `test.yml` as `check:support-literals`) fails when any class rises
above its ceiling in `BUDGET`. The ceiling only ever moves down, in a commit that
lowers the count.

Current ceilings: `dispatch: 12`, `declaration: 3`, `value: 137`. Stage 1 lowered
`value` 149 → 137 and `dispatch` 39 → 12 (the old ceiling was stale; the measured
count in that class rose 10 → 12 in the same commit, because a wrong
`.family ===` exemption was removed — see §3B).

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

## 6. Verification discipline

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
- Full suite (990 tests) + goldens, **including untracked test files** —
  `git ls-files` silently skips them.
- `npm run check:docs` clean.
- Gated lint, `--max-warnings 0`.
- The whole-run signature (`__tests__/autoPlaceSignature.test.ts`) unchanged for
  any stage that touches placement.
- The metric ratchet from §5.2 does not rise.

---

## 7. Decisions

Each entry records who decided and on what evidence. An entry with neither is not
a decision — mark it open rather than closing it on inference.

1. **`branch.isAutoBraceable`** — **done.** The flag was right and the passes were
   wrong; both now call `isAutoBraceableShaftType(...)` instead of filtering on
   `supportKind === 'trunk'`, and `branch` reaches auto-bracing.
2. **The kickstand-on-branch behaviour** — **reopened; this was not a decision.**
   Recorded here as closed "confirmed by the owner", but no such confirmation is
   on record. The argument given — a branch-hosted kickstand does not stabilise
   that column, so the extra placement errs toward over-support — is plausible
   and may be right. It is a print-quality product call, and it is still open.
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
   when stage 4 reaches that file.
4. **`computeAndApplySupportDiameterProfile`** — **no seam needed.** It is a
   geometry routine, not a type; importing it across folders is not the defect
   this plan is about. Left as is. (The uncovered add-side repair in §6 stands on
   its own as a test gap.)
5. **`hostsKickstand` is a new descriptor flag, not a reuse of an existing one.**
   Decided in this session, preserving today's set (trunk + branch). The
   evidence for not reusing: that pair is `isAutoBraceable` *minus* kickstand,
   `canBeGridHost` too narrow (trunk alone), and `hasSegments` too broad (it
   admits leaf, brace, twig, stick) — the same survey recorded in
   `docs/dev/support-registry-findings.md` for the leaf's sprout hosts, which is
   a *different* question that wants its own decision (below). The AGENTS rule —
   one way to ask each question — forbids borrowing a flag whose question differs.
   Backed by `derivedTypeSubsets.test.ts`.
6. **Readers take the entity, not a type id (stage 2).** Decided in this
   session, on the plan's own §3A: the caller already holds the entity, so a type
   id argument is a second source of truth a rename cannot reach. An entity with
   no resolvable type yields null rather than a guess, so a hand-built fixture
   must declare `typeId` — the six suite failures and one golden diff that
   followed were all missing stamps, and both import paths now stamp.
7. **`JOINT_REMOVAL_BY_TYPE` mirrors `hasSegments && !segmentsCarryBothJoints`
   rather than adding a flag.** Decided in this session, on the evidence that
   `segmentsCarryBothJoints` is documented as exactly this distinction ("False for
   types whose endpoints come from elsewhere — a root, a parent knot, or a
   neighbouring segment"). A second flag would restate it, and the mirrored map
   carries a test. **Cheapest of the two to reverse**: if a shafted type ever
   resolves its endpoints elsewhere *and* has no removable joint, it needs its own
   flag and this entry is wrong.

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

## 8. What "done" looks like

- `type-literal-metric.py` reports **0 dispatch** and **0 declaration** outside
  `SupportTypes/`.
- The remaining value-position literals are all either (a) inside a type's own
  folder, (b) a documented different vocabulary, or (c) an `addSupportEntity` call
  where the type genuinely does not exist yet.
- `rename-test.py` reports **0 "real work"** errors for every one of the eight
  types. Current standing, re-measured after stage 1:

  | type | honest remaining | was | | type | honest remaining | was |
  | --- | ---: | ---: | --- | --- | ---: | ---: |
  | branch | **91** | 112 | | brace | 17 | 17 |
  | leaf | 51 | 67 | | kickstand | 14 | 12 |
  | trunk | 46 | 55 | | stick | 10 | 10 |
  | | | | | twig | 5 | 5 |
  | | | | | anchor | **2** | 2 |

  **236 total**, down from 280 at the start of stage 1. Two types rose and are
  still above their pre-stage-1 reading (`trunk` 55 → 56 → 50 is net down;
  `kickstand` 12 → 14 is net up) because a silent hazard became a compile error —
  read §3B before treating either as a regression. `anchor` at 2 is the proof the
  pattern works — its conversion landed and it was comparable to the others
  beforehand. `stick` at 10 is the number most often quoted; `branch` at 91 is the
  number that describes the remaining work.
- The inventory (`inventory.py`) shows no token that would survive a rename
  *without* a compile error. The rename test cannot see those; the two
  instruments are not interchangeable.
- The ratchet in CI holds the numbers, so the next instance of §1.1 is caught by
  a gate rather than by a person noticing.
