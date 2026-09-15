# Closing out the rename goal

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

## 1. The 30 production sites

```
7  src/supports/state.ts
3  src/components/controls/AutoSupportPanel.tsx
2  src/supports/interaction/useSupportRenderLookup.ts
2  src/supports/PlacementLogic/supportClipboard.ts
2  src/features/scene/voxl/codec.ts
2  src/features/scene/useSceneCollectionManager.ts
2  src/features/export/logic/supportExportReconstruction.ts
2  scripts/dragonfruit-ts-cli.ts
1  each: autoPlace, SupportRenderer, useKnotInteraction, useJointInteraction,
       JointGizmo, BezierGizmoManager, ExportManager, ModelSupportsModal
```

Read each one before converting: a site that names a type because the type is
genuinely its subject stays, and moves into that type's folder if it does not
already live there. The pattern for moving one is the proxy and marquee seams
(`proxyGeometry/seam.ts`, `marqueeGeometry/seam.ts`).

`state.ts` at 7 is the largest and the last one to touch.

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
