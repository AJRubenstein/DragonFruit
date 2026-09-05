"use client";

import { useSyncExternalStore } from 'react';
import type { KickstandBuildResult, KickstandState } from './types';
import type { SupportState } from '../../types';
import { addKnot, addRoot, addSupportEntity, getSnapshot, setSnapshot, subscribe, updateKickstand as updateKickstandInStore } from '../../state';

export type { KickstandState } from './types';

/**
 * Kickstands live on SupportState; this module is the API its callers already
 * use. The KickstandState they read is a VIEW over it, with roots and knots
 * filtered to those a kickstand owns.
 *
 * @deprecated for removal -- a compatibility shim left by the kickstand
 * flattening. Every export below reads or writes `state` directly, so a caller
 * can use `getSnapshot()` / `getSupportEntities('kickstand')` and drop the
 * filtered view. Kept because ~83 files still import it. No kickstand-specific
 * logic may be added here; it is a wrapper, not a store.
 */
// Rebuilt only when SupportState changes identity: useSyncExternalStore compares
// by reference and would re-render forever given a fresh object each call.
let cachedSource: SupportState | null = null;
let cachedView: KickstandState | null = null;

export function getKickstandSnapshot(): KickstandState {
    const s = getSnapshot();
    if (cachedSource === s && cachedView) return cachedView;

    const kickstands = s.kickstands;
    const roots: KickstandState['roots'] = {};
    const knots: KickstandState['knots'] = {};
    for (const kickstand of Object.values(kickstands)) {
        const root = s.roots[kickstand.rootId];
        if (root) roots[root.id] = root;
        const hostKnot = s.knots[kickstand.hostKnotId];
        if (hostKnot) knots[hostKnot.id] = hostKnot;
    }

    cachedSource = s;
    cachedView = { kickstands, roots, knots, selectedId: s.selectedId };
    return cachedView;
}

/**
 * Replace kickstand data. Roots and knots merge into the shared collections
 * rather than replacing them -- overwriting would drop every other root and knot.
 */
export function setKickstandSnapshot(next: KickstandState) {
    const s = getSnapshot();
    setSnapshot({
        ...s,
        kickstands: next.kickstands,
        roots: { ...s.roots, ...next.roots },
        knots: { ...s.knots, ...next.knots },
    });
}

export function updateKickstand(buildOrKickstand: KickstandBuildResult | KickstandState['kickstands'][string]) {
    if ('kickstand' in buildOrKickstand) {
        // A build carries the root and host knot it created; add all three as
        // ordinary entities.
        addRoot(buildOrKickstand.root);
        addKnot(buildOrKickstand.hostKnot);
        addSupportEntity('kickstand', buildOrKickstand.kickstand);
        return;
    }
    updateKickstandInStore(buildOrKickstand);
}

export function useKickstandStoreState() {
    return useSyncExternalStore(
        subscribe,
        getKickstandSnapshot,
        getKickstandSnapshot,
    );
}
