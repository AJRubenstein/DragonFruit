"use client";

/**
 * The body of the Auto Support settings dialog: one scrolling surface of field
 * cards, the preset strip above them, and the dialog's footer.
 *
 * It is deliberately presentational — the draft it edits plus the last run's
 * diagnostics arrive as props and it owns no settings state — so the panel shell
 * can keep the dialog, the draft and the reports where they already were. Which
 * control belongs to which section is the catalogue in `autoSupportPanelTabs.ts`,
 * not this file.
 *
 * Two layout rules are load-bearing:
 *
 * - There is no tab row and no rail. With every knob a compact field instead of
 *   a slider the whole policy fits in one scroll, so navigation between sections
 *   would be a second way to reach something already on screen. The sections
 *   still order the cards, which is what keeps the dialog readable.
 * - Debug & Advanced is a closed `<details>`, last. It holds every debug switch,
 *   every diagnostic and the calibration constants, so a user changing how
 *   supports are made never scrolls past any of it.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { AlertTriangle, Check, ChevronDown, RotateCcw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { FieldHelpTooltip, LabeledNumberInput, LabeledToggleInput } from '@/components/settings/profileFormAtoms';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';
import type { AutoSupportSettings, ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import { restoreAutoSupportFactoryDefaults } from '@/supports/Settings/autoSupportPresets';
import { AutoSupportPresetManagerModal, AutoSupportPresetSelector } from './AutoSupportPresets';
import {
  ADVANCED_CALIBRATION_HEADING,
  ADVANCED_CALIBRATION_KNOBS,
  ADVANCED_CALIBRATION_TOGGLE,
  ADVANCED_CALIBRATION_WARNING,
  AUTO_SUPPORT_ADVANCED_SECTION,
  AUTO_SUPPORT_POLICY_SECTIONS,
  AUTO_SUPPORT_SECTION_CARD,
  DEBUG_DIAGNOSTICS_HEADING,
  KNOBS_BY_SECTION,
  SIZING_TIER_FIELD,
  SIZING_TIER_OPTIONS,
  TOGGLES_BY_SECTION,
  measuredCalibrationDefaults,
  type AutoSupportSectionDef,
  type KnobDef,
  type ToggleDef,
} from './autoSupportPanelTabs';

/** The dialog's card, the material editor's shape: uppercase header, fields under it. */
const FIELD_CARD_STYLE: CSSProperties = {
  borderColor: 'var(--border-subtle)',
  background: 'var(--surface-2)',
};

const TIER_ACTIVE_STYLE: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--accent), white 10%)',
  background: 'color-mix(in srgb, var(--accent), var(--surface-0) 76%)',
  color: 'color-mix(in srgb, var(--accent), var(--text-strong) 25%)',
};

const TIER_IDLE_STYLE: CSSProperties = {
  borderColor: 'var(--border-subtle)',
  background: 'var(--surface-1)',
  color: 'var(--text-muted)',
};

/** The footer's quiet left action — the Settings modal's secondary-accent token. */
const QUIET_ACTION_STYLE: CSSProperties = {
  color: 'var(--accent-secondary)',
  borderColor: 'color-mix(in srgb, var(--accent-secondary), var(--border-subtle) 42%)',
  background: 'color-mix(in srgb, var(--accent-secondary), var(--surface-1) 92%)',
};

/** The dialog's primary action — the panel's own accent treatment. */
const ACCENT_ACTION_STYLE: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--accent), var(--border-subtle) 45%)',
  background: 'color-mix(in srgb, var(--accent), var(--surface-1) 86%)',
  color: 'var(--accent)',
};

/** The number of decimals a knob's step implies. */
const decimalsForStep = (step: number) => (step < 0.1 ? 2 : step < 1 ? 1 : 0);

/**
 * A knob's value as the dialog will store it: inside the range the slider used to
 * offer, rounded to the decimals its step implies. The settings store clamps to
 * `AUTO_SUPPORT_CONSTRAINTS` on write; this keeps a typed number from showing as
 * one value and landing as another.
 */
function normalizeKnobValue(knob: KnobDef, raw: number): number {
  const clamped = Math.min(knob.max, Math.max(knob.min, raw));
  return Number(clamped.toFixed(decimalsForStep(knob.step)));
}

/** One numeric knob: a labelled field with the stepper, never a slider. */
function NumberField({
  knob,
  draft,
  setDraft,
}: {
  knob: KnobDef;
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
}) {
  const { _ } = useLingui();
  const hint = _(knob.hint);
  const label = knob.unit ? `${_(knob.label)} (${knob.unit})` : _(knob.label);

  return (
    <div className="space-y-1">
      <LabeledNumberInput
        label={label}
        helpText={hint}
        title={hint}
        value={draft[knob.key]}
        step={knob.step}
        onChange={(value) => setDraft((current) => ({ ...current, [knob.key]: normalizeKnobValue(knob, value) }))}
      />
      {knob.measuredDefault !== undefined && (
        <div className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {_(msg`measured`)} {knob.measuredDefault.toFixed(decimalsForStep(knob.step))}
        </div>
      )}
    </div>
  );
}

/** One boolean knob, as the pill the material editor's switches use. */
function ToggleField({
  toggle,
  draft,
  setDraft,
}: {
  toggle: ToggleDef;
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
}) {
  const { _ } = useLingui();
  const hint = _(toggle.hint);

  return (
    <LabeledToggleInput
      label={_(toggle.label)}
      helpText={hint}
      title={hint}
      checked={draft[toggle.key]}
      onChange={(next) => setDraft((current) => ({ ...current, [toggle.key]: next }))}
    />
  );
}

/**
 * The sizing band, as the segmented control the Settings modal uses for its own
 * three-way choices (`Off / Line / Solid`). Its own band tooltip sits on each
 * segment; the field's tooltip is the ⓘ beside the label.
 */
function SizingTierField({
  draft,
  setDraft,
}: {
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
}) {
  const { _ } = useLingui();
  const label = _(SIZING_TIER_FIELD.label);
  const hint = _(SIZING_TIER_FIELD.hint);

  return (
    <div className="col-span-2 space-y-1">
      <span className="ui-label font-medium inline-flex items-center gap-1.5">
        {label}
        <FieldHelpTooltip label={label} help={hint} />
      </span>
      <div className="grid grid-cols-3 gap-1.5" title={hint}>
        {SIZING_TIER_OPTIONS.map((option) => {
          const active = draft.sizingPreset === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, sizingPreset: option.value }))}
              title={_(option.hint)}
              className="h-9 rounded-md border text-[12px] font-semibold transition-colors"
              style={active ? TIER_ACTIVE_STYLE : TIER_IDLE_STYLE}
            >
              {_(option.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A card of fields: the section's uppercase header, its one-liner, and a 2-column grid. */
function FieldCard({ section, children }: { section: AutoSupportSectionDef; children: React.ReactNode }) {
  const { _ } = useLingui();

  return (
    <section className="rounded-xl border p-3" style={FIELD_CARD_STYLE}>
      <div className="ui-meta font-semibold uppercase tracking-wide" title={_(section.hint)}>
        {_(section.label)}
      </div>
      <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
        {_(section.subtitle)}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

/** The diagnostics card: the debug switches, then the last run's report. */
function DiagnosticsCard({
  draft,
  setDraft,
  debugSimpleRender,
  onToggleDebugSimpleRender,
  sizingDebug,
  forestReport,
  onShowForestReport,
  showSizingDebug,
  onToggleSizingDebug,
}: {
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
  debugSimpleRender: boolean;
  onToggleDebugSimpleRender: () => void;
  sizingDebug: SizingDebugInfo | null;
  forestReport: ForestReport | null;
  onShowForestReport: () => void;
  showSizingDebug: boolean;
  onToggleSizingDebug: () => void;
}) {
  const { _ } = useLingui();
  const simplifiedHint = _(msg`Debug: simplified support render — contact disks/cones plus line vectors instead of full shafts`);

  return (
    <section className="rounded-xl border p-3" style={FIELD_CARD_STYLE}>
      <div className="ui-meta font-semibold uppercase tracking-wide">{_(DEBUG_DIAGNOSTICS_HEADING)}</div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {TOGGLES_BY_SECTION.debug.map((toggle) => (
          <ToggleField key={toggle.key} toggle={toggle} draft={draft} setDraft={setDraft} />
        ))}
        {/* Not an `autoSupport` key: a top-level render switch with its own updater. */}
        <LabeledToggleInput
          label={_(msg`Simplified`)}
          helpText={simplifiedHint}
          title={simplifiedHint}
          checked={debugSimpleRender}
          onChange={onToggleDebugSimpleRender}
        />
      </div>

      <div className="mt-3 space-y-2">
        {!sizingDebug && !forestReport && (
          <div className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
            {_(msg`Run Generate Supports to collect sizing and forest diagnostics.`)}
          </div>
        )}

        {sizingDebug && (
          <div className="rounded-md border" style={AUTO_SUPPORT_SECTION_CARD}>
            <button
              type="button"
              onClick={onToggleSizingDebug}
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
      </div>
    </section>
  );
}

/** The calibration card: the warning, the master switch, the six measured fields. */
function CalibrationCard({
  draft,
  setDraft,
}: {
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
}) {
  const { _ } = useLingui();

  return (
    <section className="rounded-xl border p-3" style={FIELD_CARD_STYLE}>
      <div className="ui-meta font-semibold uppercase tracking-wide">{_(ADVANCED_CALIBRATION_HEADING)}</div>

      <div
        className="mt-2 flex items-start gap-2 rounded-md border px-2 py-1.5"
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

      <div className="mt-2 grid grid-cols-2 gap-2">
        <ToggleField toggle={ADVANCED_CALIBRATION_TOGGLE} draft={draft} setDraft={setDraft} />
        {ADVANCED_CALIBRATION_KNOBS.map((knob) => (
          <NumberField key={knob.key} knob={knob} draft={draft} setDraft={setDraft} />
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setDraft((current) => ({ ...current, ...measuredCalibrationDefaults() }))}
          className="ui-button ui-button-secondary !h-8 px-3 text-xs inline-flex items-center gap-1.5"
          title={_(msg`Reset the six calibration values to the measured defaults`)}
        >
          <RotateCcw className="h-3 w-3" />
          {_(msg`Reset to measured defaults`)}
        </button>
      </div>
    </section>
  );
}

export type AutoSupportSettingsBodyProps = {
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
  debugSimpleRender: boolean;
  onToggleDebugSimpleRender: () => void;
  sizingDebug: SizingDebugInfo | null;
  forestReport: ForestReport | null;
  onShowForestReport: () => void;
  /** Close without writing the draft. */
  onCancel: () => void;
  /** Write the draft to the auto-support settings. */
  onApply: () => void;
};

export function AutoSupportSettingsBody({
  draft,
  setDraft,
  debugSimpleRender,
  onToggleDebugSimpleRender,
  sizingDebug,
  forestReport,
  onShowForestReport,
  onCancel,
  onApply,
}: AutoSupportSettingsBodyProps) {
  const { _ } = useLingui();
  const [showSizingDebug, setShowSizingDebug] = React.useState(false);
  const [showPresetManager, setShowPresetManager] = React.useState(false);
  const [showRestoreFactory, setShowRestoreFactory] = React.useState(false);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 space-y-3">
        <AutoSupportPresetSelector
          draft={draft}
          setDraft={setDraft}
          onManagePresets={() => setShowPresetManager(true)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {AUTO_SUPPORT_POLICY_SECTIONS.map((section) => (
            <FieldCard key={section.key} section={section}>
              {TOGGLES_BY_SECTION[section.key].map((toggle) => (
                <ToggleField key={toggle.key} toggle={toggle} draft={draft} setDraft={setDraft} />
              ))}
              {section.key === 'density' && <SizingTierField draft={draft} setDraft={setDraft} />}
              {KNOBS_BY_SECTION[section.key].map((knob) => (
                <NumberField key={knob.key} knob={knob} draft={draft} setDraft={setDraft} />
              ))}
            </FieldCard>
          ))}

          {/* Debug & Advanced: closed by default, so nothing debug sits between a
              user and the fields above it. */}
          <details
            className="group lg:col-span-2 rounded-xl border"
            style={FIELD_CARD_STYLE}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
                style={{ color: 'var(--text-muted)' }}
              />
              <span
                className="ui-meta font-semibold uppercase tracking-wide"
                title={_(AUTO_SUPPORT_ADVANCED_SECTION.hint)}
              >
                {_(AUTO_SUPPORT_ADVANCED_SECTION.label)}
              </span>
              <span className="min-w-0 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                {_(AUTO_SUPPORT_ADVANCED_SECTION.subtitle)}
              </span>
            </summary>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start px-3 pb-3">
              <DiagnosticsCard
                draft={draft}
                setDraft={setDraft}
                debugSimpleRender={debugSimpleRender}
                onToggleDebugSimpleRender={onToggleDebugSimpleRender}
                sizingDebug={sizingDebug}
                forestReport={forestReport}
                onShowForestReport={onShowForestReport}
                showSizingDebug={showSizingDebug}
                onToggleSizingDebug={() => setShowSizingDebug((current) => !current)}
              />
              <CalibrationCard draft={draft} setDraft={setDraft} />
            </div>
          </details>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 px-4 py-3 shrink-0"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'color-mix(in srgb, var(--surface-1), transparent 10%)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowRestoreFactory(true)}
          className="ui-button !h-9 px-3 text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          style={QUIET_ACTION_STYLE}
          title={_(msg`Put the built-in presets back to their factory settings; your own presets are left alone`)}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Restore factory presets`)}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="ui-button ui-button-secondary !h-9 px-3 text-xs"
            title={_(msg`Close without applying the edits made in this dialog`)}
          >
            {_(msg`Cancel`)}
          </button>
          <button
            type="button"
            onClick={onApply}
            className="ui-button !h-9 px-3 text-xs inline-flex items-center justify-center gap-1.5"
            style={ACCENT_ACTION_STYLE}
            title={_(msg`Write the edits made in this dialog to the auto-support settings`)}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            {_(msg`Apply`)}
          </button>
        </div>
      </div>

      <AutoSupportPresetManagerModal
        open={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        draft={draft}
        setDraft={setDraft}
        onRestoreFactoryPresets={() => setShowRestoreFactory(true)}
      />

      <StructuredDialogModal
        open={showRestoreFactory}
        ariaLabel={_(msg`Restore factory presets`)}
        title={_(msg`Restore Factory Presets?`)}
        subtitle={_(msg`The built-in presets go back to their measured factory settings.`)}
        iconTone="warning"
        onClose={() => setShowRestoreFactory(false)}
        onBackdropClick={() => setShowRestoreFactory(false)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowRestoreFactory(false)}
              className="ui-button ui-button-secondary !h-9 px-3 text-xs"
              title={_(msg`Keep the built-in presets as they are`)}
            >
              {_(msg`Cancel`)}
            </button>
            <button
              type="button"
              onClick={() => {
                restoreAutoSupportFactoryDefaults();
                setShowRestoreFactory(false);
              }}
              className="ui-button !h-9 px-3 text-xs"
              style={ACCENT_ACTION_STYLE}
              title={_(msg`Restore the built-in presets`)}
            >
              {_(msg`Restore`)}
            </button>
          </>
        }
      >
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {_(msg`Your own presets are left alone, and the current settings are not touched — the built-in you are using will read as having unsaved changes, with Revert as the way to accept the factory block.`)}
        </p>
      </StructuredDialogModal>
    </div>
  );
}
