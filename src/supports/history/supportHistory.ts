import { pushHistory, registerHistoryHandler } from '@/history/historyStore';
import type { HistoryDirection } from '@/history/types';
import type { SupportHistoryActionType, SupportHistoryPayloadMap } from './actionTypes';

/**
 * Push a support history entry with the payload its type requires. The compiler
 * rejects a payload that doesn't match the action type, so a push site can't
 * drift from the handler that inverts it.
 */
export function pushSupportHistory<K extends SupportHistoryActionType>(action: {
  type: K;
  payload: SupportHistoryPayloadMap[K];
  description?: string;
}): void {
  pushHistory(action);
}

export type SupportHistoryHandler<K extends SupportHistoryActionType> = (
  payload: SupportHistoryPayloadMap[K],
  direction: HistoryDirection,
) => boolean | void;

/**
 * Register a handler that receives its action's payload already narrowed. The
 * single `as` cast the untyped store forces lives here, once, instead of at the
 * top of every handler body.
 */
export function registerSupportHistoryHandler<K extends SupportHistoryActionType>(
  type: K,
  handler: SupportHistoryHandler<K>,
): () => void {
  return registerHistoryHandler(type, (action, direction) =>
    handler(action.payload as SupportHistoryPayloadMap[K], direction),
  );
}
