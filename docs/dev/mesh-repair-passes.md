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
prune_and_classify
```

Two of those are conditional. `split_self_intersections` runs between
`double_faces_after_split` and `remove_inner_faces` when the caller sets
`resolve_self_intersections`, and `filter_components` runs after `noise_shells` when they
set `keep_largest_n_components`.

`tests/smoke.rs` pins this list in `the_pipeline_runs_the_stage_order_it_says_it_does`.
If a change to the order is deliberate, that test is where you say so.

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
| `weld_epsilon` | vertex weld tolerance, relative to the bbox diagonal |
| `fill_holes_max_edges` | the longest border loop `holes_all` will close |
| `keep_largest_n_components` | keep the top N components by absolute volume, or all |
| `repair_orientation` | whether the orientation passes run |
| `resolve_self_intersections` | whether the crossings are split and the buried faces removed |
| `assume_support_geometry` | force the model/support classification for support STLs |

## Two things that are not what they look like

### The inner-face removal is component-level, and that is not a shortcut

The reference engine resolves non-manifoldness and self-intersections by wrapping the
outer surface with a boolean union. There is no union here, so `cull_interior_components`
removes a face only when it sits inside *another component*, where removing it provably
cannot open the outer shell.

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
