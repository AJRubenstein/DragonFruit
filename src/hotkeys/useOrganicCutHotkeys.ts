import { useEffect } from 'react';
import type { RefObject } from 'react';
import { registerDeleteHandler } from '@/features/delete/deleteRegistry';

/**
 * Priority for the Cut tool's delete claim. Above the support-interaction
 * handler (100) so that while a seam is being drawn, Delete edits the seam and
 * can never fall through to deleting the model itself.
 */
export const ORGANIC_CUT_DELETE_PRIORITY = 200;

/** The slice of Cut-tool session state Delete needs, read through a ref. */
export type OrganicCutHotkeyState = {
  /** True while the Cut tool is the active transform mode. */
  active: boolean;
  removePoint: (index: number) => void;
  selectedIndex: number | null;
};

/**
 * Delete handling for the Cut tool, claimed through the delete registry at
 * [`ORGANIC_CUT_DELETE_PRIORITY`] so the configurable `GLOBAL.DELETE` binding
 * removes the selected waypoint instead of the model. The claim covers the whole
 * tool session — even with no waypoint selected — because a Delete that fell
 * through to the model would be destructive.
 *
 * Undo/redo are NOT handled here: every Cut edit is pushed to the app history
 * (see history/actionTypes.ts), so the normal global undo/redo inverts them.
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
}
