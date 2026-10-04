# Support System

The largest subsystem in the frontend. `src/supports/` owns everything from the geometry of a single contact tip to the interaction that places a whole forest.

## Where things live

| Directory | Holds |
| --------- | ----- |
| `SupportPrimitives/` | The reusable pieces every type is built from — Roots, Shaft, Joint, Knot, ContactCone, ContactDisk. Each with its renderer and, where it pays, an instanced group |
| `SupportTypes/` | One directory per placeable type — Trunk, Branch, Leaf, Twig, Stick, Brace, Kickstand, Stump — each with a renderer and usually a builder |
| `PlacementLogic/` | Where a support is allowed to go: pathfinding, collision, solvers, grid policy |
| `interaction/` | Hover, selection, snapping, and the routing that decides which controller owns a click |
| `rendering/`, `Renderers/` | Shared render assembly and batched/instanced groups |
| `autoSupport/` | Automatic placement: candidate generation, coverage, Poisson spacing, near-plate bands, physics-driven sizing |
| `autoBracing/` | Automatic brace generation, plus the mesh geometry store used for clearance |
| `Grid/`, `Curves/`, `Rafts/` | Grid lattice, curved segments, raft geometry |
| `history/` | The typed history façade for support actions |
| `Settings/` | Persisted support and raft settings, and the anatomy preview |

Four files at the root carry the weight: `supportTypeRegistry.ts` (what every type IS — see below), `types.ts` (every entity interface plus `SupportState`), `state.ts` (the store and serialization), and `SupportRenderer.tsx` (the scene render loop).

## What each piece is

The vocabulary — and the distinctions people get wrong, like knot versus joint or brace versus kickstand — is in [Anatomy of Supports](../reference/support-anatomy/index.md), one page per piece. The domain glossary in `CONTEXT.md` records the terms to avoid and where the code spells them differently.

## The contracts that bite

**Partly registry-driven.** `supportTypeRegistry.ts` is the single source of truth for what a support type *is*: `SUPPORT_TYPES` holds one descriptor per type carrying its id, label, `SupportState` collection, selection category, history action pair, and a set of behaviour flags. Anything that needs "every support type" or "every entity collection" derives it from there rather than listing types by hand.

The registry deliberately describes identity, not behaviour. It holds no renderers, builders or placement logic — adding those would turn a mechanical refactor into a rewrite. Where the store must call back into a type (updating an entity, sizing a knot on a tapered shaft), the registry declares a *slot* that `state.ts` fills at load, which avoids an initialisation cycle: `state.ts` calls `createEmptySupportCollections()` while the module is still evaluating.

Three shapes are acceptable when a piece of code needs type-specific behaviour, and one is not:

- **Derived** — loop over `SUPPORT_TYPES` or a key list. Preferred.
- **Declared** — a property on the descriptor, so the type is named once at its definition.
- **Subtracted** — `.filter(id => id !== 'trunk')`. Rejected: a new type silently joins or skips the set, which is the failure the registry exists to prevent.

**Adoption is partial.** `npm run scan:support-types` reports where per-type
references still sit — run it rather than trusting a number written here.
`state.ts` also keeps `@deprecated` per-type add/update/remove wrappers
(`addTrunk`, `removeBranch`) alive until their callers move.

What the registry has taken over: collection key lists, `initialState`, the modelId and shafted-collection walks, the updater and knot-diameter slots, root ownership, removal cascades and their history payloads, segment endpoint resolution, contact-bridge construction, placement-surface marking, shaft and joint batching, selection-category resolution, the delete gate, and the renderer's per-type detail table. What remains hand-wired: export reconstruction, per-type builders in the auto-placer, and parts of the interaction manager.

See [Adding a New Support Type](support-type-extension.md) for which steps are registry-driven today.

**Two rendering paths must agree.** Unselected straight geometry renders through instanced groups (`InstancedShaftGroup`, `InstancedJointGroup`, `InstancedRootsGroup`, `InstancedContactConeGroup`); selected and edited geometry renders individually. Both paths must produce the same hover and click semantics, or a support behaves differently depending on whether it happens to be selected.

**The proxy path splits hover from click.** Outside support mode every model's supports draw through `SupportProxyMeshLayer`, which is batched into four instanced meshes. Hover, clicks and drag starts are answered by one invisible box per model (`computeProxyHoverBoxes`), not by the batches: R3F raycasts every instance of every mesh carrying a pointer handler, so a per-instance hit costs O(supports) per pointer move and per click. Hover and selection both resolve a model, which is all they ever needed: the hover tint and the selection colour cover a whole model's supports. The marquee is unaffected because it needs Shift and the model drag bails on Shift. If you add a pointer handler to an instanced batch, you have reintroduced the O(supports) raycast.

**A selection rides on per-instance colours.** The batches hold every visible model's primitives and are laid out from the support state, not from the selection. A selected model's instances are recoloured in place (`instanceColor` on the four groups, a colour attribute on the merged curved-shaft tubes), which is why selecting every model on the plate costs a colour pass rather than one overlay per model. The colour pass is a separate layout effect from the matrices: a selection must not re-derive every instance matrix to change a colour. The merged tube mesh has one material, so it takes its colours per vertex; a caller that passes no `instanceColor` keeps the material colour and the batches behave exactly as before.

**The world layer hides an excluded model instead of dropping it.** The active model's supports are drawn by the layer attached to its group (so they follow a live transform), and the world layer used to leave them out of its batches. It now keeps them and zero-scales their instances (`isHidden` on the four groups), so making a model active costs the instances that changed state rather than a full re-layout of the plate. Curved shafts are the exception: a merged tube cannot hide one shaft, so the world layer takes those from the visible set and merges them again, which is cheap because each shaft's sweep is cached. A layer with a `modelFilterId` (the ghost and preview ones) still filters its geometry, because it draws one model by definition.

**A batch layout is ~0.1 us per instance, and it is paid per re-layout.** The four groups derive a matrix per instance whenever their arrays change (a support edit, or the active model moving between the world layer and its own attached layer). Keep the arrays stable when only a colour or a visibility changes, and hoist scratch objects in any helper the layout calls: minting a `Vector3` per instance per pass cost more than the maths in the cone batch.

**A proxy geometry that will be raycast needs a bounds tree.** `src/utils/bvh.ts` installs three-mesh-bvh's accelerated raycast globally, and a mesh whose geometry has no `boundsTree` falls back to the plain per-triangle test — paid once per visible mesh on every pointer move. The raft proxy geometries build one (`withBoundsTree`); the instanced batches cannot (three-mesh-bvh does not accelerate `InstancedMesh.raycast`), which is why their hover does not go through them.

**Knots must survive topology edits.** A knot persists its host shaft id, its normalized position along that shaft (`t`), and a world position derived from the host. Any change to shaft topology has to route through the paths that recompute knot placement — otherwise attachments silently drift or detach.

**Cascades are one history action.** Deleting a trunk rehosts or removes its dependents; that whole cascade is a single entry with before/after state, so undo restores a consistent graph rather than half of one. See [History and Undo/Redo](history-and-undo-redo.md).

## Multi-support settings

`applySettingsToSelectedSupports` in
`src/supports/Settings/applySettingsToSelectedSupports.ts` is the mutation path
for editing settings when one or more supports are selected. It reads the
current support selection, resolves every selected support to its editable
target, and batches all store mutations into one notification. When no
multi-selection exists, it falls back to the primary selected support.

### Profile field limits

`SUPPORT_PROFILE_LIMITS` (`src/supports/Settings/defaults.ts`) holds the sane
range of every General-tab profile field (`tip`, `shaft`, `roots`). The store
applies it through `clampProfileFields` on **every** write — the tab, a preset, an
imported scene and a plugin call all pass through it — so no path can hand a
negative or absurd dimension to the geometry builders. The same table supplies
the inputs' `min`/`max`, which also switches `NumberInput` to a pattern that
cannot start a negative value.

Zero is a legal limit for a height that may mean "no feature" (root disk/cone
height); diameters floor just above zero because a zero-radius disk or cone has
no usable normal. Upper bounds are generous — they catch a stray digit, not model
a printer. A new General-tab field is not protected until it is in that table and
clamped in `clampProfileFields`.

The settings sidebar shows the last selected support's values. Changing a value
applies those settings to the complete selection. The sidebar captures one
before/after support edit snapshot around the editing session, so undo restores
the whole selection in one step. Selection controllers must therefore keep a
primary selected support alongside the selected-ID set; clearing the primary
representative makes the sidebar non-editable even when IDs remain selected.
Shift-click toggles one support without disturbing the rest of the set. Detailed
primitive renderers must defer to the parent support while a multi-selection is
active: a normal click replaces the set with that support, while Shift-click
toggles only that support. Selecting a shaft, joint, knot, or contact cone in
either case would clear the support selection set.

## Placing supports

- By hand: modifier keys choose the family, the first click's target chooses the type — [Support Placement Modifiers](../reference/support-placement-modifiers.md).
- Automatically: `autoSupport/` generates candidates from island analysis and overhang regions, then sizes and places a forest. Gated behind an experiment.

## The placement guide line

Hovering a model in Support mode marks the band where the tip will land: the
intersection of the horizontal plane at the hovered point's height with the
model. Dragging a tip drives the same plane from the drag's hit point, which is
what tips get levelled against when several of them have to meet the model at one
height.

The plane lives in `supportPlacementGuideStore` (`src/components/scene/SceneCanvas/`).
It has two writers, `handleSupportHover` in `SceneCanvas` for model hover and
`useContactDiskDragSession` for a tip drag, and they do not share a render pass:
while `isContactDiskHudDraggingActive()` the hover path leaves the plane alone, so
a drag cannot fight the hover's ray for the same pointer.

Only the store's "is the plane set" flag is subscribed to (by `SceneCanvas`, to
mount the overlay); the Z is read imperatively every frame by `StlMesh`, which
writes the `uPlaneZ` uniform. The split is deliberate. The Z follows the pointer,
so carrying it in render state means either a scene re-render per pointer move or
a deadband on the value — and a deadband steps the line by `z / tan(tilt)` of
contour travel on screen, which is pixels on a shallow face and nothing on a
steep one.

The stripe itself is measured along the surface: distance to the plane's contour
divided by the surface's tilt against the plane. A face lying in the plane has no
contour and gets a faint wash instead of a stripe as wide as the face. The stripe
width is half the contact diameter of the tip being placed.

## Related pages

- [Grid and Branching](grid-and-branching.md) — grid node ownership and attachment
- [Support Pathfinding V3](support-pathfinding-v3.md) — the routing solver
- [Raft Geometry](raft-geometry.md) — the base derived from support roots
