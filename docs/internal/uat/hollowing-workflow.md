---
issue: dragonfruit-kb-harvest-2026-08
date: 2026-08-18
subsystem: hollowing
---

# Hollowing workflow

## Scenario 1: Apply hollowing to a solid model

Given a loaded solid model
When I activate the hollowing tool and set wall thickness
Then a voxel preview shows the hollow interior
And the preview respects resource-aware caps (reduced resolution on large models)

## Scenario 2: Cavity detection

Given a hollowed model
When the hollowing operation completes
Then cavities (enclosed voids) are detected and highlighted
And I can place drain holes to connect cavities to the exterior

## Scenario 3: Blocker placement

Given a hollowed model with the hollowing tool active
When I place a blocker region
Then the blocked area retains its original solid geometry
And the blocker boundary is clean (no stray voxels at the interface)

## Scenario 4: Async lasso selection

Given a hollowed model in the hollowing tool
When I draw a lasso selection around a region
Then the selection completes asynchronously without freezing the UI
And the selected region can be toggled between hollow and blocked

## Scenario 5: Slice-path blocker integrity

Given a hollowed model with blockers placed
When I slice the model
Then blocker regions produce solid layers (no hollow artefacts)
And the transition between hollow and blocked regions is watertight

## Scenario 6: Select a hole punch through the slice-view cutaway

Given a hollowed model with an existing hole punch and exterior view active
When I move the slice viewer until the plug is visible from inside the cavity
And click the plug
Then the existing punch is selected and its gizmo appears
And no new punch is placed on the far cavity wall
And selection also works with the lower clip bound and in interior view

## Scenario 7: Place a hole punch in interior view

Given a hollowed model in interior view with no hole punch selected
When I click a cavity surface away from existing punches
Then a new punch is placed at that surface
And the build plate or other unrelated geometry behind the model does not block placement
