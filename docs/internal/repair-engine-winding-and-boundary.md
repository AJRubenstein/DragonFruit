# Winding residual and the boundary walk

**Point in time.** Written at the end of the repair 2.0 branch, after five attempts to make the
fill close a residual it cannot close. The numbers below are measured; the code names are as they
were when this was written.

The question this answers: why does the Harbinger file stay not fully repaired, and why did every
attempt to fix it fail?

## What the residual actually is

Harbinger's report ends at 6,945 boundary edges, 861 non-manifold edges, 64 inconsistent winding
edges and 805 boundary loops, against 3,047,814 triangles.

Split into its model and support sections by `model_triangle_count`:

| section | triangles | loops | boundary | nm edges | winding | watertight |
|---|---|---|---|---|---|---|
| model | 2,077,820 | 805 | 6,945 | 861 | 64 | no |
| support | 969,994 | 0 | 0 | 0 | 0 | yes |

**The supports are clean.** Every residual is on the model section. That matters because the
intuition going in was the opposite: pre-supported exports are assumed to be the messy part, and
here they are the tidy one.

The model section's boundary is **not shaped like holes**. Measured over its 7,258 boundary
vertices:

- 2,266 fans carry a **single** boundary edge. A sector of surface is bounded by two, so those are
  ends.
- 1,429 of 7,258 vertices have arrivals that do not balance departures.

A boundary made of ends and unbalanced vertices is a set of **open chains**, not closed loops.

## Why the fill cannot close it

`fill_holes_oriented` closes loops. There are no loops in that boundary, so it closes nothing, and
it is right to.

The confusion that cost the most time here is that **two different walks report different things
about the same mesh**, and neither is wrong:

- `Topology::boundary_loops` reports 805 loops for the model section. It is a **counting** walk: its
  job is to give the report a number, and any pairing satisfies that.
- `directed_hole_loops` finds 0 loops there. It is a **filling** walk, and it only closes loops whose
  caps will not create defects.

Reading the 805 against the 0 looks like the filling walk is failing. It is not. The two are
answering different questions.

## The five attempts, and how each failed

All five aimed at the filling walk. All five were wrong to.

| attempt | result |
|---|---|
| Fan pairing keyed at the head | 0 loops on corbu, closed nothing |
| Fan pairing keyed at the tail | corbu volume +20% |
| Fan pairing by fan root, paired two at a time | corbu volume +20% |
| Fan pairing by fan root, ring pairing (total) | corbu non-manifold 1,364 to 2,021 |
| Pointing the fill at `boundary_loops` unchanged | corbu winding 113 to 622, a test broken |

The last one is the instructive one. `boundary_loops` is a *reporting* decomposition, so pointing
the fill at it hands the filler loops no cap can close, and the mesh gets worse. Four failures from
four variations of the same idea meant the model of the problem was wrong, not that a line was off,
and that should have been the signal to stop and measure. Measuring is what finally settled it.

## Two corrections worth carrying forward

**A cut is not a repair.** Two passes once repaired winding by duplicating vertices around the
unsatisfiable edges, which leaves coincident facets. Every class still read clean and the volume did
not move, because the copies sit exactly on the originals, so nothing caught it. It showed only as
3,000 extra self-intersecting triangles on corbu and as doubled surfaces in the viewport. Both passes
are gone. The rule that would have caught it immediately: **no pass may add a part.**

**A guard has to cover the classes its own operation touches.** The pass that replaces those cuts
deletes faces and relies on the fill to close what that opens. Its guard checked parts, volume and
winding, and none of those sees a hole, so a failed fill left a cavity and the move was accepted.
Boundary edges and non-manifold edges are now compared before and after. That was found by eye in
the app, not by a test, because all three existing guards were quantities the failure mode does not
move.

Also worth knowing: **the component count is not a signal for added parts.** It moves with the
winding, since connectivity is directional. Corbu once went 8 to 13 components with no geometry
added at all. Self-intersections and duplicate triangles are what catch coincident geometry.

## What to measure next

The open question is what that model geometry *is*. 2,077,820 triangles is the bulk of the file. If
the chains sit in one localized region, it is a defect worth repairing. If they trace the hull, the
model arrived open by design and the verdict is already correct.

A probe along the lines of the one that produced the table above would answer it: repair, take the
first `model_triangle_count` triangles, and report where the boundary vertices cluster rather than
how many there are.

Closing it, whatever it is, means either adding geometry (which the reference engine does on this
file at a cost of 24% more triangles, and which the rule above forbids) or deleting designed surface.
Both are decisions rather than repairs.

## Related

- `../../docs/dev/mesh-repair-passes.md` — the published pass set, the stage order and the verdict
- `repair-engine-reference.md` — the engine survey this branch was planned against
- `repair-engine-plan.md` — the plan the branch followed
