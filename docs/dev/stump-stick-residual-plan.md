# Clearing the last stump and stick references

**Status: sections 1-7 are DONE.** Neither type is clean, and neither reaches
zero: what remains is the type's own folder, the registry, the tests, and
`supportMarqueeShapes` in SceneCanvas, which is the one per-type geometry left
that has not been given a seam.

`npm run scan:support-types` reports per type. Stump and stick are the two
smallest, and they reduce to the same shapes, which is what makes them worth
doing together.

Current, after sections 1-7 (4,001 total across 110 files):

```
    874  trunk        596  branch        159  twig
    822  brace        599  kickstand      93  stick
    813  leaf                              45  stump
```

Stump went 77 -> 45 and stick 145 -> 93 across the seven sections. Every
reference count above measures how much code still SPELLS a type; none of it
dispatches on one -- the literal budget stays at 0 dispatch / 0 declaration.

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
which has no top joint. `resolveDeclaredHosts` reads the `owns` edge for the root
and the `hostedBy` knot edges for the knot, and assembling it the old way fails
three tests by name. It is the exported selector that was already there; the
private helper this section first added for it was a duplicate and has been
removed in favour of it.

That gap was NOT only latent here: the same assembly at
`KNOT_PLACEMENT_BY_TYPE` in `state.ts` and in `page.tsx`'s context menu left a
knot riding a kickstand behind when the kickstand moved. Both now call
`resolveDeclaredHosts`; see section 5.

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

## Status: neither type is clean

Sections 1-6 are done. **Stump is at 63 references and stick at 115.** Section 7
is the only one of this plan's sections left, and it is deliberately deferred to
its own plan; the carried-over items below are also open.

Neither type can be renamed by editing the registry alone today. Both are
close: the literal budget is 0 dispatch / 0 declaration, so nothing BRANCHES on
either name. What is left spells the name rather than dispatching on it.

### 5. The transform switch in `state.ts` -- DONE, and it was hiding the kickstand bug

**The switch is gone.** `transformAllSupportsForSingleModel` now walks
`SUPPORT_ENTITY_COLLECTIONS` and asks the same declarations section 3's bounds
walk uses: `hasSegments` for the segment pass, `contactEndpointsFor` for the
contacts by kind and field, and `transformExtrasFor` for the per-type extras. The
one arm that remains is `roots`, which is not a support type at all.

**Two of the three "exceptions" were already declared.** `SUPPORT_TRANSFORM_EXTRAS`
already held `brace: ['curve']` and `stump: ['rootPos', 'joint']`, and
`transformExtrasFor` was already the accessor -- a NEIGHBOURING function in the
same file, `transformSupportsForModel`, already transformed this way. So this
section was less "invent a declaration" and more "make the second copy match the
first". Only `roots` preserving Z needed keeping.

**STUMP'S ARM HAD MORE THAN THE SKETCH ABOVE.** It also moved `rootPos` and
`joint.pos`, which the sketch's "transform the segments and contacts" does not
cover. `transformExtrasFor` names both.

**Kickstand was not in the switch at all** -- it fell to `default` and its
segments were transformed afterwards by a separate pass,
`transformAllKickstandsInState`, which the commit then reported through
`kickstandsChanged`. That pass was purely generic, so it is folded in: the walk
covers kickstands like every other type, and `kickstandsChanged` is now read off
whether the walk minted a new collection for them. `kickstandStoreVersionRef` in
`page.tsx` still advances once per transform, so the drag-sync handshake is
unchanged.

**Verified byte-for-byte.** Captured every collection plus `roots` and `knots`
for five scenarios -- translate with a Z delta (exercising `preserveRootZ`),
rotate, scale, and two single-model transforms -- run against HEAD and against
the working tree: **identical, 1,754,214 bytes each time, five times**. Then the
suite, the goldens and `next build`.

**`Stick` and `Stump` are no longer imported into `state.ts` at all** as a
result; `Twig` was already unused and went with them.

### 6. Payload collection lists -- DONE, and one of the lists was dropping stumps

Two functions, `voxlSupportsContainData` and `countSupportEntries`, listed nine
collections each. **`stumps` was not among them**, even though
`DragonfruitImportFormat` declares it -- so a document whose only supports were
stumps read as having NO supports at all, and counted 0. Demonstrated directly:
two stumps and nothing else gave `false` / `0` before, `true` / `2` after. On the
criosphinx fixture the delta is zero only because that fixture carries no stumps,
which is why nothing caught it.

Both now walk `SUPPORT_COLLECTION_KEYS`, which is exactly the payload's key set:
that list is `SUPPORT_PRIMITIVE_COLLECTIONS` (roots, knots) plus every type's
collection, and it omits none of the payload's keys.

The optional-collection check named `twigs`, `sticks` and `kickstands`
individually -- `stumps` is optional too and went unchecked, so a malformed
payload could smuggle a non-array through it. Now every declared collection is
checked.

**The four `getSupportsForModel` call sites are derived too.** That function
already walks `MODEL_ID_COLLECTION_KEYS` and returns an array per collection; the
callers were reading a hand-written subset of it, nine lines of `||` at a time,
and asking `getSnapshot().kickstands` separately. They now reduce or `some` over
the same key list the function fills. `kickstandCountByModel`, the hand-built
map that duplicated what `supportIds.kickstands` already held, is gone.

Three dead `kickstandStateBefore = getSnapshot()` locals went with it -- one
orphaned by deriving its only reader, two that were already dead assignments.

One `ReturnType<typeof getSupportsForModel>` became the named `ModelSupportIds`
the module exports, per the repo's rule against publishing a contract as
`ReturnType<typeof fn>`.

### 7. The proxy mesh layer's per-type emitters -- DONE, by a SEAM not a descriptor

`SupportProxyMeshLayer` emitted a different primitive recipe per type -- a stump's
frustum with its own radii and height, a stick with two cones, a brace with a
profile curve. This section's verdict was that deriving them "needs the descriptor
to declare a type's PROXY GEOMETRY, which is a larger declaration than this plan
contemplates". That was the wrong SHAPE, not the wrong instinct: the recipes stay
per type, they just move to where a per-type fact belongs.

**What was built.** A registration seam beside the layer,
`src/supports/proxyGeometry/seam.ts`, modelled on `exportGeometry/seam.ts` --
which already says the thing this section needed: *"each type's export geometry is
a fact about that type, so it lives in that type's own folder and registers itself
here. Nothing else names a type."* Each of the eight types now has
`<Type>/<type>ProxyGeometry.ts`, imported for its side effect from that folder's
existing `<type>Registration.ts`, so the generated barrel still loads everything.

The layer's eight loops and its nine per-collection aliases are gone. In their
place is one walk over `SUPPORT_TYPES` that asks each type for its recipe:

```ts
for (const descriptor of SUPPORT_TYPES) {
  const registered = supportProxyGeometryOf(descriptor.id);
  if (!registered) continue;
  if (registered.registration.detailedOnly && !includeDetailedPrimitives) continue;
  if (registered.registration.skipInInteriorView && interiorSupportIdSet) continue;
  for (const entity of Object.values(state[descriptor.location.key] ?? {})) {
    if (interiorSupportIdSet && !interiorSupportIdSet.has(interiorSupportKey(entity))) continue;
    registered.build(entity as never, context);
  }
}
```

**Doing this needed the layer to become testable first.** Nothing rendered this
component in a test, so there was no way to tell a correct derivation from a
plausible one. The emitter came out as an exported pure function,
`collectProxyPrimitives(state, { includeDetailedPrimitives, interiorSupportIdSet })`
-- the same move section 1 made for `interiorSupportIds`. That is what made the
byte-for-byte check below possible at all.

**The two per-type decisions are now declared, not inlined.** The interior filter
was uniform for every type except brace, which is a connecting structure between
supports rather than one facing the model; and leaf emits nothing at all unless
detailed primitives are on. Both are facts about those types, so both are
registration flags -- `skipInInteriorView` and `detailedOnly`.

**Verified byte-for-byte, with the capture taken BEFORE the change.** Every
primitive of every model, in four scenarios (detailed, coarse, interior with
nothing inside, interior with everything inside): **identical, 585,221 bytes each
time**. The baseline was captured while the code was still the old emitter, which
is what makes the comparison meaningful rather than a re-read.

**Measured, spanning this section and the previous ones:** stump 77 -> 45, stick
145 -> 93. 4,316 -> 4,001 references. The floor this plan estimated was stump ~40
and stick ~90, so the emitters were indeed most of what remained.

**One thing deliberately NOT derived.** Trunk's proxy shaft falls back to a 5mm
stub when a segment ends with no top joint and no contact, but trunk's descriptor
declares `shaftFallback.stubLengthMm: 10`. Using the declaration as the recipes
were being written would have CHANGED trunk's proxy geometry -- so the literal is
kept verbatim and the discrepancy is recorded here rather than silently resolved
in either direction. `resolveSegmentEndpoints` has the same 10-vs-5 question to
answer for the export and slice paths, and the captured baseline is what would
catch it.

### Carried over

- **`updateLeaf` and `updateBrace`** still live in `state.ts` and still name
  their type. Not equivalent to the generic path (leaf's cone-host knot
  recompute, brace's ordered span-host-first settle), so each needs its store
  dependency exposed as a named seam before it can move. Section 1 explains.
  `updateStump` was deleted rather than moved -- the generic pass already did
  what it did.
- **`supportMarqueeShapes` in `SceneCanvas`** builds a pickable polyline per
  type. This was "same class as section 7, same verdict" -- and section 7's
  verdict moved, so the same seam shape applies: a per-type recipe registered
  from the type's own folder. Not done, and now the ONLY per-type geometry left
  outside a type's folder.
- **`hostKnot` assembled from `lower.kind`** -- **FIXED**. It was called a latent
  defect here; it was live. Both call sites (`KNOT_PLACEMENT_BY_TYPE` in
  `state.ts` and the context menu in `page.tsx`) handed a kickstand no knot,
  because its knot is at its UPPER end through `hostKnotId`. A knot riding a
  kickstand was left behind when the kickstand moved. Both now read the declared
  edges through `resolveDeclaredHosts`; see section 5.

### The floor

Measured, with sections 5-7 done: stump 45 and stick 93. The estimate here was
40 and 90, so after the proxy emitters moved the two are within a few
references of it. What is left is the marquee geometry, plus the type's own
folder, the registry and the tests, which are exempt or are the type's own
subject. Neither type reaches zero, and should not: zero would mean the renderer
had no per-type geometry at all.


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
tsconfig.json`, the full suite (929 src, 82 plugins), all 44 goldens (support
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
