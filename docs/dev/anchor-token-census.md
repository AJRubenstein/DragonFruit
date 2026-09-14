# `anchor`: every token, classified

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
| `nextAnchors`, `updateAnchor` | 3 | `state.ts` |
| `AnchorRenderer` | 2 | `SupportRenderer`, `registerBuiltinDetailRenderers` |
| `anchorRegistration` | 3 | the generated barrel -- **derived, leave it** |
| `supportAnchors`, `supportAnchorsRef` | 11 | `RaftProxyMeshLayer` -- reads `supportState.anchors` |
| `anchorList` | 3 | `SupportRenderer` |
| `AnchorLike` | 2 | `raftFootprintCircles.ts` -- `Pick<Anchor, …>` |
| `anchorCount`, `anchorClusters`, `anchorRegions` | 9 | `autoSupport/types.ts` -- report fields |
| `stabilizationAnchors`, `computeStabilizationAnchors`, `StabilizationAnchor`, `MAX_ANCHORS` | 21 | `stabilization.ts` -- these place anchors |
| `ANCHOR_HEIGHT_THRESHOLD_MM` | 2 | the height at which a trunk becomes an anchor |
| `ANCHOR_TOL`, `ANCHOR_FLOOR_MM2`, `ANCHOR_MIN_PRIMARY` | 6 | `orientationAdvisor.ts` |
| `ANCHOR_BELOW_ROOT` | 12 | a `LimitationCode`; only `anchorAutoPlacement.ts` raises it |
| `Anchors` | 6 | `DiagnosticsModal` and other labels |
| `Anchoring` | 1 | `orientationAdvisor.ts` |

## Watch for

**`ANCHOR_BELOW_ROOT` is the type**, despite reading like geometry. It is a
`LimitationCode` in `types.ts` raised only by the anchor's own placement rule.
An earlier draft of the plan listed it as "check this" -- it does not need
checking, it needs renaming with the type.

**`anchorRegistration` is already derived.** It appears in
`generatedSupportRegistrations.ts`, which is generated by walking the
`SupportTypes/` folders. Renaming the folder regenerates it.

**Test fixture ids** (`'anchor-a'`, `'anchor-1'`, `'r-anchor'`, `'seg-anchor'`,
`'knot-on-anchor'`) are arbitrary strings. They do not have to change for
correctness, but leaving them makes the suite read as though it still tests a
type that no longer exists.

**Test titles and user-facing copy** name the type in prose. They are not code,
but a rename that leaves them behind is visibly half-done.
