# AGENTS.md — `src/supports/`

Read this before touching anything in this directory. It exists because the same
mistake keeps recurring across sessions, in slightly different clothes.

## The one rule

**A support type is named in exactly one place: the registry.**

`supportTypeRegistry.ts` declares what every type IS. Everything downstream
derives from it. If you find yourself writing `'trunk'`, `'stick'`, `'leaves'`
or `Stick[]` anywhere else, stop and ask where that fact belongs — the answer is
almost always "on the descriptor".

This is not a style preference. There are **eight** support types — trunk,
branch, leaf, twig, stick, brace, anchor, kickstand — plus two primitive
collections (roots, knots) that are not types, giving ten collections in total.
A ninth type will be added eventually. Every hand-written list is a place that
ninth type silently joins or silently skips, and the failure is invisible: no
compile error, no test failure, just a feature that quietly does the wrong thing
for one type.

(Count them before quoting a number. "Nine types" is a persistent slip — it
comes from counting the ten collections and subtracting one primitive.)

## Three shapes, one of them wrong

When code needs per-type behaviour:

| Shape | Example | Verdict |
| ----- | ------- | ------- |
| **Derived** | `for (const d of SUPPORT_TYPES)` | Best. Add a type, it just works. |
| **Declared** | `descriptor.hasSegments` | Fine. The type is named once, at its definition. |
| **Subtracted** | `.filter(id => id !== 'trunk')` | **Never.** A new type joins or skips silently. |

Real examples that had to be undone: `id !== 'trunk' && id !== 'branch'` picking
snap types, `key !== 'trunks' && !== 'branches' && !== 'kickstands'` picking
self-contained shafts. Each became a declared descriptor flag.

Subtraction is the one that keeps sneaking back, because it always looks like the
smallest change. It isn't — it is a landmine with a delay fuse.

## What "in the registry" actually means

Declaring the *value* in the registry is only half of it. If the type is restated
elsewhere, you still have two sources of truth and nothing to keep them in sync.

**Wrong** — the shape is declared in the registry AND written out here. Rename a
field in the registry and this keeps compiling while undo breaks at runtime:

```ts
export function removeStick(id: string): { stick: Stick; knots: Knot[] } | null {
    return removeSupportEntity('stick', id) as { stick: Stick; knots: Knot[] } | null;
}
```

**Right** — the return type is derived, so a rename is a compile error at every
consumer:

```ts
export function removeStick(id: string) {
    return removeSupportEntity('stick', id);
}
```

Test yourself: **rename a field in the registry and run `tsc`.** If nothing
breaks, the link is not real and you have written the fact down twice.

## Traps that have actually bitten, in this order

1. **`SUPPORT_TYPES` is annotated, so its literals widen.**
   `readonly SupportTypeDescriptor[]` turns `id: 'trunk'` into `string`. Any
   `Exclude<>` check against it yields `never` and passes vacuously; nothing can
   be derived from it at the type level. This defeated an exhaustiveness check
   once and a derived return type later. Data you need literal types from goes in
   its own `as const` map (see `SUPPORT_REMOVAL_SHAPES`) — **do not annotate it**,
   however tidy that looks.

2. **`knots` and `roots` are primitives, not support types.**
   They have no descriptor and are absent from `SUPPORT_TYPES`, yet
   `Knot.parentShaftId` is the busiest edge in the dependency graph. A walk over
   `SUPPORT_TYPES` alone misses most of what a cascade should reach. Use
   `SUPPORT_GRAPH_NODES` when you need every collection that participates.

3. **`Knot` does not extend `SupportEntity`.** It has no `modelId`; its model is
   derived from its host shaft. That is why `MODEL_ID_COLLECTION_KEYS` excludes
   it, and the exclusion is correct.

4. **Passing tests prove nothing about a new flag.** Twice in this refactor a new
   descriptor flag was added, all tests passed, and mutation testing showed the
   suite did not cover it at all. Break every flag you add deliberately, confirm
   a test fails, restore.

5. **Golden masters pin what an operation DELETES, not what it returns.** A
   generic remover once dropped the seed entity from its own returned list; every
   golden still passed, and undo would have restored one entity fewer. If you
   change a return shape, test the round trip.

## Before you commit

- `npx tsc --noEmit` clean.
- `node --import tsx --test "src/**/*.test.ts"` — note the **double quotes**;
  `npm test` single-quotes its glob and matches nothing on Windows, reporting a
  false green of 0 tests.
- `npx tsx --test local-only/support-goldens/*.test.ts` — byte-identical for a
  refactor. A golden diff means either a behaviour change (was it intended?) or a
  regression.
- Mutation-test anything new that a test claims to cover.

## Scope discipline

**One concern per commit.** A registry conversion and a bug fix in the same diff
means the goldens can no longer tell you which caused a change — and the goldens
are the whole safety argument for mechanical refactors here.

When you find a bug mid-conversion — and you will, this code has real ones —
land the conversion behaviour-preserving first, then fix separately. If the bug
makes the conversion impossible to do cleanly (two removers disagreeing on
policy, say), say so and ask; do not encode a flag whose only purpose is
preserving a defect.

**Do not do registry work while adding a support type.** Same reason. Recorded in
`docs/dev/backlog.md` as well.

## Where things are

| File | Holds |
| ---- | ----- |
| `supportTypeRegistry.ts` | What every type IS: descriptors, flags, edges, removal shapes |
| `types.ts` | Entity interfaces. `SupportEntityByCollection` names each collection ONCE; `SupportState` derives from it |
| `supportCascade.ts` | The dependency-graph walk removals share |
| `state.ts` | The store. Still the least converted file — ~350 hand-written per-type references |

The registry deliberately holds no renderers, builders or placement logic. It
describes what a type is, not how it draws. Where the store must call INTO a
type, use a registration slot (`registerSupportUpdater`) — importing `state.ts`
from the registry is an initialisation cycle, because `state.ts` calls
`createEmptySupportCollections()` while the module is still evaluating.

## Further reading

- `docs/dev/support-system.md` — subsystem overview and current adoption level
- `docs/dev/support-type-extension.md` — adding a type, step by step
- `plans/state-ts-cleanup.md` (outside the repo) — the staged conversion plan
