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

## 1. `SupportProxyMeshLayer.tsx` -- the interior-id loops -- DONE

**The shape.** Nine per-collection aliases fed five near-identical loops that
differ only in which contact fields they test. (The aliases are gone: the layer
reads the state itself now, and this section's later sibling -- the emitters
below -- moved each type's recipe into its own folder.)

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

## 2. `RaftProxyMeshLayer.tsx` -- two aliases -- DONE

Two per-collection aliases only. Small, same treatment, and worth doing
in the same pass so the two mesh layers stay the same shape.

Check whether the raft footprint genuinely wants only these two collections or
whether it has the same drift as SceneCanvas. `raftFootprintCircles.ts` already
walks declared types -- compare against it.

---

## 3. `SceneCanvas.tsx` -- the memo key, then the fan-out -- DONE

### 3a. Fix the key -- DONE, but the reason stated here was wrong

Landed as written: the eight hand-written entries became one derived spread over
`SUPPORT_COLLECTION_KEYS`, so `stumps` and `kickstands` are covered and the key
cannot fall behind the registry.

**The premise above is inverted, and the measurement is the point.** The cache
was never under-invalidating: `supportStateForBounds` is itself in that memo's
dependency array, so the memo re-runs on every store change and the eight
per-collection refs are inert. Measured against the real store -- a
hover/selection change moves the state object's identity while leaving the
collection identities untouched. The memo therefore recached on hover/selection
churn, which is exactly what its comment claimed it avoided. It over-invalidated;
it never under-invalidated.

Consequences:

- Deriving the list is correctness hygiene, not the behaviour change predicted
  here. Nothing recaches more than before.
- The `stumps`/`kickstands` omission was harmless *today* and a hazard *tomorrow*:
  drop the whole-state dependency to get the narrow invalidation this section
  wanted, and an incomplete derived key becomes a stale cross-section.
- **Deliberately not done:** dropping `supportStateForBounds` from that
  dependency array. It is a performance change (fewer recaches) carrying a
  staleness risk if the derived key is ever incomplete, and it is not what this
  section asked for. It needs a frame-time measurement first.

**Verify:** the manual check this section originally named -- edit a stump, then
a kickstand, with the cross-section open -- does NOT distinguish the two states,
because the section updates either way. It was not run: there is no app-drivable
path (auto-support needs the native `scanMeshMinima` call) and the running app is
the user's. It remains manually verifiable by the user.

### 3b. The prop fan-out (49 sites) -- classified

The 49 sites are not one question. Two were genuinely asking for a registry
answer and are done:

- **The model-knot collection** walked four types by hand, naming each one's knot
  field (`parentKnotId`, `startKnotId`/`endKnotId`, `hostKnotId`). Those fields
  ARE the declared `hostedBy` edges onto `knots`, so it now asks
  `hostKnotFieldsFor` per descriptor, which also replaced the three anonymous
  copies of that edge filter in the registry. Verified identical to the loops it
  replaces over the criosphinx fixture (121 braces, 22 branches, 50 leaves, 3
  kickstands).
- **Three copies of "which bases define the raft footprint"** -- the drawn raft,
  the marquee ring, and the model bounds -- two of which read `roots` alone and
  so ignored the types carrying their own inline root. All three now share
  `collectRaftBaseCirclesByModel`. Measured: the circle set was missing the
  stump's inline root (88 -> 89, r=1mm). That base is interior on the only
  available fixture, so the profile is unchanged there; this closes a latent
  disagreement between what is drawn and what is grabbable or bounded, not an
  observed one. The bounds walk is hoisted into a memo because that callback runs
  once per model.

Left alone, with the reason:

- **`supportMarqueeShapes`** (~2803-2875): eight per-type loops whose bodies
  differ in which endpoints contribute, whether sockets are included, and whether
  a contact cone is required. Deriving it needs the descriptor to declare a
  type's pickable geometry -- a far larger declaration than this plan
  contemplates. Here the type genuinely is the subject.
- **`sourceSupportAnchor`** (~3318): a supports-centroid for the duplicate
  preview, `roots` only. Same shape as the raft sites, but changing it moves
  where a duplicated model is previewed -- a visible behaviour change with no
  measured drift to justify it. Left deliberately.


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
all **44** golden tests (support 16, export 16, slice 12 -- the export and slice
suites are the ones a geometry change disturbs), `check:docs`, `check:lint`, and
a real `next build`.

**A passing suite is not evidence.** Two flags in this refactor were invisible to
the whole suite AND every golden. Interior view and cross-section caching are
both in that category, which is why each section above names a manual check.
