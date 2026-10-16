# Mesh repair passes

The repair engine is a fixed-order set of passes over an `IndexedMesh`. Each one mutates
the mesh in place and appends a `RepairStepReport`, and the report is the only thing
callers see. `repair()` is the entry point; `RepairOptions` is the input.

The crate is `dragonfruit-mesh-repair`, consumed by the shell at
`src-tauri/src/mesh_repair.rs` and by the CLI at `rust/dragonfruit-mesh-repair/src/bin/cli.rs`.
Reach for this page when you are changing the order, adding a pass, or changing what
counts as repaired.

## The order

```
orient_components
stitch
holes_trivial
double_faces
orient_holes_stitch
orient_holes_all_stitch
double_faces_after_split
remove_inner_faces
noise_shells
settle
repair_rounds
prune_and_classify
```

Four are conditional and so are not in that list. `split_self_intersections` runs between
`double_faces_after_split` and `remove_inner_faces` when the caller sets
`resolve_self_intersections`. `union_overlapping_parts` runs after `remove_inner_faces`
when the mesh still has bad edges, and `split_non_manifold_edges` follows it; both need
the `manifold` feature. `filter_components` runs after `noise_shells` when the caller
sets `keep_largest_n_components`.

The union running before the split is load-bearing. `tests/smoke.rs` pins it by asserting
the union's position is before the split's, because the split is what makes each surface
constructible and a union after it has nothing left to merge. Ordered the other way, the
same file keeps about 200 more parts.

`tests/smoke.rs` pins this list in `the_pipeline_runs_the_stage_order_it_says_it_does`.
If a change to the order is deliberate, that test is where you say so.

## `repair_rounds`, and why the list above is not the whole story

`repair_rounds` runs last and is a loop, not a pass. It evaluates the mesh, picks a defect class that is
actually non-zero, runs the one pass that class needs, re-evaluates, and repeats — up to
`MAX_REPAIR_ATTEMPTS` passes, stopping as soon as no class can improve the defect total. A pass is kept
only when the *whole* total strictly drops, so a round can trade one class for another only when the sum
improves, and the loop cannot wander.

This exists because one ordered pass per stage leaves a residue: a pass that half-solves something gets
no second turn. The classes disturb each other, so a round can expose one the round before it created.
The order it tries them in is `DEFECT_CLASSES` — non-manifold edges, winding, boundary, pinched
vertices, noise shells — and the reason for that order is in its doc comment.

Measured: on the worst file in the corpus it takes non-manifold edges from 3,515 to 107 and pinched
vertices from 3,164 to 209, where the ordered passes alone left 2,001 and 1,816; and on the reported
1.02M-triangle model it takes them from 1,364 and 1,390 to 17 and 32.

It costs about a third of a run on the files that need it, and nothing on the files that do not, because
a mesh with no defects left breaks out of the loop before its first attempt.

### The repetition is the design

`orient`, `stitch`, `holes` and `double_faces` each appear more than once, and that is
not duplication to be tidied. Each one disturbs what the one before it settled: welding
vertices makes degenerate faces, filling a hole adds faces whose winding has to be
decided, flipping a face changes which of its edges is a boundary. Running the set once
leaves work that the next pass creates. `settle` is the same four passes again, in the
order the stages after `remove_inner_faces` leave the mesh needing them.

The rule that follows from this: **a pass is not scored on a by-product that another
pass owns.** If a pass's side effect is somebody else's job, order it that way and do not
judge it on that side effect. A guard that rejected a pass for disturbing winding, when
orientation runs immediately afterwards, rejects its own successor's work.

## The verdict

`fully_repaired` is five classes and no more, computed by `evaluate::evaluate`:

| class | what it counts |
| --- | --- |
| orientation | edges whose two faces disagree about direction |
| bad edges | edges not shared by exactly two faces |
| holes | boundary loops |
| non-manifold | edges carrying more than two faces, and the vertices they pass through |
| shells | shells small enough to be noise |

**Self-intersections are not one of them.** The repair acts on them when asked, and
`MeshHealthReport::self_intersection_triangles` reports the count, but a mesh that
crosses itself and is otherwise sound is a mesh that prints. Treating crossings as a
defect is how a good file gets reported as broken, and how a caller ends up being told
its model needs minutes of work it does not need.

Each class that survives is also written into `residual_issues`, one line per class, so
the report says what is left and not just that something is.

## The options

| option | what it does |
| --- | --- |
| `weld_tolerance_mm` | vertex weld tolerance, absolute and in model units. Unset runs the default ladder |
| `fill_holes_max_edges` | the longest border loop `holes_all` will close |
| `keep_largest_n_components` | keep the top N components by absolute volume, or all |
| `repair_orientation` | whether the orientation passes run |
| `resolve_self_intersections` | whether the crossings are split and the buried faces removed |
| `assume_support_geometry` | force the model/support classification for support STLs |

### A non-manifold edge is one whose faces cannot be paired

More than two faces on an edge does not make it non-manifold, and counting it that way is
how a model the reference engine calls clean, and which is clean, came out of a repair
reported as broken.

Four faces with two traversing the edge each way are two coincident manifold edges: two
surfaces meeting along a shared edge, each of them closed. So `Topology::non_manifold_edges`
pairs every forward traversal with a backward one and looks at what is left. Two forward
and one backward is a fan with a face it cannot pair, which is non-manifold. A single face
is a boundary, which is a hole and not this class at all. Two faces traversing the same way
are a winding disagreement, which `inconsistent_edges` reports and the orientation pass can
fix, so they are not counted here either.

Measured on `213277_438404_1039898_HF_Warlock_unified_mm.3mf`: eleven edges carry four
faces, and all eleven are two forward and two backward. Under the old count the file read
as having 11 non-manifold edges and 4 pinched vertices, and the reference engine's panel
reports 0 bad edges, 0 holes and 0 bad orientation for the same file and the same vertex
count. The file is clean.

`bad_edges` is the union of this class with the hole edges, which is how the reference
counts it, so the two agree by construction once the pairing is right.

## Three passes where the five classes are not enough

### The cull is two face classes, and they behave nothing alike

`cull_faces` removes two kinds of face and now judges them separately, because judging them
together is how `3DBenchy.stl` came out of a repair with all 355 of its winding edges and
every one of its 2,017 degenerate faces still in place.

A face that names the same vertex twice, `(a, b, a)`, has no area and no volume, and its
edges are phantom: it contributes both `(a, b)` and `(b, a)`, so an edge carrying one real
face looks like it carries two. That manufactured pairing is exactly what the winding count
reports, which is why benchy read 355 inconsistent edges and watertight at once. Removing
its 2,006 of these clears all 355 with no other class moving.

A face whose three positions are collinear but whose indices are all different is a
different animal: benchy's 11 of them are load-bearing, and removing them opens 29 edges
and 9 holes.

The guard used to wrap the pair, so the second class's refusal threw away the first class's
removal. Now `cull_repeated_vertex_faces` is guarded on its own and runs first, and
`cull_duplicate_and_zero_area_faces` follows it.

### Winding runs cheapest first and stops when flipping cannot help

Three passes in increasing cost, each running only when the one before it has given up:

1. `greedy_flip_winding_edges` — single-face flips, best net first, over one topology
   build. A full rebuild per flip hung benchy: 355 flips at a full build each.
2. `solve_winding_regions` — the disagreements no single flip can reach. A frustrated cycle
   has no improving first move, but flipping a *set* of faces changes only the edges on the
   set's boundary, so a bounded region around the residual is enumerated exactly and the
   best assignment kept.
3. `walk_winding_edges` — the disagreements neither of those can enter. It takes the
   steepest toggle available even when that toggle makes the count *worse*, never revisits
   a face, remembers the best count it saw, and undoes everything past that point.

All three answer to the same guard: the volume must not move more than one percent. The
`unify_winding` that runs before them is per patch, and a patch decision cannot settle a
disagreement *within* a patch. That is the gap these three close.

**What they cannot close** is a genuinely frustrated seam. The V3 Cones keep exactly 4
edges, and those form a closed loop 58357 → 162679 → 160762 → 160761 → 58357 around a
sliver cluster whose faces measure 1e-5 to 2.6e-4 square units. Every face on it scores
-1, the tree assignment leaves the same 4, and 400 toggles of the walk never beat it. They
are independent frustrated cycles: no assignment of face orientations resolves them, so
they need the surface rebuild the reference engine gets from its self-intersection split,
not a winding pass. That is reported, and not forced.

Scale does not change it. On `INDIGO AWARD '26_Hollow_Fixed.stl`, a hollowed model of 1.08M
triangles, the same wall arrives with 10,417 edges: `unify_winding_once` flips 10,417 faces
and the count does not move at all, no face on any disagreement scores positive so the
greedy has nothing to take, and 400 toggles of the walk never beat it. `Untitled2.stl` is
the same at 1,389, and the V3 Cones at 4. Four files now sit behind one missing capability —
a surface rebuild — rather than four separate bugs.

### The residual is always an even subgraph, and the cut solver is what moves it

The disagreement set that survives every cheaper pass has a shape, and it is always the same one:
it is an **even subgraph** of the mesh — every vertex has even degree in it. Measured, the count of
odd-degree vertices is 0 on the V3 Cones (4 edges), `Untitled2.stl` (1,389) and the hollowed INDIGO
model (10,417). That is what a residual is, not a coincidence.

So the bad edges are the boundary of *some* set of faces, and on an orientable surface that set is
always reachable, by Poincaré duality: an even subgraph of the mesh is a cut of the face graph.
`solve_winding_cut` finds it. Removing the bad edges splits the face graph into regions, and any
union of regions has a boundary made only of bad edges, so turning regions over fixes exactly the
bad edges it cuts. Which regions to turn is a max-cut on the region graph, solved exactly when
that graph is small and by a local search when it is not.

This is the one move the greedy, the region enumeration, the walk and the annealed search all
miss. The set to turn over is a union of whole regions, not a patch — on Untitled2 it is 429,571
faces — so toggling faces one at a time cannot find it and a region cap cannot contain it.

Measured on `Untitled2.stl`: 1,389 disagreements, 409 of them lying between regions and 980 inside
one. The cut solver fixes all 409 and leaves the 980, which no assignment of face orientations can
fix: a bad edge with both faces in the same region is in the interior of every region.

In the pipeline it is refused, and the reason is the volume guard. Turning those regions over moves
the signed volume 233%. That is the *input's* volume being wrong rather than the fix being one — a
mesh with mis-oriented regions has no meaningful signed volume to compare against, which is the
same shape of problem as the duplicate faces `stitch` removes moving sr-71 by 1.33% while
correcting it.

### The V3 Cones cannot be fixed by flipping at all

Its disagreements sit **inside a single region** — zero lie between regions — so no union of
regions has them as its boundary. Three independent searches agree the count cannot be reduced:
exact enumeration over 20 faces, an annealed search over 20,000, and the cut solver. An even
subgraph that is not a cut of the dual is the signature of a non-orientable surface, and on a
closed mesh the usual cause is self-intersection: two sheets passing through each other glue into
a twisted neighbourhood.

Flipping cannot help, so the *surface* has to change. `retessellate_unsatisfiable` deletes the
faces carrying those edges and lets the fill close what that opens: the edge is gone, so the
winding drops, and what replaces it is the fill's own surface rather than a copy of anything. On
the cones that is 7 edges, 11 faces deleted and 13 filled — winding 4 to 0, parts 15 to 15, volume
unchanged in the sixth decimal.

It is judged on the outcome, not on a threshold count, because the same move is wrong elsewhere: on
the harbinger file those edges number 181, deleting them adds nine parts, and the winding only
reaches 48. A localised defect can be re-tessellated; one spread across the surface cannot, because
every local fix for it adds geometry. The rule that decides it is **no pass may add a part**, and a
pass that means to repair winding has to be judged on whether it did.

### An earlier attempt at this is worth knowing about

Duplicating the vertices around those edges also makes the surface orientable, and it was in the
tree for a while. It is wrong, and the reason is subtle enough to be worth recording: the copies
sit exactly on the originals, so the volume does not move and no class gets worse — the mesh reads
as fully repaired while carrying coincident facets. What it actually costs shows in the
self-intersection count, 17,879 to 20,906 on corbu, and in the viewport as doubled surfaces. Adding
a part is the defect; nothing in the five classes sees it.

### The orientation pass is per component, so it has to stay O(faces)

`repair_orientation` walks the components and decides each one's winding, which means anything
inside that walk is multiplied by the component count. A presupported scene makes that fatal
rather than slow: `supported_apaato_DF_Scene.3mf` is 3.8M triangles in **2,938,564
components**, nearly one per triangle. Three loops inside the walk were O(faces × components)
or worse — a full scan of the component array per component, `mesh.bbox()` per component, and
`mesh.signed_volume()` per flipped component — and the nesting ray-cast test ran for every
component although it can only change the answer for one that would otherwise be flipped. That
file had not reached the *second* stage after an hour.

What it costs now: faces bucketed by component once, the bbox and the mesh volume hoisted, the
nesting test asked only where it can matter, and a fragment under four faces skipped, since it
cannot enclose anything and its signed volume describes where it sits rather than which way it
faces. The same file finishes in 544 s, with bad edges 9,364,576 to 0 and boundary loops
2,938,564 to 0.

The rule this leaves: inside the component walk, no pass over the whole mesh, and no scan of
the component array per component.

### A union is judged on what it costs as well as what it merges

`union_overlapping_parts` accepts on a falling part count, classes that did not get worse,
and no volume growth. That was not enough. On the harbinger file it merged 5,414 solids and
took the parts 3,083 down to 646, and paid for that with 47% more triangles and 10,664 new
degenerate faces on a mesh that started with 683 of them.

So it also carries a size budget: triangles within 10% of the count it started with, and
degenerate faces within 0.1% of the triangle count or 64, whichever is larger. COOKIE_b4's
union — the one that makes that file read as repaired — adds 4.3% and 126, and stays.

`split_non_manifold_edges` has the same shape of problem and a worse one. It judges itself
on the volume not moving, and it was comparing the volume of a mesh that *arrived* with
boundary edges to one whose rims it had just filled. Those are different measurements —
signing a boundary loop the other way is the same mesh and a different number. On the corbu
model, sealing alone moves the volume 97.7 to 117.4 before the split does anything, so the
+26% it was refused for was mostly the measurement changing.

Against a sealed baseline its own cost is +5.28%: non-manifold edges 1364 to 0, loops 30 to
4, parts 8 to 13 against an allowance of 16. That is still above the one percent guard, so
it is still refused, and the stage note now says which of the four tests refused it.

`split_self_intersections` is the only pass that rebuilds the surface rather than editing it,
and it carried no acceptance test at all. On the V3 Cones it took non-manifold edges 0 to
5,557, the boundary 0 to 344 and the volume up 132%; on corbu, bad edges 822 to 16,704 and
the volume up 852%. Both were applied and kept. It is guarded on the same test as the rest
now, so asking for it on a mesh it cannot handle gives the mesh back unchanged, with the
refusal in the stage report.

### The boolean engine cannot be the wrap for damaged input

The established recipe for a hard case is a self-union boolean, and
ours would have to run on `manifold-csg`. It cannot. `Manifold::from_mesh_f32` requires input
that is already edge-manifold *and* consistently oriented, so it refuses exactly the meshes a
wrap is for: measured, it refuses the V3 Cones (0 non-manifold edges, watertight, 4
inconsistent winding edges), corbu (1,364 non-manifold) and `Untitled2.stl` (1,389 winding),
and accepts only meshes the earlier passes have already cleaned. A wrap therefore has to come
from our own `corefine_self_intersections`, which is guarded off because it produces a far
worse mesh, or from a different boolean engine.

The clamp on that pass's edge-crossing parameter is what made it produce a far worse mesh. Where
an edge crosses a plane was computed without clamping the parameter to the edge, and `same_sign`
lets a near-coplanar triangle through — three signed distances of order 1e-9 are not all above its
1e-7 epsilon — so the ratio could be enormous. Measured on 3DBenchy, 80 of 15,813 new vertices
landed outside the input bounding box and stretched its diagonal from 82.9 to 147,829, taking the
surface area up 1,444% and the signed volume negative. Clamped, the same file comes out at +0.29%
area and +0.06% volume with no point off the box. The crossing counts fall too — 11,223 to 8,647 on
benchy, 29,383 to 24,653 on the cones — because the extrapolated points had been inventing
intersections that were never there.

A face whose chords all start and end on its own boundary is now triangulated directly: the
boundary ring is split along each chord and each piece fanned, which is exact because splitting a
convex ring along a chord leaves both pieces convex. That is precisely the case the CDT gets wrong
— with extra points sitting collinear on the boundary it returns a triangulation missing a whole
region, 25% of one face on a two-triangle fixture and 0.29% of 3DBenchy's surface area. Rejecting
those triangulations instead, which is the obvious guard, rejects 8,123 of 14,751 of them — 55% —
so the split is the fix and distrust is not. What remains of the loss is the faces with a mix of
boundary and interior chords, which still go to the CDT: 0.17% of benchy's area, down from 0.29%.

Two things the clamp had to be careful about, and both were found by the tests rather than by
reading the code:

- **Finiteness has to be checked before clamping, not after.** A vertex exactly on the other plane
  makes the denominator zero; clamping first maps that infinity to a bound and lets a degenerate
  pair through as though it were a real crossing. That is how a pair of triangles that merely touch
  came to be reported as intersecting, which inflates the crossing count the panel shows.
- **A coverage check on the CDT's output is not the answer.** It rejects 55% of the faces it would
  otherwise refine, trading a quietly missing surface for a pass that barely works.

The pass stays off until the mixed-chord case is handled the same way.

## Two things that are not what they look like

### The inner-face removal is component-level, and that is not a shortcut

The reference engine resolves non-manifoldness and self-intersections by wrapping the
outer surface with a boolean union. There is no union here, so `cull_interior_components`
removes a face only when it sits inside *another component*, where removing it provably
cannot open the outer shell.

The component it removes has to be **closed**. A cavity is a closed component inside another, and
removing it fills a void; a buried sheet is open, carries no volume, and removing it moves nothing.
That used to be tested by watching the signed volume, which is a stand-in that stops working the
moment the mesh is not watertight: on the worm file 2,975 boundary edges leave the volume
meaningless, and the removal tripped a 0.589% move that was arithmetic on an open surface rather
than a cavity being filled. Closeness is the property the guard is really about, so closeness is
what it tests now, by requiring every edge of the component to be used by exactly two of its faces.
The volume check stays as a second bound, and in this reduced domain the volume it reads is real.

The upgrade you would reach for is a per-face test: sample both sides of a face along its
normal, count ray crossings, and a face separates inside from outside exactly when the
two sides disagree. It was written and measured, and it does not hold up. Three
directions per side with a conservative vote, the offset tied to the face's own longest
edge, the ray tilted off the normal: at an offset of three thousandths of the longest
edge it took seven faces from `poussin.stl` that were on the surface, opened it, and the
hole pass then made two non-manifold edges out of the patch. At five ten-thousandths it
left `poussin` alone and still took forty-seven faces from `3DBenchy.stl` and produced
seven non-manifold edges the same way. The classification is right about 99.99% of faces,
and a hundredth of a percent of a surface is a hole.

The guard that would make it sound, "drop a face only when its edges keep two faces",
blocks exactly the case the stage exists for: a buried sheet's edges are its own, and one
face on an edge is what a sheet edge and a boundary edge both look like. The test cannot
tell them apart locally, which is why the parity test is the only candidate and why its
error rate decides the question.

Until there is a boolean union, this stage stays component-level and says so.

### The hole patching is on the boundary, not in the middle

`holes_trivial` closes a border loop of six edges or fewer and `holes_all` closes
anything up to the caller's cap, both in `crate::holes`. A loop that is not a simple
cycle, or that another loop already claimed, is skipped: a border that pinches is not a
hole, and capping it adds the faces that make the mesh non-manifold.

## Related pages

- [Mesh wire formats](mesh-wire-formats.md), the payloads this engine reads and writes
- [Tauri IPC bridge](tauri-ipc-bridge.md), how a repair reaches the frontend
- [The slicing engine](slicing-engine/index.md), what consumes the result
