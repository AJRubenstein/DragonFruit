---
issue: dragonfruit-120-3
date: 2026-07-05
supersedes: dragonfruit-120-0 (2026-04-19)
kind: verification
---

# UAT: Rendering — idle CPU

Manual verification scenarios for the opt-in demand-mode rendering
(Settings → Performance → "Idle Rendering"). Re-run after any PR that
modifies `useFrame` hooks, invalidate plumbing, or the frameloop prop on the
main SceneCanvas.

Note (dragonfruit-120-3): PR #120 was closed because CEF recomposites every
vsync regardless of canvas draws — the Linux scenario below is retained as
historical/aspirational until the CEF message-pump work (dragonfruit-120-2)
lands. macOS is now the primary acceptance platform.

## Scenario: macOS idle CPU drops to near-zero with demand mode on (PRIMARY)

**Rationale.** Primary acceptance criterion for the demand-mode
reimplementation. Baseline measured 2026-07-05 on MBP 16" 2019 (Intel,
WKWebView): ~23% combined idle CPU (WebContent + WebKit GPU + main process)
with an empty plate under frameloop='always'; 0.0% when the window is
hidden, proving the render loop is the entire idle cost.

```gherkin
Given DragonFruit is running on macOS WKWebView
  And the user has set Settings → Performance → Idle Rendering → On
  And the scene has a loaded model (repeat with empty plate)
  And no pointer hover, selection, drag, or island overlay is active
When the user leaves the scene untouched for 10 seconds
Then the WebKit GPU process drops below 1% CPU
  And the Render Diagnostics overlay shows renders/sec converging to ~0
  And combined process CPU (main + WebContent + WebKit GPU) is at most 10%
  And fans are not audibly spinning up due to DragonFruit alone
```

Measured 2026-07-05 (empty plate, workspace build): Off 25.1% avg → On 8.7%
avg; WebKit GPU 8.1% → 0.4%; renders/sec 0.3. The residual is a platform
floor, not the render loop: main process (~4.5%) idles parked in the AppKit
event loop (wry wakeups) and WebContent (~4.3%) runs 60 Hz bookkeeping rAF;
all processes drop to 0.0% when the window is occluded. A <3% combined
target is not reachable on 2019 Intel while visible regardless of frameloop.

## Scenario: Interaction classes resume and re-idle cleanly

**Rationale.** Every invalidate-plumbed consumer class must wake the loop
during interaction and release it afterwards (ADR-0001, ADR-0004).

```gherkin
Given demand mode is On and the Render Diagnostics overlay is enabled
When the user performs each of: orbit/pan/zoom, transform-gizmo drag on all
  handle types, camera focus hotkey, home reset, support placement
  (branch/brace/leaf/kickstand), joint and knot drags, place-on-face
Then the scene tracks the interaction at full frame rate with no lag or
  teleport-on-release
  And within ~1 second after each interaction ends renders/sec returns to 0.0
```

## Scenario: Island overlays scope out the idle win (ADR-0022)

**Rationale.** Island overlays animate uTime by design and use scoped
continuous invalidation — renders/sec must NOT be expected to converge while
they are visible, and must converge again once hidden.

```gherkin
Given demand mode is On and a model with detected islands is loaded
When the island overlay (or surface dots overlay) is visible
Then renders/sec stays at the display rate (animation stays smooth, no freeze)
When the overlay is hidden
Then renders/sec converges to 0.0 within ~1 second
```

## Scenario: Idle CPU drops to near-zero on Linux CEF with demand mode on (HISTORICAL — blocked on dragonfruit-120-2)

**Rationale.** Retained from dragonfruit-120-0. CEF recomposites every vsync,
so demand mode alone did not deliver the win on Linux; re-activate this
scenario once the external-message-pump scheduling fix lands.

```gherkin
Given DragonFruit is running on Linux CEF
  And the user has set Settings → Performance → Idle Rendering → On
  And the scene has a loaded model
  And no pointer hover, selection, or drag is active
When the user leaves the scene untouched for 10 seconds
Then process CPU usage drops below 5%
  And the Render Diagnostics overlay shows renders/sec converging to 0.0
```

## Scenario: Windows wry shows no regression

```gherkin
Given DragonFruit is running on Windows wry
  And the user has enabled demand mode
  And the scene has a loaded model
  And no interaction is active
When the user leaves the scene untouched for 10 seconds
Then process CPU usage is equal to or lower than with demand mode off
```
