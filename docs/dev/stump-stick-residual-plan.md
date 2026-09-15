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

**The shape.** Five near-identical blocks: search a collection for the segment,
record which collection won, then branch on that at the end to write the result
back. The type names appear in the union, in the five `Object.values(state.x)`
calls, in three target-id locals and in the write-back arms.

**Why it matters more than its count.** A hand-written union of type ids
survives a rename with NO compile error -- `state.ts` has already produced that
failure once (`KickstandHostKind`). The union here is the same class. The
`targetTrunkId` / `targetKickstandId` split then forces every caller-visible arm
to know which types exist.

**What replaces it.** The registry already declares `hasSegments` per type, and
`SUPPORT_TYPES` is ordered. One walk over the types that declare segments finds
the owner and returns `{ typeId, entity, segmentIndex }`; the write-back arms
collapse to one that dispatches on the returned `typeId`.

**Check before assuming it is uniform.** The kickstand arm reads from a
different source than the other four (see the `kickstands` local above the
loop), and the trunk and kickstand arms do extra work the others do not. If an
arm is genuinely different, that difference becomes a declaration on the
descriptor, not an `if`.

**Verify.** `toggleSegmentCurve` is reachable from a hotkey. Capture the
before/after state for a scene holding one of every shafted type, toggle a
segment on each, and assert the result is identical. Mutation-test it: making
the walk skip one type must fail.

---

## 3. Collection-named locals

`for (const stick of …state.sticks)`, `for (const stump of …state.stumps)` in
code that is not about that type: `SceneCanvas` bounds and marquee shapes,
`SupportProxyMeshLayer` interior ids, `SupportRenderer` lookups.

Each is a per-type loop inside a function that wants every type. The fix is the
same collapse already made in `SupportRenderer` and `SupportProxyMeshLayer`:
walk `SUPPORT_TYPES`, read `descriptor.location.key`, ask the registry the
question the loop body asks by hand.

**`supportMarqueeShapes` in `SceneCanvas` is the exception.** Its per-type
geometry (which endpoints, whether sockets count, whether a contact cone is
required) is genuinely per type. Renaming the local is the honest fix there --
a local variable name cannot be derived.

---

## 4. The duds, already handled

- `NOT_THE_TYPE` in `scan-support-type-references.ts` holds `stickiness` and
  `CURRENT_SEGMENT_STICKINESS`. `--duds` prints what it excluded.
- The string "models stick out of the printer build volume" is prose in a
  comment field; the scan blanks strings, so it never counted.

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
