"use client";

/**
 * The Auto Support settings dialog's preset UI: the selector strip at the top of
 * the dialog, and the management row under it.
 *
 * A preset is a named `autoSupport` block: the whole run policy. The collection,
 * the active selection and the file format belong to
 * `@/supports/Settings/autoSupportPresets`; this file is only its UI.
 *
 * Two behaviours worth knowing before changing it:
 *
 * - Selecting a preset **applies** it to the live settings. That is the store's
 *   contract, so it cannot be staged in the dialog's draft like a knob edit —
 *   instead the applied block is copied back into the draft, so the fields
 *   immediately show what was applied.
 * - A built-in's name is translated by id at render, so Rename is refused for
 *   them (and Delete too: the format and the tier row are defined in terms of
 *   those ids). A built-in *is* savable over — that is how a user keeps a
 *   tweaked tier.
 *
 * Two rows, and the split is deliberate:
 *
 * - The first holds the selector and the two **apply** actions (`Save`, `Revert`)
 *   with the dirty strip under them: they are about the settings on screen.
 * - The second is the **collection's** action bar, the material manager's
 *   arrangement: `New` through `Restore factory presets`, with `Delete` alone on
 *   the right in the danger colour.
 *
 * The dropdown itself lists presets and nothing else. Its row styling and right
 * labels follow `LutCurveSelector` (`src/features/slicing/components/LutCurveEditor.tsx`)
 * and the theme profile dropdown (`src/components/settings/UISettingsTab.tsx`) —
 * those were the inspiration for how a preset row *reads*, not for holding
 * actions in the menu.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Check, Copy, Download, PenLine, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { FieldHelpTooltip } from '@/components/settings/profileFormAtoms';
import { normalizeAutoSupportSettings, type AutoSupportSettings } from '@/supports/autoSupport';
import {
  createAutoSupportPreset,
  deleteAutoSupportPreset,
  duplicateAutoSupportPreset,
  exportAutoSupportPresetToJson,
  getActiveAutoSupportPresetId,
  getAutoSupportPreset,
  getAutoSupportPresetsServerSnapshot,
  getAutoSupportPresetsSnapshot,
  importAutoSupportPresetFromJson,
  isAutoSupportPresetDirty,
  renameAutoSupportPreset,
  resetToActivePreset,
  restoreAutoSupportFactoryDefaults,
  saveAutoSupportPreset,
  setActiveAutoSupportPreset,
  subscribeToAutoSupportPresets,
  type AutoSupportPreset,
} from '@/supports/Settings/autoSupportPresets';
import { translateAutoSupportPresetName } from '@/supports/Settings/autoSupportPresetMessages';
import {
  getSettings,
  subscribeToSettings,
  updateAutoSupportSettings,
} from '@/supports/Settings/state';
import { isTauriRuntime } from '@/utils/tauriRuntime';
import {
  pickOpenFilesWithNativeDialog,
  readPrintArtifactBytesFromPath,
  savePrintArtifactWithNativeDialog,
} from '@/features/slicing/tauri/nativeSlicerBridge';
import { SIZING_TIER_LABELS } from './autoSupportPanelTabs';

type Translate = (descriptor: MessageDescriptor) => string;

/** Placeholder and starting value for a new preset's name. */
const NEW_PRESET_NAME = msg`New Preset`;

/** What the selector shows before the user has ever picked a preset. */
const NO_ACTIVE_PRESET_LABEL = msg`Custom — not a preset`;

/**
 * Interpolating `msg` templates live at module scope: React Compiler renames the
 * interpolated locals inside a component, which desyncs the message id from the
 * compiled catalog in production (see AGENTS.md).
 */
function formatDirtyNotice(presetName: string, translate: Translate): string {
  return translate(msg`"${presetName}" has unsaved changes — Save overwrites it, Revert reloads it.`);
}

/** Interpolating template — module scope for the same reason as above. */
function formatDeletePresetTitle(presetName: string, translate: Translate): string {
  return translate(msg`Delete "${presetName}"?`);
}

/**
 * Applies a preset and copies the applied block into the dialog's draft, so the
 * fields show what was just selected.
 *
 * Module scope so the panel's tier row and the preset selector drive the same
 * path (and a test can call it without a DOM).
 */
export function selectAutoSupportPreset(
  id: string,
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>,
): void {
  setActiveAutoSupportPreset(id);
  setDraft(getSettings().autoSupport);
}

/**
 * Overwrites the selected preset with the settings the dialog is showing. The
 * draft goes to the live settings first: Save is the one action that means "make
 * these edits the policy", so it has to carry edits staged in the fields too.
 */
function saveDraftIntoActivePreset(
  draft: AutoSupportSettings,
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>,
): void {
  const activeId = getActiveAutoSupportPresetId();
  if (!activeId) return;
  updateAutoSupportSettings(draft);
  saveAutoSupportPreset(activeId);
  setDraft(getSettings().autoSupport);
}

/**
 * Writes one preset to a file: the native save dialog in the desktop shell, a
 * download otherwise. The `savePrintArtifactWithNativeDialog` mechanism (and its
 * cancel-is-not-an-error rule) matches the theme profile exporter.
 */
async function exportPresetToFile(id: string): Promise<void> {
  const preset = getAutoSupportPreset(id);
  if (!preset) return;

  const json = exportAutoSupportPresetToJson(id);
  const safeName = preset.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fileName = `${safeName || 'auto-support-preset'}.dragonfruit-auto-support.json`;

  if (isTauriRuntime()) {
    const bytes = new TextEncoder().encode(json);
    try {
      await savePrintArtifactWithNativeDialog(bytes, fileName);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (message.toLowerCase().includes('cancel')) return;
      throw error;
    }
  }

  const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * The collection and the live settings, as the preset UI reads them. Both stores
 * matter: the collection is the list, and the live settings are what
 * `isAutoSupportPresetDirty` compares the active preset against.
 *
 * The active id and the dirty flag are not part of the list snapshot, so each is
 * read through a subscription of its own. React Compiler treats a bare call to
 * an imported function as pure and evaluates it once, which would otherwise
 * freeze both at whatever they were when the component mounted — a selection
 * that never updates and a dirty strip that never clears.
 */
function useAutoSupportPresetState(): {
  presets: readonly AutoSupportPreset[];
  activeId: string | null;
  activePreset: AutoSupportPreset | undefined;
  dirty: boolean;
} {
  const presets = React.useSyncExternalStore(
    subscribeToAutoSupportPresets,
    getAutoSupportPresetsSnapshot,
    getAutoSupportPresetsServerSnapshot,
  );
  const activeId = React.useSyncExternalStore(
    subscribeToAutoSupportPresets,
    getActiveAutoSupportPresetId,
    getActiveAutoSupportPresetId,
  );
  const dirty = React.useSyncExternalStore(
    subscribeToAutoSupportPresets,
    isAutoSupportPresetDirty,
    isAutoSupportPresetDirty,
  );
  // The dirty flag is a fact about the live settings too: this is the
  // subscription that makes a knob edit re-read it.
  React.useSyncExternalStore(subscribeToSettings, getSettings, getSettings);

  return {
    presets,
    activeId,
    activePreset: React.useMemo(() => (activeId ? getAutoSupportPreset(activeId) : undefined), [activeId]),
    dirty,
  };
}

type AutoSupportPresetSelectorProps = {
  /** The dialog's draft, so a selection can be reflected in the fields. */
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
};

/**
 * The dialog's top strip. The first row is which preset the settings are and the
 * two actions that resolve that; the second is the collection's own action bar.
 */
export function AutoSupportPresetSelector({ draft, setDraft }: AutoSupportPresetSelectorProps) {
  const { _ } = useLingui();
  const { presets, activeId, activePreset, dirty } = useAutoSupportPresetState();

  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  /** The name dialog, in the two modes the references' own dialog has. */
  const [nameDialog, setNameDialog] = React.useState<{ mode: 'create' | 'rename'; name: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [showRestoreFactory, setShowRestoreFactory] = React.useState(false);
  /** Import/export failures of any kind; the store's messages are shown verbatim. */
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isBuiltIn = activePreset?.isBuiltIn === true;

  const presetOptions = presets.map((preset) => ({
    value: preset.id,
    label: translateAutoSupportPresetName(preset, _),
    // The active preset is the one the trigger is showing; the dropdown tints the
    // selected row, and the check names it in a list of same-shaped rows.
    icon: preset.id === activeId ? <Check className="h-3.5 w-3.5" /> : undefined,
    // The references label the type on the right (`Built-in` / `Custom`); a
    // preset's tier is the other fact a user picks by, so both ride there.
    rightContent: `${_(SIZING_TIER_LABELS[normalizeAutoSupportSettings(preset.settings).sizingPreset])} · ${preset.isBuiltIn ? _(msg`Built-in`) : _(msg`Custom`)}`,
  }));

  const applyImportedText = (text: string) => {
    try {
      importAutoSupportPresetFromJson(text);
      setErrorMessage(null);
      setDraft(getSettings().autoSupport);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const importFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void file.text().then(applyImportedText);
  };

  const importFromNativeDialog = async () => {
    try {
      const picked = await pickOpenFilesWithNativeDialog('bundle', false);
      const sourcePath = picked[0]?.path?.trim();
      if (!sourcePath) return;
      applyImportedText(new TextDecoder().decode(await readPrintArtifactBytesFromPath(sourcePath)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('cancel')) return;
      setErrorMessage(message);
    }
  };

  const confirmNameDialog = () => {
    if (!nameDialog) return;
    const name = nameDialog.name.trim();
    if (name.length === 0) return;
    if (nameDialog.mode === 'create') {
      createAutoSupportPreset(name);
    } else if (activePreset && !activePreset.isBuiltIn) {
      renameAutoSupportPreset(activePreset.id, name);
    }
    setNameDialog(null);
    setDraft(getSettings().autoSupport);
  };

  const pendingDeletePreset = pendingDeleteId ? getAutoSupportPreset(pendingDeleteId) : undefined;

  return (
    <section
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="ui-label font-medium inline-flex shrink-0 items-center gap-1.5"
          style={{ color: 'var(--text-strong)' }}
        >
          {_(msg`Preset`)}
          <FieldHelpTooltip
            label={_(msg`Preset`)}
            help={_(msg`The saved run policy the settings below are. Selecting one applies it immediately; the rest of the dialog stays staged until you press Apply.`)}
          />
        </span>

        <div className="min-w-[14rem] flex-1">
          <SelectDropdown
            value={activeId ?? ''}
            options={activeId
              ? presetOptions
              : [{ value: '', label: _(NO_ACTIVE_PRESET_LABEL), disabled: true }, ...presetOptions]}
            onChange={(id) => selectAutoSupportPreset(id, setDraft)}
            ariaLabel={_(msg`Auto-support preset`)}
            className="space-y-0"
            selectClassName="w-full h-[36px] px-2.5 pr-10 leading-tight text-sm"
            menuClassName="max-w-[26rem]"
          />
        </div>

        <button
          type="button"
          onClick={() => saveDraftIntoActivePreset(draft, setDraft)}
          disabled={!activeId}
          className="ui-button ui-button-secondary !h-9 shrink-0 px-3 text-xs disabled:opacity-40"
          title={_(msg`Overwrite the selected preset with the current settings`)}
        >
          {_(msg`Save`)}
        </button>
        <button
          type="button"
          onClick={() => {
            resetToActivePreset();
            setDraft(getSettings().autoSupport);
          }}
          disabled={!activePreset || !dirty}
          className="ui-button ui-button-secondary !h-9 shrink-0 px-3 text-xs disabled:opacity-40"
          title={_(msg`Reload the selected preset over the current settings, discarding the edits`)}
        >
          {_(msg`Revert`)}
        </button>
      </div>

      {/* The collection's action bar, the material manager's arrangement: every
          action named, and the destructive one alone on the right. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setNameDialog({ mode: 'create', name: _(NEW_PRESET_NAME) })}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5"
          title={_(msg`Create a preset from the current settings and select it`)}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          {_(msg`New`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activePreset && !activePreset.isBuiltIn) {
              setNameDialog({ mode: 'rename', name: activePreset.name });
            }
          }}
          disabled={!activePreset || isBuiltIn}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-40"
          title={isBuiltIn
            ? _(msg`A built-in's name is translated and cannot be renamed`)
            : _(msg`Rename the selected preset`)}
        >
          <PenLine className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Rename`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeId) duplicateAutoSupportPreset(activeId);
          }}
          disabled={!activeId}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-40"
          title={_(msg`Copy the selected preset under a new name`)}
        >
          <Copy className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Duplicate`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (isTauriRuntime()) {
              void importFromNativeDialog();
              return;
            }
            importInputRef.current?.click();
          }}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5"
          title={_(msg`Import a preset from a JSON file, and apply it`)}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Import`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!activeId) return;
            void exportPresetToFile(activeId).catch((error: unknown) => {
              setErrorMessage(error instanceof Error ? error.message : String(error));
            });
          }}
          disabled={!activeId}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-40"
          title={_(msg`Export the selected preset as a JSON file`)}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Export`)}
        </button>
        <button
          type="button"
          onClick={() => setShowRestoreFactory(true)}
          className="ui-button ui-button-secondary !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5"
          title={_(msg`Put the built-in presets back to their factory settings; your own presets are left alone`)}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Restore factory presets`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activePreset && !activePreset.isBuiltIn) setPendingDeleteId(activePreset.id);
          }}
          disabled={!activePreset || isBuiltIn}
          className="ui-button ui-button-secondary !ml-auto !h-8 px-2.5 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-40"
          style={{
            color: !activePreset || isBuiltIn ? 'var(--text-muted)' : 'var(--danger)',
            borderColor: 'color-mix(in srgb, var(--danger), var(--border-subtle) 55%)',
          }}
          title={isBuiltIn
            ? _(msg`Built-in presets cannot be deleted`)
            : _(msg`Delete the selected preset`)}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Delete`)}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={importFromFile}
          className="hidden"
          aria-label={_(msg`Auto-support preset file`)}
        />
      </div>

      {/* Dirty state: the live block no longer matches the active preset. */}
      {activePreset && dirty && (
        <div
          className="mt-2 flex items-center gap-2 rounded-md border px-2 py-1.5"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent-secondary), var(--border-subtle) 45%)',
            background: 'color-mix(in srgb, var(--accent-secondary), var(--surface-1) 90%)',
          }}
        >
          <PenLine className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent-secondary)' }} />
          <span className="text-[10px] leading-snug" style={{ color: 'var(--text-strong)' }}>
            {formatDirtyNotice(translateAutoSupportPresetName(activePreset, _), _)}
          </span>
        </div>
      )}

      {errorMessage && (
        <div
          className="mt-2 rounded-md border px-2 py-1.5"
          style={{
            borderColor: 'color-mix(in srgb, var(--danger), var(--border-subtle) 45%)',
            background: 'color-mix(in srgb, var(--danger), var(--surface-1) 92%)',
            color: 'var(--danger)',
          }}
          role="alert"
        >
          <span className="text-[10px] leading-snug break-words">{errorMessage}</span>
        </div>
      )}

      <StructuredDialogModal
        open={nameDialog != null}
        ariaLabel={nameDialog?.mode === 'create' ? _(msg`Create preset`) : _(msg`Rename preset`)}
        title={nameDialog?.mode === 'create' ? _(msg`New Preset`) : _(msg`Rename Preset`)}
        subtitle={nameDialog?.mode === 'create'
          ? _(msg`The current settings are saved under this name, and it becomes the selected preset.`)
          : _(msg`The selected preset is renamed; its settings are not touched.`)}
        icon={<PenLine className="h-4 w-4" />}
        iconTone="accent"
        onClose={() => setNameDialog(null)}
        onBackdropClick={() => setNameDialog(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setNameDialog(null)}
              className="ui-button ui-button-secondary !h-9 px-3 text-xs"
              title={_(msg`Leave the collection as it is`)}
            >
              {_(msg`Cancel`)}
            </button>
            <button
              type="button"
              onClick={confirmNameDialog}
              disabled={(nameDialog?.name.trim().length ?? 0) === 0}
              className="ui-button !h-9 px-3 text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent), var(--border-subtle) 45%)',
                background: 'color-mix(in srgb, var(--accent), var(--surface-1) 86%)',
                color: 'var(--accent)',
              }}
              title={nameDialog?.mode === 'create'
                ? _(msg`Create the preset and select it`)
                : _(msg`Rename the selected preset`)}
            >
              <Check className="h-3.5 w-3.5" />
              {nameDialog?.mode === 'create' ? _(msg`Create`) : _(msg`Save Name`)}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <label
            className="block text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            {_(msg`Preset name`)}
          </label>
          <input
            type="text"
            value={nameDialog?.name ?? ''}
            onChange={(event) => setNameDialog((current) => (current ? { ...current, name: event.target.value } : current))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.stopPropagation();
                confirmNameDialog();
              }
            }}
            className="ui-input h-9 w-full text-xs"
            placeholder={_(NEW_PRESET_NAME)}
            aria-label={_(msg`Preset name`)}
          />
        </div>
      </StructuredDialogModal>

      <StructuredDialogModal
        open={pendingDeletePreset != null}
        ariaLabel={_(msg`Delete preset`)}
        title={pendingDeletePreset ? formatDeletePresetTitle(pendingDeletePreset.name, _) : ''}
        subtitle={_(msg`This cannot be undone.`)}
        iconTone="danger"
        onClose={() => setPendingDeleteId(null)}
        onBackdropClick={() => setPendingDeleteId(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              className="ui-button ui-button-secondary !h-9 px-3 text-xs"
              title={_(msg`Keep the preset`)}
            >
              {_(msg`Cancel`)}
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingDeleteId) deleteAutoSupportPreset(pendingDeleteId);
                setPendingDeleteId(null);
                setDraft(getSettings().autoSupport);
              }}
              className="ui-button !h-9 px-3 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--danger), var(--border-subtle) 45%)',
                background: 'color-mix(in srgb, var(--danger), var(--surface-1) 88%)',
                color: 'var(--danger)',
              }}
              title={_(msg`Delete the preset`)}
            >
              {_(msg`Delete`)}
            </button>
          </>
        }
      >
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {_(msg`The preset is removed from the list. The current settings are left as they are.`)}
        </p>
      </StructuredDialogModal>

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
              style={{
                borderColor: 'color-mix(in srgb, var(--accent), var(--border-subtle) 45%)',
                background: 'color-mix(in srgb, var(--accent), var(--surface-1) 86%)',
                color: 'var(--accent)',
              }}
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
    </section>
  );
}
