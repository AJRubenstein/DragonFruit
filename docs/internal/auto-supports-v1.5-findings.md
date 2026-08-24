> **SUPERSEDED (unified fixed-density distribution):** the bake-off, Poisson
> generator, and anchor-band machinery described below were removed. Kept as
> history only.

# Auto-Supports v1.5 — Findings & State (2026-08-21)

Working notes from the `feat/auto-supports-v1.5` session. Unpublished
(`docs/internal/`), safe to edit/delete.

## Where we are

Branch tip: `b17b294e` — pushed to `origin/feat/auto-supports-v1.5`.

Baseline chosen: **`4e02b075`** (anchor min-size filter + triangle perimeter
loops). Everything after it was reverted twice and rebuilt as two small commits:

| Commit | Content |
|---|---|
| `4e02b075` | anchor min-size filter (`ANCHOR_MIN_XY_MM=4`, `ANCHOR_MIN_AREA_MM2=12`), triangle perimeter loops (Rust) gated to anchors |
| `9c53ab84` | *(in backup only — see below)* anchor fan-merge, cap 4, anchor↔anchor only |
| `b17b294e` | triangle perimeters in GRID mode (all overhangs), bakeoff anchor blowout cap (>3× → fewer wins), per-point `anchorPoint` flag |

Backups of discarded work:
- `backup/auto-supports-pre-revert` — per-point raycast + side-wall reject (caused zig-zag)
- `backup/anchor-fanmerge-26d0282a` — anchor fan-merge + Rust crease-splitting (caused brutal scan slowdown)

## What works now

- **Simple render mode** (`debugSimpleSupportRender` setting): line-vector shafts,
  no knots/joints/cones — user likes this, keep.
- **Anchor min-size filter** — slivers (3×0.5 mm toe patches) stay standalone
  non-anchors instead of hammering the first layer.
- **Triangle perimeters everywhere** — grid boundary-fill and poisson ring both
  use Rust-extracted inset loops when available; voxel erosion is fallback.
- **Bakeoff blowout cap** — anchor tie (<1% coverage delta): if one side emits
  >3× pillars while both clear 95%, fewer wins. Kills the `grid 59 @99.6% vs
  poisson 1151 @100%` foot explosion.
- **Per-point `anchorPoint`** — only poisson samples within the region's own
  band (`baseZ + anchorBandHeightMm`) get girth/fan treatment; upper points of a
  tall region are plain supports.

## What failed and why (do not re-try as-is)

1. **Per-point raycast for ALL candidates** (`3e00d103`, reverted):
   slanted real overhangs got routed by A* with per-point normals → zig-zag
   forests. If revisiting, scope per-point normals to anchors only (they build
   straight via `buildAnchorData`, no routing).
2. **Rust region splitting at creases/Z-jumps** (`26d0282a`, reverted):
   - Z-jump rule shattered legitimate slopes — a single steep quad's two facets
     differ >2 mm in triangle-center Z. Edge-adjacent faces are contiguous by
     definition; genuinely separate heights share no edge.
   - Even the crease-only variant made island scans "brutally slow" and DF slow
     after scan (user report). More regions = more masks/loops/candidates.
3. **Anchor efficiency-gate exclusion**: anchors skipping the <5%-margin gate
   directly caused the 1151-pillar foot. The >3× tie cap fixes that case.

## Open problems / next steps

1. **Smart clustering instead of physical splitting.** One continuous cape still
   yields ONE huge region spanning 43 mm of Z (Vader). Agreed direction:
   keep regions physical, then cluster *regions* into anchor groups by
   Z-proximity + normal agreement at the placement layer before deciding what
   gets anchored. No extra Rust passes, no scan cost. NOT YET IMPLEMENTED.
2. **Anchor fan-merge** (cap 4, anchor↔anchor) exists on the backup branch and
   worked mechanically (verified: leaves-per-host ≤4). Worth re-landing after
   clustering lands — it needs `collectFanShaftPoints` to include anchor trunks
   tagged `isAnchor`, skip segments without bottom joints (drift-cull bug), and
   `fanLeafToTrunk(..., onlyAnchorHosts)`.
3. **Scan perf regression risk**: if scans feel slow again even WITHOUT the
   split commit, suspect `build_perimeter_loops` / footprint mask cost on
   high-triangle models — not yet profiled.
4. Test premise fixed: `autoPlace.test.ts` "keeps low undersides" — its `o15`
   fixture is a sliver deliberately excluded by `ANCHOR_MIN_XY_MM`; assertions
   updated to match.

## Key files

- `src-tauri/src/overhang.rs` — classifier, footprint mask, perimeter loops
- `src/supports/autoSupport/gridPlacement.ts` — grid spacing, boundary fill, `samplePerimeterLoops`

## Verification status at push

- `cargo test overhang` 6/6 (at baseline)
- tsc clean
- (v1.5 numbers superseded by the unified fixed-density distribution)
