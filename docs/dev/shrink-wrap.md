# ShrinkWrap

ShrinkWrap resamples a mesh into a closed one. It is the escape hatch for input whose topology
cannot be repaired: a mesh with a frustrated winding seam, a hollowed model whose interior has been
turned inside out, or anything else where every pass in
[the repair pipeline](mesh-repair-passes.md) has to refuse rather than damage the object.

**It resamples.** The result bears no relation to the input's vertex count, triangle count or exact
geometry beyond its overall shape. That is the point — it is the only way to guarantee a closed
result on input whose topology cannot be fixed — and it is why it is never part of `repair()`.

The reference engine has the same shape: its `ShrinkWrap::run` is a separate command with its own
dialog parameters, and its automatic repair path never calls it.

## The public surface

| item | what it is |
| --- | --- |
| `shrink_wrap(mesh, options)` | the entry point, in `dragonfruit_mesh_repair::shrink_wrap` |
| `ShrinkWrapOptions` | `voxel_mm`, `gap_fill_mm`, `thickness_mm`, `max_triangles` |
| `ShrinkWrapOutcome` | the wrapped `mesh` plus a `ShrinkWrapReport` |
| `ShrinkWrapReport` | input, isosurface and output triangle counts, voxel size, offset, band size, elapsed milliseconds |

The CLI exposes it as its own subcommand rather than a flag on `repair`, so that asking for it is a
deliberate act:

```
dragonfruit-mesh-repair shrinkwrap model.stl --voxel-mm 0.1 --gap-fill-mm 0.1 \
    --max-triangles 2000000 --out-stl wrapped.stl
```

## How it works

1. **Sample a signed distance field** in a narrow band: only lattice points within a few voxels of a
   triangle are stored, so memory is proportional to surface area over voxel size rather than to
   the bounding box volume. A dense grid at 0.05 mm on a 50 mm model is 10⁹ cells; the band is a
   few million. The sign comes from the nearest triangle's own normal, not from a parity ray cast,
   because parity is meaningless on the open and mis-oriented input this exists for.
2. **March tetrahedra** through the field at the requested offset, six per cell, interpolating each
   crossing. This is what puts the surface *between* lattice points.
3. **Smooth** lightly with Taubin, which removes the lattice ripple without the volume loss a plain
   Laplacian would cause.
4. **Simplify** to the caller's triangle budget. This is not an optimisation: at 0.05 mm the
   isosurface is tens of millions of triangles, and the budget is what makes the resolution usable.
   The reference engine's ShrinkWrap pulls a simplifier for the same reason.
5. **Close** the small openings the offset leaves where the model is thinner than it, and again
   after simplification, which collapses edges across them.

## The parameters

| option | what it does |
| --- | --- |
| `voxel_mm` | the resolution. Detail finer than this does not survive, and the surface error is a fraction of it. Smaller costs memory and time linearly in the band. |
| `gap_fill_mm` | push the surface out by this much before extracting, which is what closes gaps: two sheets of a hole up to twice this wide meet and merge. Costs that much inflation. |
| `thickness_mm` | push it out by this much more. Additive with `gap_fill_mm`; kept separate because the reference dialog has both. |
| `max_triangles` | simplify to at most this. Zero keeps all of it. |

**Offsets are the fidelity knob.** At 0.1 mm a one-voxel fill moves the surface a tenth of a
millimetre; at 0.05 mm, half that. That is why the reference's 0.05–0.1 mm range looks like the
original and a coarser one does not.

Measured on the V3 Cones, which cannot be repaired locally at all — 4 winding edges that no
assignment of face orientations resolves. Input 1,383,426 triangles, volume 2,713:

| resolution | offset | output triangles | volume delta |
| --- | --- | --- | --- |
| 0.1 mm | 0.1 mm | 1,999,658 (budget 2M) | **+16.3%** |
| 0.2 mm | 0.1 mm | 1,284,188 (no budget) | +16.6% |
| 0.3 mm, occupancy grid | 1 voxel | 132,160 | **+83.5%** |

The last row is the previous implementation — an occupancy grid with voxel faces drawn on it — and
the comparison is the point: at a *coarser* resolution it inflated five times as much, because its
surface could only sit on voxel boundaries, a whole voxel away from the input, and it could not
interpolate.

**It is not dimensionally faithful.** The wrap closes a mesh and moves its surface by roughly the
offset. On a calibration part whose dimensions are the point, that matters — the cones are still
16% fat at 0.1 mm. It repairs the topology, not the measurements.

## Constraints

- **Never called from `repair()`.** It is a separate function, a separate CLI subcommand, and a
  caller has to name it. A repair that silently resampled would destroy geometry a caller never
  agreed to lose.
- **The band has to reach past the isosurface.** Extracting at an offset of *n* voxels puts the
  surface *n* voxels off the mesh; a band that stops short does not contain its own crossing and
  the result fragments. Measured with a half-millimetre fill at a tenth-millimetre voxel: eight
  components where there should have been one.
- **The interpolation starts from a canonical end of each lattice edge.** Several tetrahedra reach
  the same edge from either end, and computing the parameter from a different end gives a point
  that differs in the last bits — which the weld then fails to merge, leaving the surface open.
- **Orientation is by propagation, not by the triangle's own normal.** The normal is numerically
  unstable on the slivers an isosurface makes, and 2,400 edges came out inconsistent on a cube.
- **It does not use `repair_orientation`.** That pass refuses when the volume moves more than one
  percent, which is the right guard for a repair that might invert a solid and the wrong one here:
  correcting a winding *is* a volume correction. It reverted the fix and left the 2,400 edges; an
  independent propagation settles the same surface to zero.

## Related pages

- [Mesh repair passes](mesh-repair-passes.md) — the local passes, and why they refuse on this input
- [Mesh wire formats](mesh-wire-formats.md) — the payloads this reads and writes
