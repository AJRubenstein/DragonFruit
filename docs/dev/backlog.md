# Backlog and Known Gotchas

A home for temporary rules, tradeoffs, gotchas, and desired architectural
directions that `AGENTS.md` references tersely. When `AGENTS.md` points here,
this page is the fleshed-out explanation. Add entries here when a rule is too
long for `AGENTS.md`, is expected to be lifted once an upstream change lands,
or is a known refactor we intend to do.

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

**Adoption is partway.** Measured by `npm run scan:support-types`: **11,008
hand-written type references across 147 files**, down from 12,164, and 950
production lines lighter than `dev` across `src/supports/`. History handlers,
registration slots, the support primitives and most of `state.ts` are converted;
`SupportRenderer.tsx` (1,598) and auto-placement (1,270) are not. Adding a type is therefore still mostly manual — see
`dev/support-type-extension.md`, which marks each step.

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

Known remaining hand-written lists worth converting:

- The 16 `SUPPORT_ADD_*` / `SUPPORT_REMOVE_*` constants imported into the
  registry must be kept in sync with `SupportTypeId` by hand. Deriving them from
  the type id is possible but needs checking first: history action strings may be
  persisted in saved projects, and changing one would break loading old files.

### Bugs found while converting

Each was a hand-written type list that disagreed with the registry. Fixed
unless marked otherwise; recorded because the same shape will recur.

| bug | where | status |
| --- | ----- | ------ |
| Anchor joints could not be dragged — three separate lookups omitted anchors | `useJointInteraction`, `JointGizmo`, knot host map | fixed |
| Anchors could not host a draggable knot | `useKnotInteraction` | fixed |
| Stale-cache host recovery searched only sticks | `useKnotInteraction` | fixed |
| Knot-move history said "Move support knot" for trunk, anchor and kickstand | `KnotGizmo` | fixed |
| Kickstand undo restored nothing generically | `state.ts` | fixed |
| Trunk and kickstand `roots: 'root'` singular dropped a root on removal | `SUPPORT_REMOVAL_SHAPES` | fixed |
| Sidebar accepted types with no tool | settings | fixed |
| Settings fell through to "leaf" for an unhandled kind | `applySettingsToSupportTarget` | fixed |
| A knot on a kickstand shaft loaded with `diameter: NaN` — normalization synthesised a segment carrying no diameter | `normalizeLoadedKnotAndLeafGeometry` | fixed |
| A leaf on an anchor- or kickstand-hosted knot stayed behind when its model moved — the segment/modelId index covered four of six shafted types | `transformSupportsForModel` | fixed |
| Scene-batched branches passed only `modelId` to `isModelVisible`, so a branch with none of its own could not resolve through its parent knot and was hidden under any model filter. Verified mechanically (false -> true); whether such branches occur in practice is unconfirmed, though four other sites defend against it | `SupportRenderer` | fixed, latent |
| Debug origin colouring painted braces, twigs, sticks and kickstands grey ("no origin") though they record no origin at all — pre-existing, present on `dev`. Now a distinct slate; falling back to the model colour instead put them 76 RGB from the overhang orange | `SupportRenderer` | fixed |
| A twig whose two contact diameters differ should leave the batched pass and render detailed — spot-checked working, but not exercised systematically or covered by a test | `SupportRenderer` `buildPlainShaftSet`, `shaftTaper` | **recheck** — needs a deliberate mismatched-diameter case |
| Raft crenulation gap/spacing controls do nothing unless `wallEnabled` is on — the settings only reach the crenelated wall generators, so with the wall off they silently no-op. Pre-existing, unrelated to the registry work | `RaftRenderer:184` | **open** — UX, gate or disable the controls |
| `autoBracing/` generated kickstands by name -- ~170 identifiers, and a 587-line generator that was placement logic for one type outside its folder | `autoBracing/` | fixed -- generator moved to `SupportTypes/Kickstand/`, reached via `registerLateralStabiliser`; 65 refs left, all the `kickstands` collection key |
| `canDeleteSelection` omitted `anchor` from its category list | `useSupportInteractionManager` | fixed — derives from `getSupportTypeBySelectionCategory` |
| Nested-brace reachability clauses are dead code, subsumed by `touchedSegmentIds` | `transformSupportsForModel` | fixed |
| Shaft stub length is 10 for trunk, 5 elsewhere; four other sites use 10 | `shaftFallback`, `resolveSegmentEndpoints` | fixed — `resolveSegmentEndpoints` now reads `shaftFallback.stubLengthMm` instead of a hardcoded 10, so branch/twig/stick/anchor get their declared 5. Behaviour change, reached only when a shaft has no top joint AND no contact; all 50 goldens unchanged |
| `TwigRenderer` omits `isInteractable` where the other three pass it | `TwigRenderer` | **open** — harmless while the default is true |
| The import wire format still carries the `{kickstand, root, hostKnot}` bundle | `loadFromImportFormat` | **open** — ⚠️ wire format |
| Type selection by hardcoded threshold, each duplicated at a second site: twig/stick by span, anchor/trunk by tip height | four sites | fixed — `placementRule` on the descriptor, resolved by `selectTypeForPlacement` |
| `skipDependentGeometry` is declared on an updater and passed `true` by nobody | `updateKnot` | **open** — a drag-time fast path no drag path uses; dropped from the support updaters, still on `updateKnot` |
| `updateTrunk` alone omitted the `if (!state.trunks[id]) return` guard the other seven had, so it INSERTED an absent trunk rather than ignoring it | `updateTrunk` | fixed — sharing one update skeleton gave every type the guard |
| The multi-select delete history entry says `Delete ${n} supports` unconditionally ("Delete 1 Supports"), counts the ids *selected* rather than those actually removed (deletion cascades, and unresolvable ids are skipped), and records itself as `SUPPORT_AUTO_BRACE_REPLACE` because that action carries a whole-store before/after | `useSupportInteractionManager` `performDeleteSelection` | **open** — cosmetic; `descriptor.singular`/`label` and the entity's `typeId` now make a correct label cheap, but the count and the borrowed action type each need a decision |
| The slice path chains kickstand segment endpoints (each starts where the last ended, ignoring `bottomJoint`) while the renderer uses `resolveSegmentEndpoints`, which reads the joints — so screen and slice may already disagree for kickstands | `buildSupportAndRaftWorldTriangles` vs `segmentEndpoints` | **open** — found by the slice goldens when collapsing the per-type blocks; 576 triangles' difference on 3 kickstands. Blocks that conversion until resolved |
| `raftThickness` is read from raft settings in the slice triangle builder and never used | `buildSupportAndRaftWorldTriangles` | **open** — found by mutation: shifting it 1 micron changed no output. Either the raft is meant to affect slice geometry and does not, or the line is dead |
| `removeExistingBracing` is an auto-bracing setting with no UI, defaulted true, so auto-bracing always replaces its own previous braces and the option cannot be turned off | `autoBracing/settings.ts` | **open** — either surface it or drop the field; it reads as a control that was never wired up |
| Sliding a knot along a curved kickstand shaft did not snap to the 0.001mm drag grid, though the other four shafted hosts did | `useKnotInteraction` knot projection | fixed — the straight-shaft path already snapped kickstands unconditionally, so a kickstand knot was snapped on a straight segment and unsnapped the moment it became a curve. Incoherent rather than intentional; the bezier branch now snaps like the rest |
| Kickstand joint drags left the gizmo handle at the raw pointer position while the shaft was clamped against the root, so the handle could visually detach from the joint. The other arms applied the clamp; the kickstand arm alone did not set `gizmoPos` | `JointGizmo` `applyMoveDelta` | **recheck** — collapsing the arms gave kickstand the same clamp as trunk/branch. Reads as a fix and tests clean, but it is a visible change to a drag that shipped this way; confirm with the team before treating it as settled |
| An anchor caught in a marquee is selected (it deletes) but never highlights | `SupportRenderer`, anchor render path | **open** — `resolveDetailSupportColor` was given the bulk-selection branch the scene resolver had (commit 96dea371) and it did NOT fix it, so the colour resolver is not the only gap. Anchor is the one type drawn entirely by detail renderers (root frustum + contact cone, no batched shaft pass), which is why it differs; the remaining cause is unfound |
| A leaf sprouting from a joint searches trunk and branch joints only, though twig, stick, anchor and kickstand all have joints too | `LeafPlacementController` | **open** — kept as-is through the derivation; whether the other four should host a sprouted leaf is a product decision |
| The branch index loop pushed `knotIdsByParentShaftId[parentKnotId] = [parentKnotId]`, keying a knot id to itself, but that bucket is only ever read by SEGMENT id -- unreachable unless a knot id equalled a segment id | `supportRenderLookupMath` | fixed — dropped when the loop was derived; nothing read it |
| Deriving *what* a memo reads without deriving *what it depends on*: three snap-target memos asked for `ALL_SNAP_TYPES` while listing five or six collections by hand, so the index went stale on anchor/kickstand changes and a green preview could fail to commit | `BranchPlacementController`, `LeafPlacementController`, `BracePlacementController` | fixed — depend on `supportState` itself, which ESLint can verify; the hand-written arrays were already raising `exhaustive-deps` warnings nobody acted on |
| Auto-placement's 12mm cavity-bridge cap has never rejected anything: it measured from `contactConeB`, but the stick builder sorts its cones so B is the *upper* one — which sits at the tip the span is measured from, giving ~0 every time | `autoPlace.ts` cavity bridge block | **open** — confirmed by probe (coneA.z 0.05, coneB.z 10.0 for a tip at z=10). Measuring from the declared `lower` contact would start rejecting long bridges, a real behaviour change; left for review rather than folded into the derivation |
| A tapered kickstand in a selection over 24 supports never took the bulk-selected colour: past that threshold the per-type selected sets are emptied, and the kickstand block called `resolveBaseColor` directly rather than `resolveDetailSupportColor`, which is what adds the bulk colour | `SupportRenderer` kickstand render block | fixed — routed through `sharedRenderProps` like the other six. Only a tapered kickstand or twig can mount detail while unselected (a taper cannot be instanced); twig already used the shared props. Same shape as the open anchor highlight bug, and worth checking whether that one shares a cause |
| `modelIdOfParentShaft` looked its argument up as an ENTITY id, but every knot's `parentShaftId` is a SEGMENT id, so it returned null for all of them: the active-model knot count read zero, and knots not otherwise attributed were dropped from the support bounds walk | `SupportModelLinker`, `page.tsx` counts + bounds | fixed — resolves through the owning shaft's segments now. Its tests passed throughout because every fixture keyed `parentShaftId` to the entity id, a case that does not occur; verified against a 592-entity scene where 317 of 317 knots carried a segment id and 0 carried an entity id |
| A ghosted or unbatchable brace called `resolveBaseColor` directly, so like the kickstand it never took the bulk-selected colour past the detail threshold | `SupportRenderer` brace render block | fixed — routed through `sharedRenderProps`, with the ghost overrides for `suppressHover`/`isInteractable` applied after the spread |
| The Ctrl+Shift+X support overlay's counts read `0 / 0` for every collection: they came from `page.tsx`'s support snapshot, which subscribes to a deliberately EMPTY snapshot whenever `scene.mode === 'support'` -- the only mode the support overlay appears in | `page.tsx` `trackSupportCollectionsInHome`, `SharedPanelStack` | fixed — the panel reads the support store directly. The empty-snapshot optimisation is untouched; only the debug readout stopped depending on it |
| `SupportRenderer.tsx` held ~250 type-named identifiers, the bulk of them eight per-type JSX render blocks | `SupportRenderer` render blocks | fixed — one `detailRenderers` table plus a `renderDetailFor` loop; **250 -> 61**. Each entry declares `entityProp`, `hosts` (returning null to skip), `skip`, `extraProps` and `noClipping`. The table lives in the component, not the registry: every entry closes over live scene state, and putting renderers on the descriptor would make every registry consumer import React. Verified by re-implementing both the old blocks and the new table as pure functions and comparing all 512 boolean combinations across 8 types — 0 differences; the suite covers none of this path. `detailRendererCoverage.test.ts` reads the source so a ninth type without an entry fails rather than silently drawing nothing |
| The second settling pass in the knot-geometry chain (leaf reshape -> leaf-cone knots -> brace-segment knots, run again when the brace step moved something) may be dead work: instrumented across all 1,197 tests it fires exactly ONCE and changes nothing when it does (`leafConeChanged=false, braceChanged=false`), and deleting it leaves every test and all 50 goldens green | `state.ts` `settleKnotDependentGeometry` | **open** — either it guards a real convergence case no fixture reaches (a brace whose knots move a leaf that moves knots on another brace), or one pass already settles everything and the second is wasted work on every import. Needs a decision before it can be removed; left in place because removing behaviour on the strength of green tests is exactly the trap |

| The grep metric counts capitalised identifiers (`renderStickList`) and is blind to lowercase type-literal dispatch (`category === 'stick'`), which is the same rename hazard in a form the measurement never sees | repo-wide | **swept, 108 -> 75.** Converted: the delete path's knot-host chain, the joint-drag preview union, the sidebar's field guards (`SUPPORT_KINDS` properties), the preview camera chain (table), the transform walk's pseudo-shaft tracking (`knotHostPrefix`), the whole support clipboard. What REMAINS is deliberate, in three groups: (1) **per-type builders/components** — `TrunkPreview` (4), `autoPlace` (8), `SupportRenderer` (2) each call a different builder with a different argument shape; these need the same renderer/builder registry `SupportRenderer` is blocked on, and should move with it. (2) **genuine per-type behaviour** — `BezierGizmoManager` (5, trunk's own history entry + brace's curve), `useKnotInteraction` (10, branch-preview cache and twig taper), `autoBrace` (6). (3) **false positives** — `presets.ts` and `autoSupport/settings.ts` use `'anchor'` as a SIZING PRESET name, `supportPlacementRouting` matches `intent.family`; renaming the anchor type touches none of them. Re-measure with those excluded before treating the number as work remaining |
| `npm run check:lint` cannot run on Windows: `spawn('npx')` needs a shell there, and `.bin/eslint.cmd` fails too (`EINVAL`, Node refuses to spawn `.cmd` since CVE-2024-27980) | `scripts/check-lint-clean.mjs` | **not a bug** — CI runs it on ubuntu-latest (`test.yml`), where it works; it has never run on Windows since the script was written. Locally on Windows, run the two guards (directories exist, plugin submodules populated) and then eslint over the listed dirs — eslint alone is NOT the gate, since an empty submodule lints green while covering nothing. `process.execPath` + `node_modules/eslint/bin/eslint.js` would make it cross-platform if a local signal is ever wanted |
| `SupportSidebar.tsx` (25 identifiers) and `useKnotInteraction.ts` (14) look like rollup targets by count but mostly are not: the sidebar's are one floating **trunk** preview feature, the knot hook's a branch-segment preview cache and twig-diameter math. Renaming a type would not require renaming any of them | `SupportSidebar`, `useKnotInteraction` | **not a target** — surveyed and deliberately skipped. Their type-literal dispatch (17 and 10 sites) is the real exposure, not the identifier names |

| The grep metric's Anchor column overcounts by ~20%: 14 of 71 hits are geometric anchor points (`AnchorPoint`, `lowAnchor`, `resolveAnchorAtZ`), DOM anchor refs (`supportSidebarAnchorRef`, `multiGizmoAnchorRef`) or slice intent anchors, none of which the anchor TYPE owns. `GitBranch` (a lucide icon, 2 hits) contaminates Branch the same way | metric, `autoBracing/autoBrace.ts` and elsewhere | **open** — exclude them when reading the number, or the type looks further from done than it is. `autoBrace.ts` scores 37 largely on this: it never references `'anchor'` or `anchors` at all |

| `branch` declares `isAutoBraceable: true` but is unreachable in both auto-bracing passes: the main pass drops every non-trunk sample the line after collecting it (`buildSupportSamples(snapshot).filter(s => s.supportKind === 'trunk')`), and the stabiliser pass is handed a state holding only `kickstands`. So branch samples are built and discarded on the next expression | `autoBracing/autoBrace.ts` sample construction | **open** — PRE-EXISTING, not introduced by the registry work: the trunk filter is unchanged from before `30aad040`, which only replaced three hand-written loops with one over the flag. Either branches should be braceable (a feature gap the flag now advertises) or the flag is wrong for branch and should be false. Deciding needs a product call, so nothing was changed |

| Copying a model with anchors produced broken supports on every copy: the clipboard CAPTURE walks `MODEL_ID_COLLECTION_KEYS` from the registry (so anchors came across), but the MERGE that writes the pasted state named its eight collections by hand and omitted `anchors`, as did the `hasSupports` count that gates the paste. A model supported only by anchors pasted nothing at all | `PlacementLogic/supportClipboard.ts` | fixed — merge and count both derive from `SUPPORT_COLLECTION_KEYS`. Reported by a user, reproduced by them (hundreds of duplications clean without anchors); the mutation that reinstates the skip fails both anchor tests. Anchor is the type with NO edges and an inline root, so it appeared in no id-remapping list and was the easiest to forget |
| `getOrCreateMappedId` mints a fresh UUID for any id it has not already mapped, so a reference that should have been remapped but was never captured silently becomes a pointer to nothing — no warning, no error, and the support renders in a wrong position rather than failing | `supportClipboard.ts` `getOrCreateMappedId` | **open** — this is what made the anchor bug present as "odd things" rather than an error. It cannot distinguish "first sight of an id I am about to clone" from "dangling reference", because both arrive as a cache miss. Wants either a `console.warn` in dev on the miss path, or splitting the helper in two — one that expects to create an id and one that expects to find an existing mapping and warns when it cannot. The split is the real fix and would have surfaced this class immediately |
| The support clipboard hand-wrote `leafCone:` / `braceSegment:` prefix handling in three places (clone, capture filter, bounds walk), each re-deriving which types a knot can ride instead of a real segment | `supportClipboard.ts` | fixed — declared as `knotHostPrefix` on the leaf and brace descriptors and read from there. Deliberately NOT reusing `segmentSelectionPrefix`, which is about selection ids and agrees only by coincidence for brace |

| Moving a model also moves knots riding the contact cone of a leaf that belongs to a DIFFERENT model, when that leaf hangs off a knot on the moved model's shaft: the walk treats any reachable entity as affected (`ownModelId !== modelId && !connected`), so the foreign leaf is transformed and its riders with it | `state.ts` `transformSupportsForModel` | **open** — pre-existing, confirmed by running the new test against the pre-refactor code. Defensible as "connected geometry moves together" and possibly intended, so nothing was changed; `transformPseudoShaftKnots.test.ts` pins the CURRENT behaviour rather than endorsing it. Decide before touching it |

| The support inspector debug readout is reported not working, and `setSceneHoveredSupportId` is a suspect: `SupportRenderer` aliases the shared setter to a local const (`const setSceneHoveredSupportId = setSharedSceneHoveredSupportId`), and two `useEffect` blocks that call it omit it from their dependency arrays — eslint flags both as missing deps | `SupportRenderer` hover effects, `interaction/shared/hover/sceneHoverStore` | **open** — reported by the user, not yet reproduced. The alias is stable across renders so a stale closure is unlikely to be the whole story; worth checking whether the hover store is written but never read by the inspector, or read from a different store instance. Noted while converting the kickstand view, not investigated |

| The pseudo-shaft prefixes `'leafCone:'` and `'braceSegment:'` are spelled out at ~73 sites across 12 files, though both are declared per type (`knotHostPrefix`, `segmentSelectionPrefix`). This is the WIDEST remaining rename hazard: renaming leaf's prefix in the registry leaves every literal pointing at nothing, `tsc` green and only 3 of 1,267 tests failing — proved by doing it | `state.ts` (25), `SupportRenderer` (12), `useKnotInteraction` (6), `supportExportReconstruction` (6), the three placement controllers (12), and others | **partly fixed** — `parseKnotHostId` and `knotHostId` added to the registry; four files converted (73 -> 61). The rest are NOT mechanical: most sit inside per-type branches whose bodies genuinely differ (brace tracks visited ids to break cycles, leaf does not), so each needs reading rather than a regex. Convert opportunistically when editing these files; a blind rewrite here is how an argument was dropped once already |
| `AutoPlaceResult` carries five `placed*` counters (trunks, anchors, branches, leaves, sticks) and no twig counter, though twigs are placed as cavity fallbacks — a placed twig increments nothing | `autoPlace.ts`, `autoSupport/types.ts` | **open** — cosmetic: nothing in production reads these counters, only tests. `ForestReport` has both `stickCount` and `twigCount` and is the richer summary. Either add the counter or drop the shape in favour of the report |

| Two more hand-typed walks that omitted ANCHORS, found by sweeping for the shape rather than by a report: `resolveSupportModelId` in `SupportRenderer` was a seven-branch first-match chain (an anchor id resolved to undefined, so under any model filter `isModelVisible` treated it as invisible), and `DiagnosticsModal` counted seven collections in three hand-kept places — the type, the empty defaults and the render rows — so the panel reported no anchors at all | `SupportRenderer` `resolveSupportModelId`, `DiagnosticsModal` support stats | fixed — the resolver walks `SUPPORT_TYPES`, taking each entity's own `modelId` then its declared `hostedBy` knot edges; the panel derives from `countSupportCollections` and `SUPPORT_COLLECTION_KEYS`. The renderer chain was LATENT, not live: callers pass `entity.modelId` first, which anchors carry, so it short-circuited before the missing lookup. Equivalence checked by running both implementations over 17 fixture ids across all eight types — identical everywhere the old chain answered |

| `buildScopedSupportGeometryGroup` called six per-type group builders from six hand-written `payload.<collection>.forEach` blocks, each resolving its own inputs first: brace looks up two knots, kickstand a root plus host knot with a four-way modelId fallback | `supportExportReconstruction.ts` | fixed — one `groupBuilders` table typed `Record<SupportTypeId, GroupBuilder>`, walked in registry order, so a type missing from the export is a COMPILE ERROR rather than silence. Entries are zero-argument closures, which keeps each row's type without a cast. Trunk and branch were inline `SupportGeometryGenerator` calls and became `buildTrunkGroup` / `buildBranchGroup` to match the other six. Verified by dumping all 68 exported nodes (name, geometry type, world position to 4dp, userData) before and after — identical |
| The geometry export path had NO per-type coverage: dropping anchors, or leaves, from `buildScopedSupportGeometryGroup` left all 1,262 tests green. The existing test asserted only that nothing WRONG was present (`children.length > 0` plus a modelId filter), which a whole missing type still satisfies | `supportExportReconstruction.test.ts` | fixed — `every populated support type reaches the exported geometry` derives the expected group-name prefixes from each descriptor's `singular`, so a new type is covered by being declared. Same anchor-shaped blind spot as the clipboard paste bug |
| Four `resolve<Type>ModelId` helpers in the export module are unreferenced (`resolveBranchModelId`, `resolveLeafModelId`, `resolveBraceModelId`, `resolveKickstandModelId`) | `supportExportReconstruction.ts` | **open** — PRE-EXISTING, confirmed by linting the file before and after the table conversion (5 warnings both ways). The live paths inline the same fallback chains. Either the helpers should be adopted or removed; not touched, since neither is what the table change was for |

| `kickstandStore` is a deprecated compatibility shim, not a second store: every export reads and writes `SupportState`, and the `KickstandState` it returns is a filtered VIEW (the roots and knots kickstands own). 19 files and ~143 `kickstandState` references still go through it | `kickstandStore.ts` and its callers | **partly fixed** — an earlier row here claimed kickstands lived in two places; that was WRONG, the file's own header says otherwise. The view's filtering is a registry fact: `ownsRoot` is trunk and kickstand, and the `edges` declare `rootId -> roots` / `hostKnotId -> knots`. `getOwnedPrimitives(typeId, collection)` in `state.ts` derives it, with `getKickstandRoots` caching by snapshot identity because `useSyncExternalStore` compares by reference. Three raft renderers converted (22 -> 19 files). The rest need reading one at a time: several callers iterate the FILTERED set (raft base circles count trunk roots and kickstand roots separately, so widening to all roots would double count) |

| Kickstand declares `shaftTaper` (`segments: 'last'`) but registers no `registerKnotDiameterRule`, so a knot slid along a kickstand's tapered terminal segment takes the flat segment diameter while a twig knot tracks its taper | `SupportTypes/Kickstand`, `resolveKnotDiameter` | **open** — surfaced by deriving the knot-drag sizing through the registry rule instead of calling the twig math directly. The drag path now asks the registry, so the fix is one `registerKnotDiameterRule('kickstand', ...)` in a Kickstand registration module; it needs the terminal-segment taper math and a decision on whether the 10% joint oversize applies. A visible geometry change, so not folded into the derivation |

| Knot-drag history named only three hosts (`leafCone`, `brace`, `kickstand`) and let trunk, branch, leaf, twig, stick and anchor fall through to "Move support knot" — the same bug already fixed once in `KnotGizmo`, which derives the label from the type id | `useKnotInteraction` drag end, `KnotGizmo` | fixed — both call sites share `knotMoveDescription` in `knotUtils`. One wording change: a kickstand host knot now reads "Move kickstand knot" rather than "Move kickstand host knot", so the rule can be uniform. Undo-stack text only; flag if the longer form was deliberate |

| The manager routes support-hover and support-click to `leafPlacement` and `branchPlacement`, but both hooks return no-ops for those two methods (`const onSupportHover = useCallback((hit) => { void hit; }, [])`). Eight owner-dispatch literals drive four calls that do nothing | `useSupportInteractionManager` support hover/click, `useLeafPlacement`, `useBranchPlacement` | **open** — branch's no-ops carry a comment saying snapping is handled by `BranchPlacementController`, so this reads as intentional for branch and unexplained for leaf. Left alone while converting the MODEL gestures: collapsing them into a table would tidy the syntax around dead calls and hide that they are dead. Decide whether the routing or the handlers should go |

| Auto-placement picks its collision predicate by type literal: `leafConeCollides` for a leaf, `branchCollidesWithSDF` for a branch, bare `isShaftBlocked` otherwise, chosen behind `kind === 'leaf'` and the builder call sites. The three take different arguments (a cone and a knot position, a whole branch entity, a start/end/radius triple) and answer the same question | `autoPlace.ts` collision checks, `checkAttachment` | **open** — noted while typing the placement `kind` chain. Wants a registry-side collision descriptor so a type declares how it is swept, rather than each call site naming the predicate. Deferred deliberately: the predicates differ in shape, not just name, so this is a real interface design and not a rename |

Two of these were invisible to the whole suite AND all 22 goldens
(`transformSupportsForModel`'s reachability walk). Passing tests are not
evidence a flag is covered — see AGENTS.md trap 4.

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
