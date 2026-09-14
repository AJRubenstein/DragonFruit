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

`ANCHOR_BELOW_ROOT` is the opposite case: it reads like geometry but IS the
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
is an `HTMLDivElement`, while `ANCHOR_BELOW_ROOT` reads like geometry and is the
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
