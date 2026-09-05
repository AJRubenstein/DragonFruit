# Backlog and Known Gotchas

A home for temporary rules, tradeoffs, gotchas, and desired architectural
directions that `AGENTS.md` references tersely. When `AGENTS.md` points here,
this page is the fleshed-out explanation. Add entries here when a rule is too
long for `AGENTS.md`, is expected to be lifted once an upstream change lands,
or is a known refactor we intend to do.

## Lingui + React Compiler: interpolating translations

**Do not** add interpolating `msg` translations inline inside a React component
or hook:

```ts
msg`${minutes} minutes`;   // ❌ inside a component/hook
```

React Compiler renames the interpolated locals in production builds
(`minutes` → `minutes_2`), which desyncs the message id from the compiled
catalog — production then renders the placeholder raw (`{minutes_2}`). Dev looks
fine and hides the bug.

**Rule:** translations that interpolate values live in **module-scope helper
functions** (e.g. the duration formatters in `src/app/page.tsx`), which React
Compiler leaves untouched.

**Temporary until:** Lingui moves to a Babel macro ordered before React Compiler.

## In progress: make the support system registry-driven

`src/supports/supportTypeRegistry.ts` **exists** and is load-bearing: one
descriptor per type, and every "for each support type / collection" walk derives
from it. `SupportState`'s collections, the modelId and shafted walks, root
ownership, the updater and knot-diameter slots, and several behaviour decisions
that used to be hardcoded type names now come from there.

**Adoption is partway.** Measured by `npm run scan:support-types`: **11,008
hand-written type references across 147 files**, down from 12,164, and 950
production lines lighter than `dev` across `src/supports/`. History handlers,
registration slots, the support primitives and most of `state.ts` are converted;
`SupportRenderer.tsx` (1,598) and auto-placement (1,270) are not. Adding a type is therefore still mostly manual — see
`dev/support-type-extension.md`, which marks each step.

**Remaining goal:** move the rest of the per-type threading behind the registry,
so the renderer, interaction manager and export derive their behaviour rather
than enumerating types. Deliberately out of scope for the registry itself:
renderers, builders and placement logic. It describes what a type IS, not how it
draws — putting behaviour in it turns a mechanical refactor into a rewrite.

**Do not do this refactor while adding a support type.** Still true, and still
the point: converting a hand-wired path and adding a new type at once means a
behaviour change and a migration land in the same diff, and neither can be
reviewed or bisected cleanly. Add the type through the current hand-wired path,
then convert separately. Registry work should land on its own with no behaviour
change.

**The rule that matters.** When code needs type-specific behaviour, derive it
from the registry or declare it as a descriptor property. Never subtract
(`.filter(id => id !== 'trunk')`): a new type silently joins or skips the set,
which is the exact failure the registry exists to prevent.

Known remaining hand-written lists worth converting:

- `canDeleteSelection` in `useSupportInteractionManager.ts` enumerates seven
  categories and omits `anchor` — a live bug, and a textbook case for a flag.
- The 16 `SUPPORT_ADD_*` / `SUPPORT_REMOVE_*` constants imported into the
  registry must be kept in sync with `SupportTypeId` by hand. Deriving them from
  the type id is possible but needs checking first: history action strings may be
  persisted in saved projects, and changing one would break loading old files.

### Bugs found while converting

Each was a hand-written type list that disagreed with the registry. Fixed
unless marked otherwise; recorded because the same shape will recur.

| bug | where | status |
| --- | ----- | ------ |
| Anchor joints could not be dragged — three separate lookups omitted anchors | `useJointInteraction`, `JointGizmo`, knot host map | fixed |
| Anchors could not host a draggable knot | `useKnotInteraction` | fixed |
| Stale-cache host recovery searched only sticks | `useKnotInteraction` | fixed |
| Knot-move history said "Move support knot" for trunk, anchor and kickstand | `KnotGizmo` | fixed |
| Kickstand undo restored nothing generically | `state.ts` | fixed |
| Trunk and kickstand `roots: 'root'` singular dropped a root on removal | `SUPPORT_REMOVAL_SHAPES` | fixed |
| Sidebar accepted types with no tool | settings | fixed |
| Settings fell through to "leaf" for an unhandled kind | `applySettingsToSupportTarget` | fixed |
| A knot on a kickstand shaft loaded with `diameter: NaN` — normalization synthesised a segment carrying no diameter | `normalizeLoadedKnotAndLeafGeometry` | fixed |
| A leaf on an anchor- or kickstand-hosted knot stayed behind when its model moved — the segment/modelId index covered four of six shafted types | `transformSupportsForModel` | fixed |
| Scene-batched branches passed only `modelId` to `isModelVisible`, so a branch with none of its own could not resolve through its parent knot and was hidden under any model filter. Verified mechanically (false -> true); whether such branches occur in practice is unconfirmed, though four other sites defend against it | `SupportRenderer` | fixed, latent |
| Debug origin colouring painted braces, twigs, sticks and kickstands grey ("no origin") though they record no origin at all — pre-existing, present on `dev` | `SupportRenderer` `resolveSceneSupportColor` | fixed |
| `canDeleteSelection` omits `anchor` | `useSupportInteractionManager` | **open** — §7 |
| Nested-brace reachability clauses are dead code, subsumed by `touchedSegmentIds` | `transformSupportsForModel` | fixed |
| Shaft stub length is 10 for trunk, 5 elsewhere; four other sites use 10 | `shaftFallback`, `resolveSegmentEndpoints` | **open** — inherited drift, needs a decision |
| `TwigRenderer` omits `isInteractable` where the other three pass it | `TwigRenderer` | **open** — harmless while the default is true |
| The import wire format still carries the `{kickstand, root, hostKnot}` bundle | `loadFromImportFormat` | **open** — ⚠️ wire format |
| Type selection by hardcoded threshold, each duplicated at a second site: twig/stick by span, anchor/trunk by tip height | `BranchPlacementController:609`, `useTrunkPlacement:186/496`, `gridPlacement:500` | **open** — §8, should be declared ranges on the descriptor |

Two of these were invisible to the whole suite AND all 22 goldens
(`transformSupportsForModel`'s reachability walk). Passing tests are not
evidence a flag is covered — see AGENTS.md trap 4.

## Desired: route every native call through the IPC bridge

`src/features/slicing/tauri/nativeSlicerBridge.ts` is documented as the seam for
Tauri commands (`dev/tauri-ipc-bridge.md`), and it is where new wrappers belong.
It is not yet the only path: 84 direct `invoke(...)` call sites live in 29 other
modules, nine of them React components, reaching ~70 of the 107 native commands.

**Why it matters:** the command name is a plain string on the TS side, so nothing
type-checks it against Rust. Centralizing the calls is what would make a single
rename verifiable instead of a grep-and-pray.

**Goal:** every native command reached through a named wrapper, so the bridge is
the full inventory of the contract and a boundary check (in the style of
`scripts/check-plugin-boundaries.mjs`) can enforce it.

Do not attempt the migration as part of unrelated work — move a call site into
the bridge when you are already editing it, and leave the rest. The bulk move is
its own change, with no behavior difference.

## Desired: native twin optimization plan

A roadmap note, not a current runtime contract — previously
`dev/native-twin-optimization-plan.md`.

**Goal:** move toward a native scene twin in Rust so the frontend can send small
state diffs instead of repeatedly staging large geometry buffers during slicing
and export.

**Key constraints:** support editing in the frontend must stay smooth; support
fidelity must remain exact; the work should land after the stable beta path is
complete.

**Architecture direction:** frontend owns live interaction and preview; backend
owns canonical slice-ready state; model assets are loaded by identity rather
than resent repeatedly; support changes are transmitted as graph diffs with
stable IDs and resolved coordinates.

**Success criteria:** less bulk geometry IPC; better support-heavy export
performance; revision parity between frontend and twin before slicing/export.
