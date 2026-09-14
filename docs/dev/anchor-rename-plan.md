# Cleaning up `anchor`

A worked example of taking one support type to the goal: renaming it in the
registry changes the name **and nothing else**.

Pick `anchor` because it is the smallest. What is learned here sets the recipe
for the other seven, which are larger but the same shape.

## The goal, stated exactly

Change `id: 'anchor'` in `supportTypeRegistry.ts` to any other name. Afterwards:

- `npx tsc --noEmit` reports 0 errors;
- the full suite passes, with no fixture edited;
- the 16 support golden masters stay byte-identical;
- the app builds and an anchor still places, renders, exports and undoes.

If a hand-written `anchor` survives anywhere outside the three exempt places,
the last two fail silently rather than loudly, which is the whole problem.

## Exempt, by convention

- `src/supports/supportTypeRegistry.ts` -- the naming point
- `src/supports/types.ts` -- the entity interface the registry derives from
- `src/supports/SupportTypes/Anchor/` -- a type may name itself in its own folder

Everything else is in scope.

## What the measurement actually says

Three instruments disagree, and each is right about a different thing.

| instrument | reads | why |
| --- | ---: | --- |
| `rename-test.py anchor` | **0** | the compiler-visible work is DONE |
| `scan:support-types` | part of 5,151 | counts identifiers, most of which are not this type |
| `inventory.py` | 766 occurrences | every token containing the string |
| a raw source sweep | 1,161 mentions, **154 tokens** | the honest ceiling; see the census |

**`rename-test.py` reading 0 is not success.** It sees only what `tsc` can prove.
Everything below compiles clean after a rename and is wrong at runtime, which is
exactly the failure the knot-host prefixes already demonstrated.

## The number that matters: 87

Of the 766 occurrences, most are **a different word**. English uses "anchor" for
geometric anchoring, and this codebase does so heavily:

| not this type | where |
| --- | --- |
| `sortAnchor`, `lowAnchor`, `highAnchor` | `autoBrace.ts` -- brace geometry |
| `candidateAnchors`, `anchorPoints` | `kickstandStabiliser.ts` -- sample points |
| `arrangeAnchorMode`, `packingAnchor` | scene arrangement |
| `textAnchor` | SVG |
| `tenonAnchor` | organic cut |
| `const anchor = document.createElement('a')` | DOM, in two exporters |
| `AnchorSide`, `LayoutAnchorRule` | floating panel layout |
| `resolveShaftAnchor`, `socketAnchorRef` | where a shaft is anchored |

**Renaming any of these is a defect, not progress.** They are listed here so the
next person does not "fix" them, and so a future metric can subtract them
deliberately rather than by eye.

Filtering to tokens that touch the store collection, the type literal or the
entity type leaves:

- **87 production references across 32 files**
- **41 test references across 12 files**

That is the work.

## One judgement call, already made

`src/supports/Settings/presets.ts` defines `ANCHOR_PRESET` with `id: 'anchor'`,
`name: 'Anchor'`, icon ⚓, sitting beside `'detail'` and `'structure'`. It is a
SIZING PRESET that happens to share the word.

**Leave it.** It is persisted in user settings (`sizingPreset: 'detail' |
'structure' | 'anchor'`), so renaming it breaks saved profiles for a cosmetic
gain. If the type is ever renamed, this preset keeps its own name, and that is
correct: they were never the same thing.

`STUMP_BELOW_ROOT` is the opposite case: it reads like geometry but IS the
type -- a `LimitationCode` raised only by the anchor's own placement rule. Every
token is classified in [anchor-token-census.md](anchor-token-census.md); read it
before touching anything, because the word cuts both ways.

## How to work

One file at a time, smallest first. For each:

1. Read the site. Decide: **the support type**, or **the English word**?
2. If the word, leave it and move on.
3. If the type, derive it. The registry answers "which type is this" in every
   case that has come up so far: a declared flag, a declared edge, or a
   descriptor lookup. If nothing answers, add a flag to the descriptor -- that
   is the intended escape hatch, not a cast.
4. Re-run the file's tests.

Do not batch a regex across files. The prefix cleanup tried that once and
dropped an argument; every site here needs reading because the word is ambiguous
by nature.

**Nor classify by file.** The census was first built that way and got two things
wrong in both directions: `supportSidebarAnchorRef` sits in a supports file and
is an `HTMLDivElement`, while `STUMP_BELOW_ROOT` reads like geometry and is the
type. The test is what the token IS -- a `Vec3`, a DOM ref, a screen direction,
an entity -- not where it lives. Every row in the census carries that evidence.

## Verifying, at the end

The rename test will still say 0, so it proves nothing here. Use the real one:

```
python ../lysdiag/tools/rename-all.py anchor <newname>
```

then `tsc`, the suite, the goldens, and a manual place/render/export/undo. Revert
the rename afterwards -- it is a probe, not a commit.

**A passing suite is not evidence.** Two flags in this refactor were invisible to
the whole suite AND every golden. If a site cannot be covered, say so in the PR
rather than implying it is proven.

## What "done" unlocks

One type fully derived is the proof the approach scales, and gives a real
per-type cost for the other seven. `anchor` is the smallest, so treat its number
as a floor rather than an average -- `trunk` and `branch` are far larger, and
`branch` additionally suffers the identifier problem (`branchId` and friends)
that `anchor` does not have.

---

## Outcome: `anchor` is clear

Renaming the id in the registry, the `types.ts` keys, and the type's own folder
now needs **no other edit**. Measured with `rename-probe.py anchor --new anchory`:

| check | result |
| --- | --- |
| `tsc --noEmit -p tsconfig.json` | **0 errors** |
| `src/**` suite | **910 / 910 pass** |
| test fixtures edited for the rename | **none** — the recorded data is untouched |
| support golden masters | **byte-identical to before this work** |

`rename-test.py` still reads 0, as it did before anything was done — which is why
it was never the instrument for this. It renames `types.ts` alone and counts
compile errors; every site this task fixed compiled perfectly with the old name.

### What the work actually was

**One production hazard, and it was not a literal.**

`src/supports/detailRenderer/registerBuiltinDetailRenderers.ts` imported all eight
renderers by hand-written PATH:

```ts
import '../SupportTypes/Anchor/AnchorRenderer';
```

A path is a place a type's name is written down, and no scanner classifies one as
a type literal — `"anchor"` never appears as a string. Renaming the type left that
import pointing at a folder that no longer existed, and because the renderer
module is loaded by the SCENE, everything that renders anything failed to LOAD:
**253 tests never ran** (909 → 656) from that one line, and the failure named a
module path rather than the type.

It is now generated from the folders, exactly as `generatedSupportRegistrations.ts`
already was (`scripts/generate-support-renderers.mjs`), and wired into
`predev` / `prebuild` / `pretest`. `supportTypeFolders.test.ts` already asserted
the `<Folder>Renderer.tsx` convention, so the two halves meet.

**Everything else was test scaffolding that named a type to build a fixture.**
Seven files, and the fix in each was the same shape: pin the VALUE, derive the
NAME. The strongest of them is `entityTypeId.test.ts`, whose per-type seed table
is now built from the descriptor's declared facts (`hasSegments`, `contactFields`,
`edges`) — a rename needs no edit, and two of its tests came out STRONGER, checking
every declared type where they previously checked one.

### Two corrections to the plan and census

1. **`STUMP_BELOW_ROOT` is NOT the type.** The census says it "needs renaming
   with the type". It is a member of `GridPlacementRejectReason` — a vocabulary of
   rejection reasons beside `KNOT_ABOVE_TIP` and `NO_HOST_SEGMENT` — raised by
   `anchorAutoPlacement.ts` and read by `useTrunkPlacement.ts`. Both sides share
   the literal, so a type rename leaves it consistent, and the message it renders
   ("lower than the anchor root") describes geometry. It is the same class as
   `ANCHOR_PRESET`: the word, not the type id. Renaming it would be a defect.

2. **The golden masters are not rename-INVARIANT, and that is correct.** The
   recorded JSON stores every entity's `typeId` as a value, so renaming a type
   legitimately changes every recording that leaves one of its entities in the
   state. Under the probe, nine of the ten cascade goldens differ for exactly this
   reason — and `cascade-remove-anchor` does not, because the anchor is gone from
   its output. This is the store asserting what it stamps, not a stale literal. The
   plan's "goldens stay byte-identical" is a statement about the REFACTOR (they
   prove the conversions changed no behaviour, and they pass unchanged), not about
   an actual rename.

### The per-type cost, as a floor

`anchor` needed **seven test files** and **one production file** (the renderer
barrel). That is the smallest type, so treat it as a floor. Two things make the
others larger: `branch` writes itself into identifiers (`branchId`,
`branchPlacement`) that no rename can derive, and the per-type fixture tables that
anchor could build from descriptor facts are richer for types with more declared
shape.

### How to re-run the acceptance

```
python ../lysdiag/tools/rename-probe.py anchor --new anchory
```

It renames both naming points, the type's folder and the three names derived from
it (folder, `<Folder>Renderer.tsx`, `<id>Registration.ts`), REGENERATES both
generated barrels, runs `tsc` and the suite INCLUDING the goldens, then restores
everything and verifies the restore. Read its docstring before trusting a number
from it: a probe that renames only one naming point, or that guesses the
collection plural, or that skips the folders, manufactures errors that do not
exist — which is how an earlier `remaining-worklist.py` reported 167 where the
honest figure was 10.

---

## The rename happened: the type is now `stump`

Everything above is the plan as written while the type was still called `anchor`.
It was carried out, and this is what it cost.

### The two hazards the plan did not predict

Both were found by loading a scene in the app, not by any test or the compiler.

1. **The detail-renderer prop name.** `SupportRenderer.renderDetailFor` passes a
   renderer its entity under a COMPUTED key -- the descriptor's `singular` -- so
   TypeScript cannot check that the component destructures the same name. After
   the rename the descriptor said `stump` and `StumpRenderer` still read `anchor`:
   the prop was `undefined` and the scene crashed at draw time, with 0 tsc errors
   and the whole suite green. Now asserted by `supportTypeFolders.test.ts`.

2. **The payload collection key.** A support payload stores its entities under a
   collection name (`anchors:`), so a scene saved before the rename loaded with
   those entities simply absent -- no error, just missing geometry. Measured on
   the `criosphinx` export fixture: six meshes and ~1,100 vertices gone.
   `src/supports/importMigrations.ts` now rewrites both the former key and the
   former `typeId`/`origin` stamps, driven by a `renamedFrom` declaration on the
   descriptor so the migration itself names no type.

Neither is the kind of thing a literal-count metric can see, and both are the
reason the plan insists on a manual place/render/export/undo check.

### What the rename actually needed

- **Both naming points**: `types.ts` (the entity interface, `StumpFields`, the
  `SupportFieldsByType` key, the `SupportCollectionByType` key) and
  `supportTypeRegistry.ts` (the descriptor id, the ten per-type flag tables, the
  collection map, the removal shape).
- **The type's own folder**: `Anchor/` -> `Stump/`, and its three DERIVED names
  (`StumpRenderer.tsx`, `stumpRegistration.ts`, and the folder itself), which
  `supportTypeFolders.test.ts` and the registrations generator both derive from
  the id.
- **The collection key** `anchors` -> `stumps`, everywhere `SupportState`, the
  wire format, the clipboard payload and the raft-footprint input name it.
- **The origin value**: the near-plate origin was spelled after the type, so it
  moved too -- as its own migration, and its comparison is now derived through
  `NEAR_PLATE_ORIGIN` rather than spelled, because an origin key does NOT follow
  `SupportTypeId` and a stale comparison would fail silently.

Not renamed, because they are different vocabularies that merely share the word:
the sizing preset (`'anchor'` beside `'detail'`/`'structure'`, persisted in user
settings), geometric anchoring (`sortAnchor`, `lowAnchor`, `resolveShaftAnchor`,
`socketAnchorRef`, `anchorZ`), the floating-panel layout map
(`LayoutProfile.anchors`), the lucide `Anchor` ICON in the top bar, and
the rejection-reason vocabulary (`STUMP_BELOW_ROOT` beside `KNOT_ABOVE_TIP`).

### Cost, measured

**53 files** carried the word; **~20** needed a real change beyond the rename
itself; two of those were the hazards above. The test scaffolding dominated:
seven files built type-keyed fixtures, and the fix in each was the same shape the
plan prescribes -- pin the value, derive the name.

### Verification

`python ../lysdiag/tools/rename-probe.py stump --new stumpx` now reports
**0 tsc errors**, with only the golden `typeId` recordings differing (the store
asserting what it stamps). Before the work the same probe on `anchor` reported 53.
