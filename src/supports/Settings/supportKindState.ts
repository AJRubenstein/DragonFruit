export type SupportKind = 'trunk' | 'raft' | 'leaf' | 'branch' | 'stick' | 'twig' | 'grid' | 'auto';

/**
 * The kind the sidebar returns to when an edit session ends.
 *
 * Named here rather than at each reset site. Not a SupportTypeId: this union is
 * the tool selector, which carries non-type tools (raft, grid, auto) and omits
 * types with no sidebar tool of their own.
 */
export const DEFAULT_SUPPORT_KIND: SupportKind = 'trunk';

type SupportKindState = {
    kind: SupportKind;
};

let currentState: SupportKindState = {
    kind: 'trunk',
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((listener) => {
        try {
            listener();
        } catch (err) {
            console.error('[SupportKindState] listener error', err);
        }
    });
}

export function getSupportKindState(): SupportKindState {
    return currentState;
}

export function getActiveSupportKind(): SupportKind {
    return currentState.kind;
}

export function subscribeToSupportKindState(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setActiveSupportKind(kind: SupportKind): void {
    if (currentState.kind === kind) return;
    currentState = {
        ...currentState,
        kind,
    };
    notify();
}

export function getSupportKindSnapshot(): SupportKindState {
    return currentState;
}
