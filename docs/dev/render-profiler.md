# Render Profiler

The render profiler answers "where did that frame go?" from inside the running
app. It is a draggable window over the scene that reports, per frame and per
render pass:

- frame interval, CPU submission time, and GPU time where the context can
  measure it,
- draw calls, triangles, lines and points,
- how many `WebGLRenderer.render` passes a frame issued, attributed to the
  scene each one drew,
- the scene-graph inventory behind them (objects, meshes, instances, programs,
  geometries, textures).

Toggle it with **Ctrl+Shift+P**. It is off by default and costs nothing while
closed. The window remembers where you left it. See
[Performance Debugging](performance-debugging.md) for the rest of the toolkit —
the stall detector, the diagnostics modal and external profilers.

## Reading the numbers

| Row | What it is | What a bad value suggests |
| --- | --- | --- |
| FPS | frames per second over the sampled window | below the display refresh while nothing moves — a frame budget problem |
| Frame time | interval between frame marks (p50, p95) | p95 far above p50 — intermittent work, not a steady cost |
| CPU render | time inside `WebGLRenderer.render`, summed over passes | high: draw-call setup, matrix/skinning updates, shader switches |
| GPU render | timer-query result, when available | high with low CPU: fill rate, vertex load or a heavy fragment shader |
| Draw calls | `renderer.info.render.calls` | hundreds per frame: per-object or per-bucket meshes instead of batches |
| Triangles | `renderer.info.render.triangles` | geometry drawn that is not on screen, or a missing LOD |
| Passes | render calls per frame, one row per scene | more than the app intends (a picking pass that should be paused) |

`frameMs` includes the wait for the display, and CPU and GPU time overlap;
subtracting one from another gives a bound, not a breakdown. The React commit
is not in either column — a frame that renders cheaply and still feels slow is
a React or layout problem, not a renderer one.

### GPU timing

GPU rows come from `EXT_disjoint_timer_query_webgl2`. When the context does not
expose it — WebView2 does not, on this machine — the badge reads **CPU only**
and every GPU cell reads `n/a`; the profiler does not estimate GPU time.

**GPU probe** is the explicit alternative: for 90 frames it waits with
`gl.finish()` after the main pass and records the GPU-inclusive cost of each
frame as that pass's GPU time. It stalls the main thread by design and distorts
the frame timing while it runs, so treat it as a measurement, not a mode: press
it, read the GPU row, stop. The badge reads **GPU sync** afterwards, and the
probe frames stay in the rolling window until they age out.

A real timer query resolves a frame or two after its pass, so a row can trail
briefly. Disjoint results (the GPU changed clocks mid-query) are discarded
rather than reported, and a context that never answers is abandoned after five
dropouts.

## Recording

- **Record** captures the next 600 frames into a separate buffer. While it runs
  the panel stops refreshing, so its own four-renders-a-second cost cannot show
  up as the p95 the recording is meant to explain. When the buffer fills, one
  `[render]` line is written to `dragonfruit.log`: frame, CPU and GPU
  percentiles, draw-call and triangle percentiles, a line per pass, and the
  scene inventory. That is the line to ask a user for in a report.
- **Write log** writes the same line for the current rolling window.
- **Copy JSON** puts the full report — every captured frame and both summaries —
  on the clipboard.
- **Pause** stops sampling without unpatching anything; the renderer resumes
  normal behaviour on the next frame.

The rolling window keeps 240 frames (about four seconds at 60 fps) so the live
panel stays cheap. Recording is the path for a longer capture.

## How it works

`src/utils/debug/renderProfiler.ts` is the sampler and the store. It patches the
live renderer's `render` method and restores it on uninstall; each pass is timed
with a `performance.now()` pair and its counters are read from
`renderer.info.render` immediately after the call. `passDrawCounts` handles both
`info.autoReset` modes: with it on, the counters already describe the pass; with
it off, the difference from the previous reading does.

`src/components/scene/SceneCanvas/SceneRenderProfiler.tsx` mounts inside the
canvas. It installs the sampler while the window is open, and its `useFrame`
calls `markRenderFrame` to close the previous frame before any render of the
next is recorded. It is mounted first among the canvas children; R3F runs frame
subscribers in mount order, so the picking pass's own `useFrame` lands in the
right frame.

`src/components/debug/RenderProfilerOverlay.tsx` is the window. It is a plain
DOM card, not a drei `Html` label: it must keep its React tree out of the R3F
reconciler and stay readable while the scene is throttled. It refreshes at the
store's notify rate — four times a second — so drawing it cannot pollute the
numbers it reports.

The picking scene is named `picking` (`createPickScene` in
`src/components/picking/PickingRenderer.tsx`), which is what gives that pass a
readable label instead of `aux1`. Any other unnamed scene gets a stable `auxN`
label per scene identity.

## Constraints

- **Ctrl+Shift+P is the profiling binding.** The platform reads that
  combination as Print, so `setupHotkeyListeners` prevents its default action
  in `src/hotkeys/HotkeyRegistryManager.tsx`; without that the print dialog
  opens over the app.
- The sampler is one method patch on one renderer object. Mounting two canvases
  with the profiler open re-points it at the last installed renderer; the
  diagnostics use case is the main workspace canvas.
- The pass counters are `renderer.info.render`, so anything that bypasses the
  renderer (a raw `gl.drawElements` in a custom pass) is not in them.
- Scene inventory is a traversal of the main scene, refreshed every two seconds
  while the profiler is open.

## Related pages

- [Performance Debugging](performance-debugging.md) — the in-app stall
  detector, the diagnostics modal (Ctrl+Shift+D) and the CDP harness.
