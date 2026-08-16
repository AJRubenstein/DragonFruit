# Auto-Supports Redesign Plan

Status: design agreed (2026-08-16). Audit fixes (section-5 list + undo/selection work) are
landed on `feat/auto-supports-v1`; this is the rebuild plan that builds on the cleaned surface.

Progress:
- [x] Step 1 — Rust overhang classifier (mesh-normal, footprint mask, angle threshold).
      `src-tauri/src/overhang.rs`, 6/6 unit tests (rotated cube, wall, slopes, containment).
- [x] Step 2 — `scan_overhangs` IPC + overhang regions in `useIslands` (DetectedIsland source
      'overhang', contactVoxels from footprint, real angle). Visible in-app as pucks + list.
      Overhang regions merge into the pipeline (voxel duplicates dropped) and render as
      translucent surface-mesh highlights.
- [x] Step 3 — density grid placement (grid phase): overhang regions ≥ gridAreaThresholdMm2
      get supports at √areaPerSupportMm2 spacing (containment-tested, surface-snapped,
      standalone trunks). `areaPerSupportMm2` is the density knob.
- [x] Step 4 — footprint-aware coverage convergence: regions are covered when their projected
      footprint is covered (not just the centroid); under-covered regions get gap-fill trunks
      at uncovered footprint clusters, iterating to a 95% target. Regular-island placement
      proven at scale on a dragon figurine (44 trunks / 79 leaves / 212 braces).
- [ ] Step 5 — forest resize pass.
- [ ] Step 5 — forest resize pass.
- [ ] Step 6 — worker + plan-then-commit + preview.
- [ ] Step 7 — validation corpus + tuning.

## Problem summary (from the audit)

- Detection only flags near-flat undersides: the growth rule `candidates = current − dilate(prev, buffer)`
  with `supportBufferMm = 0.25` and `layerHeightMm = 0.05` only catches surfaces flatter than
  `arctan(0.05/0.25) ≈ 11.3°` from horizontal (per-layer expansion smaller than the buffer is
  declared "supported"). The entire 11°–45° zone — the classic needs-support range in resin
  printing — is invisible, and shallow slopes accumulate unsupported material without ever
  triggering the rule. Sharp features are covered by the separate minima detector.
- Placement is per-island ("one candidate per island + fanning"), not region/density-driven:
  large shallow flats get a single point support instead of a grid, and the only grid logic
  (overhang coverage) runs on the TS fallback path only (Rust sideload lacks `contactVoxels`).
- Sizing is pseudo-physics (now fed real volume/top-Z, still decorative); user chose empirical
  presets instead.
- Pipeline is synchronous on the main thread, no preview, partial commits.

## Requirements model (what resin auto-support must do)

1. **Overhang detection** — every surface region that can't self-support: ledges (slice-growth),
   shallow slopes (mesh-normal angle classification), sharp features (minima).
2. **Density placement** — regions → tip positions: small region → one tip; large flat →
   grid at `areaPerSupport` spacing (the primary user control).
3. **Angle-aware tip selection** — flat ceilings: denser grid + stronger tips; slopes: sparser.
4. **Tree structure** — tips merge into branches off shared trunks; tall groups braced.
5. **Sizing** — empirical bands by supported area + angle + height; forest-wide resize pass.

## Target architecture: phased pipeline

Detection emits **regions** (footprint + angle + area), not points. Placement runs as ordered
phases, each consuming the previous output, with coverage recompute between them:

1. **Grid phase** — large flats (`area > gridThreshold && angle < shallowAngle`): density grid at
   √areaPerSupport spacing, jittered, edge-biased toward the leading edge of the slope. Defines
   the trunk forest.
2. **Region phase** — smaller regions: one support at lowest edge / centroid; may merge into
   phase-1 trunks.
3. **Sharp-feature phase** — minima/sharps: single supports (existing detector).
4. **Coverage convergence** — recompute what's now supported (tip influence radius), fan out
   branches/leaves from the existing forest to uncovered islands; iterate until no region above
   the coverage threshold remains. Escalation option: each iteration may add supports or thicken
   existing tips.
5. **Brace phase** — brace tall groups (existing machinery).

Plan-then-commit: the whole pipeline computes off-thread into a plan; Apply commits one undoable
history entry; preview shows ghost supports.

## Sizing model (locked: empirical presets)

Two-stage:

- **Placement-time**: bands per type — tip by `angle × area-share`, shaft by `height × carried
  area`, root by trunk load, branch by leaf load. Reuses `sizeParameters` with real
  `totalSupportedAreaMm2`.
- **Forest resize pass**: after placement (before commit), re-derive every trunk/branch size from
  the final attachment tree. Generalize `computeAndApplyTrunkDiameterProfile` (currently only
  used in trunk replacement) to the whole forest. Trunk carrying four branches gets thicker;
  lone trunk stays slim.

## Orchestration

Worker-based scan + placement (no main-thread jank), ghost preview, single undoable commit,
auto-rescan on transform change.

## Implementation steps (incremental, each verified before the next)

1. **Rust overhang classifier** (mesh-normal, configurable self-support angle).
   Acceptance: `cargo test` — synthetic shapes (30°-rotated cube → full underside facet,
   sphere, slope at 20°/45°) yield the expected overhang regions with area + footprint + angle.
   No IPC wiring yet — pure module + tests.
2. **Region metadata through the scan path** — classifier output merges into `DetectedIsland[]`
   (contactVoxels + area + angle); sideload path feature-equal to TS fallback.
   Acceptance: in-app scan of a rotated cube shows the full facet as an island with angle.
3. **Density grid placement (grid phase)**.
   Acceptance: facet of area A gets ≈ A/areaPerSupport tips, deterministic, collision-safe,
   edge-biased.
4. **Phased pipeline + coverage convergence** (grid → region → sharp → converge → brace).
   Acceptance: rotated cube fully covered, no region > threshold uncovered; branches attach to
   grid trunks (real trees, not trunk spam).
5. **Forest resize pass**.
   Acceptance: trunk with 4 branches thicker than a lone trunk of same height; deterministic.
6. **Worker + plan-then-commit + preview**.
   Acceptance: placement runs off-thread, preview ghosts render, Apply = one undo entry,
   undo/redo clean.
7. **Validation corpus + tuning**.
   Acceptance: corpus passes the coverage target; density control changes tip count predictably;
   the 5 pre-existing pathfinding test failures root-caused.

## Test corpus

Rotated cube (30°), sphere, L-bracket, shelf with stacked overhangs, cone (45° walls),
deep pocket, thin walls; real models from `public/mesh-preview-models` when available.

## Locked decisions

- Empirical sizing presets (no physics pretense).
- Decommission the legacy Analysis-tab island scanner (single production scanner).
- Hybrid detection: slice-growth (ledges) + mesh-normal classifier (slopes) + minima (sharps).
- Phased placement with coverage convergence.
- Worker-based plan-then-commit with preview.
