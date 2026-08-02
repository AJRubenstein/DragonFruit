// User-adjustable UI scale, applied via native webview zoom (Webview::setZoom).
// The base UI is a fixed reference density; this lets users magnify or compact
// the whole interface. Default 1 (100%) = the DPI-correct reference size.

export type UiScalePreset = 0.75 | 0.9 | 1 | 1.1 | 1.25 | 1.5;

export const UI_SCALE_STORAGE_KEY = 'ui-scale';
const UI_SCALE_EVENT = 'ui-scale-changed';

export const DEFAULT_UI_SCALE: UiScalePreset = 1;

export const UI_SCALE_PRESETS: UiScalePreset[] = [0.75, 0.9, 1, 1.1, 1.25, 1.5];

export function normalizeUiScale(input: unknown): UiScalePreset {
  if (typeof input === 'number' && (UI_SCALE_PRESETS as number[]).includes(input)) {
    return input as UiScalePreset;
  }
  return DEFAULT_UI_SCALE;
}

export function getSavedUiScale(): UiScalePreset {
  if (typeof window === 'undefined') return DEFAULT_UI_SCALE;

  try {
    const raw = window.localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (raw == null) return DEFAULT_UI_SCALE;
    return normalizeUiScale(JSON.parse(raw));
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

export function saveUiScale(scale: UiScalePreset): void {
  if (typeof window === 'undefined') return;

  const normalized = normalizeUiScale(scale);

  try {
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures
  }

  window.dispatchEvent(new CustomEvent(UI_SCALE_EVENT, { detail: normalized }));
}

export function subscribeToUiScale(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== UI_SCALE_STORAGE_KEY) return;
    listener();
  };

  const onCustom = () => listener();

  window.addEventListener('storage', onStorage);
  window.addEventListener(UI_SCALE_EVENT, onCustom as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UI_SCALE_EVENT, onCustom as EventListener);
  };
}
