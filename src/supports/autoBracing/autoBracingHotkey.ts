import type { SidebarPanel } from '../Settings/sidebarPanels';

type AutoBracingHotkeyContext = {
    active: boolean;
    wasActive: boolean;
    sidebarExpanded: boolean;
    activeSupportKind: SidebarPanel;
    curvePageVisible: boolean;
    modalOpen: boolean;
};

export function shouldRunAutoBracingHotkey({
    active,
    wasActive,
    sidebarExpanded,
    activeSupportKind,
    curvePageVisible,
    modalOpen,
}: AutoBracingHotkeyContext): boolean {
    return active
        && !wasActive
        && sidebarExpanded
        && activeSupportKind === 'stick'
        && !curvePageVisible
        && !modalOpen;
}
