---
issue: dragonfruit-120-0
date: 2026-04-19
kind: verification
---

# UAT: Rendering — demand-mode toggle lifecycle

Manual verification scenarios for the runtime toggle that enables/disables demand mode (Settings → Mesh → "Reduce idle CPU (beta)"). The `frameloop` prop is reactive and the Canvas re-keys on change — these scenarios verify the transition is clean.

## Scenario: Toggle round-trip preserves scene responsiveness

**Rationale.** Canvas re-keys on frameloop change — risk that the remount leaves the scene in a stuck or broken state. Adversarial finding M2 from the plan review.

```gherkin
Given a model is loaded with OrbitControls active
When the user flips Settings → Mesh → "Reduce idle CPU (beta)" from Off → On → Off
Then the scene remounts briefly each time
  And camera position and selection are preserved through the remount
  And orbit / pan / zoom remain responsive after each flip
  And no residual "stuck frame" or rendering artifact appears
```

## Scenario: Env var override wins over preference

**Rationale.** `NEXT_PUBLIC_DEMAND_FRAMELOOP=1|0` is the dev/CI escape hatch. It must override whatever preference the user has persisted.

```gherkin
Given the user has persisted Settings → Mesh → Off (always render)
When DragonFruit is launched with NEXT_PUBLIC_DEMAND_FRAMELOOP=1
Then the main SceneCanvas runs with frameloop='demand' regardless of the user preference
  And the Settings UI still displays the user's persisted preference (Off)
  And unsetting the env var + relaunching falls back to the user preference
```

## Scenario: Three-value preference survives default flip

**Rationale.** See `ADR/0003-three-value-preference-state.md`. When a future PR flips the platform default to ON, users who explicitly opted OFF must keep their choice.

```gherkin
Given the user has explicitly selected Settings → Mesh → Off (always render)
  And the platform default is currently OFF
When a future PR flips the platform default to ON
  And the user relaunches DragonFruit
Then the main SceneCanvas continues to use frameloop='always'
  And the Settings UI still shows "Off (always render)"

Given a different user has left Settings → Mesh on "Follow platform default"
When the same PR lands and flips the platform default to ON
  And the user relaunches DragonFruit
Then the main SceneCanvas switches to frameloop='demand' automatically
  And the Settings UI shows "Follow platform default (currently: on demand)"
```
