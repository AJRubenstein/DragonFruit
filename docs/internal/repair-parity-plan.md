# Repair parity plan

Working plan for bringing the repair pipeline in line with how the shipping slicers repair a mesh.
The evidence behind it is kept out of the repository on purpose — see **Where the evidence lives** at
the end — because this file is pushed and describes a clean-room reimplementation, and clean-room
means the notes we commit do not carry the other implementations' names, symbols or addresses.

## Why

Three shipping slicers were examined and all three agree on the shape of repair: it is **local and
combinatorial**, and none of them resamples, voxelises or remeshes. The verdict they report has five
classes, and self-intersections are not among them. Ours counted eight and included
self-intersections twice (crossings and contacts), which is why a printable model kept reading as
broken and then cost minutes of work.

The five classes are: orientation, bad edges, holes, non-manifold, shells. The repair acts on
self-intersections; the verdict does not count them.

## The target order

The reference's automatic repair is ten passes, run **once, in order**, with no iteration:

| # | pass | parameter | ours |
| --- | --- | --- | --- |
| 1 | stitch | 0.010 mm, orientation respected | `weld_vertices_oriented`/`stitch_vertices_oriented` |
| 2 | close trivial holes | — | `holes::holes_trivial` |
| 3 | remove double triangles | — | `cull_faces` |
| 4 | fix flipped triangles | — | `repair_orientation` |
| 5 | close trivial holes | — | we run this once |
| 6 | stitch | 0.010 mm, orientation ignored | ours sits beside #1, not here |
| 7 | fix flipped triangles | — | we run this once |
| 8 | close all holes | — | **ours closes early** |
| 9 | remove degenerated faces | tolerance from the bbox | ours is a fixed criterion |
| 10 | remove tiny shells | border volume 0.0001 mm³ | ours is absolute volume |

The core's own composite, which is the executable truth rather than the UI's grouping, runs the
stitch **six times at hardcoded absolute tolerances** (0.005, 0.010, 0.002, 0.004 mm with the
orientation ignored, then 0.080 mm with it respected after the holes are closed), and **loops over
nothing**. Nothing in it probes the mesh, nothing derives a tolerance from the edge lengths, and the
only mesh-derived number in the whole script is the degenerate-removal tolerance, off the bbox.

That is the design lesson, and it is the opposite of what this engine had been doing. Our tolerances
are derived from the mesh — the weld from its own shortest edge over the diagonal, the fill cap from
its median edge — and our pipeline is built as rounds that keep coming round. Derived parameters are
fragile: the loader refines coarse faces before anything reads the mesh (see
`docs/dev/mesh-wire-formats.md`), so the shortest edge a file presents depends on how the file was
loaded, and the weld tolerance moves with it. Absolute tolerances do not move.

## Why it matters — what was actually wrong

On `corbu-chibi-corrboo45.stl` our repair reported `fully_repaired: true` with 0 boundary edges, 0
loops and 0 non-manifold, and looked wrong: open walls and flat faces inside the cavity. Both were
true, and the cause was found and fixed: `stitch_vertices` welded **and then culled faces**, and on
that model the weld found nothing — all 653 of the stage's changes were the cull. Removing those
faces opens the surface, and the hole pass then fills the openings flat, because a loop's
minimum-area triangulation *is* a facet. The cull is gone from the stitch; duplicate removal happens
where the target does it, at the double-faces stage.

## The instrument problem — read this before believing any result

Our report gave **identical numbers for runs that looked different**: the default, `2.5e-4` and
`5e-4` weld tolerances all reported 0/0/0 and `fully_repaired: true`.

So a green report is **not** evidence a repair looks right. Every claim about output quality needs an
eye or at least a render. Do not call a repair fixed on the strength of counters.

Two things make the counters read better than they are, and both are now fixed:

- A stage's `changed` column counted a pass that had been refused, because the cull is judged in two
  halves and only one of them was being reported.
- The loader silently refines the mesh, so `analyze` on a coarse part reports a count that belongs to
  neither the file nor the renderer. The CLI takes `--raw` for the file as written, and says on
  stderr when it refined.

## Where the time goes

Measured before the guard rework, 84 s in 13 stages on a 1.02M-triangle model:

| ms | stage | changed |
| --- | --- | --- |
| 14,103 | `orient_holes_stitch` | **0** |
| 13,641 | `orient_holes_all_stitch` | 39 |
| 12,806 | `settle` | 1347 |
| 10,668 | `split_non_manifold_edges` | 7742 |
| 7,850 | `orient_components` | 7 |
| 6,455 | `stitch` | **0** |
| 5,036 | `double_faces` | **0** |
| 4,857 | `double_faces_after_split` | **0** |
| 2,755 | `union_overlapping_parts` | **0** |

**~40% of the time was stages that changed nothing.** Two causes, both addressed:

- Every pass was wrapped in a full five-class evaluation of the mesh *before* it ran, whether or not
  it then did anything. `judge` now weighs a pass only when the pass reports a change.
- The second double-face pass ran even when the crossings were not split. It now runs only when a
  pass since the first cull could have made a duplicate.

Corpus effect: 5% to 32% faster per file with every five-class outcome identical.

Deleting a round because it happened to be a no-op on one input is still not on the table:
`orient_holes_stitch` changed nothing on corbu, but `holes_trivial` had altered the mesh since those
passes last ran, so it was not provably a repeat. The tests that remain are the provable ones.

## Open questions

- **The hole patch.** The reference does not fan a loop flat: it solves a patch in a mesh of its own,
  with the rim edges marked and a solver behind it. What that solver does differently is *not yet
  identified* — the interval-DP criterion is the same recurrence as ours (minimise area, penalise
  slivers), the triangulation adds no geometry, and the join does not move the rim. Three candidates
  remain, and they are recorded in the evidence file.
- **The degenerate criterion.** Their "degenerate face" is topological, not an area threshold: a face
  with a coincident far vertex, removed by collapsing its shortest edge (or deleting the face when
  that edge is on the boundary). We have no counterpart to that step.
- **A guard that trades.** `worse_than` compares the five classes for *rises*. The cull once passed it
  while opening the surface, because removing duplicate faces removes non-manifold edges at the same
  time as it creates boundary ones. A per-class comparison cannot see a swap. Worth deciding whether
  any guard should refuse a trade rather than only a rise.
- **The dead orientation option.** `ResolvedOptions::repair_orientation` is set from the caller and
  never read, so `RepairOptions::repair_orientation == false` still runs every orientation pass. A
  documented option that silently does nothing is worse than no option.
- **`Gusano_de_Dune_70%.stl`** is the worst file in the corpus and the one that does not repair: it
  enters with 1,896 winding edges, 3,515 non-manifold edges, 315 loops, 3,164 pinched vertices across
  302 parts, and leaves with 1,818 / 3,514 / 91 / 3,162 across 294. The union and the split both run
  and both are refused on it. A last-resort surface rebuild is the remaining idea.

## Next steps

1. The absolute stitch ladder: replace the derived weld tolerance with the reference's absolute
   one, so loading a file one way or another cannot move it.
2. The ordered script: one instance of each pass, in the target order, instead of rounds.
3. The degenerate criterion, topological rather than by area.
4. `Gusano_de_Dune_70%.stl`, and a last-resort rebuild for a mesh no local pass can settle.

## Where the evidence lives

`.omp/notes/repair-parity-plan.raw.md` — the full record: which binary, which units, which addresses,
what each function does, and which readings were retracted. `.omp/` is excluded from version control
in this checkout, deliberately. Nothing in it is a substitute for measurement: every claim about a
repair's quality is unverified until a render, and the raw file says which of its own conclusions were
wrong when they were first written.

## Standing rules for this work

- Verify with the real binary on real files. `cargo test` alone has caught none of this work's actual
  bugs.
- A change that improves the counters but cannot be seen in a render is not known to be an
  improvement. Say so.
- No product names, symbols or addresses in anything committed.
