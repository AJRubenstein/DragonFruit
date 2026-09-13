import {
    getSupportTypeDescriptor,
    SIDEBAR_PANEL_TYPE_IDS,
    SUPPORT_TYPES,
    type SidebarTab,
    type SupportTypeId,
} from '../supportTypeRegistry';
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
 * Which types the sidebar actually offers is a UI decision, so each type DECLARES
 * it (`offersSidebarPanel`) and the registry exports the offered ones in the
 * order the sidebar shows them -- `SIDEBAR_PANEL_TYPE_IDS`, held to the flags by
 * a module-load check. Every type COULD be a panel (see `typePanelFacts`, which
 * answers for all of them), but showing one needs settings the sidebar has no
 * fields for yet.
 */

/** Re-exported so a panel consumer has one import site for the sidebar's vocab. */
export type { SidebarTab };

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

/**
 * The types the sidebar currently offers a panel for.
 *
 * A UI list rather than a fact, so it is declared on the descriptors: each type
 * says whether it is offered (`offersSidebarPanel`), and the registry exports
 * them in the ORDER the sidebar offers them -- which is observable, because
 * `panelForTab` opens the first panel declaring a tab. Registry order is not
 * that order (it declares branch before leaf; the sidebar offers leaf first).
 */
const TYPE_PANELS: readonly SupportTypeId[] = SIDEBAR_PANEL_TYPE_IDS;

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
    // A tool panel declares only its tab and groups; `drawsOwnPreview` is derived
    // for every panel alike, so the cast cannot smuggle an absent field through.
    if (panel in TOOL_PANELS) {
        return {
            ...TOOL_PANELS[panel as ToolPanel],
            drawsOwnPreview: hasOwnAnatomyPreview(panel),
        };
    }
    return typePanelFacts(panel as SupportTypeId);
}

/**
 * The tab a panel is edited under. Tool panels answer for themselves; every
 * type answers from its descriptor.
 */
export function tabPanelFor(panel: SidebarPanel): SidebarTab | 'auto' {
    return panelFacts(panel).tab;
}

/**
 * The panel a tab opens, the first that declares it. Derived, so the two cannot
 * drift: the support-info tab opens trunk's panel because trunk is offered
 * first, and 'bracing' opens stick's because stick alone declares it.
 */
export function panelForTab(tab: SidebarTab): SidebarPanel {
    const panel = SIDEBAR_PANELS.find((candidate) => panelFacts(candidate).tab === tab);
    if (!panel) throw new Error(`no panel declares the "${tab}" tab`);
    return panel;
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
 *
 * The support-info tab's panel, which is the trunk panel: `panelForTab` answers
 * with the first panel declaring a tab, and trunk leads `SIDEBAR_PANEL_TYPE_IDS`.
 * Derived rather than spelled, so a rename reaches it; `panelForTab` throwing
 * for a tab no panel declares is the load-time check that this stayed true.
 */
export const DEFAULT_SIDEBAR_PANEL: SidebarPanel = panelForTab('supportInfo');

/**
 * Tabs other than the generic support-info one.
 *
 * Each opens a panel that draws its own anatomy preview, so this is what the
 * preview registration barrel checks against -- derived rather than a list, so
 * no type name is written out to say "stick draws its own".
 */
export const TOOL_PANEL_TABS: readonly SidebarTab[] = [
    ...new Set(
        SIDEBAR_PANELS
            .map((panel) => panelFacts(panel).tab)
            .filter((tab): tab is SidebarTab =>
                tab !== 'auto' && tab !== panelFacts(DEFAULT_SIDEBAR_PANEL).tab),
    ),
];

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
