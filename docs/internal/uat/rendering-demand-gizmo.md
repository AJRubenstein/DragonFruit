---
issue: dragonfruit-120-0
date: 2026-04-19
updated: 2026-07-29
updated-by: dragonfruit-103-2
kind: verification
---

# UAT: Rendering — gizmo interaction under demand mode

Manual verification scenarios for gizmo behaviour when demand mode is active. These are regression guards for bugs caught during live validation of the demand-mode rollout.

> **2026-07-29 correction (dragonfruit-103-2).** The "billboard settles" scenario
> previously asserted the rotation handle settles *camera-facing*, that fans do
> not spin up, and a "~1 second" window. All three clauses over-specified: the
> camera-facing behaviour was an implementation choice (now false by design —
> the grabber parks at the object's true angle), fan behaviour is not
> objectively verifiable, and the real invariant has a precise threshold. The
> scenario now asserts the invariant it always actually guarded: the render
> loop idles after convergence.

## Scenario: Gizmo drag tracks cursor smoothly

**Rationale.** Regression caught during live validation — gizmo drag handlers mutate refs directly (perf pattern) which demand mode silently broke. Under `always` mode the next 60 Hz frame renders the mutation; under `demand` mode nothing invalidates unless a hook calls `invalidate()` after the ref mutation. If this regresses, users see the model teleport on pointer-up instead of following the cursor during drag.

```gherkin
Given demand mode is enabled
  And a model is selected with the transform gizmo visible
When the user drags an axis handle (X / Y / Z)
Then the model position follows the cursor continuously during drag
  And there is no visible teleport on pointer-up
  And the same holds for the centre handle, rotate handles, and scale handles
```

## Scenario: Rotation gizmo settles and the loop idles

**Rationale.** Asymptotic smoothing that never exactly reaches its target keeps
the render loop alive forever (see `ADR/0004-anti-asymptotic-smoothing-chase.md`).
The invariant is loop idleness, not any particular resting orientation.

```gherkin
Given demand mode is enabled
  And the user has selected a model and activated the rotation gizmo
  And the diagnostics overlay is enabled
When the user moves the camera, then releases (no further input)
Then the rotation grabber settles at the model's current angle on its ring
  And the renders/sec overlay reaches 0.0 once settling completes
```

## Scenario: Snap feedback during joint/knot drag

**Rationale.** Placement hooks (BranchPlacementController, LeafPlacementController, etc.) and primitives (useJointInteraction, useKnotInteraction) drive snapping via `useFrame`. In demand mode, snapping must remain responsive — snap indicators should appear within 16 ms of cursor crossing a snap target.

```gherkin
Given demand mode is enabled
  And the user is actively placing a branch or leaf support
When the cursor crosses a valid snap target (shaft segment, joint, etc.)
Then the snap indicator appears within 16 ms (single 60 Hz frame)
  And the preview updates continuously during the drag
  And releasing over the snap target commits to the snapped position
```
