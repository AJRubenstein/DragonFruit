import { useEffect } from 'react';
import type { RefObject } from 'react';
import { redo, undo } from '@/history/historyStore';
import { registerDeleteHandler } from '@/features/delete/deleteRegistry';
import { hotkeyStore, isActionActiveSync } from './hotkeyStore';

/**
 * Priority for the Cut tool's delete claim. Above the support-interaction
 * handler (100) so that while a seam is being drawn, Delete edits the seam and
 * can never fall through to deleting the model itself.
 */
export const ORGANIC_CUT_DELETE_PRIORITY = 200;

/**
 * The slice of Cut-tool session state these hotkeys read, passed as a ref so the
 * store subscription below never has to be torn down and rebuilt as the session
 * changes (waypoint edits change `canUndoPoint` on nearly every click).
 */
export type OrganicCutHotkeyState = {
  /** True while the Cut tool is the active transform mode. */
  active: boolean;
  undoPoint: () => void;
  redoPoint: () => void;
  canUndoPoint: boolean;
  canRedoPoint: boolean;
  removePoint: (index: number) => void;
  selectedIndex: number | null;
};

/**
 * Cut-tool keyboard handling, routed through the central hotkey system rather
 * than direct window listeners (see docs/reference/hotkeys.md).
 *
 * - **Delete**: claimed through the delete registry at
 *   [`ORGANIC_CUT_DELETE_PRIORITY`], so the configurable `GLOBAL.DELETE` binding
 *   removes the selected waypoint instead of the model. The claim is active for
 *   the whole tool session — even with no waypoint selected — because a Delete
 *   that silently fell through to the model would be destructive.
 * - **Undo / redo**: while the tool is active this hook owns the configurable
 *   `GLOBAL.UNDO` / `GLOBAL.REDO` bindings, stepping the waypoint history first
 *   and delegating to the global model history once the seam has nothing left to
 *   step. The caller must pass `disabled` to `useUndoRedoHotkeys` for the same
 *   condition so exactly one subscriber acts on a press.
 */
export function useOrganicCutHotkeys(stateRef: RefObject<OrganicCutHotkeyState>) {
  useEffect(() => {
    // registerDeleteHandler's unregister returns a boolean; wrap it so the
    // effect cleanup stays void.
    const unregister = registerDeleteHandler(
      () => stateRef.current.active,
      () => {
        const s = stateRef.current;
        if (s.selectedIndex != null) s.removePoint(s.selectedIndex);
      },
      ORGANIC_CUT_DELETE_PRIORITY,
    );
    return () => {
      unregister();
    };
  }, [stateRef]);

  useEffect(() => {
    let wasUndoActive = false;
    let wasRedoActive = false;

    const unsubscribe = hotkeyStore.subscribe(() => {
      // Redo is a strict superset of Undo (adds Shift by default) so it is
      // checked first, matching useUndoRedoHotkeys.
      const isRedoActive = isActionActiveSync('GLOBAL', 'REDO');
      const isUndoActive = isActionActiveSync('GLOBAL', 'UNDO');
      const s = stateRef.current;

      if (s.active) {
        if (isRedoActive && !wasRedoActive) {
          if (s.canRedoPoint) s.redoPoint();
          else redo();
        } else if (isUndoActive && !wasUndoActive) {
          if (s.canUndoPoint) s.undoPoint();
          else undo();
        }
      }

      wasUndoActive = isUndoActive;
      wasRedoActive = isRedoActive;
    });

    return unsubscribe;
  }, [stateRef]);
}
