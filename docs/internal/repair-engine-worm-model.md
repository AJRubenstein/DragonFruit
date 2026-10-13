# The worm model: what is wrong with it and what was tried

**Point in time.** Written on `feat/repair-refinement`, after iterating on
`Gusano_de_Dune_70%.stl` and taking what the guards allow.

The file is a 596,293 triangle, 302 part pre-supported export with 3,515 non-manifold edges and
1,454 boundary edges. It arrives tangled, and everything below is measured.

## What the file actually is

The non-manifold edges are two different problems wearing one number:

| kind | count | what it is |
|---|---|---|
| exact duplicates | 3,655 vertex-sets holding 18,374 faces | the same triangle repeated, up to ~23 copies at one junction |
| genuine overlap | ~2,000 junctions | faces sharing an edge without being the same triangle, up to **92 faces at one edge** |

Spread across 76 x 79 x 98 of a 157.75 diagonal model, so not a local defect. All of it on the
**model** section: the support section is clean, which is the same shape of result the Harbinger
file gave and the opposite of what pre-supported exports are assumed to be.

`Manifold::from_mesh_f32` **refuses the biggest component** (`manifold3d status: NotManifold`), so
no boolean can take the surface as it stands.

## What was fixed, and it holds

`cull_duplicate_and_zero_area_faces` removed a face that stood twice, took the last face off an edge
doing it, and then `worse_than` refused the removal for opening the mesh. The rims it opens are
where a doubled wall stood rather than openings somebody designed, so the pass now fills them, and
splits the pinches first because the fill skips a pinched loop by design. That is the recipe
`split_non_manifold_edges` already used on its own rims.

The ripple is worth knowing: `stitch_vertices` calls `cull_faces` internally, so the same fill
applies there too, and **`stitch` went from collapsing 124 duplicate faces to 15,350**.

On the worm model: non-manifold 3,515 to 1,999, boundary 1,454 to 976, loops 315 to 237, winding
1,896 to 1,505, **no parts added**. The reference files are unchanged and all six still fully
repaired.

## What is still refused, and why the guards are right

**The split.** It reaches non-manifold **1,999 to 0**, loops 237 to 140, and is refused on parts:
302 to **600** against an allowance of about 317. A model nearly doubling its piece count has come
apart rather than been repaired.

**The union.** It produces parts 302 to **1,986** and triangles +33%, and refuses itself.

**The pair cannot rescue each other.** Recorded from an earlier attempt: the split *offsets* the
separated surfaces so a re-weld cannot merge them back, which is why a union can never merge them
either. Judging the pair together was tried and reverted, and it cost a CSG per split round without
ever turning a refusal into an acceptance.

## What would actually repair it

A boolean that can take tangled input, or a re-export. Everything in the crate refuses for a
measured reason, and the sequence deduplicate, fill, split, union does not close because step three
makes step four impossible by construction.

One thing not yet tried: the **union runs before the split** in the pipeline order, deliberately, and
that order was chosen on other files. Running it on the split's output is the dead end above.

## Measured since: the union itself is the problem

The fragmentation is not ours. Taking this file's components and feeding each to
`Manifold::from_mesh_f32` directly:

- **391 components, 348 accepted, 43 refused outright.**
- Unioning the 348 accepted: **306,624 triangles out of 187k, and 1,892 components.**

A union of disjoint solids should return roughly what went in, and 1,892 is five times the 348. So
Manifold takes these solids, accepts them, and shatters them. The pipeline's own union note (parts
302 to 1,986, triangles +33%) is that number relayed, not a fault in our acceptance test.

That means the boolean path is unusable on this file's solids, and every refusal downstream is
correct. Repairing it needs a boolean that survives tangled input, or a re-export.

## Related

- `../../docs/dev/mesh-repair-passes.md` — the published pass set and the guards
- `repair-engine-winding-and-boundary.md` — the Harbinger residual, same shape of answer
