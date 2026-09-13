import { hasOwnAnatomyPreview } from '../anatomyPreviewRegistry';
import { panelForTab, TOOL_PANEL_TABS } from '../sidebarPanels';

import './PreviewTypes/Raft/RaftPreview';
import './PreviewTypes/Grid/GridPreview';
import './PreviewTypes/Brace/BracePreview';

/**
 * Loads every panel that draws its own anatomy preview, so its registration runs.
 *
 * A module nothing imports never executes, so a preview that registers itself
 * is silently absent and its panel falls through to the generic support
 * diagram. Mirrors `previewGeometry/registerBuiltinPreviewBuilders`.
 *
 * `TrunkPreview` is deliberately absent: it is the fallback, mounted directly.
 */
// Which panels must register is DERIVED: every tab other than the generic one
// opens a panel that draws itself. Listing them would put `'stick'` back into a
// hand-written type list, which is what the registry exists to remove.
const missing = TOOL_PANEL_TABS
    .map((tab) => panelForTab(tab))
    .filter((panel) => !hasOwnAnatomyPreview(panel));

if (missing.length > 0) {
    throw new Error(
        `anatomy preview panels have no registered preview: ${missing.join(', ')}. `
        + 'Add an import above -- a module nothing imports never registers.',
    );
}

export {};
