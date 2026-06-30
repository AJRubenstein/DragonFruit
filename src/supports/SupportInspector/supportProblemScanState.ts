import type { SupportProblem } from './supportProblemScan';

interface SupportProblemScanState {
    open: boolean;
    problems: SupportProblem[];
    scannedAtMs: number | null;
}

let state: SupportProblemScanState = { open: false, problems: [], scannedAtMs: null };

const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) listener();
}

export function subscribeToSupportProblemScanState(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getSupportProblemScanState(): SupportProblemScanState {
    return state;
}

export function setSupportProblemScanResults(problems: SupportProblem[]): void {
    state = { open: true, problems, scannedAtMs: Date.now() };
    emit();
}

export function closeSupportProblemScan(): void {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
}
