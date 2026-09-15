# The next phase: the five hotspot files

**Status: sections 1-3 are DONE (1 and 3 converted, 2 measured and left).
Sections 4 and 5 are not started.** Work them in order.

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

### 1. `supportPreviewOverlay.ts` -- DONE

**Three builders became one, and the survey found more than the sample did.**

The plan caught two of them (`buildBranchesByParentKnotId` and
`buildLeafIdsByParentKnotId`, the same index written twice). Reading the whole
file as instructed found a THIRD in the same shape: `buildBraceIdsByKnotId`,
which differs only in indexing BOTH of a brace's knot edges rather than one --
so it is the one that proves the rule has to be "every declared host knot", not
"the one host knot field". All three now go through
`buildEntitiesByHostKnot(entities, project)`.

**The type is read off the entity, not passed in.** `hostKnotFieldsFor(typeId)`
is what answers "which fields hold this type's host knots", and the *type* came
from `resolveSupportTypeIdOf(entity)` rather than a parameter. That matters for
the literal budget: a type parameter means every call site spells a type name,
and the ratchet caught exactly that -- passing `'branch'`, `'leaf'` and `'brace'`
took `value` from 3 to 6 and failed `check:support-literals`. Deriving the type
from the data removed all three, and the budget is back at its baseline of 3.

Unstamped entities are skipped rather than indexed under an assumed type, which
is pinned by a test.

**A consumer outside `src/` had to be migrated:**
`scripts/support-drag-perf.ts` imported one of the builders and now uses the
derived one. Its synthetic branch fixture had to be stamped with a `typeId`,
because the index reads the type off the entity -- unstamped, the benchmark would
have measured an empty walk. It is stamped from `SIMULATED_MEMBER_TYPE_ID`, the
derived constant the script already had, so no new literal.

**Verified:** all three indexes are byte-identical to the builders they replace
over the criosphinx fixture (2103, 3208 and 10083 bytes), each checked against an
inline copy of the ORIGINAL builder rather than against a reading of it. Seven new
tests cover the rule -- a two-edge type indexed under both, a no-edge type
indexed at all, empty and missing knot ids, an unresolvable type, the projector,
and a per-type round trip over every type declaring a host knot. Mutation-tested:
indexing only the first declared edge fails two of them by name.

The rest of the file (the cascade walk, the leaf collection, the brace ghosting)
is generic map logic with no per-type knowledge in it, so there was nothing else
to derive.

References: 3,936 -> 3,904.

### 2. `autoBracing/autoBrace.ts` -- MEASURED, NOTHING TO CONVERT

Measured with `--type brace --lines` and `--type trunk --lines`, as instructed.
The prediction held: **the file is already derived where derivation applies**, and
every remaining mention is either the subject of the file or the word "brace" as
domain vocabulary rather than a type name.

Already derived, so there was nothing to replace:

```
157  for (const descriptor of SUPPORT_TYPES) { if (!descriptor.isAutoBraceable) continue; }
436  buildSupportSamples(snapshot).filter((s) => isAutoBraceableShaftType(s.supportKind))
654  if (isAutoBraceableShaftType(s.supportKind)) …
667  const bracesKey = getSupportTypeDescriptor(spanKnotHostType()).location.key;
701  for (const descriptor of SUPPORT_TYPES) …
1039 isAutoBraceableShaftType(lowS.supportKind) && isAutoBraceableShaftType(highS.supportKind)
```

Grepped for the two shapes that would mean otherwise -- arrays of type-name
literals, and functions named per type -- and found **neither**.

What the remaining 89 brace and 99 trunk references actually are:

- **The brace as the subject.** This is the auto-bracing feature:
  `generatedBraceCount` / `removedBraceCount`, `keptBraces`, `braceIds`,
  `braceKnotIds`, `createUniqueIdFactory('auto-brace', …)`,
  `brace.generatedBy === 'autoBracing'`, `AutoBraceStatus`. A brace IS what the
  file is about, which is the plan's own test for leaving a name alone.
- **The word, not the type.** `maxBraceLenMm`, `braceDiameterMm`,
  `buildBraceProfile`, `maxHorizontalRunFromBraceLen`, `SUPPORT_AUTO_BRACE_REPLACE`
  -- these share the word `brace` and name no type. The same class the anchor
  census spent its length on.
- **Two genuinely per-type loops, both the subject:** the trunk walk that builds
  `segmentOwnerTrunkId` (trunks host the stabilisers being placed) and the
  kickstand walk that copies a kickstand's own root and host knot into the
  snapshot.

**Conclusion: no change.** Deriving any of the above would mean inventing a
declaration for a fact the file already states by being about braces, which is
the opposite of the plan's rule. The reference count here measures vocabulary,
not coupling.

### 3. `autoSupport/autoPlace.ts` -- ONE CONVERSION, TWO FINDINGS RECORDED

Leaf 120, branch 102. As expected, this file had more in it than a conversion.

**Converted: `maxMemberSpanMm` hand-wrote its member set.**

```ts
const members = [...Object.values(draft.leaves), ...Object.values(draft.branches)];
```

That is `SHAFT_HOSTED_MEMBER_TYPES`, and this SAME FILE already walks it in nine
other places (lines 1838, 1849, 1857, 1885, 1899, 1926, 2214 at the time of
writing) -- so the derived pattern was already the file's convention and this was
the one exception. It now iterates the declared list and reads each member type's
`collectionKey`, which also drops the intermediate array the spread built.

**Verified identical over 2,941 `findMergeHost` results** -- a grid of tip
positions across the whole support field, captured BEFORE the change. The member
set feeds each host's load score, so the ranking would move if the set did.

**Finding recorded, NOT resolved: `syncContactConeDiameters` walks two types
where four qualify.** It builds its segment-diameter map from `draft.trunks` and
`draft.branches`, both hand-written. The declared set of types whose upper
endpoint is a cone AND which carry segments is FOUR:

```
trunk   upper=cone  hasSegments  collection=trunks
branch  upper=cone  hasSegments  collection=branches
stick   upper=cone  hasSegments  collection=sticks
stump   upper=cone  hasSegments  collection=stumps
```

Deriving it would therefore ADD stick and stump -- a behaviour change, not a
rename, and one that decides whether a stick's or stump's cone body diameter gets
resynced to its shaft. That may well be intentional (a stick's cone is placed
against a socket, a stump's frustum is not a shaft at all), but deciding it is
not this plan's job. Recorded here by the rule that a discrepancy is recorded
rather than silently resolved in either direction.

**Finding recorded as legitimate, not a smell: the brace walk at line 1902.** It
is commented "Brace knots are separate -- never cull a knot that is a brace
endpoint", and that is exactly right: a brace's endpoints are knots it does not
own the way a member is hosted by one, so counting knot users needs the separate
pass. Brace is the subject.

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
