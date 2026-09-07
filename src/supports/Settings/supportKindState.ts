/**
 * The sidebar tool selector. Its own vocabulary, not SupportTypeId: it carries
 * non-type tools (raft, grid, auto) and omits types with no sidebar tool.
 *
 * `drawsOwnPreview` -- the anatomy preview draws this kind itself.
 * `hasContactCone` / `hasShaft` / `hasPlateRoot` -- which settings fields show.
 */
export const SUPPORT_KINDS = {
    trunk: { drawsOwnPreview: false, hasContactCone: true, hasShaft: true, hasPlateRoot: true },
    raft: { drawsOwnPreview: true, hasContactCone: false, hasShaft: false, hasPlateRoot: false },
    leaf: { drawsOwnPreview: false, hasContactCone: true, hasShaft: false, hasPlateRoot: false },
    branch: { drawsOwnPreview: false, hasContactCone: true, hasShaft: true, hasPlateRoot: false },
    stick: { drawsOwnPreview: true, hasContactCone: false, hasShaft: false, hasPlateRoot: false },
    twig: { drawsOwnPreview: false, hasContactCone: false, hasShaft: false, hasPlateRoot: false },
    grid: { drawsOwnPreview: true, hasContactCone: false, hasShaft: false, hasPlateRoot: false },
    auto: { drawsOwnPreview: false, hasContactCone: false, hasShaft: false, hasPlateRoot: false },
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

/** Whether the sidebar offers this kind the given settings group. */
export function kindHas(
    kind: SupportKind | null | undefined,
    group: 'hasContactCone' | 'hasShaft' | 'hasPlateRoot',
): boolean {
    return !!kind && SUPPORT_KINDS[kind][group];
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
