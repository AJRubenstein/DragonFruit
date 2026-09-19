import type { ComponentType } from 'react';

import type { SidebarPanel } from './sidebarPanels';

/**
 * Which component draws a sidebar panel's anatomy preview.
 *
 * A panel's preview registers itself from wherever that preview lives -- a
 * support type's own folder, or the tool's own module -- so the sidebar mounts
 * whatever is registered rather than holding a table it must be kept in step
 * with.
 *
 * "Does this panel draw its own preview" is "did anyone register one", so a
 * registration cannot disagree with itself.
 *
 * A panel that registers nothing falls through to `TrunkPreview`, the generic
 * renderer, which is deliberately not registered here.
 */
export interface AnatomyPreviewProps {
    settings: unknown;
    liveConfig: unknown;
    previewState: unknown;
    /** The panel being previewed, so one component could serve several. */
    activePanel: SidebarPanel;
    anatomyOverrides: unknown;
    raftSettings: unknown;
}

type AnatomyPreview = ComponentType<AnatomyPreviewProps>;

const ANATOMY_PREVIEWS = new Map<SidebarPanel, AnatomyPreview>();

/**
 * Registers a panel's own anatomy preview.
 *
 * Called at module load from the preview's own module. A panel that never
 * registers one is rendered by the generic fallback.
 */
export function registerAnatomyPreview(panel: SidebarPanel, preview: AnatomyPreview): void {
    ANATOMY_PREVIEWS.set(panel, preview);
}

/** The preview registered for `panel`, or null to use the generic fallback. */
export function anatomyPreviewFor(panel: SidebarPanel): AnatomyPreview | null {
    return ANATOMY_PREVIEWS.get(panel) ?? null;
}

/** Whether `panel` draws its own preview rather than falling through. */
export function hasOwnAnatomyPreview(panel: SidebarPanel): boolean {
    return ANATOMY_PREVIEWS.has(panel);
}
