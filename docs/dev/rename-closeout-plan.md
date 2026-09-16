# Closing out the rename goal

**Status: sections 1 and 2 are DONE. 152 -> 70, production 30 -> 11, tests
75 -> 12. Nine defects found, every one invisible to the suite and the goldens.**
Section 3 (plugins) is recorded and deliberately untouched; section 4 stays open.

The probes' own numbers are the record: `npm run scan:rename stick`.

The hotspot plan is finished. This one answers the question the whole refactor
exists to answer, and it is answered by measurement rather than by counting
references: **can a type be renamed by editing the registry alone?**

## The measurement

Renaming `stick` -> `stickz` at both naming points (`supportTypeRegistry.ts` and
`types.ts`) and compiling: **152 errors.** They are not one problem:

| where | at the start | now | verdict |
| --- | ---: | ---: | --- |
| tests, fixtures and goldens | 83 | 12 | **done** -- the rest are type-subject sites |
| production `src/` and `scripts/` | 30 | 11 | **done** -- the rest are type-subject sites |
| plugins (`lys-import`, `chitubox-import`) | 26 | 34 | submodules, their own PRs |
| `SupportTypes/Stick/` | 13 | 13 | exempt by design -- a type may name itself |

So the honest headline was **113 sites, not 152**. Ninety-one of them are gone.
The 23 left are the plugins, which are not this repo's to edit, the type's own
folder, and sites where the type is genuinely the subject.

**The plugin count reads 34 rather than 26 because the probe got better**: an
optional wire-format key (`sticks?: Stick[]`) was not being renamed, so plugin
errors were undercounted. 34+75 = 26+83 = 110 either way -- a counting boundary,
not a discrepancy.

Reference counts do NOT measure this. Stick sits at 81 references and stump at
36, but a rename breaks 113 places: the counts measure how much code SPELLS a
type, and the probe measures what a rename actually breaks. Run the probe.

## 1. The production sites -- DONE, 30 -> 11

**The probe is mechanised**: `npm run scan:rename <type>` (`scripts/rename-probe.ts`),
beside the other two scans, so it travels with the branch. It renames both
naming points, compiles, buckets the errors, and ALWAYS reverts. It reproduces
this plan's numbers exactly -- 152 total, 13 exempt, 30 production -- once it
edits the naming points competently. Four corrections were needed to get there,
each of which had been manufacturing errors: indented property keys, the
collection name as a KEY in `SupportEntityByCollection`, the optional
wire-format key (`sticks?: Stick[]`), and the default reading of "rename both".

### Done (30 -> 11), and the defects found on the way

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

### Remaining (11), and what each needs

Resolved since, each with what it took:

- **`voxl/codec.ts` and `supportExportReconstruction` (4)** -- the same
  "materialise the wire format" shape, twice. Now one shared builder,
  `importPayloadCollections`. It walks `IMPORT_PAYLOAD_COLLECTION_ORDER`, written
  out because **the key ORDER is part of the wire format**: the export goldens
  compare serialised bytes and the manager hashes them, so walking the registry's
  order (`SUPPORT_COLLECTION_KEYS`, primitives first) would silently reorder every
  export. A new test holds that list against the registry and fails when a
  collection is removed from it -- which is how the walk stays safe.
- **`useSceneCollectionManager` (2)** -- resolved, and it was a DEFECT. The
  clipboard-bounds walk missed stumps (see section 2). Now derived from
  `hasSegments` and `contactEndpointsFor`, with the radius field chosen by contact
  kind, since a cone keeps it in `profile` and a disk on the contact itself.
- **`AutoSupportPanel` (3)** -- **stays, and now precisely why.** The descriptor
  already carries `ownsRoot` (true for trunk and kickstand only), so the trunk
  exception IS derivable. What is not: the brace block finds braces through their
  KNOTS rather than their `modelId`, and the kickstand block deletes its root and
  host knot. Both are knot-graph logic, not per-type lists, and both are
  order-dependent inside a single React effect with no test. Deriving them is a
  change to which entities get cleared on regenerate -- a behaviour decision, not
  a rename. **The earlier note that a new descriptor flag is needed was wrong**;
  `ownsRoot` exists. The blocker is the knot logic.
- **`state.ts` (4)** -- the import remap chain. Each type's body remaps DIFFERENT
  fields (a twig its two disks, a stick its two cones, a trunk neither), so these
  are per-type bodies rather than a list. The plan's own rule: not mechanical.
- **`autoPlace` (1)**, **`scripts/dragonfruit-ts-cli.ts` (2)** -- the report's
  named count fields, and a script operating on a stick. **Stays**: the type is
  the subject.
- **`supportCollections.ts` (1)** -- its own `IMPORT_PAYLOAD_COLLECTION_ORDER`,
  which is the one deliberate place a payload key is named. Guarded by the test
  above.

## 2. The test sites -- DONE, 83 -> 12

Concentrated in `supportClipboardRemap.test.ts` (18), `autoPlace.test.ts` (12),
`originalMaxConnectedDiameter.ts` (6), `autoBracingHotkey.test.ts` (5),
`loadFromImportFormatNormalization.test.ts` (5), `supportDesignationSlicing.test.ts`
(5), plus the goldens' own fixtures.

**These are not a lower priority than the production sites.** A fixture that
spells a collection key by hand is exactly what made three of this refactor's
defects invisible: the stump with an empty `segments` array hid an
un-toggleable stump, the fixture with no stumps hid a payload that read as empty,
and the stump sitting inside the model hid it being absent from the bounds.

The rule: build the fixture from what the type DECLARES, and key rows on a
collection rather than a type id. See `entityTypeId.test.ts`, and
`src/supports/__tests__/helpers/typeCollections.ts` for the shared pieces.

### Done (75 -> 12)

**One more defect fell out of it: a payload's bounds rectangle missed stumps.**
`supportRectForPayload` expanded each contact and every segment joint for trunks,
branches, leaves, twigs, sticks and kickstands -- listed by hand, stumps absent.
A payload carrying one under-reported its extent. Measured against the old walk:
17 expansions, now 20, the three new ones exactly the stump's three, every
existing radius unchanged.

Converted:

- Twelve `SupportState` literals across nine files now spread
  `createEmptySupportCollections()`, which is what `initialState` itself does.
  Each listed nine keys by hand. `registryIsSingleSourceOfTruth.test.ts` already
  forbids new ones; it did not cover existing ones.
- Four `DragonfruitImportFormat` fixtures (`loadFromImportFormatNormalization`
  alone had five) spread a walked key set and fill rows through a type id -- so no
  key is spelled, and rows stay checked against the type that id names. A derived
  key written directly in the literal collapses the object to an index signature,
  losing that check, which is why the shared helper assigns by key instead.
- `supportSettleSeam`'s six-type list is the registry's settle-hook set;
  `cascadeEquivalence` derives a type with no edges rather than hand-picking one;
  `autoBracingHotkey` derives both panels from `hasAutoBracingHotkey`;
  `autoPlace`'s bridge counts come from `contactBridgeTypes()`.
- `supportClipboardRemap` and `originalMaxConnectedDiameter` now cover EVERY
  declared type rather than one hand-picked one. The first of these mattered: its
  source-id set named fifteen collections and missed `stumps` entirely, and its
  fixture carried `setCollection(payload, 'stump', [])`, so no stump row was ever
  checked.

### Remaining (12) -- all type-subject, the plan's stated exception

Nine are in the gitignored goldens, three in `src/`. Every one is a test whose
SUBJECT is a single named type, where the type id is the data the assertion is
about -- `coneBodyFollows` ("a leaf hosted on a STICK's segment"), `toggleSegmentCurve`
(a switch building one entity per shafted type from that type's own fields),
`removalRoundTrip`'s cascade cases. The plan's own test decides these: *is this
the type, or is this every type?* Converting them would assert the registry
against itself.

`originalMaxConnectedDiameter` shows the line. It is a verbatim per-type
reference implementation, so its subject was derived from a real registry fact --
the one type declaring a cone at BOTH ends -- rather than spelled, because a type
id passed as data is exactly what `check:support-literals` counts. Its remaining
per-type arms reach their collections through properties whose names are those
arms' own types; only the subject arm could not, because property access is a
name.

## 3. The 34 plugin sites -- not this repo's to fix

`lys-import` (25) and `chitubox-import` (9). Both are submodules; a change there
is its own PR and its own pointer bump.

**The whole of it is the wire format.** Every one of the 34 is either
`DragonfruitImportFormat`'s renamed key (`sticks` -> `sticksz`) or the renamed
exported entity type (`Stick`). Nothing else about the plugins breaks, so the
change any PR needs is mechanical and the same in both: read the collection
through `IMPORT_PAYLOAD_COLLECTION_ORDER`/`importPayloadCollections` from
`@/supports/supportCollections` and the entity through `SupportEntityFor<'stick'>`
from `@/supports/supportTypeRegistry`, rather than naming either.

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

The probe reports only `SupportTypes/<Type>/`, the plugins, and type-subject
sites. **It does now**: 70, being 13 + 34 + 12, plus the 11 production sites
`npm run scan:rename` still lists as the per-type residue described in section 1.

The plugin half is the only part of that which is real remaining work, and it is
work in two other repositories.

## Gates

Delete `tsconfig.tsbuildinfo`, then `npx tsc --noEmit -p tsconfig.json`, the full
suite (960 src, 82 plugins), all 44 goldens (support 16, export 16, slice 12),
`check:docs`, `check:lint`, and a real `next build`.

On Windows: `npm test` does not expand its glob and reports success having run
nothing. `check:lint` dies with `spawn npx ENOENT`; lint the 43 whitelist
directories directly. `rm -f x && tsc` in a cmd.exe eval skips the `tsc` silently
-- run gates through bash.
