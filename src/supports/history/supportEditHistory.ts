import type { MessageDescriptor } from '@lingui/core';
import { pushSupportHistory } from '@/supports/history/supportHistory';
import { SUPPORT_EDIT_REPLACE } from './actionTypes';
import { SUPPORT_COLLECTION_KEYS } from '../supportTypeRegistry';
import { getSnapshot, type SupportState } from '../state';

export interface SupportEditHistorySnapshot {
  support: SupportState;
}

export function captureSupportEditSnapshot(): SupportEditHistorySnapshot {
  return { support: getSnapshot() };
}

type SupportEditHistoryJob = {
  description: MessageDescriptor;
  before: SupportState;
  after: SupportState;
};

const pendingJobs: SupportEditHistoryJob[] = [];
let flushScheduled = false;

/**
 * A snapshot without the interaction fields, so undo does not restore a
 * selection or hover from whenever the entry was recorded.
 *
 * A shallow copy is enough: the store replaces its state rather than mutating
 * it, so a captured snapshot never changes underfoot, and `pushHistory`
 * deep-clones whatever payload it stores.
 */
function withoutInteractionState(snapshot: SupportState): SupportState {
  return {
    ...snapshot,
    selectedId: null,
    selectedCategory: null,
    hoveredId: null,
    hoveredCategory: 'none',
  };
}

/**
 * Pushes every queued entry, oldest first.
 *
 * Exported so anything that pushes its own history can drain this queue first:
 * a pending entry that lands afterwards would sit above an edit the user made
 * later, and one undo would revert the wrong one.
 */
export function flushSupportEditHistory(): void {
  flushScheduled = false;
  if (pendingJobs.length === 0) return;

  const jobs = pendingJobs.splice(0, pendingJobs.length);
  for (const job of jobs) {
    pushSupportHistory({
      type: SUPPORT_EDIT_REPLACE,
      description: job.description,
      payload: { before: job.before, after: job.after },
    });
  }
}

/** Drops queued entries, for a caller clearing the stacks they would land on. */
export function cancelPendingSupportEditHistory(): void {
  pendingJobs.length = 0;
  flushScheduled = false;
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => flushSupportEditHistory(), { timeout: 250 });
  } else {
    setTimeout(flushSupportEditHistory, 0);
  }
}

/**
 * Whether an edit changed anything worth an undo step.
 *
 * Collection identity first, which is free: `normaliseSupportState` keeps it
 * across a write that only moved hover or selection, so a click that grabbed a
 * handle and let go is rejected without reading the state. Only when identity
 * differs is the content compared, since a write can produce an equal value.
 */
function changedAnything(before: SupportState, after: SupportState): boolean {
  const touched = SUPPORT_COLLECTION_KEYS.filter((key) => before[key] !== after[key]);
  if (touched.length === 0) return false;
  return touched.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

/**
 * Records a whole-state support edit, pushed when the main thread next idles.
 *
 * Deferred because the store clones each payload it keeps, which is tens of
 * milliseconds on a large scene -- too much to spend at drag-end. The pair is
 * captured now, though: the snapshots are immutable, so what lands is what the
 * edit saw, whatever happens before the flush.
 *
 * An edit that changed nothing is dropped: every gizmo pushes at drag end
 * whether or not the drag moved anything, and an empty entry costs the user an
 * undo press and clears the redo stack.
 */
export function pushSupportEditHistory(
  description: MessageDescriptor,
  before: SupportEditHistorySnapshot,
  after: SupportEditHistorySnapshot,
) {
  if (!changedAnything(before.support, after.support)) return;

  pendingJobs.push({
    description,
    before: withoutInteractionState(before.support),
    after: withoutInteractionState(after.support),
  });
  scheduleFlush();
}
