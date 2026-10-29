/**
 * Temporary probe: opt-in timing marks, read with
 * `performance.getEntriesByType('measure')`. Costs a branch per call when off.
 */
export function perfEnabled(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { __dfPerf?: boolean }).__dfPerf);
}

export function perfMark(label: string): number {
  return perfEnabled() ? performance.now() : 0;
}

export function perfMeasure(label: string, start: number): void {
  if (!perfEnabled() || start === 0) return;
  performance.measure(`[df] ${label}`, { start, end: performance.now() });
}

/**
 * Temporary bisect switch: `window.__dfLayers = { merged: false }` drops one
 * layer from the scene so a commit's cost can be attributed to it.
 */
export function perfLayerEnabled(name: 'merged' | 'proxy' | 'mergedMesh' | 'shapes' | 'rafts' | 'overlay'): boolean {
  if (typeof window === 'undefined') return true;
  const layers = (window as unknown as { __dfLayers?: Partial<Record<'merged' | 'proxy' | 'mergedMesh' | 'shapes' | 'rafts' | 'overlay', boolean>> }).__dfLayers;
  return layers?.[name] !== false;
}
