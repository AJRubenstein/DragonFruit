"use client";

/**
 * The body of the Auto Support settings dialog: the tab row and the seven tab
 * panels.
 *
 * It is deliberately presentational — it owns no store state, takes the draft it
 * edits plus the last run's diagnostics as props, and reports a tab change back
 * — so the panel shell can keep the dialog, the draft and the reports where they
 * already were. Which control belongs to which tab is the catalogue in
 * `autoSupportPanelTabs.ts`, not this file.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { AutoSupportSettings, ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import { AutoSupportPresetsTab } from './AutoSupportPresetsTab';
import {
  ADVANCED_CALIBRATION_KNOBS,
  ADVANCED_CALIBRATION_TOGGLE,
  ADVANCED_CALIBRATION_WARNING,
  AUTO_SUPPORT_SECTION_CARD,
  AUTO_SUPPORT_TABS,
  KNOBS_BY_TAB,
  TOGGLES_BY_TAB,
  measuredCalibrationDefaults,
  type AutoSupportTabKey,
  type KnobDef,
} from './autoSupportPanelTabs';

const TAB_ACTIVE_STYLE: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--accent), white 10%)',
  background: 'color-mix(in srgb, var(--accent), var(--surface-1) 84%)',
  color: 'var(--accent)',
};

const TAB_IDLE_STYLE: CSSProperties = {
  borderColor: 'var(--border-subtle)',
  background: 'var(--surface-1)',
  color: 'var(--text-muted)',
};

const TOGGLE_ACTIVE_STYLE: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--accent-secondary), white 10%)',
  background: 'color-mix(in srgb, var(--accent-secondary), var(--surface-1) 84%)',
  color: 'color-mix(in srgb, var(--accent-secondary), var(--text-strong) 25%)',
};

/** The number of decimals the slider's step implies, for the readout. */
const decimalsForStep = (step: number) => (step < 0.1 ? 2 : step < 1 ? 1 : 0);

function SliderRow({
  knob,
  draft,
  setDraft,
}: {
  knob: KnobDef;
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
}) {
  const { _ } = useLingui();
  const value = draft[knob.key];
  const decimals = decimalsForStep(knob.step);
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
          title={_(knob.hint)}
        >
          {_(knob.label)}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {knob.measuredDefault !== undefined && (
            <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {_(msg`measured`)} {knob.measuredDefault.toFixed(decimals)}
            </span>
          )}
          <span className="text-[11px] tabular-nums font-semibold" style={{ color: 'var(--text-strong)' }}>
            {value.toFixed(decimals)}{knob.unit}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        onChange={(event) => setDraft((current) => ({ ...current, [knob.key]: parseFloat(event.target.value) }))}
        title={_(knob.hint)}
        className="ui-range w-full"
      />
    </div>
  );
}

const GROUP_HEADING_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
};

/** One on/off chip, shared by the ordinary, debug and calibration toggles. */
function ToggleChip({ label, hint, active, onClick }: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      className="min-h-[36px] w-full rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide transition-colors flex items-center justify-center"
      style={active ? TOGGLE_ACTIVE_STYLE : TAB_IDLE_STYLE}
    >
      {label}
    </button>
  );
}

export type AutoSupportSettingsBodyProps = {
  tab: AutoSupportTabKey;
  onTabChange: (tab: AutoSupportTabKey) => void;
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
  debugSimpleRender: boolean;
  onToggleDebugSimpleRender: () => void;
  sizingDebug: SizingDebugInfo | null;
  forestReport: ForestReport | null;
  onShowForestReport: () => void;
};

export function AutoSupportSettingsBody({
  tab,
  onTabChange,
  draft,
  setDraft,
  debugSimpleRender,
  onToggleDebugSimpleRender,
  sizingDebug,
  forestReport,
  onShowForestReport,
}: AutoSupportSettingsBodyProps) {
  const { _ } = useLingui();
  const [showSizingDebug, setShowSizingDebug] = React.useState(false);

  const toggles = TOGGLES_BY_TAB[tab];
  const knobs = KNOBS_BY_TAB[tab];

  return (
    <div className="space-y-3">
      {/* ── Tab row ─────────────────────────────────────────────── */}
      <div className="rounded-md border p-2.5" style={AUTO_SUPPORT_SECTION_CARD}>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_SUPPORT_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => onTabChange(entry.key)}
              title={_(entry.hint)}
              className="h-8 flex-1 basis-[7.5rem] rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap transition-colors"
              style={tab === entry.key ? TAB_ACTIVE_STYLE : TAB_IDLE_STYLE}
            >
              {_(entry.label)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab body ────────────────────────────────────────────── */}
      <div className="rounded-md border p-2.5" style={AUTO_SUPPORT_SECTION_CARD}>
        {tab === 'presets' ? (
          <AutoSupportPresetsTab draft={draft} setDraft={setDraft} />
        ) : (
          <div className="space-y-2.5">
            {(toggles.length > 0 || tab === 'debug') && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {toggles.map((toggle) => (
                  <ToggleChip
                    key={toggle.key}
                    label={_(toggle.label)}
                    hint={_(toggle.hint)}
                    active={draft[toggle.key]}
                    onClick={() => setDraft((current) => ({ ...current, [toggle.key]: !current[toggle.key] }))}
                  />
                ))}
                {tab === 'debug' && (
                  // Not an `autoSupport` key: a top-level render switch with its own updater.
                  <ToggleChip
                    label={_(msg`Simplified`)}
                    hint={_(msg`Debug: simplified support render — contact disks/cones plus line vectors instead of full shafts`)}
                    active={debugSimpleRender}
                    onClick={onToggleDebugSimpleRender}
                  />
                )}
              </div>
            )}

            {knobs.map((knob) => (
              <SliderRow key={knob.key} knob={knob} draft={draft} setDraft={setDraft} />
            ))}

            {tab === 'debug' && (
              <>
                {/* ── Run diagnostics ──────────────────────────────── */}
                <div className="pt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={GROUP_HEADING_STYLE}>
                    {_(msg`Run diagnostics`)}
                  </div>
                </div>

                {!sizingDebug && !forestReport && (
                  <div className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                    {_(msg`Run Generate Supports to collect sizing and forest diagnostics.`)}
                  </div>
                )}

                {sizingDebug && (
                  <div className="rounded-md border" style={AUTO_SUPPORT_SECTION_CARD}>
                    <button
                      type="button"
                      onClick={() => setShowSizingDebug(!showSizingDebug)}
                      title={_(msg`The inputs and factors the last run sized the supports with`)}
                      className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>{_(msg`Sizing Debug`)}</span>
                      <svg className="w-3 h-3 transition-transform" style={{ transform: showSizingDebug ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showSizingDebug && (
                      <div className="px-2.5 pb-2 space-y-1 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        <div className="flex justify-between border-t pt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                          <span>{_(msg`Model volume`)}</span><span style={{ color: 'var(--text-strong)' }}>{(sizingDebug.modelVolumeMm3 / 1000).toFixed(1)} cm³</span>
                        </div>
                        <div className="flex justify-between"><span>{_(msg`Est. weight`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.estimatedWeightG.toFixed(1)} g</span></div>
                        <div className="flex justify-between"><span>{_(msg`Candidates`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.totalCandidates}</span></div>
                        <div className="flex justify-between"><span>{_(msg`Model size`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.modelSizeMm.toFixed(0)} mm</span></div>
                        <div className="flex justify-between"><span>{_(msg`Weight / support`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.weightPerSupportG.toFixed(2)} g</span></div>
                        <div className="flex justify-between"><span>{_(msg`Load share`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.loadShareG.toFixed(2)} g</span></div>
                        <div className="flex justify-between"><span>{_(msg`Sizing factors`)}</span><span style={{ color: 'var(--text-strong)' }}>×{sizingDebug.sizeFactor.toFixed(2)} size · ×{sizingDebug.loadFactor.toFixed(2)} load</span></div>
                        <div className="flex justify-between"><span>{_(msg`Avg island area`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.avgIslandAreaMm2.toFixed(2)} mm²</span></div>
                        <div className="flex justify-between"><span>{_(msg`Standalone trunks`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.standaloneHosts}</span></div>
                        <div className="flex justify-between"><span>{_(msg`Grid infill trunks`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.gridInfillHosts}</span></div>
                        <div className="flex justify-between" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 2, marginTop: 2 }}>
                          <span>{_(msg`Shaft Ø range`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.shaftDiameterRange.min.toFixed(2)}–{sizingDebug.shaftDiameterRange.max.toFixed(2)} mm</span>
                        </div>
                        <div className="flex justify-between"><span>{_(msg`Tip Ø range`)}</span><span style={{ color: 'var(--text-strong)' }}>{sizingDebug.tipContactRange.min.toFixed(2)}–{sizingDebug.tipContactRange.max.toFixed(2)} mm</span></div>
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
                    style={{ ...AUTO_SUPPORT_SECTION_CARD, color: 'var(--text-muted)' }}
                  >
                    <span>{_(msg`Forest Report`)}</span>
                    <span className="text-[9px] normal-case tracking-normal">
                      {forestReport.hostCount}H {forestReport.leafCount}L {forestReport.branchCount}B · {forestReport.trees.length} trees
                    </span>
                  </button>
                )}

                {/* ── Advanced (calibration) ───────────────────────── */}
                <div className="pt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={GROUP_HEADING_STYLE}>
                    {_(msg`Advanced (calibration)`)}
                  </div>
                </div>

                <div
                  className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                  style={{
                    borderColor: 'color-mix(in srgb, #d97706, var(--border-subtle) 50%)',
                    background: 'color-mix(in srgb, #d97706, var(--surface-1) 90%)',
                  }}
                  role="note"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#d97706' }} />
                  <span className="text-[10px] leading-snug" style={{ color: 'var(--text-strong)' }}>
                    {_(ADVANCED_CALIBRATION_WARNING)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <ToggleChip
                    label={_(ADVANCED_CALIBRATION_TOGGLE.label)}
                    hint={_(ADVANCED_CALIBRATION_TOGGLE.hint)}
                    active={draft[ADVANCED_CALIBRATION_TOGGLE.key]}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      [ADVANCED_CALIBRATION_TOGGLE.key]: !current[ADVANCED_CALIBRATION_TOGGLE.key],
                    }))}
                  />
                </div>

                {ADVANCED_CALIBRATION_KNOBS.map((knob) => (
                  <SliderRow key={knob.key} knob={knob} draft={draft} setDraft={setDraft} />
                ))}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, ...measuredCalibrationDefaults() }))}
                    className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] inline-flex items-center gap-1.5"
                    title={_(msg`Reset the six calibration values to the measured defaults`)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {_(msg`Reset to measured defaults`)}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
