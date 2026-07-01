import type { SupportState } from '@/supports/types';
import { subscribe as subscribeSupportState, getSnapshot as getSupportSnapshot } from '@/supports/state';
import { diffSupportStates, type SupportChangeEntry } from './supportChangeMonitor';

interface SupportChangeMonitorState {
    armed: boolean;
    open: boolean;
    armedAtMs: number | null;
    lastDiffAtMs: number | null;
    changes: SupportChangeEntry[];
}

let state: SupportChangeMonitorState = {
    armed: false, open: false, armedAtMs: null, lastDiffAtMs: null, changes: [],
};
let baseline: SupportState | null = null;
let unsubscribeFromStore: (() => void) | null = null;

const listeners = new Set<() => void>();
function emit(): void {
    for (const listener of listeners) listener();
}

function recompute(): void {
    if (!baseline) return;
    state = { ...state, changes: diffSupportStates(baseline, getSupportSnapshot()), lastDiffAtMs: Date.now() };
    emit();
}

export function subscribeToSupportChangeMonitorState(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getSupportChangeMonitorState(): SupportChangeMonitorState {
    return state;
}

/** Captures a fresh baseline from the current support state and opens the HUD.
 * Every subsequent support-state change is diffed against THIS baseline until
 * the monitor is re-armed. */
export function armSupportChangeMonitor(): void {
    baseline = structuredClone(getSupportSnapshot());
    const now = Date.now();
    state = { armed: true, open: true, armedAtMs: now, lastDiffAtMs: now, changes: [] };
    if (!unsubscribeFromStore) {
        unsubscribeFromStore = subscribeSupportState(recompute);
    }
    emit();
}

export function disarmSupportChangeMonitor(): void {
    if (unsubscribeFromStore) {
        unsubscribeFromStore();
        unsubscribeFromStore = null;
    }
    baseline = null;
    state = { armed: false, open: false, armedAtMs: null, lastDiffAtMs: null, changes: [] };
    emit();
}

export function closeSupportChangeMonitorPanel(): void {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
}
