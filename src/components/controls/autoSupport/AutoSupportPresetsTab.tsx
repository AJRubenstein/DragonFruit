"use client";

/**
 * The Auto Support settings dialog's Presets tab.
 *
 * A preset is a named `autoSupport` block: the whole run policy. The collection,
 * the active selection and the file format belong to
 * `@/supports/Settings/autoSupportPresets`; this file is only its UI.
 *
 * Two behaviours worth knowing before changing it:
 *
 * - Selecting a preset **applies** it to the live settings. That is the store's
 *   contract, so it cannot be staged in the dialog's draft like a knob edit —
 *   instead the applied block is copied back into the draft, so the other tabs
 *   immediately show what was applied.
 * - A built-in's name is translated by id at render, so Rename is refused for
 *   them (and Delete too: the format and the quick-select row are defined in
 *   terms of those ids). A built-in *is* savable over — that is how a user keeps
 *   a tweaked tier.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { PenLine } from 'lucide-react';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';
import type { AutoSupportSettings } from '@/supports/autoSupport';
import {
  createAutoSupportPreset,
  deleteAutoSupportPreset,
  duplicateAutoSupportPreset,
  exportAutoSupportPresetToJson,
  getActiveAutoSupportPresetId,
  getAutoSupportPreset,
  getAutoSupportPresets,
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
import { AUTO_SUPPORT_SECTION_CARD } from './autoSupportPanelTabs';

type Translate = (descriptor: MessageDescriptor) => string;

/** Placeholder and starting value for a new preset's name. */
const NEW_PRESET_NAME = msg`New Preset`;

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
 * other tabs show what was just selected.
 *
 * Module scope so the panel's tier row and the preset list drive the same path
 * (and a test can call it without a DOM).
 */
export function selectAutoSupportPreset(
  id: string,
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>,
): void {
  setActiveAutoSupportPreset(id);
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

type AutoSupportPresetsTabProps = {
  /** The dialog's draft, so a selection can be reflected in the other tabs. */
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
};

export function AutoSupportPresetsTab({ draft, setDraft }: AutoSupportPresetsTabProps) {
  const { _ } = useLingui();

  // Two stores: the preset collection (any edit to it) and the live settings
  // (what `isAutoSupportPresetDirty` compares an edit against).
  React.useSyncExternalStore(
    subscribeToAutoSupportPresets,
    getAutoSupportPresetsSnapshot,
    getAutoSupportPresetsServerSnapshot,
  );
  React.useSyncExternalStore(subscribeToSettings, getSettings, getSettings);

  const presets = getAutoSupportPresets();
  const activeId = getActiveAutoSupportPresetId();
  const activePreset = activeId ? getAutoSupportPreset(activeId) : undefined;
  const dirty = isAutoSupportPresetDirty();

  const [newName, setNewName] = React.useState(() => _(NEW_PRESET_NAME));
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = React.useState(false);
  /** Import/export failures of any kind; the store's messages are shown verbatim. */
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const startInlineRename = (id: string, name: string) => {
    setRenamingId(id);
    setRenameValue(name);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const commitInlineRename = () => {
    if (renamingId) renameAutoSupportPreset(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue('');
  };

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

  const pendingDeletePreset = pendingDeleteId ? getAutoSupportPreset(pendingDeleteId) : undefined;

  return (
    <div className="space-y-2.5">
      {/* Dirty state: the live block no longer matches the active preset. */}
      {activePreset && dirty && (
        <div
          className="flex items-center gap-2 rounded-md border px-2 py-1.5"
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

      {/* The list. Selecting applies; the store keeps built-ins first. */}
      <div className="space-y-1" data-auto-support-preset-list="true">
        {presets.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <div
              key={preset.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
              style={isActive
                ? {
                  borderColor: 'color-mix(in srgb, var(--accent), var(--border-subtle) 40%)',
                  background: 'color-mix(in srgb, var(--accent), var(--surface-1) 86%)',
                }
                : AUTO_SUPPORT_SECTION_CARD}
            >
              {renamingId === preset.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={commitInlineRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.stopPropagation();
                      commitInlineRename();
                    } else if (event.key === 'Escape') {
                      event.stopPropagation();
                      setRenamingId(null);
                      setRenameValue('');
                    }
                  }}
                  className="ui-input h-6 min-w-0 flex-1 text-[11px]"
                  aria-label={_(msg`Preset name`)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => selectAutoSupportPreset(preset.id, setDraft)}
                  title={_(msg`Apply this preset to the auto-support settings`)}
                  className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-strong)' }}
                >
                  {translateAutoSupportPresetName(preset, _)}
                </button>
              )}
              <span
                className="shrink-0 text-[9px] uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
                title={preset.isBuiltIn
                  ? _(msg`Built-in preset: a reserved id with the factory block, savable over but not renameable or deletable`)
                  : _(msg`Your own preset`)}
              >
                {preset.isBuiltIn ? _(msg`Built-in`) : _(msg`Custom`)}
              </span>
            </div>
          );
        })}
      </div>

      {/* New: captures the current (draft) block under a new name. */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          className="ui-input h-7 min-w-0 flex-1 text-[11px]"
          aria-label={_(msg`New preset name`)}
          title={_(msg`Name for the new preset`)}
        />
        <button
          type="button"
          onClick={() => {
            createAutoSupportPreset(newName);
            setDraft(getSettings().autoSupport);
            setNewName(_(NEW_PRESET_NAME));
          }}
          className="ui-button ui-button-secondary !h-7 shrink-0 px-2.5 text-[11px]"
          title={_(msg`Create a preset from the current settings and select it`)}
        >
          {_(msg`New`)}
        </button>
      </div>

      {/* Actions on the active preset. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (!activeId) return;
            updateAutoSupportSettings(draft);
            saveAutoSupportPreset(activeId);
            setDraft(getSettings().autoSupport);
          }}
          disabled={!activeId}
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
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
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
          title={_(msg`Reload the selected preset over the current settings, discarding the edits`)}
        >
          {_(msg`Revert`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activePreset && !activePreset.isBuiltIn) startInlineRename(activePreset.id, activePreset.name);
          }}
          disabled={!activePreset || activePreset.isBuiltIn}
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
          title={activePreset?.isBuiltIn
            ? _(msg`A built-in's name is translated and cannot be renamed`)
            : _(msg`Rename the selected preset in place`)}
        >
          {_(msg`Rename`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeId) duplicateAutoSupportPreset(activeId);
          }}
          disabled={!activeId}
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
          title={_(msg`Copy the selected preset under a new name`)}
        >
          {_(msg`Duplicate`)}
        </button>
        <button
          type="button"
          onClick={() => {
            if (activePreset && !activePreset.isBuiltIn) setPendingDeleteId(activePreset.id);
          }}
          disabled={!activePreset || activePreset.isBuiltIn}
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
          title={activePreset?.isBuiltIn
            ? _(msg`Built-in presets cannot be deleted`)
            : _(msg`Delete the selected preset`)}
        >
          {_(msg`Delete`)}
        </button>
      </div>

      {/* Collection-level actions. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowRestoreConfirm(true)}
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px]"
          title={_(msg`Put the built-in presets back to their factory settings; your own presets are left alone`)}
        >
          {_(msg`Restore factory presets`)}
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
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px] disabled:opacity-40"
          title={_(msg`Export the selected preset as a JSON file`)}
        >
          {_(msg`Export`)}
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
          className="ui-button ui-button-secondary !h-7 px-2.5 text-[11px]"
          title={_(msg`Import a preset from a JSON file, and apply it`)}
        >
          {_(msg`Import`)}
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

      {errorMessage && (
        <div
          className="rounded-md border px-2 py-1.5"
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
        open={showRestoreConfirm}
        ariaLabel={_(msg`Restore factory presets`)}
        title={_(msg`Restore Factory Presets?`)}
        subtitle={_(msg`The built-in presets go back to their measured factory settings.`)}
        iconTone="warning"
        onClose={() => setShowRestoreConfirm(false)}
        onBackdropClick={() => setShowRestoreConfirm(false)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowRestoreConfirm(false)}
              className="ui-button ui-button-secondary !h-9 px-3 text-xs"
              title={_(msg`Keep the built-in presets as they are`)}
            >
              {_(msg`Cancel`)}
            </button>
            <button
              type="button"
              onClick={() => {
                restoreAutoSupportFactoryDefaults();
                setShowRestoreConfirm(false);
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
    </div>
  );
}
