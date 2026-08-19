# Support Placement Modifiers

In support mode, held modifier keys decide *which kind* of support a click places. The modifier chooses a **family**; the target of the first click then decides the type within it.

## Cheat sheet

| Held | First click on… | Places |
| ---- | --------------- | ------ |
| *(nothing)* | model | Trunk (with Roots) |
| `Alt` | model | Branch, or a Twig/Stick if the second click is also on the model |
| `Alt` | support shaft | Brace |
| `Ctrl` | support shaft | Kickstand |
| `Ctrl`+`Alt` | model | Leaf |

Bindings are configurable — these are the defaults from `SUPPORTS` in `src/hotkeys/hotkeyConfig.ts` (`BRANCH_PLACEMENT`, `LEAF_PLACEMENT`, `KICKSTAND_PLACEMENT`). A contact below 5 mm gets an [anchor](support-anatomy/anchor.md) rather than a trunk, decided by height, not by modifier.

## How a family is chosen: exact match, not precedence

It is tempting to read the table as a precedence ladder — "`Ctrl`+`Alt` is more specific, so it beats `Alt`". That is **not** the mechanism, and the difference is observable.

`isSupportPlacementBindingSatisfiedByModifierState` requires the number of modifiers held to **equal** the number the binding declares, and every declared modifier to be down. So a binding matches only on an exact set:

- `Alt` alone satisfies the branch family (one modifier, and it is Alt).
- `Ctrl`+`Alt` satisfies the leaf binding only — the branch family needs *exactly* `{alt}`, and two keys are held.
- **`Shift`+`Alt` satisfies nothing.** Under a precedence reading you would expect Alt to still win; it does not, because the sets differ in size.

At most one family can therefore match. The order the intent resolver checks them in (leaf → branch → kickstand) is a formality, not a tie-break. Key press order never matters: only the set of modifiers down at the moment of the click.

## Once a flow starts, releasing the key does not cancel it

`resolveSupportPlacementRouting` checks the in-flight state (`braceAwaitingEnd`, `leafAwaitingBase`, `branchAwaitingBase`) **before** it looks at live modifiers, and the resolved intent always carries `releaseShouldCancel: false`. So after the first click has committed a family, letting go of the modifier leaves the placement waiting for its second click rather than dropping it.

## Where this lives

- `src/hotkeys/hotkeyConfig.ts` — the bindings
- `src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts` — modifier set → family
- `src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts` — family + click target → which controller owns the interaction
- `src/supports/__tests__/supportPlacementHotkeyResolver.test.ts` — the matrix as tests

## Related

- [Hotkey System Reference](hotkeys.md) — the hotkey system itself
- [Anatomy of Supports](support-anatomy/index.md) — what each type is
- `dev/hotkeys.md` — rules for working on the hotkey system
