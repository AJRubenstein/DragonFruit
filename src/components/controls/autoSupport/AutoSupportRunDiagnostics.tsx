"use client";

/**
 * The last run's diagnostics, on the Auto Supports panel: the sizing inputs the
 * run used, disclosed, and the button that opens the forest report.
 *
 * It belongs to the panel, not the settings dialog: a run is started from the
 * panel and the report describes the run that just happened, so it is read
 * beside the button that started it. The settings dialog carries only the
 * `Debug mode` switch that shows this — see `docs/dev/auto-supports.md`.
 *
 * Presentational by construction, like the settings body: the report arrives as
 * a prop and the disclosure's open/closed state is the only thing it owns, so it
 * can be rendered to static markup in a test.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { ChevronDown } from 'lucide-react';
import type { ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import { AUTO_SUPPORT_SECTION_CARD } from './autoSupportPanelTabs';
import { formatFixed } from '@/utils/localeNumber';

export type AutoSupportRunDiagnosticsProps = {
  /** The last run's inputs and factors. Nothing renders until a run produced one. */
  sizingDebug: SizingDebugInfo | null;
  /** The last run's report. Nothing renders until a run produced one. */
  forestReport: ForestReport | null;
  onShowForestReport: () => void;
};

export function AutoSupportRunDiagnostics({
  sizingDebug,
  forestReport,
  onShowForestReport,
}: AutoSupportRunDiagnosticsProps) {
  const { _, i18n } = useLingui();
  const [showSizingDebug, setShowSizingDebug] = React.useState(false);

  return (
    <>
      {sizingDebug && (
        <div className="rounded-md border" style={AUTO_SUPPORT_SECTION_CARD}>
          <button
            type="button"
            onClick={() => setShowSizingDebug((current) => !current)}
            title={_(msg`The inputs and factors the last run sized the supports with`)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>{_(msg`Sizing Debug`)}</span>
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: showSizingDebug ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {showSizingDebug && (
            <div className="px-2.5 pb-2 space-y-1 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              <div className="flex justify-between border-t pt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                <span>{_(msg`Model volume`)}</span>{/* i18n-ignore: unit */}<span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.modelVolumeMm3 / 1000, 1, i18n.locale)} cm³</span>
              </div>
              <div className="flex justify-between"><span>{_(msg`Est. weight`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.estimatedWeightG, 1, i18n.locale)} g</span></div>
              <div className="flex justify-between"><span>{_(msg`Candidates`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.totalCandidates}</span></div>
              <div className="flex justify-between"><span>{_(msg`Model size`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.modelSizeMm, 0, i18n.locale)} mm</span></div>
              <div className="flex justify-between"><span>{_(msg`Weight / support`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.weightPerSupportG, 2, i18n.locale)} g</span></div>
              <div className="flex justify-between"><span>{_(msg`Load share`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.loadShareG, 2, i18n.locale)} g</span></div>
              <div className="flex justify-between"><span>{_(msg`Sizing factors`)}</span><span style={{ color: 'var(--text-strong)' }}>×{formatFixed(sizingDebug.sizeFactor, 2, i18n.locale)} size · ×{formatFixed(sizingDebug.loadFactor, 2, i18n.locale)} load</span></div>
              <div className="flex justify-between"><span>{_(msg`Avg island area`)}</span>{/* i18n-ignore: unit */}<span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.avgIslandAreaMm2, 2, i18n.locale)} mm²</span></div>
              <div className="flex justify-between"><span>{_(msg`Standalone trunks`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.standaloneHosts}</span></div>
              <div className="flex justify-between"><span>{_(msg`Grid infill trunks`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.gridInfillHosts}</span></div>
              <div className="flex justify-between" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 2, marginTop: 2 }}>
                <span>{_(msg`Shaft Ø range`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.shaftDiameterRange.min, 2, i18n.locale)}–{formatFixed(sizingDebug.shaftDiameterRange.max, 2, i18n.locale)} mm</span>
              </div>
              <div className="flex justify-between"><span>{_(msg`Tip Ø range`)}</span><span style={{ color: 'var(--text-strong)' }}>{formatFixed(sizingDebug.tipContactRange.min, 2, i18n.locale)}–{formatFixed(sizingDebug.tipContactRange.max, 2, i18n.locale)} mm</span></div>
            </div>
          )}
        </div>
      )}

      {forestReport && (
        <button
          type="button"
          onClick={onShowForestReport}
          title={_(msg`Every placed support with its size and fan-out groups`)}
          className="w-full rounded-md border px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}
        >
          <span>{_(msg`Show Forest Report`)}</span>
          <span className="text-[9px] normal-case tracking-normal">
            {forestReport.hostCount}H {forestReport.leafCount}L {forestReport.branchCount}B · {forestReport.trees.length} trees
          </span>
        </button>
      )}
    </>
  );
}
