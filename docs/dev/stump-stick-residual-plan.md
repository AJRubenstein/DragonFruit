# Clearing the last stump and stick references

`npm run scan:support-types` reports per type. Stump and stick are the two
smallest, and they reduce to the same four shapes, which is what makes them
worth doing together.

```
    923  trunk        674  kickstand     225  twig
    870  brace        642  branch        145  stick
    859  leaf                             77  stump
```

Counts are identifiers outside the registry, `types.ts` and each type's own
folder. Comments and strings are invisible to this scan -- use
`npm run scan:support-literals` and a source scan as well.

The near-plate type was renamed `anchor` -> `stump`. `anchor` is still an
ordinary word here for geometric anchoring, the `Anchor` sizing preset, the
scene-arrange anchor and the auto-support anchor BAND -- none of which are the
type. Four rename errors have already been found in that direction (a UI label,
a preset dialog, a submodule comment, a limitation message), so check what a
token IS before changing it. See [anchor-token-census.md](anchor-token-census.md).

---

## What the references actually are

This scan already excludes the registry, `types.ts` and each type's own folder,
so every reference it reports is somewhere a type should NOT be named. None of
them are "fine because the type is the subject" -- if the type is the subject,
the code belongs in that type's folder.

They fall into four groups.

**1. A body that belongs in the type's folder but cannot move yet.**
`updateStump`, `updateLeaf` and `updateBrace` live in `state.ts` while being
registered from their own folders -- `stumpRegistration.ts` does
`registerSupportUpdater<Stump>('stump', updateStump)` and imports the body back
out of `state.ts`. Section 1.

**2. A hand-written per-type search.** `toggleSegmentCurve` in `state.ts`
(~2124-2338) searches five collections in sequence for the one holding a
segment, each with its own loop, its own target-id variable and its own
result arm. It declares `let container: Trunk | Branch | Twig | Stick |
Kickstand | null` -- a union of five type names. Section 2.

**3. A local named after the collection it loops.** `for (const stick of
Object.values(state.sticks))` inside code that is not about sticks. The loop
exists only because the list was hand-written. Section 3.

**4. A dud.** `stickiness` (drag bias), and the string "models stick out of the
printer build volume". Already excluded or invisible; listed here so they are
not chased. Section 4.

---

## 1. The three bespoke updaters in `state.ts`

`updateStump`, `updateLeaf` and `updateBrace` are each registered from their own
folder and imported back out of `state.ts`. The registration is derived; the
body is not, and it is the body that names the type.

**SECTION 1 IS DONE, and it needed no move.** The plan's own "Check first" is
what settled it: `updateStump`'s whole body was `replaceSupportEntity(stump)`,
which is what the generic pass does for every type that registers nothing, so
the bespoke updater was DELETED rather than relocated and stump simply takes the
generic path. `replaceSupportEntity` lost its one-argument overload with it,
leaving the single `(typeId, entity)` form its one remaining caller (the
settings applier) uses. `StumpRenderer` writes through
`updateSupportEntity({ ...latest, contactCone })`, which reads the type off the
entity.

Two claims in the note below were wrong, and measuring beat reading:

- The generic path does NOT "cache the settings hex" for a stump: stump declares
  `hasEditableSettings: false`, so that whole branch is dead for it.
- It DOES run a knot scan, and the scan is live rather than vacuous --
  `getKnotPlacementOnShaft('stump')` returns a placement function, and probing it
  with a knot on a stump segment moves the knot. What makes it harmless is that
  no knot rides a stump in the store, not that the code declines to try.

`updateLeaf` and `updateBrace` remain, and are NOT equivalent to the generic
path: leaf's cone-host knot recompute and brace's ordered span-host-first settle
are exactly what the generic pass does not do. Moving either still means
exporting store internals as a named seam first.

**Why they have not moved.** Each reads store internals that are module-private
to `state.ts`: `state.leaves` / `state.braces` directly,
`getCachedSupportSettingsHex`, `recomputeSpanHostKnotGeometry`, and
`replaceSupportEntity` (private, overloaded). Moving a body today means
exporting the store's internals, which trades one coupling for a worse one.

---

## 2. `toggleSegmentCurve` -- the five-collection search

**DONE.** The section is replaced by the derived owner walk plus the shared
endpoint resolution. What actually happened differs from the sketch below in
three ways worth recording.

**The owner walk already existed.** `findShaftOwnerOfSegment(segmentId)` was
already exported and already used by six callers (the context menu, joint
creation, the knot gizmo, knot interaction, the removal payload). It walks
`getSupports()` and reads the type off each entity, so this section needed a
MIGRATION to an existing seam, not a new walk over `SUPPORT_TYPES` filtered by
`hasSegments`.

**It was never merely inelegant -- it was broken.** The five hand-written loops
were `trunks`, `branches`, `twigs`, `sticks`, `kickstands`. Stump declares
`hasSegments: true` and was not among them, so a stump's segment was silently
un-toggleable. The fixture's stump has an empty `segments` array, which is why
nothing caught it; a stump gains segments as soon as one is jointed. The new
test iterates `SUPPORT_TYPES` for `hasSegments`, so stump is covered by
construction, and removing it from the walk fails three tests by name.

**The endpoints have a shared implementation, and using it changes geometry.**
The old write-back arms re-derived the curve's start and end per type: the last
arm cast the container to Trunk and read `.contactCone`, so a shaft ending at a
contact got a curve aimed at the CONTACT POINT, and the arms for twig and stick
-- whose contacts are `contactDisk*` and `contactCone*`, not `contactCone` --
fell through to a stub 10mm along +Z. The section now calls
`resolveSegmentEndpoints`, which is what the export, split, joint-drag and
raster-export paths already use, so the curve spans the shaft the app draws.

**`hostKnot` had to come off the declared edges, not `lower.kind`.** The
convention used elsewhere in the tree is
`descriptor.lower.kind === 'knot' ? state.knots[entity.parentKnotId]`. That hands
a KICKSTAND no knot at all -- its knot is at its UPPER end and its field is
`hostKnotId` -- so `resolveSegmentEndpoints` returns null for its last segment,
which has no top joint. `supportEndpointHostsOf` reads the `owns` edge for the
root and `hostKnotFieldsFor` for the knot, and assembling it the old way fails
three tests by name. The other `lower.kind`-based call sites
(`KNOT_PLACEMENT_BY_TYPE` in `state.ts`, `page.tsx`) have the same latent gap and
were left alone: out of this section's scope, and noted here rather than fixed
silently.

**Measured before and after**, over the criosphinx fixture:

- 249 real segments, all six shafted types: the derived start/end equals what
  the old arms computed, 0 differing -- provided the hosts are assembled as
  above.
- The fixture's only segments without a top joint are three kickstand ones, all
  of which agree.
- 5 real segments (every type that has one; the fixture's stump has none) toggle
  to bezier and round-trip back exactly.
- The span arm (`brace`, reached through a prefixed id) toggles on and off, and
  an unknown span id is a no-op rather than a throw.

**Not identical, deliberately, on two arms the fixture cannot reach:** a trunk
or stump segment ending at a contact now ends the curve at the socket rather
than the contact point, and a twig/stick one no longer falls back to a stub
10mm along +Z. Both are what `resolveSegmentEndpoints` does for the other ten
call sites, and both are unreachable on real data today -- twig and stick
declare `segmentsCarryBothJoints`, and no fixture trunk ends without a joint.

**Original sketch, kept for the shape it described.**

Five near-identical blocks: search a collection for the segment, record which
collection won, then branch on that at the end to write the result back. The
type names appear in the union, in the five `Object.values(state.x)` calls, in
three target-id locals and in the write-back arms -- the split between the trunk
and kickstand target ids then forced every caller-visible arm to know which
types exist.

A hand-written union of type ids survives a rename with NO compile error --
`state.ts` has already produced that failure once (`KickstandHostKind`).

---

## 3. Collection-named locals

**DONE for the derivable ones, with two real bugs found and fixed.** The section
was right that these loops are per-type loops inside functions that want every
type; it was wrong that the fix is uniform. Measured verdicts:

**`SceneCanvas` bounds -- DERIVED, and it was broken twice over.**
`computeSupportAndRaftWorldBounds` had six per-type loops plus a roots loop. It
is now two passes: the types declaring segments (joints uniformly, contacts
through each type's declared `kind` and `field`), and `INLINE_ROOT_TYPES` for
the bases that are not Roots entries.

- **STUMP WAS NEVER IN THE BOX AT ALL.** There was no `stumps` loop and stump
  has no Roots entry, so nothing in the function looked at one. A model whose
  only support is a stump got `null` bounds -- no support bounds whatsoever --
  and a stump away from a model's other supports sat outside the box. This is
  section 3's own subject matter arriving as a bug rather than as untidiness.
- **The contact set is not the `hasSegments` set.** Leaf declares a contact and
  no segments. Hanging the contact pass off `hasSegments` drops leaf's tip from
  the box; it did, by 0.13mm on the fixture, which is exactly the size of
  mistake that survives a golden suite.

Verified identical to a verbatim reproduction of the six old loops on the
criosphinx fixture, and the stump cases measured separately since the fixture's
stump sits inside the box the old loops produced.

**`supportMarqueeShapes` -- PER-TYPE, confirmed rather than assumed.** Nine
loops building pickable polylines, differing in which endpoints contribute,
whether a socket counts and whether a contact cone is required. Deriving it
needs the descriptor to declare a type's pickable geometry. The locals there are
already honestly named for their type, so there is nothing to rename either.

**`SupportProxyMeshLayer` interior ids -- already done** (see
`per-type-alias-cleanup.md` §1). Its **proxy primitives are PER-TYPE**: each type
emits a different recipe, a stump's frustum carrying its own base/top radius and
height, a brace its profile curve. Same reason as the marquee.

**`SupportRenderer` lookups -- the one exception is legitimate.**
`supportIdByContactDiskId` adds the near-plate type's contact cones because the
render lookup worker does not index them. It walks each type's declared contact
fields to do it, and a type that stops declaring a cone drops out on its own.
**The gap it works around is worth its own look**: the worker indexes contacts by
declared field, so it should not need this at all.

---

## 4. The duds, already handled

- `NOT_THE_TYPE` in `scan-support-type-references.ts` holds `stickiness` and
  `CURRENT_SEGMENT_STICKINESS`. `--duds` prints what it excluded.
- The string "models stick out of the printer build volume" is prose in a
  comment field; the scan blanks strings, so it never counted.

---

## What is left, and why

Sections 1-3 are done. What remains is not the shapes this plan described:

- **`updateLeaf` and `updateBrace`** still live in `state.ts` and still name
  their type. Not equivalent to the generic path (leaf's cone-host knot
  recompute, brace's ordered span-host-first settle), so each needs its store
  dependency exposed as a named seam before it can move. Section 1 explains.
- **Per-type geometry in `supportMarqueeShapes` and the proxy mesh layer.** A
  real refactor, needing pickable and proxy-anchor declarations on the
  descriptor. Out of this plan's scope by its own test.
- **`hostKnot` assembled from `lower.kind`** at `KNOT_PLACEMENT_BY_TYPE` in
  `state.ts` and in `page.tsx` has the same gap that section 2 hit: a kickstand's
  knot is at its UPPER end through `hostKnotId`, and `lower.kind === 'knot'` is
  false for it, so it is handed no knot. Two named call sites, one shared fix.


---

## Expect the count to RISE before it falls

Renaming a stale local from `anchor` to `stump` makes it visible to a scan
keyed on the stem: doing that took stump from 68 to 77. A rising count here
means fewer stale names, not more coupling. Read the literal budget
(`npm run check:support-literals`, currently 0 dispatch / 0 declaration) and the
rename test for whether a rename is safe; this scan measures how much code still
spells a type at all.

---

## Rules that apply throughout

**Derive, never subtract.** No `.filter(id => id !== 'stump')`. If a type is
excluded, the descriptor says so with a flag.

**A conceded folder's exports are not conceded.** A type's own folder may name
itself in values; a TYPE it exports carrying its own name breaks every consumer
on a rename.

**The literal budget must not rise.** If a change raises it, a list moved rather
than went away.

**Gates:** delete `tsconfig.tsbuildinfo`, then `npx tsc --noEmit -p
tsconfig.json`, the full suite (925 src, 82 plugins), all 44 goldens (support
16, export 16, slice 12), `check:docs`, `check:lint`, and a real `next build`.

**Running them on Windows**, where the obvious commands mislead:

- `npm test` does not expand its glob and reports success having run NOTHING.
  Expand it yourself:
  `node --import tsx --test $(find src -name '*.test.ts' -o -name '*.test.tsx')`
- The goldens are three separate test files under `local-only/` (support-goldens,
  export-goldens, slice-goldens), all needed. A geometry change shows up in the
  export and slice suites, not in the support 16.
- `npm run check:lint` dies with `spawn npx ENOENT`. It is a ratchet over a
  43-directory whitelist, so lint those directories directly at
  `--max-warnings 0` instead.
- A stale `tsconfig.tsbuildinfo` makes `tsc` print nothing while real errors
  exist. Delete it first, every time, and use `-p tsconfig.json`.
- `.next/` holds generated `.d.ts` files that report syntax errors of their own.
  They are not source; `rm -rf .next/dev` if they appear.

**A passing suite is not evidence.** `toggleSegmentCurve` had no coverage when
this was written. Add the test before the refactor, not after.
