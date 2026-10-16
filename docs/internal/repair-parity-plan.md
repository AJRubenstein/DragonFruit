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

### Measured out: the absolute stitch ladder

Copying the rung structure was tried and rejected on measurement, and the numbers are here so it is not
tried again. A quantising weld can miss a pair at one step that it catches at the next, so four
absolute rungs (0.002 to 0.010 mm) were run in place of the derived tolerance, and a single absolute
0.010 mm default was tried as well:

| default | engine time over the corpus | defect classes and verdicts changed |
| --- | --- | --- |
| derived shortest-edge fraction (kept) | baseline | — |
| absolute 0.010 mm | +10% to +25% | none |
| ladder, 0.002 to 0.010 mm | +30% to +67% | none |

Neither welded anything on any file but one, where the ladder welded 4 vertices. The reason is
upstream of the stitch: **every mesh reaches the repair already welded**, because the loader welds the
soup it reads, so what is left for the stitch is normally nothing, and a coarser rung that does find
something is refused by its own guard. A caller can still name an absolute tolerance
(`weld_tolerance_mm`), which is the part worth keeping: a stitch is a distance, and until now no caller
could ask for one. The derived default stays because it is what the corpus measures as free.

## The acceptance criterion, read off the reference's own output

The reference's repair of the reported file is in the user's Downloads beside the input, and analysing it
with this engine says exactly what a repaired mesh has to look like. It is the best acceptance test we
have, and it settles an argument about mechanism.

| | input | the reference's output |
| --- | --- | --- |
| inconsistent / non-manifold / loops / pinches | 113 / 1364 / 14 / 1390 | **0 / 0 / 0 / 0** |
| parts | 8 | **2** |
| volume | 97.727 | 97.928 |
| triangles | 961,504 | 1,076,192 |
| watertight / oriented | no / no | yes / yes |
| self-intersecting faces | 14,432 | 9,892 (still, and not a class) |

**All five classes zero. Parts down, volume preserved.** That last row is the mechanism: it does not
*separate* surfaces that share an edge, it **unions** them. Separating gives each surface its own rim, so
the part count and the volume both rise — which is why this engine's `split_non_manifold_edges` can never
match this output, whatever its acceptance test says, and why every attempt to accept it made the object
worse. The reference's own script has no non-manifold stage at all: it resolves those with a boolean
union of the outer surface, which is the one thing this engine does not have in its repair path.

### What does match: the rebuild, then the pipeline

`solid-remesh --tolerance 0` followed by `repair` reproduces that output on every class:

| | this engine, rebuild then repair |
| --- | --- |
| inconsistent / non-manifold / loops / pinches | **0 / 0 / 0 / 0** |
| parts | 5 |
| volume | 98.736 |
| triangles | 1,018,668 |
| capping faces added | **29** |

Twenty-nine caps against the local pipeline's 3,438 plus 1,457 — because nothing is being closed flat. The
surface is resolved into a solid instead, which is what the reference does, and it is where the flat
sheets inside the cavity and the fanned gap came from.

The tolerance matters more than anything else in that chain: the mode's default of `0.001` simplifies the
surface before resolving it and takes this file from 961,504 triangles to 158,190, throwing the detail
away. At `0.0` it keeps it.

### How the reference's repair is driven, from the kernel underneath it

Read from the geometry kernel's own source-path strings, tool registry and log lines. Behaviour only;
the names and addresses are in the evidence file.

**Their repair is a defect-driven loop, not a script.** A defect tracker lists the mesh's defects, picks
a class, repairs it, *recomputes the defects*, and repeats until none remain or an iteration cap is
reached, printing each round. Two details matter:

- **Self-intersections are one of the defect classes the loop acts on** (a class index of their own,
  separate from the five the verdict reports), and when that pass makes progress the loop **resets and
  starts again**. So a residue gets another turn by construction.
- It reports what it could not fix, and iterates the orientation and normals passes again after every
  other class, which is why their winding comes out at zero where ours comes out at 177.

**Their tool set contains operations this engine has no counterpart for**, and three of them are exactly a
rim that should not be capped flat:

- a tool that **joins two boundary loops to each other**. A break-through is closed by joining its two
  rims, not by spanning one of them — which is what our fill does and what a render sees.
- a tool that **welds cracks**, with machinery that pairs up points on the two sides and fails loudly when
  it cannot agree. That is the small gap.
- a tool that **splits a non-manifold surface** — as an operation the loop can invoke, not a stage of the
  ordered script. Our split is the same operation; theirs just is not sequenced into the ten passes.

**Their boolean refines both sides before joining.** It computes the intersecting pairs, *refines the
mesh so the two surfaces' boundary loops match in edge length*, then pairs up the loops and merges them,
and reports the loops' edge min/max/average/variance as its measure of whether the join is clean. That is
the step that makes a union produce a smooth stitch instead of slivers, and it is why the part count goes
down with the volume preserved.

### Done: the same loop, bounded

`repair_rounds` is now that loop. It evaluates the mesh, picks a class that is actually non-zero, runs the
one pass that class needs, re-evaluates, and repeats until no class can improve the defect *total* — and
a pass is kept only when the total strictly drops, so it cannot wander. Measured:

| | before the loop | after |
| --- | --- | --- |
| the reported 1.02M-triangle model: non-manifold / pinches | 1,363 / 1,389 | **17 / 32** |
| the worst corpus file: non-manifold / pinches / loops | 2,001 / 1,816 / 0 | **107 / 209 / 0** |

It costs about a third of a run on those files and nothing on files that are already clean, because a
mesh with no defects breaks out before the first attempt. Eleven of the twelve corpus files are unchanged.

### What is still different, measured

| | winding / non-manifold / loops / pinches | parts | volume | self-intersecting | degenerate |
| --- | --- | --- | --- | --- | --- |
| input | 113 / 1364 / 14 / 1390 | 8 | 97.727 | 14,432 | 653 |
| the reference's output | **0 / 0 / 0 / 0** | **2** | 97.928 | **9,892** | **3** |
| this engine, local pipeline | 163 / 1363 / 0 / 1389 | 5 | 117.442 | 16,951 | 366 |
| this engine, rebuild then repair | 177 / **0 / 0 / 0** | 5 | 98.736 | **18,639** | 502 |

Four classes and the volume match on the rebuild path. Three things do not, and the first two are what a
render shows as stray triangles:

- **Self-intersecting faces.** Their repair *halves* them, 14,432 to 9,892. Ours nearly doubles them,
  because the boolean re-triangulates the sheets it resolves and leaves them overlapping. This is not one
  of the five classes, but it is what a mesh of loose slivers looks like.
- **Winding.** Ours comes out at 177 and 163, both *worse* than the input's 113, against their 0. The
  per-component orientation pass runs and does not settle it, and `unify_winding` refuses to keep a flip
  that does not reduce the count, so a set of disagreements that form a cycle stays.
- **Degenerate faces**, 502 against their 3, and **parts**, 5 against 2.

The self-intersection split was tried on the rebuilt mesh and refused by its own guard: 24,876
intersecting pairs, 13,638 faces refined, 37,106 new vertices, and the refined surface is worse by the
five classes.

### A fan is not the difference any more

An earlier render showed the cavity closed by a fan of triangles converging on a point. That was a stale
output, produced before the boundary walk was fixed. Measured on the current build, the local pipeline
fans **once** on this file, over an area of 0.0004 mm², and the ring patch handles the rest.

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

Then the largest one. `repair_orientation` is reached **four** times, because orientation, stitch,
holes and double faces each disturb what the one before settled — but an orientation pass handed a mesh
nothing has touched since the last one does nothing, and every pass here is deterministic (verified:
three files repair to bit-identical output across repeated runs). `OrientationGate` runs the pass only
when a stage has changed something, and it is fed from the same `stage!` that records what each stage
changed, so a new stage cannot forget to declare itself and a refused pass declares zero because it
reverted.

| file | before | after | ratio |
| --- | --- | --- | --- |
| `213277_…_HF_Warlock_unified_mm.3mf` | 11,219 ms | 3,877 ms | 2.9x |
| `Dino_V3.stl` | 8,717 ms | 3,103 ms | 2.8x |
| `GT2_Pulley_40T_6.35_R_CS.stl` | 6,820 ms | 3,096 ms | 2.2x |
| `poussin.stl` | 4,533 ms | 2,241 ms | 2.0x |
| `Nut cap M5.stl` | 19,026 ms | 11,637 ms | 1.6x |
| `STL_DV_DarthVader_Supported.stl` | 24,510 ms | 15,077 ms | 1.6x |

Every file's five classes and its verdict are unchanged. Against the session's starting point the
Warlock file is 15.0s to 3.9s.

Deleting a round because it happened to be a no-op on one input is still not on the table:
`orient_holes_stitch` changed nothing on corbu, but `holes_trivial` had altered the mesh since those
passes last ran, so it was not provably a repeat. The tests that remain are the provable ones.

## Open questions

- **The hole patch.** The reference does not fan a loop flat: it solves a patch in a mesh of its own,
  with the rim edges marked and a solver behind it. What that solver does differently is *not yet
  identified* — the interval-DP criterion is the same recurrence as ours (minimise area, penalise
  slivers), the triangulation adds no geometry, and the join does not move the rim. Three candidates
  remain, and they are recorded in the evidence file.
- **The degenerate criterion, settled, and its order measured out.** The reference's *Remove
  Degenerated Faces* is two halves and neither is an area test: a weld of vertices by **exact** float
  position, then deletion of every live face whose vertex references repeat — `v[0] == v[1]` — with its
  neighbour and the twin edge. The tolerance quoted in its UI belongs to a different step; there is no
  distance anywhere in this pass. Our counterword is `cull_repeated_vertex_faces`, which is the same
  deletion, and the exact weld it follows has already happened here, in the loader.

  The reference removes degenerates at step 9 of its script, after Close All Holes, where ours runs
  before the fills. That was tried: the repeated-vertex class was moved into a stage of its own after
  the fills and the corpus re-run. **It changes no outcome and costs up to twice the engine time** —
  a 292,470-triangle model 4.9s to 10.0s, an 815,474-triangle one 15.1s to 28.8s — because a face that
  names the same vertex twice contributes both `(a, b)` and `(b, a)`, so removing it first is what lets
  the winding settle; leaving them in place keeps `repair_orientation` flipping the same faces on every
  call (2,160 faces, three times, on the woven model). On the reported file the two orders produce a
  **byte-identical mesh**, same sha256 and same size. Reverted.
- **A guard that trades.** `worse_than` compares the five classes for *rises*. The cull once passed it
  while opening the surface, because removing duplicate faces removes non-manifold edges at the same
  time as it creates boundary ones. A per-class comparison cannot see a swap. Worth deciding whether
  any guard should refuse a trade rather than only a rise.
- **The dead orientation option.** `ResolvedOptions::repair_orientation` is set from the caller and
  never read, so `RepairOptions::repair_orientation == false` still runs every orientation pass. A
  documented option that silently does nothing is worse than no option.
- **`Gusano_de_Dune_70%.stl`** is the worst file in the corpus. It enters with 1,896 winding edges,
  3,515 non-manifold edges, 315 loops and 3,164 pinched vertices across 302 parts, and the local
  pipeline leaves almost all of it: 1,818 / 3,514 / 91 / 3,162. Keeping only the largest component
  still leaves 3,510 non-manifold edges, so the defect is *inside* one large shell rather than between
  the parts, which rules out a part-level answer.

  The local pipeline is not the right instrument for it, and the rebuild mode now is. The surface to
  solid path separates the shared edges and rebuilds it into a solid: watertight, 0 non-manifold
  edges, 0 pinches, 0 loops, 307,258 triangles from 596,293. It costs a 20% volume rise, 532 shells
  and 114 winding edges the pass will not keep, because the surface moved. That is a last-resort
  rebuild, not a repair, and it is a mode the caller names.

  Still open for the *local* pipeline: a mesh with thousands of non-manifold edges inside one shell is
  exactly what the reference's own script has no stage for either, so matching it means reporting the
  defect rather than removing it.

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
