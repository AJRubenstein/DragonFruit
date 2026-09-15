# Closing out the rename goal

**Status: section 1 is IN PROGRESS (production 30 -> 16, four defects
found). Sections 2-4 not started.** The plugin and test halves are untouched.

The hotspot plan is finished. This one answers the question the whole refactor
exists to answer, and it is answered by measurement rather than by counting
references: **can a type be renamed by editing the registry alone?**

## The measurement

Renaming `stick` -> `stickz` at both naming points (`supportTypeRegistry.ts` and
`types.ts`) and compiling: **152 errors.** They are not one problem:

| where | errors | verdict |
| --- | ---: | --- |
| tests, fixtures and goldens | 83 | **the real remaining work** |
| plugins (`lys-import`, `chitubox-import`) | 26 | submodules, their own PRs |
| production `src/` and `scripts/` | 30 | **the real remaining work** |
| `SupportTypes/Stick/` | 13 | exempt by design -- a type may name itself |

So the honest headline is **113 sites, not 152**, and the two that matter are
83 in test scaffolding and 30 in production.

Reference counts do NOT measure this. Stick sits at 81 references and stump at
36, but a rename breaks 113 places: the counts measure how much code SPELLS a
type, and the probe measures what a rename actually breaks. Run the probe.

## 1. The 30 production sites -- IN PROGRESS, 30 -> 16

**The probe is mechanised**: `local-only/rename-probe.ts <type>`. It renames both
naming points, compiles, buckets the errors, and ALWAYS reverts. It reproduces
this plan's numbers exactly -- 152 total, 13 exempt, 30 production -- once it
edits the naming points competently. Four corrections were needed to get there,
each of which had been manufacturing errors: indented property keys, the
collection name as a KEY in `SupportEntityByCollection`, the optional
wire-format key (`sticks?: Stick[]`), and the default reading of "rename both".

### Done (30 -> 16), and four defects found on the way

Every one of these was invisible to the suite and the goldens, which is the
pattern this whole refactor keeps producing.

| site | what it was | outcome |
| --- | --- | --- |
| `ModelSupportsModal` | a hand-written knot-parent chain | **DEFECT**: it tested `trunks[parent]`, `branches[parent]`, `twigs[parent]`, `sticks[parent]` -- every one asks for an ENTITY by a SEGMENT id, so none could match. Measured: it included **0 of 317** knots. The modal's Knots group has always been empty. Now `modelIdOfParentShaft`, which includes all 317. |
| `useSupportRenderLookup` | eight collections applied by hand while `buildInputDelta` derives ten | **DEFECT**: `stumps` and `kickstands` deltas were built, posted to the worker, and dropped. The worker kept stale data. Now walked over `SUPPORT_COLLECTION_KEYS`. |
| `ExportManager` | nine collections cleared by hand under `!includeSupports` | **DEFECT**: `stumps` was not among them, so an export asked to omit supports shipped every stump. Now walked. |
| `supportExportReconstruction` | `ScopedSupportPayload` named nine collections while `trunks` was already derived | Derived as a mapped type over `SupportCollectionKey` -- the ten keys ARE that set. Fourteen imports became unused. |
| `supportClipboard` | `extractSupportClipboardPayload` built `owned` by walking the registry, then re-extracted seven named locals and used none | Seven dead locals and five dead type imports removed. |
| 5 files | `import { … Stick … }` with no use | **Dead imports, already flagged by ESLint.** None of the five is inside `lint-clean-dirs.json`, so the gate never saw them; a rename would have been the first thing to notice. |
| `state.ts` | the merge's copy-on-write shell listed ten collections | Walked. A type added to the registry would have had its imported entities written into the PREVIOUS state in place. |
| `state.ts` | the merge's debug readout listed ten counts | Walked. |
| `SupportRenderer` | the clipping effect depended on ten collections by hand | `state` alone -- the same lesson already recorded for the snap-target memos. |

### Remaining (16), and what each needs

- **`state.ts` (4)** -- the import remap chain. Each type's body remaps DIFFERENT
  fields (a twig its two disks, a stick its two cones, a trunk neither), so these
  are per-type bodies rather than a list. The plan's own rule: not mechanical.
- **`AutoSupportPanel` (3)** -- six per-type delete loops that are uniform
  ("delete this model's entities") interleaved with per-type extras (trunks
  delete their root, braces and kickstands have knot logic). Deriving the uniform
  part needs a descriptor flag marking which types the regenerate pass clears,
  because a `.filter` is a subtraction and the rules forbid one. **A flag is the
  right answer; it is a decision, not a rename.**
- **`voxl/codec.ts` (2), `supportExportReconstruction` (2)** -- the same
  "materialise the wire format from a registry-keyed set" shape, twice. Wants one
  shared builder, which the next pass should add rather than duplicating a third
  time.
- **`useSceneCollectionManager` (2)** -- the clipboard payload's collection keys.
- **`autoPlace` (1)** -- `ForestReport`'s `stumpCount` / `leafCount` /
  `branchCount` / `stickCount` / `twigCount` are NAMED fields of a typed report.
  The type is the subject here; converting would change the report's shape and
  every consumer. **Stays, by the plan's own test.**
- **`scripts/dragonfruit-ts-cli.ts` (2)** -- the script is operating on a stick
  (straightening its segments, adding one). The type is the subject. **Stays.**

## 2. The 83 test sites -- the bigger half, and the one with a rule

Concentrated in `supportClipboardRemap.test.ts` (18), `autoPlace.test.ts` (12),
`originalMaxConnectedDiameter.ts` (6), `autoBracingHotkey.test.ts` (5),
`loadFromImportFormatNormalization.test.ts` (5), `supportDesignationSlicing.test.ts`
(5), plus the goldens' own fixtures.

**These are not a lower priority than the production sites.** A fixture that
spells a collection key by hand is exactly what made three of this refactor's
defects invisible: the stump with an empty `segments` array hid an
un-toggleable stump, the fixture with no stumps hid a payload that read as empty,
and the stump sitting inside the model hid it being absent from the bounds.

The rule the converted tests already follow: build the fixture from what the type
DECLARES, and key rows on a collection rather than a type id. See
`entityTypeId.test.ts` and `removalRoundTrip.test.ts`, which are already derived
this way and produce no rename errors.

## 3. The 26 plugin sites -- not this repo's to fix

`lys-import` (17) and `chitubox-import` (9). Both are submodules; a change there
is its own PR and its own pointer bump. `lys-import`'s `HostEntry` union
hand-writes the type names and is the known one.

**Do not edit them from the parent.** Record them and leave them.

## 4. Two open findings this refactor surfaced and did not resolve

Both are in `support-registry-findings.md` and both are behaviour decisions, not
renames:

- **The trunk stub is 5mm in the proxy layer and 10mm in the descriptor.** The
  proxy view and the export/slice paths disagree for a trunk with no top joint
  and no contact.
- **`syncContactConeDiameters` covers two types where four qualify.** Deriving it
  would add stick and stump, changing whether their cone bodies resync.

Decide these before anyone derives the code around them, or the decision gets
made silently by a refactor.

## How to run the probe

```
# rename BOTH naming points, or the result is artifact
#   supportTypeRegistry.ts : the id and its collection key
#   types.ts               : the entity interface and SupportState field
rm -f tsconfig.tsbuildinfo
npx tsc --noEmit -p tsconfig.json 2>&1 | rg "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn
# then REVERT -- it is a probe, not a commit
```

Renaming one naming point and not the other collapses the derived entity mapping
to `unknown` and manufactures errors far from any real site. Renaming only
`types.ts` has produced 57 phantom errors before.

## Done is

The probe reports only `SupportTypes/<Type>/` and the plugins. Every other error
is a place the rename still has to reach by hand.

## Gates

Delete `tsconfig.tsbuildinfo`, then `npx tsc --noEmit -p tsconfig.json`, the full
suite (960 src, 82 plugins), all 44 goldens (support 16, export 16, slice 12),
`check:docs`, `check:lint`, and a real `next build`.

On Windows: `npm test` does not expand its glob and reports success having run
nothing. `check:lint` dies with `spawn npx ENOENT`; lint the 43 whitelist
directories directly. `rm -f x && tsc` in a cmd.exe eval skips the `tsc` silently
-- run gates through bash.
