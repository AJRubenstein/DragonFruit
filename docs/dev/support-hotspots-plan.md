# The next phase: the five hotspot files

The stump/stick plan is finished. It cleared the two smallest types to 36 and 84
and, in doing so, built the pattern the rest of the work uses: a per-type fact
lives in that type's own folder and registers itself through a seam.

This plan is the same work aimed at where the references actually are.

## Where they are

3,936 references across 110 files. Five files hold **1,679 of them, 43%**:

```
    532  src/supports/state.ts
    457  src/supports/SupportRenderer.tsx
    306  src/supports/autoSupport/autoPlace.ts
    232  src/supports/autoBracing/autoBrace.ts
    152  src/supports/interaction/supportPreviewOverlay.ts
```

Per type, the same files dominate every one: `state.ts` is the top or second file
for leaf, brace, kickstand and branch; `SupportRenderer.tsx` for brace, leaf,
kickstand and twig. **This is not eight separate problems.** Fixing a hotspot
moves every type at once, which is why this plan is organised by file rather
than by type.

## Order, and why

Smallest first, because each one proves the shape for the next and the last two
are the ones that can break geometry.

### 1. `supportPreviewOverlay.ts` (152) -- start here

The visible shape is a function written twice:
`buildBranchesByParentKnotId` and `buildLeafIdsByParentKnotId` are the same
index, over the same declared `hostedBy` knot edge, differing only in which type
they walk and whether they keep the entity or its id.

`hostKnotFieldsFor` already answers "which field holds this type's host knot",
and `SceneCanvas` already uses it for exactly this. One index, keyed by type.

Read the whole file before assuming the rest is the same shape -- this is a
sample, not a survey.

### 2. `autoBracing/autoBrace.ts` (232)

Mostly trunk (99) and brace (89). A brace is the subject here, so much of it is
legitimately per-type -- but `autoBrace` is also the file the findings doc flags
as scoring high on the false-positive `anchor` word, so **measure before
converting**. Run `--type brace --lines` and `--type trunk --lines` and classify
before touching anything.

### 3. `autoSupport/autoPlace.ts` (306)

Leaf 120, branch 102. The fan and merge logic. Two known open findings live in
this file (the cavity-bridge cap measuring from the wrong contact, the
consolidation host-order rule), so expect to find more; record them rather than
folding fixes into a derivation.

### 4. `SupportRenderer.tsx` (457)

Brace 137, leaf 130, kickstand 72, twig 42. Sections 7 and 8 already moved the
proxy and marquee geometry out of the render path into type folders; this is what
is left after that. Expect the same seam shape to apply again.

### 5. `state.ts` (532)

The store. Leaf 145, kickstand 114, brace 110. It carries `updateLeaf` and
`updateBrace`, which the stump/stick plan left open because moving them needs a
post-write settle seam designed first -- that decision is the gate on this file,
not a detail of it.

Do this one last. It is the file every other one depends on.

## Rules carried forward

**Extract a pure function and capture the baseline BEFORE changing anything.**
Sections 7 and 8 both did this, and section 7's baseline is what caught the trunk
stub discrepancy. A baseline taken afterwards re-reads the new code and proves
nothing.

**Derive, never subtract.** If a type is excluded, the descriptor says so with a
flag.

**A conceded folder's exports are not conceded.** A type's own folder may name
itself in values; a TYPE it exports carrying its own name breaks every consumer
on a rename.

**Record a discrepancy, do not silently resolve it.** The trunk 5-vs-10 stub is
in the findings doc, unresolved, because deriving the literal would have changed
geometry unreviewed.

**A passing suite is not evidence.** Every defect this refactor found was
invisible to the suite and the goldens: a stump that could not be toggled, a
stump missing from the bounds, a scene that read as empty, a knot left behind, a
marquee that caught a support without showing it.

## Gates

Delete `tsconfig.tsbuildinfo`, then `npx tsc --noEmit -p tsconfig.json`, the full
suite (942 src, 82 plugins), all 44 goldens (support 16, export 16, slice 12),
`check:docs`, `check:lint`, and a real `next build`.

On Windows: `npm test` does not expand its glob and reports success having run
nothing -- expand it yourself. `check:lint` dies with `spawn npx ENOENT`; lint the
43 whitelist directories directly at `--max-warnings 0`. And `rm -f x && tsc` in
a cmd.exe eval silently skips the `tsc`: run gates through bash.

## What "done" is not

Zero. A type's own folder, the registry and `types.ts` are exempt by design, and
a renderer that draws a stump needs to know what a stump is. The measure is
whether renaming a type in the registry is a one-line edit -- which today it is
not, and the literal budget (0 dispatch, 0 declaration) says the remaining
obstacle is spelling rather than dispatch.
