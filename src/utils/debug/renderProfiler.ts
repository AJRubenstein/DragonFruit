/**
 * Render profiler — a per-frame, per-pass view of what the WebGL renderer did.
 *
 * The diagnostics modal answers "how many frames per second". This answers the
 * next question: where did the frame go? It wraps `WebGLRenderer.render`, so
 * every render call is a row — the main scene, the picking pass, the view-cube
 * HUD — with:
 *
 * - CPU milliseconds spent inside the call (the cost of encoding that pass),
 * - draw calls, triangles, lines and points, read from `renderer.info.render`
 *   after the call, so each pass is measured on its own instead of summed,
 * - GPU milliseconds when the context exposes `EXT_disjoint_timer_query_webgl2`
 *   (the overlay says *unavailable* when it does not, rather than guessing).
 *
 * The sampler is off until the overlay is opened. Enabling it patches one
 * method on the live renderer and adds one `performance.now()` pair per pass;
 * disabling it restores the method, so a shipped build pays nothing unless the
 * developer asks for the numbers. The one exception is the `useFrame` call that
 * marks a frame boundary, which is a store read and an early return.
 *
 * Limitations, stated where the numbers are:
 *
 * - CPU milliseconds are submission time, not GPU execution. A cheap-looking
 *   pass can still be the expensive one on the GPU; that is what the timer
 *   query is for, and why it is shown next to it.
 * - `frameMs` is the interval between frame marks, so it includes waiting for
 *   the display. Subtract the CPU and GPU columns only as a rough bound: they
 *   may overlap and neither includes React's commit.
 * - GPU timing is asynchronous. A row can read `n/a` for a frame or two after
 *   the pass was recorded; aggregate rows are recomputed from whatever has
 *   landed.
 *
 * See `docs/dev/render-profiler.md`.
 */

import type * as THREE from 'three';
import { logToNativeFile } from '@/utils/nativeLog';

/** Frames kept live for the overlay: about four seconds at 60 fps. */
const FRAME_WINDOW = 240;
/** Default recording length. Long enough for a gesture, short enough to read. */
const DEFAULT_RECORD_FRAMES = 600;
/** Overlay refresh. The scene renders at display rate; the panel must not. */
const NOTIFY_INTERVAL_MS = 250;
/** Scene-graph statistics are a traversal; two seconds is plenty. */
const SCENE_STATS_INTERVAL_MS = 2_000;
/** Timer queries that have not resolved by now are dropped. */
const GPU_QUERY_TIMEOUT_MS = 2_000;
/** Consecutive dropped queries before GPU timing gives up. */
const GPU_MAX_FAILURES = 5;
/** At most this many queries in flight; older ones are dropped. */
const GPU_MAX_PENDING = 48;

const STORAGE_KEY = 'df.debug.renderProfiler';

export type GpuTimingState = 'untested' | 'available' | 'unavailable' | 'sync-probe';

/** One `WebGLRenderer.render` call. */
export type RenderPassSample = {
  /** `main`, or a stable label for any other scene (the picking pass is `picking`). */
  scene: string;
  /** CPU time inside the call, in milliseconds. */
  cpuMs: number;
  /** GPU time in milliseconds, when a timer query has resolved for this pass. */
  gpuMs: number | null;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
};

/** One animation frame: every render pass it issued, plus what it cost. */
export type RenderFrameSample = {
  /** `performance.now()` when the frame began. */
  atMs: number;
  /** Interval since the previous frame began, in milliseconds. */
  frameMs: number;
  cpuMs: number;
  /** React commit time attributed to this frame (see `recordReactCommit`). */
  reactMs: number;
  /** Sum of the passes' resolved GPU times; null when none resolved. */
  gpuMs: number | null;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  passes: RenderPassSample[];
  programs: number;
  geometries: number;
  textures: number;
};

export type ValueStats = {
  avg: number;
  p50: number;
  p95: number;
  max: number;
};

export type RenderPassSummary = {
  scene: string;
  /** Average number of these passes per frame. */
  perFrame: number;
  cpuMs: ValueStats | null;
  gpuMs: ValueStats | null;
  /** Average draw calls and triangles for one pass. */
  calls: number;
  triangles: number;
};

export type RenderProfilerSummary = {
  frameCount: number;
  fps: number;
  frameMs: ValueStats | null;
  cpuMs: ValueStats | null;
  reactMs: ValueStats | null;
  gpuMs: ValueStats | null;
  calls: ValueStats | null;
  triangles: ValueStats | null;
  passesPerFrame: number;
  passes: RenderPassSummary[];
};

/** Scene-graph inventory, refreshed occasionally while the profiler is open. */
export type RenderSceneStats = {
  objects: number;
  meshes: number;
  instancedMeshes: number;
  instances: number;
  lines: number;
  points: number;
  geometries: number;
  materials: number;
  /** Triangle count of everything the meshes draw, instances included. */
  triangles: number;
  /**
   * The same inventory split by the top-level group that owns each object:
   * `models`, `supports`, `rafts`, or `other`. Tagged with `userData.dfPerfGroup`.
   */
  byGroup: Record<string, { triangles: number; objects: number }>;
};

export type RenderRecordingState = {
  active: boolean;
  captured: number;
  limit: number;
};

export type RenderProfilerSnapshot = {
  enabled: boolean;
  paused: boolean;
  gpuTiming: GpuTimingState;
  frames: readonly RenderFrameSample[];
  summary: RenderProfilerSummary;
  sceneStats: RenderSceneStats | null;
  recording: RenderRecordingState;
  /** Frames left in an explicit `gl.finish()` GPU probe, 0 when none is running. */
  gpuProbeRemaining: number;
  /** Set when a recording finished or the summary was logged. */
  lastReport: string | null;
  /** `performance.now()` when the summary was last written. */
  lastReportAtMs: number | null;
};

export type RenderProfileReport = {
  summary: RenderProfilerSummary;
  sceneStats: RenderSceneStats | null;
  gpuTiming: GpuTimingState;
  frames: RenderFrameSample[];
  viewport: { width: number; height: number; dpr: number } | null;
  renderer: string | null;
};

type DrawCounters = {
  calls: number;
  triangles: number;
  lines: number;
  points: number;
};

type MutableFrame = {
  atMs: number;
  passes: RenderPassSample[];
  reactMs: number;
};

type GpuQueryHandle = object;

type GpuTimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
  QUERY_RESULT_AVAILABLE: number;
  QUERY_RESULT: number;
  createQuery: () => GpuQueryHandle;
  beginQuery: (target: number, query: GpuQueryHandle) => void;
  endQuery: (target: number) => void;
  getQueryParameter: (query: GpuQueryHandle, pname: number) => unknown;
  deleteQuery: (query: GpuQueryHandle) => void;
};

type PendingGpuQuery = {
  query: GpuQueryHandle;
  pass: RenderPassSample;
  startedAtMs: number;
};

type InstalledPatch = {
  gl: THREE.WebGLRenderer;
  original: THREE.WebGLRenderer['render'];
};

// ── Store state ──────────────────────────────────────────────────────────

let enabled = readStoredEnabled();
let paused = false;
let gpuTiming: GpuTimingState = 'untested';

let frames: RenderFrameSample[] = [];
let activeFrame: MutableFrame | null = null;

let recording: RenderFrameSample[] | null = null;
let recordingLimit = DEFAULT_RECORD_FRAMES;

let installed: InstalledPatch | null = null;
let mainScene: THREE.Scene | null = null;
const sceneLabels = new WeakMap<THREE.Scene, string>();
let nextAuxLabel = 1;

let gpuTimer: GpuTimerExtension | null = null;
let pendingGpuQueries: PendingGpuQuery[] = [];
let gpuFailures = 0;
/** Frames left in an explicit `gl.finish()` probe; 0 when not probing. */
let syncProbeRemaining = 0;

/** Whether a timing state carries GPU values the summaries may average. */
function gpuValuesAvailable(state: GpuTimingState): boolean {
  return state === 'available' || state === 'sync-probe';
}

let sceneStats: RenderSceneStats | null = null;
let lastSceneStatsAtMs = 0;

let lastNotifyAtMs = 0;
let pendingReactMs = 0;
let lastReport: string | null = null;
let lastReportAtMs: number | null = null;

let cachedSnapshot: RenderProfilerSnapshot | null = null;
const snapshotListeners = new Set<() => void>();
const enabledListeners = new Set<() => void>();

// ── Small helpers ────────────────────────────────────────────────────────

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistEnabled(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A blocked storage must not take the profiler down with it.
  }
}

function notify(): void {
  cachedSnapshot = null;
  for (const listener of snapshotListeners) listener();
}

function notifyEnabled(): void {
  for (const listener of enabledListeners) listener();
}

function statsOf(values: readonly number[]): ValueStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (quantile: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * quantile)))];
  let total = 0;
  for (const value of sorted) total += value;
  return {
    avg: total / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}

function averageOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

// ── Draw counters ────────────────────────────────────────────────────────

/**
 * The counters `renderer.info.render` holds for one `render()` call.
 *
 * three resets `info.render` when a render starts only while `info.autoReset`
 * is on; with it off the counters accumulate across passes. The two cases need
 * different arithmetic, and reading the wrong one makes the second pass of a
 * frame look free, so the caller passes the flag it observed rather than this
 * function guessing from the numbers.
 */
export function passDrawCounts(
  before: DrawCounters,
  after: DrawCounters,
  autoReset: boolean,
): DrawCounters {
  if (autoReset) return { ...after };
  return {
    calls: Math.max(0, after.calls - before.calls),
    triangles: Math.max(0, after.triangles - before.triangles),
    lines: Math.max(0, after.lines - before.lines),
    points: Math.max(0, after.points - before.points),
  };
}

function readDrawCounters(info: THREE.WebGLInfo | undefined): DrawCounters {
  const render = info?.render;
  return {
    calls: render?.calls ?? 0,
    triangles: render?.triangles ?? 0,
    lines: render?.lines ?? 0,
    points: render?.points ?? 0,
  };
}

// ── Summary ──────────────────────────────────────────────────────────────

/** Aggregates a frame window for the overlay and the report line. */
export function summarizeRenderFrames(
  samples: readonly RenderFrameSample[],
  gpuState: GpuTimingState,
): RenderProfilerSummary {
  const frameTimes = samples.map((frame) => frame.frameMs);
  const cpuTimes = samples.map((frame) => frame.cpuMs);
  const callCounts = samples.map((frame) => frame.calls);
  const triangleCounts = samples.map((frame) => frame.triangles);
  const gpuTimes = samples.flatMap((frame) => frame.passes.flatMap((pass) => (
    pass.gpuMs == null ? [] : [pass.gpuMs]
  )));

  const passOrder: string[] = [];
  const byScene = new Map<string, {
    passes: number;
    cpu: number[];
    gpu: number[];
    calls: number[];
    triangles: number[];
  }>();

  for (const frame of samples) {
    for (const pass of frame.passes) {
      let entry = byScene.get(pass.scene);
      if (!entry) {
        entry = { passes: 0, cpu: [], gpu: [], calls: [], triangles: [] };
        byScene.set(pass.scene, entry);
        passOrder.push(pass.scene);
      }
      entry.passes += 1;
      entry.cpu.push(pass.cpuMs);
      if (pass.gpuMs != null) entry.gpu.push(pass.gpuMs);
      entry.calls.push(pass.calls);
      entry.triangles.push(pass.triangles);
    }
  }

  const passSummaries: RenderPassSummary[] = passOrder.map((scene) => {
    const entry = byScene.get(scene);
    const count = samples.length;
    return {
      scene,
      perFrame: entry && count > 0 ? entry.passes / count : 0,
      cpuMs: statsOf(entry?.cpu ?? []),
      gpuMs: gpuValuesAvailable(gpuState) ? statsOf(entry?.gpu ?? []) : null,
      calls: averageOf(entry?.calls ?? []),
      triangles: averageOf(entry?.triangles ?? []),
    };
  });

  const frameMs = statsOf(frameTimes);
  const totalPasses = samples.reduce((sum, frame) => sum + frame.passes.length, 0);

  return {
    frameCount: samples.length,
    fps: frameMs && frameMs.avg > 0 ? 1000 / frameMs.avg : 0,
    frameMs,
    cpuMs: statsOf(cpuTimes),
    reactMs: statsOf(samples.map((frame) => frame.reactMs)),
    gpuMs: gpuValuesAvailable(gpuState) ? statsOf(gpuTimes) : null,
    calls: statsOf(callCounts),
    triangles: statsOf(triangleCounts),
    passesPerFrame: samples.length > 0 ? totalPasses / samples.length : 0,
    passes: passSummaries,
  };
}

function formatMs(value: number | undefined): string {
  return value == null ? 'n/a' : `${value.toFixed(2)}ms`;
}

function formatCount(value: number | undefined): string {
  return value == null ? 'n/a' : Math.round(value).toString();
}

function formatTriangles(value: number | undefined): string {
  if (value == null) return 'n/a';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}

/** One line for `dragonfruit.log`, where a user's report can carry it. */
export function formatRenderProfileLine(report: RenderProfileReport): string {
  const { summary, sceneStats: stats, gpuTiming: gpuState } = report;
  const parts: string[] = [
    `[render] frames=${summary.frameCount} fps=${summary.fps.toFixed(1)}`,
    `frame p50=${formatMs(summary.frameMs?.p50)} p95=${formatMs(summary.frameMs?.p95)} max=${formatMs(summary.frameMs?.max)}`,
    `cpu p50=${formatMs(summary.cpuMs?.p50)} p95=${formatMs(summary.cpuMs?.p95)}`,
    `react p50=${formatMs(summary.reactMs?.p50)} p95=${formatMs(summary.reactMs?.p95)}`,
    `gpu=${gpuState}${summary.gpuMs ? ` p50=${formatMs(summary.gpuMs.p50)} p95=${formatMs(summary.gpuMs.p95)}` : ''}`,
    `calls p50=${formatCount(summary.calls?.p50)} max=${formatCount(summary.calls?.max)}`,
    `tris p50=${formatTriangles(summary.triangles?.p50)} max=${formatTriangles(summary.triangles?.max)}`,
    `passes=${summary.passesPerFrame.toFixed(2)}/frame`,
  ];

  for (const pass of summary.passes) {
    parts.push(
      `${pass.scene}:${pass.perFrame.toFixed(2)}x cpu=${formatMs(pass.cpuMs?.p50)}`
      + ` calls=${formatCount(pass.calls)} tris=${formatTriangles(pass.triangles)}`,
    );
  }

  if (stats) {
    parts.push(
      `scene objects=${stats.objects} meshes=${stats.meshes} instanced=${stats.instancedMeshes}`
      + ` instances=${stats.instances} triangles=${formatTriangles(stats.triangles)}`,
    );
    const groups = Object.entries(stats.byGroup)
      .map(([group, entry]) => `${group}=${formatTriangles(entry.triangles)}`)
      .join(',');
    if (groups.length > 0) parts.push(`groups ${groups}`);
  }

  if (report.renderer) parts.push(`renderer=${report.renderer}`);
  if (report.viewport) {
    parts.push(`viewport=${report.viewport.width}x${report.viewport.height}@${report.viewport.dpr}x`);
  }

  return parts.join(' | ');
}

// ── Scene statistics ─────────────────────────────────────────────────────

function perfGroupOf(object: THREE.Object3D): string {
  let node: THREE.Object3D | null = object;
  while (node) {
    const group = node.userData?.dfPerfGroup;
    if (typeof group === 'string' && group.length > 0) return group;
    node = node.parent;
  }
  return 'other';
}

function collectSceneStats(scene: THREE.Scene): RenderSceneStats {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const byGroup: Record<string, { triangles: number; objects: number }> = {};
  const bumpGroup = (object: THREE.Object3D, triangles: number) => {
    const key = perfGroupOf(object);
    const entry = byGroup[key] ?? (byGroup[key] = { triangles: 0, objects: 0 });
    entry.objects += 1;
    entry.triangles += triangles;
  };
  let objects = 0;
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let lines = 0;
  let points = 0;
  let triangles = 0;

  scene.traverse((object) => {
    objects += 1;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      meshes += 1;
      const instanced = mesh as THREE.InstancedMesh;
      const instanceCount = instanced.isInstancedMesh ? instanced.count : 1;
      if (instanced.isInstancedMesh) {
        instancedMeshes += 1;
        instances += instanced.count;
      }
      if (mesh.geometry) {
        geometries.add(mesh.geometry);
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.getIndex();
        const perMesh = index ? index.count / 3 : (position?.count ?? 0) / 3;
        const meshTriangles = perMesh * instanceCount;
        triangles += meshTriangles;
        bumpGroup(object, meshTriangles);
      } else {
        bumpGroup(object, 0);
      }
      const material = mesh.material;
      if (Array.isArray(material)) for (const item of material) materials.add(item);
      else if (material) materials.add(material);
      return;
    }
    if ((object as THREE.LineSegments).isLine || (object as THREE.Line).isLine) lines += 1;
    if ((object as THREE.Points).isPoints) points += 1;
    if (!mesh.isMesh) bumpGroup(object, 0);
  });

  return {
    objects,
    meshes,
    instancedMeshes,
    instances,
    lines,
    points,
    geometries: geometries.size,
    materials: materials.size,
    triangles,
    byGroup,
  };
}

function refreshSceneStatsIfStale(now: number): void {
  if (now - lastSceneStatsAtMs < SCENE_STATS_INTERVAL_MS) return;
  lastSceneStatsAtMs = now;
  if (!mainScene) return;
  sceneStats = collectSceneStats(mainScene);
}

// ── GPU timer queries ────────────────────────────────────────────────────

function initGpuTimer(gl: THREE.WebGLRenderer): void {
  gpuTimer = null;
  pendingGpuQueries = [];
  gpuFailures = 0;
  gpuTiming = 'unavailable';

  let context: WebGL2RenderingContext | null = null;
  try {
    const raw = gl.getContext();
    if (raw && typeof (raw as WebGL2RenderingContext).createQuery === 'function') {
      context = raw as WebGL2RenderingContext;
    }
  } catch {
    return;
  }
  if (!context) return;

  const extension = context.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null;
  if (!extension || typeof extension.createQuery !== 'function') return;

  gpuTimer = extension;
  gpuTiming = 'available';
}

function beginGpuQuery(): GpuQueryHandle | null {
  if (!gpuTimer || gpuTiming !== 'available') return null;
  try {
    const query = gpuTimer.createQuery();
    gpuTimer.beginQuery(gpuTimer.TIME_ELAPSED_EXT, query);
    return query;
  } catch {
    return null;
  }
}

function endGpuQuery(query: GpuQueryHandle, pass: RenderPassSample): void {
  if (!gpuTimer) return;
  try {
    gpuTimer.endQuery(gpuTimer.TIME_ELAPSED_EXT);
  } catch {
    gpuTimer.deleteQuery(query);
    return;
  }
  if (pendingGpuQueries.length >= GPU_MAX_PENDING) {
    const dropped = pendingGpuQueries.shift();
    if (dropped) gpuTimer.deleteQuery(dropped.query);
  }
  pendingGpuQueries.push({ query, pass, startedAtMs: performance.now() });
}

function pollGpuQueries(now: number): void {
  if (!gpuTimer || pendingGpuQueries.length === 0) return;
  let context: WebGL2RenderingContext | null = null;
  try {
    context = installed?.gl.getContext() as WebGL2RenderingContext | null;
  } catch {
    context = null;
  }
  if (!context) return;

  let disjoint = false;
  try {
    disjoint = Boolean(context.getParameter(gpuTimer.GPU_DISJOINT_EXT));
  } catch {
    disjoint = true;
  }
  if (disjoint) {
    for (const pending of pendingGpuQueries) gpuTimer.deleteQuery(pending.query);
    pendingGpuQueries = [];
    return;
  }

  const still: PendingGpuQuery[] = [];
  for (const pending of pendingGpuQueries) {
    try {
      const available = Boolean(gpuTimer.getQueryParameter(pending.query, gpuTimer.QUERY_RESULT_AVAILABLE));
      if (available) {
        const nanoseconds = Number(gpuTimer.getQueryParameter(pending.query, gpuTimer.QUERY_RESULT));
        pending.pass.gpuMs = Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : null;
        gpuTimer.deleteQuery(pending.query);
        continue;
      }
    } catch {
      gpuTimer.deleteQuery(pending.query);
      gpuFailures += 1;
      continue;
    }
    if (now - pending.startedAtMs > GPU_QUERY_TIMEOUT_MS) {
      gpuTimer.deleteQuery(pending.query);
      gpuFailures += 1;
      continue;
    }
    still.push(pending);
  }
  pendingGpuQueries = still;

  if (gpuFailures >= GPU_MAX_FAILURES) {
    // A context that never answers would leak a query per pass; give up and
    // say so instead of pretending the timing is merely late.
    gpuTiming = 'unavailable';
    for (const pending of pendingGpuQueries) {
      try {
        gpuTimer.deleteQuery(pending.query);
      } catch {
        // Already invalid; nothing to release.
      }
    }
    pendingGpuQueries = [];
    gpuTimer = null;
  }
}

// ── Pass recording ───────────────────────────────────────────────────────

function sceneLabel(scene: THREE.Scene): string {
  if (scene === mainScene) return 'main';
  const named = scene.name?.trim();
  const existing = sceneLabels.get(scene);
  if (existing) return existing;
  const label = named && named.length > 0 ? named : `aux${nextAuxLabel++}`;
  sceneLabels.set(scene, label);
  return label;
}

function recordPass(
  sceneName: string,
  cpuMs: number,
  counters: DrawCounters,
): RenderPassSample | null {
  if (!activeFrame) return null;
  const pass: RenderPassSample = {
    scene: sceneName,
    cpuMs,
    gpuMs: null,
    calls: counters.calls,
    triangles: counters.triangles,
    lines: counters.lines,
    points: counters.points,
  };
  activeFrame.passes.push(pass);
  return pass;
}

// ── Frame lifecycle ──────────────────────────────────────────────────────

function buildFrameSample(frame: MutableFrame, now: number): RenderFrameSample {
  let cpuMs = 0;
  let gpuMs = 0;
  let gpuResolved = false;
  let calls = 0;
  let triangles = 0;
  let lines = 0;
  let points = 0;
  for (const pass of frame.passes) {
    cpuMs += pass.cpuMs;
    if (pass.gpuMs != null) {
      gpuMs += pass.gpuMs;
      gpuResolved = true;
    }
    calls += pass.calls;
    triangles += pass.triangles;
    lines += pass.lines;
    points += pass.points;
  }
  const memory = installed?.gl.info.memory;

  return {
    atMs: frame.atMs,
    frameMs: Math.max(0, now - frame.atMs),
    cpuMs,
    reactMs: frame.reactMs,
    gpuMs: gpuResolved ? gpuMs : null,
    calls,
    triangles,
    lines,
    points,
    passes: frame.passes,
    programs: installed?.gl.info.programs?.length ?? 0,
    geometries: memory?.geometries ?? 0,
    textures: memory?.textures ?? 0,
  };
}

function finishRecording(): void {
  if (!recording) return;
  const captured = recording;
  recording = null;
  lastReport = formatRenderProfileLine({
    summary: summarizeRenderFrames(captured, gpuTiming),
    sceneStats,
    gpuTiming,
    frames: captured,
    viewport: readViewport(),
    renderer: readRendererName(),
  });
  lastReportAtMs = performance.now();
  void logToNativeFile('info', lastReport);
  notify();
}

function finalizeFrame(now: number): void {
  const frame = activeFrame;
  if (!frame) return;
  activeFrame = null;
  const sample = buildFrameSample(frame, now);

  frames.push(sample);
  if (frames.length > FRAME_WINDOW) frames.shift();

  if (recording) {
    recording.push(sample);
    if (recording.length >= recordingLimit) finishRecording();
  }

  pollGpuQueries(now);
  refreshSceneStatsIfStale(now);

  // A recording is a measurement. Notifying the overlay re-renders this window
  // (and its charts) four times a second, which is enough to miss a vsync and
  // show up as the p95 the recording is supposed to explain — so it is frozen
  // until `finishRecording` publishes the result.
  if (recording) return;

  if (now - lastNotifyAtMs >= NOTIFY_INTERVAL_MS) {
    lastNotifyAtMs = now;
    notify();
  }
}

// ── Install / uninstall ──────────────────────────────────────────────────

/**
 * Wraps the renderer's `render` method. Idempotent for the same renderer;
 * call {@link uninstallRenderProfiler} to restore it.
 */
export function installRenderProfiler(gl: THREE.WebGLRenderer, scene: THREE.Scene): void {
  mainScene = scene;
  if (installed?.gl === gl) return;
  uninstallRenderProfiler();
  mainScene = scene;

  const original = gl.render;
  const autoReset = gl.info?.autoReset !== false;

  const patched = function patchedRender(
    this: THREE.WebGLRenderer,
    renderScene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    if (!enabled || paused) {
      original.call(this, renderScene, camera);
      return;
    }

    const cpuStartMs = performance.now();
    const before = readDrawCounters(this.info);
    const probing = syncProbeRemaining > 0 && renderScene === mainScene;
    const gpuQuery = probing ? null : beginGpuQuery();
    original.call(this, renderScene, camera);
    const cpuMs = performance.now() - cpuStartMs;
    const after = readDrawCounters(this.info);
    const counters = passDrawCounts(before, after, autoReset);
    const recorded = recordPass(sceneLabel(renderScene), cpuMs, counters);

    if (probing) {
      // An explicit probe: wait for the pass to finish so the number includes
      // the GPU. It stalls by design, which is why it runs for a bounded number
      // of frames and only when asked for.
      try {
        const context = this.getContext();
        const finishStartMs = performance.now();
        context.finish();
        if (recorded) recorded.gpuMs = performance.now() - finishStartMs;
      } catch {
        // Context lost; leave the pass without a GPU figure.
      }
      syncProbeRemaining -= 1;
      if (syncProbeRemaining === 0) notify();
    } else if (gpuQuery && gpuTimer) {
      if (recorded) endGpuQuery(gpuQuery, recorded);
      else {
        try {
          gpuTimer.deleteQuery(gpuQuery);
        } catch {
          // Already released by a disjoint poll.
        }
      }
    }
  };

  gl.render = patched as THREE.WebGLRenderer['render'];
  installed = { gl, original };
  initGpuTimer(gl);
  sceneStats = collectSceneStats(scene);
  lastSceneStatsAtMs = performance.now();
  cachedSnapshot = null;
}

/** Restores the renderer method and clears the live window. */
export function uninstallRenderProfiler(): void {
  if (!installed) return;
  const { gl, original } = installed;
  gl.render = original;
  installed = null;
  activeFrame = null;
  frames = [];
  if (gpuTimer) {
    for (const pending of pendingGpuQueries) gpuTimer.deleteQuery(pending.query);
  }
  pendingGpuQueries = [];
  gpuTimer = null;
  gpuTiming = 'untested';
  syncProbeRemaining = 0;
  cachedSnapshot = null;
  for (const listener of snapshotListeners) listener();
}

/**
 * Marks the start of an animation frame. Called from `useFrame`, which runs
 * before the renderer is invoked, so the passes recorded since the previous
 * call belong to the previous frame.
 */
export function markRenderFrame(): void {
  if (!enabled || paused) return;
  const now = performance.now();
  if (activeFrame) finalizeFrame(now);
  activeFrame = { atMs: now, passes: [], reactMs: pendingReactMs };
  pendingReactMs = 0;
}

/**
 * React commit time reported by a `<Profiler>` around the scene.
 *
 * A commit is main-thread work that `gl.render` does not see, so a frame that
 * renders cheaply and still misses vsync can only be explained by it (or by the
 * GPU). Commits are attributed to the frame whose mark encloses them; a commit
 * that lands before the first mark is carried into it.
 */
export function recordReactCommit(actualDurationMs: number): void {
  if (!enabled || paused) return;
  if (!Number.isFinite(actualDurationMs) || actualDurationMs <= 0) return;
  if (activeFrame) activeFrame.reactMs += actualDurationMs;
  else pendingReactMs += actualDurationMs;
}

// ── Public store ─────────────────────────────────────────────────────────

export function isRenderProfilerEnabled(): boolean {
  return enabled;
}

export function subscribeRenderProfilerEnabled(listener: () => void): () => void {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

export function setRenderProfilerEnabled(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  persistEnabled(next);
  if (!next) {
    recording = null;
    uninstallRenderProfiler();
  }
  notifyEnabled();
  notify();
}

export function toggleRenderProfilerEnabled(): void {
  setRenderProfilerEnabled(!enabled);
}

/**
 * Measures GPU-inclusive frame cost for a bounded number of frames by waiting
 * (`gl.finish`) for each main pass.
 *
 * The preferred figure comes from `EXT_disjoint_timer_query_webgl2`, but
 * WebView2 does not expose it here, so the profiler offers this explicit probe
 * instead of guessing. It stalls by design: use it to find out whether the
 * frame is GPU-bound, then stop it.
 */
export function startGpuSyncProbe(frames = 90): void {
  if (!enabled) return;
  syncProbeRemaining = Math.max(10, Math.min(600, Math.round(frames)));
  gpuTiming = 'sync-probe';
  notify();
}

export function setRenderProfilerPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  if (paused) activeFrame = null;
  notify();
}

export function subscribeRenderProfiler(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function getRenderProfilerSnapshot(): RenderProfilerSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const window = frames.slice();
  cachedSnapshot = {
    enabled,
    paused,
    gpuTiming,
    frames: window,
    summary: summarizeRenderFrames(window, gpuTiming),
    sceneStats,
    recording: recording
      ? { active: true, captured: recording.length, limit: recordingLimit }
      : { active: false, captured: 0, limit: 0 },
    gpuProbeRemaining: syncProbeRemaining,
    lastReport,
    lastReportAtMs,
  };
  return cachedSnapshot;
}

export function startRenderProfileRecording(limit = DEFAULT_RECORD_FRAMES): void {
  recordingLimit = Math.max(30, Math.min(10_000, Math.round(limit)));
  recording = [];
  lastReport = null;
  lastReportAtMs = null;
  notify();
}

export function stopRenderProfileRecording(): void {
  if (!recording) return;
  finishRecording();
  notify();
}

function readViewport(): RenderProfileReport['viewport'] {
  if (typeof window === 'undefined') return null;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function readRendererName(): string | null {
  if (!installed) return null;
  try {
    const raw = installed.gl.getContext();
    const debugInfo = raw.getExtension('WEBGL_debug_renderer_info');
    const value = debugInfo
      ? raw.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : raw.getParameter(raw.RENDERER);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** The structured payload the overlay copies, and the report is built from. */
export function buildRenderProfileReport(): RenderProfileReport {
  const source = recording && recording.length > 0 ? recording : frames;
  return {
    summary: summarizeRenderFrames(source, gpuTiming),
    sceneStats,
    gpuTiming,
    frames: source.slice(),
    viewport: readViewport(),
    renderer: readRendererName(),
  };
}

/** Writes one summary line to `dragonfruit.log` and returns it. */
export async function logRenderProfileSummary(): Promise<string> {
  const line = formatRenderProfileLine(buildRenderProfileReport());
  lastReport = line;
  lastReportAtMs = performance.now();
  await logToNativeFile('info', line);
  notify();
  return line;
}

/** Copies the full report as JSON. Returns false when the clipboard refuses. */
export async function copyRenderProfileReport(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildRenderProfileReport(), null, 2));
    return true;
  } catch {
    return false;
  }
}

