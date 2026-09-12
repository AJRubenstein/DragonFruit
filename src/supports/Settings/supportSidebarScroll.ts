import type { SidebarPanel } from './sidebarPanels';

type ScrollViewport = {
    scrollTo(options?: ScrollToOptions): void;
};

export function resetSupportSettingsScrollForTabChange(
    viewport: ScrollViewport | null,
    currentTab: SidebarPanel,
    nextTab: SidebarPanel,
): boolean {
    if (!viewport || currentTab === nextTab) return false;

    viewport.scrollTo({ top: 0 });
    return true;
}
