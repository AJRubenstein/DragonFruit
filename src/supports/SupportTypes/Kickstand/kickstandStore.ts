"use client";

import { useSyncExternalStore } from 'react';
import type { KickstandBuildResult, KickstandState } from './types';
import type { SupportState } from '../../types';
import type * as THREE from 'three';
import {
    addKickstandToState,
    getSnapshot,
    removeKickstandFromState,
    reassignAllKickstandModelIdsInState,
    resetKickstandsInState,
    setSnapshot,
    subscribe,
    beginSupportStateBatch,
    endSupportStateBatch,
    transformAllKickstandsInState,
    transformKickstandsForModelInState,
    updateKickstandInState,
    setSelectedId,
} from '../../state';

export type { KickstandState } from './types';

/**
 * Kickstands are a SupportState collection; this module is the API its callers
 * already use, kept so ~200 call sites did not have to change in the same commit
 * that moved the data.
 *
 * The KickstandState shape callers read (`kickstands`/`roots`/`knots`) is now a
 * VIEW over SupportState rather than a second copy. Roots and knots are filtered
 * to those a kickstand owns, so a reader that walks `roots` still sees only
 * kickstand roots and does not have to learn that the collections merged.
 */
// The view is rebuilt only when SupportState changes identity. useSyncExternalStore
// compares snapshots by reference and re-renders forever if handed a fresh object
// every call, and 15 components subscribe through this.
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
 * Replace kickstand data wholesale.
 *
 * Roots and knots in `next` are merged into the shared collections rather than
 * replacing them: they are the same collections everything else lives in now, so
 * overwriting would drop every non-kickstand root and knot in the scene.
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

export function setKickstandSelectedId(id: string | null) {
    setSelectedId(id);
}

export function addKickstand(build: KickstandBuildResult) {
    addKickstandToState(build);
}

export function updateKickstand(buildOrKickstand: KickstandBuildResult | KickstandState['kickstands'][string]) {
    if ('kickstand' in buildOrKickstand) {
        addKickstandToState(buildOrKickstand);
        return;
    }
    updateKickstandInState(buildOrKickstand);
}

export function removeKickstand(id: string): KickstandBuildResult | null {
    return removeKickstandFromState(id);
}

export function transformKickstandsForModel(
    modelId: string,
    deltaMatrix: THREE.Matrix4,
    touchedRootIds?: Set<string>,
    touchedKnotIds?: Set<string>,
    touchedSegmentIds?: Set<string>,
    preserveRootZ = false,
): boolean {
    // preserveRootZ is accepted and ignored: kickstand roots are in the shared
    // roots collection now, and the caller's main walk grounds them.
    void preserveRootZ;
    return transformKickstandsForModelInState(
        modelId,
        deltaMatrix,
        touchedRootIds,
        touchedKnotIds,
        touchedSegmentIds,
    );
}

export function transformAllKickstands(deltaMatrix: THREE.Matrix4, preserveRootZ = false): boolean {
    void preserveRootZ;
    return transformAllKickstandsInState(deltaMatrix);
}

export function reassignAllKickstandModelIds(modelId: string): boolean {
    return reassignAllKickstandModelIdsInState(modelId);
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
