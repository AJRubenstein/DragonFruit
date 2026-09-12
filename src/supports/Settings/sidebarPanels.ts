import { getSupportTypeDescriptor, SUPPORT_TYPES, type SupportTypeId } from '../supportTypeRegistry';
import { hasOwnAnatomyPreview } from './anatomyPreviewRegistry';

/**
 * The support sidebar's panels.
 *
 * A panel is a section of the sidebar: it shows a subset of the support settings
 * and an anatomy preview. Two kinds of thing are panels -- support TYPES (the
 * ones the sidebar offers) and TOOLS (raft, grid, auto) which have settings but
 * are not entity types.
 *
 * A type's panel facts are DERIVED, from the registry or from whether a preview
 * registered itself. Only the tool panels are declared here, because there is no
 * registry to ask: they are not support types.
 *
 * Which types the sidebar actually offers is a UI decision, so it is listed
 * rather than derived -- every type COULD be a panel (see `typePanelFacts`,
 * which answers for all of them and is held by `sidebarPanels.test.ts`), but
 * showing one needs settings the sidebar has no fields for yet.
 */

/** The sidebar's tabs. A panel is reached through exactly one. */
export type SidebarTab = 'trunk' | 'raft' | 'grid' | 'stick';

/** Panels that are not support types, so nothing else can answer for them. */
const TOOL_PANELS = {
    raft: {
        tab: 'raft',
        settingsGroups: { tip: false, shaft: false, roots: false },
    },
    grid: {
        tab: 'grid',
        settingsGroups: { tip: false, shaft: false, roots: false },
    },
    auto: {
        tab: 'auto',
        settingsGroups: { tip: false, shaft: false, roots: false },
    },
} as const;

/** The support settings groups a panel can offer fields for. */
export interface PanelSettingsGroups {
    /** The contact tip profile: length and cone angle. */
    tip: boolean;
    /** The shaft diameter. */
    shaft: boolean;
    /** The plate root diameter. */
    roots: boolean;
}

/** Everything the sidebar needs to know about one panel. */
export interface PanelFacts {
    tab: SidebarTab | 'auto';
    settingsGroups: PanelSettingsGroups;
    /** Whether the panel draws its own anatomy preview. Derived: see the registry. */
    drawsOwnPreview: boolean;
}

/**
 * A type's panel facts, answered for EVERY type.
 *
 * `hasEditableSettings` gates all of it: a type with no editable settings offers
 * no fields whatever its geometry looks like (stick, brace). Beyond that:
 *
 * - `tip` -- the type's contacts are CONES, so the tip profile applies. A twig's
 *   contacts are disks and its tip profile is not what shapes it.
 * - `shaft` -- a shaft whose diameter is directly editable. A tapered shaft's
 *   diameter comes from its ends, so the field would be a lie (twig).
 * - `roots` -- the type stands on a plate root.
 *
 * Note what these are NOT: `shaft` is not `hasSegments` (twig and stick have
 * segments and no editable shaft), and `roots` is not "has a root" (an anchor
 * has its own, with its own fields). Geometry and editability are different
 * questions, which is why the sidebar flags could not simply be read off.
 */
export function typePanelFacts(typeId: SupportTypeId): PanelFacts {
    const d = getSupportTypeDescriptor(typeId);
    return {
        tab: d.sidebarTab,
        settingsGroups: {
            tip: d.hasEditableSettings && d.contactFields.some((field) => field.startsWith('contactCone')),
            shaft: d.hasEditableSettings && d.hasSegments && !d.shaftTaper,
            roots: d.lower.kind === 'plateRoot',
        },
        drawsOwnPreview: hasOwnAnatomyPreview(typeId),
    };
}

/** The types the sidebar currently offers a panel for. A UI list, not a fact. */
const TYPE_PANELS: readonly SupportTypeId[] = ['trunk', 'leaf', 'branch', 'twig', 'stick'];

/** Every panel the sidebar offers, in tab order. */
export const SIDEBAR_PANELS: readonly SidebarPanel[] = [
    ...TYPE_PANELS,
    ...(Object.keys(TOOL_PANELS) as ToolPanel[]),
];

export type ToolPanel = keyof typeof TOOL_PANELS;
export type SidebarPanel = SupportTypeId | ToolPanel;

/** Whether `value` names a panel. */
export function isSidebarPanel(value: string): value is SidebarPanel {
    return (SIDEBAR_PANELS as readonly string[]).includes(value);
}

/** The facts for any panel, whichever kind it is. */
export function panelFacts(panel: SidebarPanel): PanelFacts {
    if (panel in TOOL_PANELS) return TOOL_PANELS[panel as ToolPanel] as PanelFacts;
    return typePanelFacts(panel as SupportTypeId);
}

/** The tab a panel is edited under. */
export function tabPanelFor(panel: SidebarPanel): SidebarTab | 'auto' {
    return panelFacts(panel).tab;
}

/** Whether the panel offers the given settings group. */
export function panelHas(
    panel: SidebarPanel | null | undefined,
    group: keyof PanelSettingsGroups,
): boolean {
    return !!panel && panelFacts(panel).settingsGroups[group];
}

/** Whether the anatomy preview draws this panel itself, rather than falling through. */
export function panelDrawsOwnPreview(panel: SidebarPanel): boolean {
    return panelFacts(panel).drawsOwnPreview;
}

/**
 * The panel the sidebar returns to when an edit session ends.
 */
export const DEFAULT_SIDEBAR_PANEL: SidebarPanel = 'trunk';

type SidebarPanelState = {
    panel: SidebarPanel;
};

let currentState: SidebarPanelState = {
    panel: DEFAULT_SIDEBAR_PANEL,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((listener) => listener());
}

export function getSidebarPanelState(): SidebarPanelState {
    return currentState;
}

export function getActiveSidebarPanel(): SidebarPanel {
    return currentState.panel;
}

export function subscribeToSidebarPanel(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setActiveSidebarPanel(panel: SidebarPanel): void {
    if (currentState.panel === panel) return;
    currentState = { panel };
    notify();
}

export function getSidebarPanelSnapshot(): SidebarPanelState {
    return currentState;
}

/** Every type, for a caller that needs to know one could become a panel. */
export const ALL_TYPE_PANEL_FACTS: readonly { id: SupportTypeId; facts: PanelFacts }[] =
    SUPPORT_TYPES.map((descriptor) => ({ id: descriptor.id, facts: typePanelFacts(descriptor.id) }));
