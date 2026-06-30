interface SupportInspectorState {
    enabled: boolean;
    treeTypesEnabled: boolean;
}

let state: SupportInspectorState = {
    enabled: false,
    treeTypesEnabled: false,
};

const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) listener();
}

export function subscribeToSupportInspectorState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSupportInspectorState(): SupportInspectorState {
    return state;
}

export function getSupportInspectorEnabled(): boolean {
    return state.enabled;
}

export function setSupportInspectorEnabled(enabled: boolean): void {
    if (state.enabled === enabled) return;
    state = {
        ...state,
        enabled,
        treeTypesEnabled: enabled ? state.treeTypesEnabled : false,
    };
    emit();
}

export function toggleSupportInspectorEnabled(): void {
    setSupportInspectorEnabled(!state.enabled);
}

export function toggleSupportInspectorTreeTypes(): void {
    if (!state.enabled) return;
    state = { ...state, treeTypesEnabled: !state.treeTypesEnabled };
    emit();
}
