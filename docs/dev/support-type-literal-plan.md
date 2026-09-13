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

**Re-measured after stage 6a** (§4). Previous readings, kept for the delta, are
in the *was* column.

| instrument | what it answers | now | was |
| ---------- | --------------- | --- | --- |
| `remaining-worklist.py` | honest rename errors, with the failing source line | **167** | 280 |
| `rename-test.py <type>` | the same, counted without the `types.ts` exclusion | 183 (167 + 16 naming-point artifacts) | 280 |
| `inventory.py` + `report.py` | every token containing a type name | **6,284** occurrences, 743 tokens | 6,955 / 778 |
| `npm run scan:support-types` | the headline reference metric | **5,380** across 149 files | 5,909 |
| `type-literal-metric.py` | every string literal equal to a type id | 111 value outside `SupportTypes`, 16 dispatch, 5 declaration | 163 / 16 / 5 |
| `npm run check:support-literals` | the same, with the ratchet | 98 value, 12 dispatch, 3 declaration | 149 / 10 / 3 |
| `silent-value-sites.py` | **value literals a rename does NOT reach** | **15, 0 of them real** | 17 real=2 |

Stage 5 moved the rename total **230 → 226**. The movement is the point: two
silent sites became loud (the forest ledger's `kind`, the `updateBrace` stamp),
and five errors that briefly appeared at the ledger *consumer* went with them once
the builder reported its own type. `silent-value-sites.py` is the instrument that
proves the class is clear, because the total alone cannot say whether a change
made a hazard loud or a literal derived.

Readings that moved up or held still while the defect count fell, each expected
rather than a regression:

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
| branch | **55** | 112 |
| leaf | 49 | 67 |
| trunk | 23 | 55 |
| brace | 15 | 17 |
| kickstand | 11 | 12 |
| stick | 7 | 10 |
| twig | 5 | 5 |
| anchor | 2 | 2 |
| **total** | **167** | 280 |

Numbers from `remaining-worklist.py`, which excludes both naming points.
`branch` has fallen from 112 to 56; `stick` at 7 is no longer the easy case it
was — the remaining work is spread across eight files of engine code rather than
concentrated in one type's vocabulary.

**Read this table before quoting a headline.** The refactor has largely been
measured on `stick`, which is the easiest type and now sits at 10. `branch` is
over ten times worse. A claim that the work is "nearly done" is true only of
whichever type was measured; it has never been true of the set.

`branch` is worst because it is both a support type and half the placement
vocabulary (`branchFamily`, `place_branch`, fan kinds). `trunk` is high because
it is the default tool. Neither is a surprise — but neither shows up if `stick`
is the only number reported.

**`rename-test.py` over-counts by 16 and `remaining-worklist.py` is the honest
one.** Both edit `types.ts` alone, but `types.ts` is the *second naming point* —
the goal statement exempts it — and renaming it without the registry leaves its
own `SupportEntityAny` inconsistent, two errors on one line per type. The
worklist excludes it and prints the failing source line beside each error.

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
| **F. Per-type identifiers** | ~1,410 distinct | `branchId`, `leafHotkeyActive`, `kickstandRoots`. **No instrument catches these** |

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

The deprecated `add`/`update`/`remove` per-type wrappers in `state.ts`
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
 4  Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx
 4  Settings/SupportSidebar.tsx            3 now page-named (stage 4); 1 is `activePanel === 'trunk'`
 3  Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx
 2  autoSupport/autoPlace.ts          (one is origin === 'anchor' — not a type)
 1  autoSupport/settings.ts
 1  Settings/presets.ts
```

The routing sites are gone with stage 1's union — they were cause B's symptom.
The anatomy-preview cluster dispatches `activePanel`, which is a `SidebarPanel`:
a `SupportTypeId` or a tool panel id, so `activePanel === 'branch' | 'leaf' |
'twig' | 'stick'` are type-keyed comparisons a rename already breaks (cause D).
The sidebar's remaining three are the same, and the fourth is `activePanel ===
'trunk'` — the tab whose id was the type's name. Stage 4 renamed that id.

### D. Value literals — **stage 5 done, and the premise was wrong**

This section used to read "148 sites … lower priority, most are argument-position
and a rename reaches them through the derived parameter type. Verify that per
call site rather than assuming it." That verification was never done, and the
assumption turns out to be right for almost all of them — which means the stage
was mostly not work.

**Measured** (`silent-value-sites.py`): of 129 value literals outside a type's
own folder, **114 are reached by a rename** — the compiler refuses stale ones
through a derived parameter type — and only 17 were silent. Two of those 17 were
real, and both are fixed:

| site | what it was | fix |
| ---- | ----------- | --- |
| the forest ledger's `kind: 'branch'` in `autoPlace.ts` | a literal that reached no check, because `PlacedKind` had also gone stale inside the exempt registry | `buildConsolidationBranch` reports the type it built, and the consumer takes it — the value comes off the builder, like `FanLeafResult` already did |
| `updateBrace` in `state.ts` | stamped `typeId: 'brace'` onto the entity it wrote | reads the type off the entity (`resolveSupportTypeIdOf`), like `updateLeaf` beside it |

**The ledger literal was silent because of a shadow list inside the exempt
registry.** `AUTO_PLACED_TYPE_IDS` was a hand-written tuple whose comment claimed
the narrow union could only come from literals ("a runtime filter only yields
`SupportTypeId`"). That is false — `KICKSTAND_HOST_BY_TYPE` already showed a
literal map gives both — and the cost was a rename hazard nothing could see: the
stale literal errored only *inside the file every check exempts*, so `PlacedKind`
kept a name that no longer existed and the consumer compiled while writing it.
It is now `AUTO_PLACED_BY_TYPE` (literals kept) plus an `isAutoPlaced` descriptor
flag, held to each other by `derivedTypeSubsets.test.ts` — the same shape as the
kickstand host set.

The other 15 silent hits are false positives or legitimate vocabulary, triaged
one by one: entity ids threaded through a `u(id)` helper (`u('trunk')` is an id,
not a type), a focus key (`focusKey.startsWith('brace')`), a doc comment, and the
two documented different vocabularies (`SizingPreset`, the preset ids). **Zero
real defects remain in this class.**

Two sites in the list are `Extract<SupportTypeId, …>` unions (`SupportPlacementOwner`,
`AttachmentKind`). They are *derived*, so a rename does reach them; the scan reports
them because the error lands at the union's consumer rather than on the literal
line. Not defects.

### E. Declarations — **1, and it is not a defect**

`TYPE_PANELS` in `sidebarPanels.ts` is `readonly SupportTypeId[]`, so a rename is
a compile error. Which panels the sidebar offers is a UI decision that matches no
descriptor flag (twig and stick are in with `hasEditableSettings: false`;
kickstand is out with `true`).

Left as is. The compiler catches drift, which is the bar.

### F. Per-type identifiers — **~1,410 distinct, invisible to every instrument**

`branchId` (74 occurrences), `leafId` (70), `leafHotkeyActive`,
`kickstandRoots`, `selectedTrunkIds`. A type name inside a
longer identifier is still a type name — each is a place a ninth type is
silently absent.

Neither the rename test nor any literal count sees these. Only
`lysdiag/tools/inventory.py` does.

**Worked example (partly closed):** `SceneCanvas.tsx` holds **zero** type-id
literals. It used to take four flat booleans — one per placement mode — and
rebuild them into `Partial<Record<SupportTypeId, boolean>>` inside itself.
`useSupportInteractionManager` now returns that record directly (beside the
`placementPreviews` record it already built), so the scene takes ONE prop and
`supportCreationModeActive` is `Object.values(placementActive).some(Boolean)`,
naming no type. Only two sites still index it by name, where they render that
type's own marker.

**The record costs the metric 7, measured.** It moved the rename total 171 → 178:
+1 per type for the record's key in `useSupportInteractionManager`, +2 for the
two sites in `SceneCanvas` that index it by name, and −0 for the three dead props
removed alongside (a JSX *attribute name* is not a literal, so it never counted).
It is kept because the pattern is already in that same file and function: the
sibling `placementPreviews` record has five type-keyed keys and is accepted, so
this is consistency rather than a new kind of site. The four flat props were
already the collapsed form — what the scene was duplicating was the *rebuild*,
and that is gone.

**What remains here is the position half:** four tip/hover position props and the
marker meshes they feed (a branch dot, a leaf dot, and each tip). Those are
per-type *renderings*, so collapsing them means a loop over the record rather
than a rename. That is the design change this section describes, and it is not
attempted here — see §4's remaining-worklist for its size.

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
| **4** | Settings/anatomy-preview dispatch | C | 11 | low | **done** — it was the tab vocabulary, not a preview decision; see below |
| **5** | Value literals in argument position | D | 129 | low | **done** — 114 were already compiler-checked; the 2 real silent ones are fixed. See §3D |
| **6a** | The joint-drag arms | F | 4 arms | med | **done** — four arms collapsed to two; see §3F.1 |
| **6b.1** | The elastic knot-drag capture | F | 2 captures | med | **done** — `flexesOnHostKnotDrag` + `FLEXING_KNOT_HOST_TYPES`; see §6b.1 |
| **6b.2** | The knot-drag solve and preview channel | F | 55 idents | med | **done** — one shared `elasticShaftPreview`; see §6b.2 |
| **6c** | Knot-host prefixes spelled out as strings | **new** | 84 sites | med | **done** — invisible to the rename test; see §6c |

**Stages 1 and 2 have landed.** Stage 1 was the silent class — a rename left
those unions compiling and wrong; stage 2 removed the type-id parameter from the
endpoint readers, which is what made their call sites reach a rename at all. Both
are recorded in §3 with the mutations that pin them.

**Stage 4 was smaller than §3C implied, and it is done.** `SidebarPanel` is
`SupportTypeId | 'raft' | 'grid' | 'auto'`, and `SIDEBAR_PANELS` is built from
`TYPE_PANELS: readonly SupportTypeId[]`, so a per-type panel id *is* a type id.
`activePanel === 'branch' | 'leaf' | 'twig' | 'stick'` are therefore type-keyed
comparisons a rename already breaks — cause D, not a hazard. The one real defect
was `activePanel === 'trunk'`, where 'trunk' was both the trunk's panel and the
shared support-info page.

That was the `SidebarTab` vocabulary (§8.1), and it was a rename, not a redesign:
`SupportTypeDescriptor.sidebarTab` has exactly **one** consumer, nothing persists
a tab id, and the tab row already LABELLED 'trunk' "Support Info" and 'stick'
"Bracing". The ids now say what the labels said, and `panelForTab` derives the
panel a tab opens from `SIDEBAR_PANELS` rather than the tab row carrying a panel
id — so the two cannot drift.

Verified in a browser (all four tabs select and swap their panel; the tab row
highlights the active one). Note for the next person: `lysdiag/tools/
build-smoke-scene.mjs` was writing a GZIP stream under an `encoding:
base64-zlib` envelope, which the codec rejects — it now emits raw zlib, and
`check-smoke-scene.mjs` inflates the same way.

**Stage 6 was expected to move no number. It did.** 6b.1 took the scan metric
from 5,835 to **5,735** and the rename test from 200 to **82 honest remaining**,
because deriving the capture deleted the type-named locals around it too. Track
6b by the prop signature, but re-measure anyway -- the prediction was wrong once.

### Where the rename test's remaining errors are — the full worklist

`lysdiag/tools/remaining-worklist.py` prints every honest rename error with the
source line that fails, for all eight types. It is the actionable form of the
table below: run it, pick a cluster, convert, re-run.

**Two measurement corrections, both this session:**

1. **`types.ts` must be excluded.** It is the second naming point (where
   `SupportFieldsByType` declares the eight), so the goal statement exempts it.
   None of the tools did. Renaming it *alone* leaves its own derived
   `SupportEntityAny` inconsistent with the registry's `SUPPORT_TYPE_COLLECTION`
   — an artifact of editing one naming point and not the other, two errors on one
   line, per type. Every total reported before this correction is inflated by 16.
2. **The tool now prints source lines**, because a line number is not a worklist.

Standing: **167 honest remaining** (naming-point artifacts excluded), from 280 at
the start of stage 1. By cluster:

| cluster | errors | what it is | shape of the fix |
| --- | ---: | --- | --- |
| `autoPlace.ts` | 24 | the orphan cull walks `leaves` and `branches` by hand (4 sites each), and the forest report's `pushMember` pairs do too; plus `draftAddEntity`/`kind` at the six builder call sites | generalise both walks over the declared `hostedBy` members — the same conversion 6b.2 did for the drag solve. The counters and the promote kind are done |
| `state.ts` | 17 | `applySupportEntityUpdate('trunk' \| 'branch' \| 'kickstand', …)`, the `removeJointById` return, and the three BESPOKE updaters (`updateLeaf`, `updateBrace`, `updateAnchor`) | the updaters are the type's OWN update logic, registered in `state.ts` where the knot/diameter passes live — their literals are legitimate, not wrappers. The add/remove wrappers and their literals are gone |
| `supportPlacementRouting` | 13 | mode → owner, one arm per mode | the state type is per-type field names; a record keyed by mode would collapse the arms — a design change |
| `SceneCanvas` | 12 | five `placementPreviews.branch` reads, two `placementActive.branch` reads, per-type marker meshes | the marker meshes are per-type renderings; collapsing them is a loop over the record |
| `useSupportInteractionManager` | 11 | the `placementPreviews` (5 keys) and `placementActive` (4 keys) records, and per-type placement state | the records are the existing pattern; deriving their keys needs a registration slot in each placement store |
| Settings / AnatomyPreview | 25 | `activePanel === '<type>'` comparisons and preview dispatch | compiler-caught today, so not hazards — converting them is the UI question stage 4 deferred, not a rename |
| knot / renderer / grid / curves | 22 | preview caches, `getSupportEntity('<type>', id)` in typed-dispatch arms, per-type caches in `gridPlacement` | each is a small local derivation; no cluster shapes |
| scripts / plugins / perf | 6 | `support-drag-perf.ts`, `convertLysData.ts` | test-and-tooling call sites; convert directly |

**Not a defect: the `Extract<SupportTypeId, …>` unions.** `SupportPlacementOwner`
and `AttachmentKind` are derived, so a rename reaches them; the count includes
their *consumers* erroring, which is the union working.

### 6a. The joint-drag arms — done

Four arms (`trunk`, `branch`, `kickstand`, and a contacts-at-both-ends fallback)
became two, in `useJointInteraction` and again in `JointGizmo`:

| what the arms differed by | where it comes from now |
| ------------------------- | ----------------------- |
| the root, and the host knot | `resolveDeclaredHosts(typeId, entity)` — the `owns → roots` and `hostedBy → knots` edge fields |
| where the angle clamp measures from | `descriptor.lower.kind`, then `resolveShaftAnchor` |
| whether the preview ref is read, or the store compared | `descriptor.jointDragUsesLivePreview` |
| which typed history action is pushed | `descriptor.historyUpdate` + `ownsEditHistoryEntry` |

`JointGizmo`'s root came from a hardcoded `.rootId`; it now reads the declared
edge, so a type's root field is named once, in its descriptor.

**Equivalence measured, not assumed.** The drag path has no test and no golden —
it is a `useFrame` body reading refs — so `lysdiag/tools/joint-arm-equivalence.ts`
re-expresses the old arms and the new code as pure functions over one input record
and compares every combination of the things they branch on (8 types × 2⁶ × 3 =
1,536 cases), using the REAL descriptor flags. Result: **all decision fields
equal except 72 readings of one field**, every one of them trunk's fallback
`contextStart`, where the old arm passed no start at all and the new one passes
the root top.

```
combinations checked: 1536
differing field readings: 72   (all trunk contextStartUsed: old=none new=rootTop)
```

The old code also carried that truncation to the commit path, whose fallback
measures from the root top exactly as the new one does — so the two disagree
within one drag, and then commit as though the new value had been used. The new
code makes the move and the commit agree. A hypothesis test, not a measurement —
exercising the two back to back needs a UI run nobody has done.

**One behaviour change was found and deliberately NOT taken.** Reading the host
fields off the declared edges gives kickstand `hostKnotId`, which the old arms
never read (they looked for `parentKnotId`), and kickstand's upper endpoint IS a
knot — so the new form could pass a host knot the old one did not. Per the
repo rule, the conversion lands behaviour-preserving first: the drag start gates
the pair on the declared lower endpoint, which reproduces the old resolution.
Whether kickstand's host knot should reach the clamp is recorded open in
`support-registry-findings.md`.

**A new load-time check.** The typed history push now takes its action from the
descriptor, and skipping it would drop the undo entry silently. `state.ts` asserts
at load that no type declares `ownsEditHistoryEntry` without `historyUpdate` —
mutation-verified by deleting trunk's action and watching it throw.

### Done

| work | evidence |
| ---- | -------- |
| **Joint-drag arms collapsed (stage 6a)** | four arms (trunk/branch/kickstand/contacts) → one hosted path + one contact path, in `useJointInteraction` and `JointGizmo`; hosts and the history action read off the descriptor. `rename-test.py` trunk 43 → 29, branch 92 → 84, kickstand 14 → 10 |
| **Value literals measured and cleared (stage 5)** | `silent-value-sites.py`: 114 of 129 value literals are rename-reached by the compiler; the 2 genuinely silent ones (`autoPlace.ts` ledger kind, `updateBrace` stamp) fixed, and the `AUTO_PLACED_TYPE_IDS` shadow list replaced by `AUTO_PLACED_BY_TYPE` + an `isAutoPlaced` flag |
| **Page-named sidebar tabs (stage 4)** | `SidebarTab` is `'supportInfo' \| 'raft' \| 'grid' \| 'bracing'`; the descriptor declares it and `panelForTab` derives the panel from `SIDEBAR_PANELS`, so no hand-kept tab→panel table. Verified in a browser: all four tabs select and swap panels |
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

### 6b.1. The elastic knot-drag capture — done

Dragging a knot flexes whatever hangs off it. Both captures — one in
`useKnotInteraction`, one in `KnotGizmo` — decided *what* hangs off it and *what
holds its tip* by hand:

```ts
const allBranches = getSupportEntities<Branch>('branch');
const attached = allBranches.filter(b => b.parentKnotId === knotId);
// ... later, per entity:
contactCone: b.contactCone ? { pos: getSocketPosition(b.contactCone.pos, ...) } : undefined
```

Three hardcodings in four lines, and each is a different failure:

| hardcoded | what it assumed | why it was wrong |
| --- | --- | --- |
| the type `'branch'` | one type flexes | **two** declare `parentKnotId` onto knots (branch, leaf) |
| the field `parentKnotId` | one edge name | the edge is already declared, per type, in `edges` |
| the field `contactCone` | one contact spelling | types spell it `contactCone`, `contactConeB`, `contactDiskB` |

All three now come from the registry. The flag is
`flexesOnHostKnotDrag`, and `FLEXING_KNOT_HOST_TYPES` pairs each flexing type
with the edge fields naming its knot, both derived:

```ts
export const FLEXING_KNOT_HOST_TYPES = SUPPORT_TYPES
    .filter((descriptor) => descriptor.flexesOnHostKnotDrag)
    .map((descriptor) => ({ typeId: descriptor.id, knotFields: /* hostedBy edges onto knots */ }));
```

The contact field comes from the type's declared `upper` endpoint, so a type
that spells it differently keeps its tip constraint instead of silently losing
it. `ElasticChainInitialState.branchId` — declared, never read — became
`shaftId`.

**Why a flag and not pure derivation.** "Has segments and hangs off a knot" is
true of leaf as well, and a leaf does *not* flex: the solver walks segment
joints, and a leaf's are not a chain. So the behaviour is declared, and
`flexingKnotHosts.test.ts` holds the declaration honest — a flexing type must
have segments, must declare a knot edge, and must name its contact field.

**Mutation-tested.** Removing `flexesOnHostKnotDrag` from branch empties the
capture, and the test fails naming the type, rather than the elastic drag
silently going dead.

**It moved numbers the plan said it would not:** scan 5,835 → **5,735**, rename
test 200 → **82 honest remaining**. Deriving the capture deleted the type-named
locals around it.

---

### 6b.2. The knot-drag solve and preview channel — done

6b.1 derived the capture but left the *solve* half naming one type, which made
the capture's new reach a latent bug rather than a feature: a leaf pulled in by
a future `flexesOnHostKnotDrag` would be captured, solved, and then dropped,
because every write-back re-fetched the entity as `getSupportEntity('branch',
id)`.

That solve loop existed **three times**, copied near-identically:

| where | tail behaviour |
| --- | --- |
| `useKnotInteraction`, per-frame drag | keeps a sync entry for a shaft that already had an override |
| `useKnotInteraction`, on release | drops the override outright |
| `KnotGizmo`, per-frame drag | same as the first |

All three now call `collectSolvedShaft` in
`SupportPrimitives/Knot/elasticShaftPreview.ts`, which takes that tail
difference as a `keepSyncEntry` predicate rather than duplicating 30 lines. The
entity is fetched **by id alone** -- `getSupportEntity(id)` has a
single-argument overload, so no type is named at all. The capture itself moved
there too, as `captureFlexingShafts`, so the two call sites share one
implementation instead of two copies that had already drifted in their joint
fallback.

**The event payload was the load-bearing rename.** `KnotDragPreviewSnapshot.-
branchSegmentsById` crossed a module boundary, so the name was a contract
between producer and consumer; it is now `shaftSegmentsById`, typed as the
shared `ShaftSegmentsById`. The consumer needed no structural change:
`SupportRenderer`'s `knotDragOverridesById` was already a plain id-keyed map.

**55 type-named identifiers removed** from the knot path -- every `branch*` one.
Scan 5,735 to **5,562**. What remains in these files is `leafCone`, `braceHost`
and `braceSpan`, which are the *host* vocabulary (`KnotHostType`), a different
axis handled by its own derivation.

---

### 6c. Knot-host prefixes — done

**A cause the plan did not have.** A knot that rides a pseudo-shaft carries a
`parentShaftId` of `<prefix><entityId>`, and each prefix is already declared by
the type that owns it -- leaf's `knotHostPrefix: 'leafCone:'`, brace's
`'braceSegment:'`. Derived readers existed too (`parseKnotHostId`,
`knotHostId`, `parsePrefixedSegmentId`).

**84 sites across 19 files ignored all of it** and spelled the prefix out:
`startsWith('leafCone:')`, `` `braceSegment:${brace.id}` ``, `.slice('leafCone:'.length)`.
`state.ts` alone held 42.

**Why every instrument missed it.** These are STRING literals, so:

| instrument | why it was blind |
| --- | --- |
| the rename test | tsc cannot see inside a string; renaming leaf still compiled |
| `scan:support-types` | counts identifiers, and `'leafCone:'` is not one |
| tests | 921 passed before and after; nothing exercised a rename |

Only reading the inventory caught it -- which is the user's standing point
about the token inventory being the only instrument that sees the whole picture,
demonstrated concretely.

**The failure it would have caused.** Rename leaf and the app compiles clean,
every test passes, and at runtime every tip knot silently fails to resolve its
host: `startsWith('leafCone:')` matches nothing, so the knot falls through to
the real-segment path and is looked up in a collection it is not in.

**What replaced it.** The two host kinds are told apart by what they already
declare, not by name: a SPAN also declares a `segmentSelectionPrefix` (it is
selectable as a segment), a CONE host does not. Hence `CONE_KNOT_HOST_TYPES`,
`SPAN_KNOT_HOST_TYPES`, `isConeKnotHost`, `isSpanKnotHost`, and the asserting
accessors `coneKnotHostType()` / `spanKnotHostType()` for the callers that build
an id while holding only the entity.

`KnotHostType` was `SupportTypeId | 'leafCone'` -- a bare string union, the
shape §3B already names as a hazard. The cone belongs to the type that declares
it, so the union is now just `SupportTypeId`, and "does this knot ride a cone"
is a derived fact on the host record.

**Guarded by a source scan**, because no type-level check can see a string:
`knotHostPrefixes.test.ts` walks `src/` and fails if any file outside the
registry and a type's own folder spells a declared prefix. Mutation-tested by
putting one literal back -- it fails naming the file.

Scan 5,562 to **5,424**. The rename test did not move (49 for leaf, 14 for
brace), which is the point: it never saw these.

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

`silent-value-sites.py` — **the stage-5 instrument.** It renames each type in
`types.ts`, runs `tsc`, and asks which value literals no error landed on. That is
the question the other two cannot answer: `type-literal-metric.py` counts every
literal whether or not a rename reaches it, and `rename-test.py` reports totals
without saying which literal survived. A site with no error near it is silent —
the only kind of value literal that is work.

All three must run from the DragonFruit repo root.

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

- `npx tsc --noEmit -p tsconfig.json` clean. **Use `-p`.** A plain
  `npx tsc --noEmit` can reuse a stale `.tsbuildinfo` and print nothing while that
  form reports real errors — it nearly let a file that does not compile be
  committed, and neither the suite nor the goldens catch it (they run through
  `tsx`).
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
   **The label and the tab id are closed; two layout flags are not.** The menu
   label was relabelled to "Support Info" earlier (the tab carries the contact
   cone, cone angle and root settings that apply to supports generally, so
   "Trunk" was wrong on its face). The *id* was the `sidebarTab` value every
   non-tool type declares, so renaming it reached the registry's `SidebarTab`
   type and every descriptor.

   **Stage 4 renamed the id.** `SidebarTab` is now `'supportInfo' | 'raft' |
   'grid' | 'bracing'` — page names, not type names — declared in the registry and
   used by every descriptor; `panelForTab` derives the panel a tab opens from
   `SIDEBAR_PANELS`, so the two cannot drift. Verified in a browser.

   **The `activePanel === 'trunk'` checks are NOT all the same thing, and only
   some are closed.** They compare a `SidebarPanel` (a `SupportTypeId` or a tool
   panel id), not a tab:

   - `SupportSidebar`'s panel-body chain (`=== 'raft' | 'grid' | 'stick' |
     'trunk'`) selects which panel body to render. That is a panel decision,
     correct as written, and a rename reaches it.
   - `TrunkPreview` / `SupportAnatomyPreviewCanvas` dispatch `activePanel` the
     same way.
   - **Two layout flags are open**: `useAdaptiveIconCompactDisplay` and
     `shouldUseCompactTrunkLayout` fire for the trunk panel alone although the
     support-info tab is shared by trunk, leaf, branch and twig. Recorded in
     `support-registry-findings.md` with the measurement — changing them to the
     tab is NOT behaviour-preserving, so the stage-4 rename left them alone.
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

### 8.1 Done: `sidebarTab` named a type but was not one

`SupportTypeDescriptor.sidebarTab` used to be `'trunk' | 'raft' | 'grid' |
'stick'`. The value `'trunk'` meant "the shared support-info tab", not the trunk
type; two values (`raft`, `grid`) are *tools*; one (`stick`) was both a type and
its own page. The label change showed it read as the trunk's own page to anyone
looking at the UI.

**Stage 4 renamed it.** `SidebarTab` is `'supportInfo' | 'raft' | 'grid' |
'bracing'`, declared in the registry beside `SupportTypeId` and referenced by the
descriptor field, so the vocabulary lives in the registry and the names describe
the PAGES. `sidebarPanels.ts` re-exports it for panel consumers, and
`panelForTab` derives which panel a tab opens from `SIDEBAR_PANELS` — the tab row
no longer carries a panel id, so the mapping cannot drift.

Verified in a browser: all four tabs select, swap their panel, and highlight the
active one. The tool ids (`raft`, `grid`, `auto`) are unchanged — there the page
and the tool genuinely are the same thing.

---

## 8. What "done" looks like

- `type-literal-metric.py` reports **0 dispatch** and **0 declaration** outside
  `SupportTypes/`.
- The remaining value-position literals are all either (a) inside a type's own
  folder, (b) a documented different vocabulary, or (c) an `addSupportEntity` call
  where the type genuinely does not exist yet.
- `rename-test.py` reports **0 "real work"** errors for every one of the eight
  types. Current standing, re-measured after stage 5:

  | type | honest remaining | was | | type | honest remaining | was |
  | --- | ---: | ---: | --- | --- | ---: | ---: |
  | branch | **84** | 112 | | brace | 14 | 17 |
  | leaf | 49 | 67 | | kickstand | 10 | 12 |
  | trunk | 29 | 55 | | stick | 7 | 10 |
  | | | | | twig | 5 | 5 |
  | | | | | anchor | **2** | 2 |

  **200 total**, down from 280 at the start of stage 1, and
  `silent-value-sites.py` reports **0 real defects** left in the value class.
  `anchor` at 2 is the proof the pattern works — its conversion landed and it was
  comparable to the others beforehand. `branch` at 84 is the number that describes
  the remaining work; `stick` at 7 is the one most often quoted.
- The inventory (`inventory.py`) shows no token that would survive a rename
  *without* a compile error. The rename test cannot see those; the two
  instruments are not interchangeable.
- The ratchet in CI holds the numbers, so the next instance of §1.1 is caught by
  a gate rather than by a person noticing.
