# `anchor`: every token, classified

> **Read this with one thing in mind: the support type this census is about has
> since been RENAMED to `stump`.** Every "IS the support type" row below was
> converted so that a rename needs no other edit, and the rename then happened.
> The prose keeps the old word deliberately: the census's whole subject is that
> `anchor` is an ordinary English word this codebase uses for geometric
> anchoring far more often than for the type, and that is still exactly true.
> Code symbols that MOVED are cited at their current names (`updateStump`,
> `stumpRegistration`, `STUMP_BELOW_ROOT`); the word in prose is history.

A census of all 154 distinct tokens containing "anchor" in `src/`, outside the
three exempt places. Companion to [anchor-rename-plan.md](anchor-rename-plan.md).

It exists because "anchor" is an ordinary English word and this codebase uses it
for geometric anchoring far more often than for the support type. Renaming the
wrong one is a defect that compiles clean, so each was read rather than matched.

Counts are mentions, not lines. 1,161 mentions across 154 tokens.

## NOT the support type -- do not rename

### Geometric anchoring (a point something is fixed to)

| token | mentions | where |
| --- | ---: | --- |
| `sortAnchor` | 14 | `autoBrace.ts` -- the point a brace sorts by |
| `lowAnchor` / `highAnchor` | 31 | `autoBrace.ts` -- span ends |
| `aAnchor` / `bAnchor` | 4 | `autoBrace.ts` |
| `AnchorPoint` / `AnchorCandidate` | 5 | `autoBrace.ts` |
| `getSupportBottomAnchor` | 3 | `autoBrace.ts` -- returns a `Vec3` |
| `resolveAnchorAtZ` | 7 | `autoBrace.ts` |
| `bestReachableAnchorZ` | 8 | `heightCoverageAnalysis.ts` |
| `requiredAnchorZ`, `maxAnchorZFromNeighbor` | 7 | `heightCoverageAnalysis.ts` |
| `ANCHOR_SAFETY_MARGIN_MM` | 2 | `heightCoverageAnalysis.ts` |
| `anchorPoint`, `resolveShaftAnchor` | 12 | `segmentEndpoints.ts` -- where a shaft is anchored |
| `socketAnchor`, `socketAnchorRef` | 5 | `LeafRenderer`, `TrunkRenderer` -- socket positions |
| `candidateAnchors`, `CandidateAnchor` | 7 | `kickstandStabiliser.ts` -- sample points |
| `topAnchorX/Y/Pos` | 9 | `kickstandStabiliser.ts` |
| `anchorPoints` | 4 | `smartPlacementCandidateSearch.ts` |
| `anchorIndex`, `anchorPenalty` | 11 | **Evidence:** `orderedModelIds.indexOf(anchorId)` in `ModelManagerPanel` -- a list index; `anchorPenalty` scores distance from it |
| `anchorZ` | 4 | `autoBrace.ts` (`ladder.forEach((anchorZ, …))`) and `BracePreview.tsx`. **Evidence:** a Z height |

### A different feature entirely

| token | mentions | where |
| --- | ---: | --- |
| `arrangeAnchorMode`, `ArrangeAnchorMode`, `setArrangeAnchorMode`, `anchorMode`, `onAnchorModeChange` | 65 | scene arrange |
| `packingAnchor`, `anchorDistSq`, `toAnchor`, `toAnchorX/Y` | 28 | `highPrecisionArrange.ts` |
| `tenonAnchor`, `TenonAnchor`, `onTenonAnchorChange`, `anchorW`, `anchorL`, `sameAnchor` | 65 | organic cut |
| `anchorPos`, `anchorSize`, `anchorRule`, `anchorTargetId`, `AnchorSide`, `LayoutAnchorRule`, `isEdgeAnchored`, `shouldPreferAnchor`, `shouldPinEdgeAnchor`, `getAnchoredDesiredPosition`, `effectiveAnchorTarget`, `anchorTargetOverride`, `forceAnchoredPanelIds`, `hasProfileAnchor` | 40 | `FloatingPanelStack.tsx`. **Evidence:** the file imports nothing from `supports/`; `anchorTargetId` is a PANEL id (`rule.to`), `anchorSize` is `getPanelSize(anchorTargetId)`, and `AnchorSide` is `'below' \| 'above' \| 'right' \| 'left' \| …` -- a screen direction |
| `textAnchor`, `labelAnchor`, `xLabelAnchor` | 10 | `LutCurveEditor`. **Evidence:** SVG attributes, values `'start' \| 'middle' \| 'end'` |
| `shouldLockDragAnchor` | 3 | `ScreenSpaceGizmo`. **Evidence:** `(operation) => operation === 'rotate' \|\| operation === 'scale'` |
| `sourceSupportAnchor`, `sourceSupportAnchorCount`, `setMultiGizmoAnchorPosition`, `multiGizmoAnchorRef`, `anchorProgress` | 25 | `SceneCanvas`. **Evidence:** all `THREE.Vector3` / `THREE.Group`. `sourceSupportAnchor` averages root positions -- it is a POINT belonging to supports, not an anchor entity |
| `sliceIntentAnchorRef`, `inAnchor` | 6 | `SlicingPanel`. **Evidence:** `useRef<HTMLDivElement>`, used for `contains(target)` click-outside |
| `supportSidebarAnchorRef` | 3 | `SupportSidebar`. **Evidence:** `useRef<HTMLDivElement>` -- a DOM node a popover positions against. In a supports file, still not the type |
| `anchor` as `document.createElement('a')` | ~6 | `rasterLayerZipExport`, `usePrintingMonitorManager`, `page.tsx`. **Evidence:** `anchor.href` / `anchor.download` -- a download link |

### The sizing preset (shares the word, is not the type)

`ANCHOR_PRESET`, `'anchor'` as a preset id, `'Anchor'` as a preset name --
**11+ mentions** in `presets.ts`, `AutoSupportPanel`, `presetMessages.ts`,
`PresetSelector.tsx`.

It sits beside `'detail'` and `'structure'` and is **persisted in user settings**
(`sizingPreset: 'detail' | 'structure' | 'anchor'`). Renaming it breaks saved
profiles for no gain. Leave it, and leave its user-facing strings.

## IS the support type -- in scope

| token | mentions | note |
| --- | ---: | --- |
| `anchor` / `anchors` / `Anchor` | the bulk | entity, collection, and type id -- read each site, the word is overloaded |
| `'anchor'` / `'anchors'` | 40 | type and collection literals |
| `updateStump` | 3 | `state.ts` |
| `AnchorRenderer` | 2 | `SupportRenderer`, `registerBuiltinDetailRenderers` |
| `stumpRegistration` | 3 | the generated barrel -- **derived, leave it** |
| `supportStumps`, `supportStumpsRef` | 11 | `RaftProxyMeshLayer` -- reads `supportState.stumps` |
| `stumpList` | 3 | `SupportRenderer` |
| `StumpLike` | 2 | `raftFootprintCircles.ts` -- `Pick<Stump, …>` |
| `anchorCount`, `anchorClusters`, `anchorRegions` | 9 | `autoSupport/types.ts` -- report fields |
| `stabilizationAnchors`, `computeStabilizationAnchors`, `StabilizationAnchor`, `MAX_ANCHORS` | 21 | `stabilization.ts` -- these place anchors |
| `ANCHOR_HEIGHT_THRESHOLD_MM` | 2 | the height at which a trunk becomes an anchor |
| `ANCHOR_TOL`, `ANCHOR_FLOOR_MM2`, `ANCHOR_MIN_PRIMARY` | 6 | `orientationAdvisor.ts` |
| `STUMP_BELOW_ROOT` | 12 | a `LimitationCode`; only `stumpAutoPlacement.ts` raises it |
| `Anchors` | 6 | `DiagnosticsModal` and other labels |
| `Anchoring` | 1 | `orientationAdvisor.ts` |

## Watch for

**CORRECTED: `STUMP_BELOW_ROOT` is NOT the type.** This census said it was —
"raised only by the anchor's own placement rule, so it needs renaming with the
type". Reading the code disproves it: `STUMP_BELOW_ROOT` is a member of
`GridPlacementRejectReason` in `PlacementLogic/Grid/types.ts`, a vocabulary of
rejection reasons beside `KNOT_ABOVE_TIP` and `NO_HOST_SEGMENT`. It is raised by
`stumpAutoPlacement.ts` and read by `useTrunkPlacement.ts`, both sides sharing
the literal, so a type rename leaves it consistent — and the message it renders
("lower than the anchor root") describes a geometric condition, not an entity
kind. It is the same class as `ANCHOR_PRESET`: the word, not the type id.
Renaming it would be a defect.

The lesson is the census's own: classify by what the token IS, not by how it
reads. `ANCHOR_PRESET` was caught because it looks like a name; this one was
missed because it looks like geometry.

**`stumpRegistration` is already derived.** It appears in
`generatedSupportRegistrations.ts`, which is generated by walking the
`SupportTypes/` folders. Renaming the folder regenerates it.

**Test fixture ids** (`'anchor-a'`, `'anchor-1'`, `'r-anchor'`, `'seg-anchor'`,
`'knot-on-anchor'`) are arbitrary strings. They do not have to change for
correctness, but leaving them makes the suite read as though it still tests a
type that no longer exists.

**Test titles and user-facing copy** name the type in prose. They are not code,
but a rename that leaves them behind is visibly half-done.

---

## A token class this census could not see: the PATH

Every row above is an identifier or a string. One of the real hazards was neither:
`registerBuiltinDetailRenderers.ts` imported each renderer as
`'../SupportTypes/Anchor/AnchorRenderer'`, and a module PATH holds a type's name
where no token scan and no string scan will find it. Renaming the type orphaned
that import, which took out every test that renders anything (253 of them) from
one line.

Two more of the same shape exist and are derived rather than hand-written:
`<Folder>Renderer.tsx` and `<id>Registration.ts`, both asserted by
`supportTypeFolders.test.ts`, and both produced by generators that walk the
folders. The count in this census should be read as "tokens that were scanable",
not "places the name occurs".
