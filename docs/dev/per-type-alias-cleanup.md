# Per-type alias blocks: the mesh layers and SceneCanvas

Three files hold hand-written per-type lists that the registry can answer for.
They are the last large block of the kind, and one of them is already wrong.

Do them in the order below. Each is independently shippable and independently
verifiable, and the first is the smallest.

---

## Why these are not "just naming"

The lists have already drifted from the registry, which is the failure the
registry exists to prevent:

**`SceneCanvas.tsx` names 8 of the 10 collections.** `stumps` and `kickstands`
are missing from the cross-section memo key, so editing one does not invalidate
the cache. The comment directly above it says *"support/kickstand refs"* -- the
intent included them and the list fell behind.

That is a live cache-invalidation defect, not a rename hazard. It is also
exactly what a derived key would have made impossible.

---

## 1. `SupportProxyMeshLayer.tsx` -- the interior-id loops

**The shape.** Nine aliases (`supportTrunks` … `supportStumps`) feed five
near-identical loops that differ only in which contact fields they test:

```ts
for (const leaf of Object.values(supportLeaves)) {
  if (isInteriorContactCone(leaf.contactCone, leaf.modelId)) ids.add(`leaf:${leaf.id}`);
}
for (const stick of Object.values(supportSticks)) {
  const onA = isInteriorContactCone(stick.contactConeA, stick.modelId);
  const onB = isInteriorContactCone(stick.contactConeB, stick.modelId);
  if (onA || onB) ids.add(`stick:${stick.id}`);
}
```

**What replaces them.** All three moving parts are already declared:

| the loop asks | the registry answers |
| --- | --- |
| which contact fields does this type have | `contactEndpointsFor(typeId)` -- `{ end, kind, field }[]` |
| is any of them interior | `anyContactMatches(typeId, entity, test)` |
| cone or disk | the `kind` on each endpoint |
| what prefixes the id | `interiorIdPrefix(entity)`, already in this file |

**`SupportRenderer.tsx` has already made this exact collapse** (lines ~557 and
~1504 call `anyContactMatches`). Copy that, do not invent a second shape.

**The two that are NOT uniform, and must stay declared:**

- **Trunk is deliberately skipped** -- "trunks are never added to the set",
  because their tips are on the model exterior. Do not let the loop pick it up.
  If no flag says this, add one to the descriptor; a comment is not a
  declaration.
- **Branch tests its segments too** (`isAnySegmentPointInterior`), the others do
  not. Check whether `hasSegments` is the right predicate before assuming it.

**Verify:** the interior view is a visual feature with thin coverage. Before
changing anything, capture the `Set<string>` the memo produces for a scene with
one of every type, and assert the new code produces the identical set. Ship that
assertion as a test -- it is the only thing standing between this refactor and a
silent change to what the cavity view hides.

---

## 2. `RaftProxyMeshLayer.tsx` -- two aliases

`supportRoots` and `supportStumps` only. Small, same treatment, and worth doing
in the same pass so the two mesh layers stay the same shape.

Check whether the raft footprint genuinely wants only these two collections or
whether it has the same drift as SceneCanvas. `raftFootprintCircles.ts` already
walks declared types -- compare against it.

---

## 3. `SceneCanvas.tsx` -- the memo key, then the fan-out

### 3a. Fix the key (small, and a real fix)

Replace the eight hand-written entries with one derived spread:

```ts
...Object.fromEntries(
  SUPPORT_COLLECTION_KEYS.map((key) => [`support_${key}`, supportStateForBounds[key]]),
),
```

**This changes behaviour**, and that is the point: stumps and kickstands start
invalidating the cache. Expect more recaching than before, because the cache was
under-invalidating. If that costs measurable frame time, the answer is a
narrower DERIVED predicate (a `contributesCrossSectionGeometry` flag on the
descriptor), never a hand-written list.

**Verify:** edit a stump, then a kickstand, with the cross-section view open.
Before the change the section does not update; after, it does. Record that in
the PR -- it is the user-visible proof.

### 3b. The prop fan-out (49 sites)

`supportStateForBounds.<collection>` appears 49 times. Once the memo key is
derived, work through the rest by the same rule: a site that names a collection
to ask a question the registry can answer should ask the registry.

Leave any site where the collection is named because that ENTITY TYPE is
genuinely what the code is about -- a renderer for one type, say. The test is
the same as everywhere else: is this the type, or is this every type?

---

## Rules that apply throughout

**Derive, never subtract.** No `.filter(key => key !== 'stumps')`. If a
collection must be excluded, the descriptor says so with a flag.

**A local variable name cannot be derived.** `for (const stump of …)` is erased
at compile time; no runtime value produces an identifier. Where a loop genuinely
stays per-type, renaming the local is the honest fix -- but a loop that only
exists because the list was hand-written should be gone, not renamed.

**The literal budget must not rise.** `npm run check:support-literals` is
ratcheted; if a change raises it, that is the signal a list moved rather than
went away.

**Gates before each of the three lands:** `tsc` (delete `tsconfig.tsbuildinfo`
first -- the stale-cache trap has bitten this repo repeatedly), the full suite,
all **50** golden tests (support 22, export and slice 28 -- the export and slice
suites are the ones a geometry change disturbs), `check:docs`, `check:lint`, and
a real `next build`.

**A passing suite is not evidence.** Two flags in this refactor were invisible to
the whole suite AND every golden. Interior view and cross-section caching are
both in that category, which is why each section above names a manual check.
