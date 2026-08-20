# Auto-Supports

Automatic support placement: given the island-analysis output for a model, decide where supports go, how thick they are, and brace them — then commit the whole thing as one undoable change.

Gated behind the `auto-supports` experiment (see [Experiments Framework](experiments-framework.md)); the gate is checked in `src/app/page.tsx`.

## The seam that matters: plan, then commit

`computeAutoSupportPlan(islands, modelId, settingsOverride?, baseState?, baseKickstand?, mesh?)` is pure with respect to the stores: it clones the current snapshots, works on drafts, and returns an `AutoSupportPlan` holding `before`, `kickstandBefore`, the new `support` and `kickstand` states, and analytics. It commits nothing.

`runAutoPlace(...)` is the thin caller that computes a plan and, only if `result.changed`, calls `setSnapshot()` / `setKickstandSnapshot()`.

Keep that split. It is what makes the run testable without a store, lets a caller preview or discard a run, and keeps the whole placement — including auto-bracing — a single history entry rather than a stream of mutations.

## The pipeline

Six phases inside `computeAutoSupportPlan` (`autoPlace.ts`):

| # | Phase | What happens |
| - | ----- | ------------ |
| 0 | Settings | Normalize; bail out returning `null` when disabled |
| 1 | Generate candidates | Turn detected islands into `CandidatePoint`s |
| 2 | Deduplicate | Collapse candidates that would support the same spot |
| 3 | Place | The bulk of the work — grid or Poisson distribution, trunk/anchor/leaf decisions, collision checks, gap filling |
| 4 | Forest resize | Re-derive every trunk's stepwise diameter now that the forest is known |
| 5 | Auto-bracing | Braces computed into the same draft, so they ride the one commit |

## Candidates

Islands arrive from volume analysis carrying a `source`. Three matter: `overhang` (the mesh-normal classifier's shallow surfaces), `minima` (local low points, only when `class === 'minimaOnly'`), and `intersection`.

Priority is a weighted score — **60% area, 30% Z height** (lower is more urgent, it prints first), **10% source bonus** for intersections, further boosted when `prioritizeIntersection` is on.

## Distribution: grid or Poisson

`distributionMode` is `'auto' | 'grid' | 'poisson'`. Under `auto`, each region's flatness is measured and compared against `poissonFlatnessThresholdDeg`: flatter than the threshold gets the lattice, more organic geometry gets Poisson-disk spacing. Explicit modes force one or the other for the whole run.

Grid spacing is modulated by surface angle, normalized against `OVERHANG_SELF_SUPPORT_ANGLE_DEG` (45°): a flat ceiling is densest (`GRID_SPACING_MIN_FACTOR` 0.7, roughly twice the supports), a slope at the self-support threshold sparsest (`GRID_SPACING_MAX_FACTOR` 1.3).

**Anchor bands** densify the first-printed underside. Eligible regions are clustered by Z-gap and only the **lowest cluster** is treated as the anchor layer; higher clusters — shelves, ledges, mid-model flats — are suction surfaces and keep scale 1. Anchoring every cluster was tried and over-supplied: with per-patch clustering nearly every region is its own cluster minimum, so the band stopped discriminating.

### Competitive bake-off on anchors (v1.5)

For `distributionMode === 'auto'`, anchor surfaces (`anchorBands.inBandIds` — the lowest Z-cluster) do **not** gamble on flatness. Both generators run and footprint coverage picks the winner per region:

- **Module:** `src/supports/autoSupport/distributionBakeoff.ts`
- **Entry:** `pickBestDistributionForRegion(region, settings, scaleById, anchorIds)` → `{ candidates, winner, metrics }`; batch helper `bakeoffAnchorRegions()`
- **Scoring:** `computeRegionCoverage(region, tips, TIP_COVERAGE_RADIUS_MM)` — fraction of `contactVoxels` within 3 mm of a tip (same metric the gap-fill loop iterates on). Higher wins.
- **Tie-break:** `|Δ| < BAKEOFF_COVERAGE_EPSILON` (1%) falls back to the shape heuristic (`computeRegionFlatnessDeg` vs `poissonFlatnessThresholdDeg`) so a flat anchor stays gridded — not "fewer wins" on a 1-point margin. Explicit `grid`/`poisson` modes bypass the bake-off entirely.
- **Efficiency gate (1–5% margin):** if `|Δ| >=1% && |Δ| < BAKEOFF_EFFICIENCY_MARGIN` (5%) and both sides already meet `REGION_COVERAGE_TARGET` (95%), fewer candidates wins — gap-fill closes the 4.7% hole (44 vs 162) with 2–3 clusters, not 118 extra trunks. Below 1% the tie-break applies; above 5% pure coverage wins.
- **Cost:** double generation on anchors only (typically 1–5 regions); coverage check is `O(voxels)` with no pathfinding. Non-anchor regions keep the single-generator heuristic.
- **Analytics:** `AutoPlaceAnalytics.competitive?: { anchorRegions, gridWins, poissonWins, avgWinnerMargin }` (`src/supports/autoSupport/types.ts`) and `distribution: {grid, poisson}` counts the wins; also logged per region (`Bakeoff o0: grid=… vs poisson=… → winner`).

```ts
import { pickBestDistributionForRegion } from './distributionBakeoff';
// bakeoff.winner === 'grid' | 'poisson', bakeoff.candidates is the chosen set
// bakeoff.metrics: { gridCoverage, poissonCoverage, gridCount, poissonCount, delta, winnerMargin }
```

Constraints — mutating the bake-off must keep: deterministic (seeded PRNG in `poissonPlacement.ts`), cap `MAX_GRID_CANDIDATES_PER_REGION` (800), footprint containment via the same `surfaceAt` hash, and `TIP_COVERAGE_RADIUS_MM` as single source of truth (`coverage.ts` / `constants.ts`).

## Coverage and gap filling

A tip covers surface within `TIP_COVERAGE_RADIUS_MM` (3 mm). A region needs no gap filling once `REGION_COVERAGE_TARGET` (95%) is met; uncovered clusters below `MIN_GAP_CLUSTER_MM2` (2 mm²) are not worth filling, and there are at most `MAX_GAP_FILL_PASSES` (3) passes per run.

## Sizing is empirical, not physics

!!! warning "Physics-based sizing was tried and removed — do not reintroduce it"
    An area-derived shaft curve **inverted the profiles**: a light 16 mm² cell sized *thicker* (1.28 mm) than a heavy 5 mm² cell (1.12 mm), because the curve rose with cell area. Light / Medium / Heavy are now hardcoded profile blocks (detail ≈ 0.8, structure ≈ 1.0, anchor ≈ 1.2 shafts) and sizing follows the active block. Session overrides apply until the next profile switch. See the header comment in `parameterSizing.ts`.

Tip contact is the profile band scaled by underside angle — flat ceilings get the full contact, steeper slopes less — floored at 30% of the shaft so a thick shaft keeps a proportional tip. Roots, tip length and penetration take the profile band flat.

## Rules worth knowing before you change placement

- **Anchors are standalone.** A contact below `ANCHOR_HEIGHT_THRESHOLD_MM` (5 mm) becomes an [anchor](../reference/support-anatomy/anchor.md), which never merges into a branching tree and never hosts a fan or merge leaf — it is load-bearing. A flat region's grid infill stays a 1:1 pillar forest.
- **Grid trunks are fanning hosts only up close.** `GRID_HOST_FAN_RADIUS_MM` (2.5 mm) is deliberately tighter than the general `LEAF_FAN_RADIUS_MM` (5 mm), so fan leaves do not sweep across the grid forest and puncture its shafts.
- **Fanning attaches to segments, not trunks.** `collectFanShaftPoints` samples per-segment (`segmentId` + `t`) and `fanLeafToTrunk`/`buildConsolidationBranch` create knots with `parentShaftId: segmentId, t` — not `trunkId`. Legacy `trunkId` knots are rehosted to the nearest segment before `computeForestDiameterProfile` so diameter demands include fan leaves and drift checks use segment geometry. `countAttachmentsOnTrunk` handles both for backward compat.
- **Orphan validation after resize.** After `computeForestDiameterProfile` the pipeline rehosts legacy knots and runs `validateAndCullOrphans` (drift >0.5 mm, missing host/segment culled; `cross`/`blocked` reported but kept). Culled leaves/branches and their orphan knots are removed, `ForestReport.orphans[]` lists `id/kind/reason/hostId/knotId/detail`, and `forestReportToText` emits `ORPHANS CULLED`. This is where the "leaf attached to nowhere" (drifted knot after a host trunk’s diameter split) is caught — check the report before the render.
- **A candidate within `ALREADY_SUPPORTED_RADIUS_MM` (3 mm) of an existing tip is already supported** and is skipped.
- **Gridless runs still merge**: candidates within `GRIDLESS_MERGE_RADIUS_MM` (4 mm) of an existing trunk join it.
- Every shared radius and span lives in `autoSupport/constants.ts`, which exists because these previously had inconsistent copies in `autoPlace.ts` and `gridPlacement.ts`. Add new ones there.
## Settings and reporting

`settings.ts` declares roughly twenty knobs with `AUTO_SUPPORT_CONSTRAINTS` giving each a min/max/step/default — including two debug switches (`debugSupportOriginColors`, `debugSkipAutoBracing`, the latter for faster iteration). Use `normalizeAutoSupportSettings` / `applyAutoSupportSettingsPatch` rather than building the object by hand.

A run returns `AutoPlaceAnalytics` and a `ForestReport`; `forestReportToText` renders it for the placement summary. The report is the primary debugging surface — every decision includes a *why*.

### Report sections (v1.5)

`ForestReport` lives in `src/supports/autoSupport/types.ts` (`ForestReport`, `ForestScanMetrics`, `CompetitiveBakeoffReport`, `OrphanInfo`, `ForestTree`). `forestReportToText` in `src/supports/autoSupport/autoPlace.ts` is the copy-paste renderer. `AutoPlaceAnalytics` mirrors the bake-off aggregate for programmatic use.

- **SCAN** — `209 islands (voxel …) → 187 candidates · 1 overhang` plus `coverage 100% of 438mm²`. Second line justifies: candidates after dedup/filter, anchor surfaces are *lowest Z-cluster* (first-printed layer, densified at `anchorSpacingFactor 0.7×`), coverage is `computeRegionCoverage` footprint fraction @3mm.
- **DISTRIBUTION BAKE-OFF (anchors)** — `grid 0.964 44 vs poisson 0.994 139 Δ=0.029` plus per-region reasoning:
  - `|Δ|<1%` → tie, shape heuristic (`computeRegionFlatnessDeg` vs `poissonFlatnessThresholdDeg`, planar→grid)
  - `both ≥95% & |Δ|<5%` → fewer wins (efficiency: gap-fill closes small hole with 2–3 clusters, not 95 extra pillars — the `44 vs 139` case)
  - otherwise higher coverage wins. Avg margin is the mean `|Δ|` across anchor bake-offs.
- **ORPHANS CULLED** — grouped by `reason` with counts and human-readable help, then per-entity `id (kind) reason @host knot … — detail`:
  - `trunkBlocked` — shaft pierces mesh (would print through model, SDF `distance < radius` on `isShaftBlocked`)
  - `blocked` — `knot→tip` ray hits mesh (`leafConeCollides` offset ray, tip-0.5mm, not straight segment; `branchCollidesWithSDF` for branches)
  - `missingHost`/`missingSegment`/`missingKnot` — knot points to segment/trunk that has no joints or was culled (legacy `trunkId` before `segmentId+t` rehost)
  - `drift` — knot >0.5mm from host shaft (split offset, `pointToSegmentDistanceSq >0.25`)
  - `cross` — leaf/branch crosses another shaft after thickening (`leafPathCrossesSupports` `radius 0.25`, kept but flagged)
  - `host trunk culled (blocked)` — leaf on a trunk that was itself `trunkBlocked`
- **PLACEMENT DIAGNOSTICS** — `Trunks by kind: poisson 2 (organic disk), grid 28 (planar infill), gap-fill 2, standalone 54 (sub-threshold, no host)`; `Candidates by distribution: grid 28 · poisson 0 · single 54`; `Candidates by source`; `Fan refusals: noHost=39 … (too far >5mm/2.5mm grid, angle >60°, sameZ|cross|blocked|capacity)`; `Merge refusals: noHost=35 (no trunk within 4mm), rejected=6 (host at capacity/collision)`. Sourced from `diagnostics` captured in `computeAutoSupportPlan`.
- **Counts** — `56 trunks · 70 leaves … | 16 trees, 40 bare` — `trees` are hosts with members, `bare` are 1:1 pillars.
- **FAN-OUT GROUPS** — `v115 @ Z=26.6mm Ø1.03mm [area 0.53mm² …] → 12: v116(L 2.8mm/20°) …` with header `(host trunk → leaves/branches within 5mm fan radius, 2.5mm for grid hosts, <60° from vertical, not blocked/crossing, not at capacity)`. `spanMm`/`angleDeg` are `knot→tip` distance and angle from vertical.
- **STANDALONE TRUNKS** — `grid-o0-… @ Z=6.4mm Ø1.27mm [area 10mm² … ×1.25 anchor girth]` plus `— anchor grid infill (lowest Z-cluster, densified)` or `— poisson disk (organic or anchor perimeter)` or `— standalone voxel/minima (below threshold or no fan host)` based on `id` prefix.

**Bake-off reporting (v1.5):** `AutoPlaceAnalytics.competitive` aggregates anchor bake-offs (`anchorRegions`, `gridWins`, `poissonWins`, `avgWinnerMargin`). `ForestReport.bakeoff` mirrors the aggregate plus `details[]` per anchor (`regionId`, `winner`, `gridCoverage`/`poissonCoverage`, `gridCount`/`poissonCount`, `delta`) and `forestReportToText` emits a `DISTRIBUTION BAKE-OFF (anchors)` block. Check `src/supports/autoSupport/types.ts` (`CompetitiveBakeoffAnalytics`, `BakeoffDetail`, `CompetitiveBakeoffReport`) for the surface.

**Orphan reporting (v1.5):** post-resize `rehostLegacyKnots` + `validateAndCullOrphans` cull `drift`/`missingHost`/`missingSegment` (orphan knot >0.5 mm off its host segment) and report `cross`/`blocked` without culling. `ForestReport.orphans[]` (`OrphanInfo`) and `forestReportToText` `ORPHANS CULLED` surface them. Drift is the "leaf attached to nowhere" case — host segment split rehost failed or knot was placed on a trunk that later split.

**Diagnostics reporting (v1.5):** `ForestReport.diagnostics` captures `diagnostics.candidatesBySource/Distribution`, `trunksByKind`, `fanRefusals`, `mergeRefusals` so the text report can explain *why* a candidate became a trunk/leaf/standalone vs fanned/merged.

## Related pages

- [Support System](support-system.md) — the subsystem this places into
- [Anchor](../reference/support-anatomy/anchor.md) — what near-plate contacts become
- [Experiments Framework](experiments-framework.md) — the gate
