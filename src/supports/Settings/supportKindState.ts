/**
 * The sidebar tool selector, and what each tool implies.
 *
 * Its own vocabulary, not SupportTypeId: it carries non-type tools (raft, grid,
 * auto) and omits types with no sidebar tool. Properties are declared here for
 * the same reason support types declare theirs -- a new tool that forgets one
 * silently inherits the default behaviour.
 *
 * `drawsOwnPreview` -- the anatomy preview renders this kind itself rather than
 * falling back to the trunk preview.
 */
export const SUPPORT_KINDS = {
    trunk: { drawsOwnPreview: false },
    raft: { drawsOwnPreview: true },
    leaf: { drawsOwnPreview: false },
    branch: { drawsOwnPreview: false },
    stick: { drawsOwnPreview: true },
    twig: { drawsOwnPreview: false },
    grid: { drawsOwnPreview: true },
    auto: { drawsOwnPreview: false },
} as const;

export type SupportKind = keyof typeof SUPPORT_KINDS;

/** Whether a support type id also names a sidebar tool. Not every one does. */
export function isSupportKind(value: string): value is SupportKind {
    return value in SUPPORT_KINDS;
}

/** Whether the anatomy preview draws this kind itself. */
export function kindDrawsOwnPreview(kind: SupportKind): boolean {
    return SUPPORT_KINDS[kind].drawsOwnPreview;
}

/**
 * The kind the sidebar returns to when an edit session ends.
 *
 * Named here rather than at each reset site.
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
