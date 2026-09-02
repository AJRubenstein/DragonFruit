"use client";

import { useSyncExternalStore } from 'react';
import type { KickstandBuildResult, KickstandState } from './types';
import type { SupportState } from '../../types';
import {
    addKickstandToState,
    getSnapshot,
    resetKickstandsInState,
    setSnapshot,
    subscribe,
    beginSupportStateBatch,
    endSupportStateBatch,
    updateKickstand as updateKickstandInStore
} from '../../state';

export type { KickstandState } from './types';

/**
 * Kickstands live on SupportState; this module is the API its callers already
 * use. The KickstandState they read is a VIEW over it, with roots and knots
 * filtered to those a kickstand owns.
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

export function subscribeToKickstandStore(listener: () => void) {
    return subscribe(listener);
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

export function resetKickstandStore() {
    resetKickstandsInState();
}

export function addKickstand(build: KickstandBuildResult) {
    addKickstandToState(build);
}

export function updateKickstand(buildOrKickstand: KickstandBuildResult | KickstandState['kickstands'][string]) {
    if ('kickstand' in buildOrKickstand) {
        addKickstandToState(buildOrKickstand);
        return;
    }
    updateKickstandInStore(buildOrKickstand);
}

// Batching is SupportState's now that the data is. Delegated rather than made a
// no-op: callers use these to suppress notification storms during bulk edits.
export function beginKickstandStoreBatch() {
    beginSupportStateBatch();
}

export function endKickstandStoreBatch() {
    endSupportStateBatch();
}

export function useKickstandStoreState() {
    return useSyncExternalStore(
        subscribeToKickstandStore,
        getKickstandSnapshot,
        getKickstandSnapshot,
    );
}
