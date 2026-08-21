# Performance Debugging

How to find out where DragonFruit's time goes. Two halves: scaffolding that
ships inside the app and reports from users' machines, and external profilers
you point at your own machine when you need a call stack.

## In-app scaffolding

### Main-thread stall detector

`src/utils/debug/mainThreadHeartbeat.ts` is the UI's equivalent of a database
slow query log. A timer that should fire every 100 ms measures how late it
actually woke up. The main thread is single-threaded, so a timer that is 12
seconds late means the thread was held for 12 seconds and the window was frozen
for exactly that long.

Reports land in `dragonfruit.log` at `WARN`:

```
[stall] Main thread blocked for 12340 ms (threshold 500 ms) — pointer: canvas (12358 ms ago), hotkey: s (4.2 s ago)
```

Because a stall is only noticed once a tick is late by the full threshold, a
block starting just after a tick gets one tick for free: with a 100 ms tick and
a 500 ms threshold, blocks up to 600 ms can go unreported, and a reported figure
understates the real block by up to 100 ms. It is a floor, not an exact
duration.

The threshold defaults to 500 ms and is read once at startup from the
`df.debug.stallThresholdMs` key in `localStorage`. Values below one tick are
ignored — the detector would be reporting its own scheduling jitter. Pick the
threshold the way you would pick `long_query_time`: low enough to catch what a
user notices, high enough that a legitimately heavy frame does not fill the log.

Ticks are skipped while the window is hidden and across any visibility change.
An occluded or minimised window has its timers throttled by the OS, which from
inside the page is indistinguishable from a freeze.

**What it cannot tell you** is which function was responsible. While the thread
is blocked no JavaScript runs, so there is nothing to sample from — this is a
property of the platform, not a gap in the implementation. What the report gives
you is the gesture that preceded the freeze, which is the part users can never
describe and the part you need to reproduce it. Take it to `sample` from there.

### Activity context

`src/utils/debug/heartbeatContext.ts` records what the user was doing, so a
stall report is more than a number. It listens to two signals the app already
emits — `app-hotkey-keydown` and `pointerdown` — and wires nothing at any call
site.

To have a slow subsystem name itself, call `noteActivity` immediately before the
expensive work:

```ts
import { noteActivity } from '@/utils/debug/heartbeatContext';

noteActivity('island-scan:contour-markers');
```

The label is truncated to 80 characters and becomes the `activity:` field of the
next stall report. Use a stable, greppable name; do not interpolate user data
into it. Only the most recent call is kept, so put it at the start of a phase
rather than inside a loop.

The same rule applies to the element description recorded on `pointerdown`: only
`data-testid`, `aria-label` and `title` are read, never text content, which would
carry users' model and file names into a log they are about to email you.

### Startup header

Written once per run, in two halves, each on the side that has the information.
Rust logs what the process knows, from `log_startup_header()` in `main.rs`:

```
[header] DragonFruit 0.1.13 (debug=false) os=macos arch=aarch64 cores=12 log_level=INFO
```

The webview logs what only it can see, from `src/utils/debug/startupHeader.ts`:
GPU string, viewport, screen size and device pixel ratio.

Without a header every report floats in a vacuum: a 12-second freeze means
nothing until you know whether it happened on an M4 Max or a 2017 iMac.

!!! warning "Nothing may be logged before `setup()`"
    `tauri-plugin-log` attaches the `log` facade during its own plugin setup.
    Any `log::info!` emitted earlier in `main()` is silently dropped — it does
    not reach the file, or stdout, or anywhere. This is why the header is
    emitted from inside `setup()`.

### Asking a user for a report

The plumbing already exists and needs no new UI: Settings has a log level
selector that applies without restarting, a live log viewer, and buttons to
reveal or open the log file. Ask the user to set the level to `debug`, reproduce
the problem, and send `dragonfruit.log`.

## External profilers

### macOS: `sample` and flame graphs

The heavy lifting happens in the WebKit content process, not in the app process.
Find it and sample it:

```bash
ps -Ao pid,ppid,%cpu,command | grep 'WebKit.WebContent' | grep -v grep
```

```bash
sample <pid> 60 -file /tmp/df-$(date +%H%M%S).txt
```

`-file` truncates the path it is given, so vary the name if you want to keep
successive captures. For a flame graph:

```bash
~/FlameGraph/stackcollapse-sample.awk /tmp/df-*.txt | ~/FlameGraph/flamegraph.pl > /tmp/df.svg
```

Note that `sample` aggregates: you get totals, not a timeline. Take one capture
per phase if you need the sequence.

!!! warning "JIT frames are not symbolicated"
    Application JavaScript appears as `???  (in <unknown binary>)`. Neither
    `sample` nor Instruments can symbolicate JavaScriptCore's JIT output. These
    tools tell you *where in WebKit* you are — event dispatch, GC, compositing —
    not which of your functions is responsible. For that, use the Web Inspector
    profiler, or profile the plain web build in Chrome.

### Reading a WebKit sample

Some stacks that come up repeatedly and what they mean:

| Stack | Meaning |
|---|---|
| `mouseEvent` → `dispatchMouseEvent` → `performMicrotaskCheckpoint` | Work in a promise continuation after a click — typically a React state flush, not the handler itself |
| `timerFired` → `WindowEventLoop` → `Worker::dispatchEvent` | The main thread processing worker messages. Work is *off* the worker but still blocking the UI |
| `updateRendering` → `WebGLRenderingContextBase::prepareForDisplay` → `waitForSyncReply` | Blocked on synchronous IPC to the GPU process. Fixed per-frame cost of WKWebView; a scene rendering when nothing moves pays it for nothing |
| `operationMapHash` + `JSRopeString::resolveRope` + `IsoInlinedHeapCellType<JSRopeString>::finishSweep` | `Map`/`Set` keyed by concatenated strings. The GC cost of the temporary keys is often as large as the lookups |

That last row is worth internalising. Building keys with template literals is
idiomatic and looks harmless, but in a hot loop it allocates a rope string per
lookup, and the sweep shows up as a third of total time. Numeric keys cost
nothing to hash and allocate nothing.

### Web Inspector and Chrome

For JavaScript with real function names, bracket the operation from the console
rather than recording everything:

```javascript
console.profile('place-support'); /* do the thing */ console.profileEnd('place-support');
```

This works in both Safari's Web Inspector, attached to the real WKWebView, and
in Chrome against `npm run dev`. Chrome has the better flame chart and exports a
`.cpuprofile` that `npx speedscope` opens, but it will not reproduce anything
WKWebView-specific.

## Known gaps

**A hung Rust command is invisible to the stall detector.** `invoke` is
asynchronous: it posts a message and returns a promise. If a command never
returns, the promise never settles, the main thread stays free, and the
heartbeat says nothing — the UI is responsive and the feature is simply dead.
Nothing currently watches for invokes that never come back.

**Large payloads returned from Rust can stall the main thread**, on the return
path rather than the call. Deserialising a large result happens on the webview's
main thread and is charged to whatever happens to be running.

**Only instrumented phases are named.** Everything else shows up as a stall with
whatever `pointerdown` happened to be last.
