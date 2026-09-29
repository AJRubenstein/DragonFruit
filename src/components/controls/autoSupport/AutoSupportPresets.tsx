"use client";

/**
 * The Auto Support settings dialog's preset UI: the selector strip at the top of
 * the dialog, and the sub-modal that manages the collection.
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
 * The selector follows the LUT curve editor's shape (`LutCurveSelector`): a
 * `SelectDropdown` for the collection plus one square icon button that opens the
 * management surface. That surface is the material editor's shape: a list with
 * column headers, and a footer whose only destructive action sits alone on the
 * right.
 */
import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Check, PenLine, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { useEscapeToClose } from '@/hotkeys/useEscapeToClose';
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
import { AUTO_SUPPORT_SECTION_CARD, SIZING_TIER_LABELS } from './autoSupportPanelTabs';

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
  /** Opens the management sub-modal. */
  onManagePresets: () => void;
};

/**
 * The dialog's top strip: which preset the settings are, whether they have
 * drifted from it, and the two actions that resolve that.
 */
export function AutoSupportPresetSelector({ draft, setDraft, onManagePresets }: AutoSupportPresetSelectorProps) {
  const { _ } = useLingui();
  const { presets, activeId, activePreset, dirty } = useAutoSupportPresetState();

  const presetOptions = presets.map((preset) => ({
    value: preset.id,
    label: translateAutoSupportPresetName(preset, _),
  }));

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

        <div className="min-w-[12rem] flex-1">
          <SelectDropdown
            value={activeId ?? ''}
            options={activeId
              ? presetOptions
              : [{ value: '', label: _(NO_ACTIVE_PRESET_LABEL), disabled: true }, ...presetOptions]}
            onChange={(id) => selectAutoSupportPreset(id, setDraft)}
            ariaLabel={_(msg`Auto-support preset`)}
            className="space-y-0"
            selectClassName="w-full h-[36px] px-2.5 pr-10 leading-tight text-sm"
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
        <button
          type="button"
          onClick={onManagePresets}
          className="ui-button ui-button-secondary inline-flex !h-9 w-9 shrink-0 items-center justify-center !p-0"
          title={_(msg`Manage presets`)}
          aria-label={_(msg`Manage presets`)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
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
    </section>
  );
}

/** One column template for the list's header row and its rows. */
const PRESET_ROW_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_5rem_7.5rem] items-center gap-2';

type AutoSupportPresetManagerModalProps = {
  open: boolean;
  onClose: () => void;
  draft: AutoSupportSettings;
  setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>;
  /** Restoring the built-ins is the dialog footer's action too; both open the
   *  same confirmation, which the dialog body owns. */
  onRestoreFactoryPresets: () => void;
};

/**
 * The preset collection as a surface of its own, the way the material editor sits
 * over the profiles list: a table you select in, and one action bar under it.
 *
 * The surface is separate from the modal so it can be rendered on its own — the
 * modal is only chrome (portal, backdrop, header) around it.
 */
export function AutoSupportPresetManagerSurface({
  draft,
  setDraft,
  onRestoreFactoryPresets,
}: Omit<AutoSupportPresetManagerModalProps, 'open' | 'onClose'>) {
  const { _ } = useLingui();
  const { presets, activeId, activePreset, dirty } = useAutoSupportPresetState();

  const [newName, setNewName] = React.useState(() => _(NEW_PRESET_NAME));
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
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
    <>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {/* The list. Selecting applies; the store keeps built-ins first. */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}>
          <div
            className={`${PRESET_ROW_COLUMNS} border-b px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide`}
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            <span>{_(msg`Name`)}</span>
            <span>{_(msg`Tier`)}</span>
            <span>{_(msg`Status`)}</span>
          </div>
          <div className="p-1.5 space-y-1" data-auto-support-preset-list="true">
            {presets.map((preset) => {
              const isActive = preset.id === activeId;
              return (
                <div
                  key={preset.id}
                  className={`${PRESET_ROW_COLUMNS} rounded-md border px-2.5 py-2`}
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
                      className="ui-input h-7 min-w-0 text-[11px]"
                      aria-label={_(msg`Preset name`)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectAutoSupportPreset(preset.id, setDraft)}
                      onDoubleClick={() => {
                        if (!preset.isBuiltIn) startInlineRename(preset.id, preset.name);
                      }}
                      title={preset.isBuiltIn
                        ? _(msg`Apply this preset to the auto-support settings. A built-in's name is translated and cannot be renamed.`)
                        : _(msg`Apply this preset to the auto-support settings. Double-click to rename it.`)}
                      className="min-w-0 truncate text-left text-[12px] font-semibold"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-strong)' }}
                    >
                      {translateAutoSupportPresetName(preset, _)}
                    </button>
                  )}

                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {_(SIZING_TIER_LABELS[normalizeAutoSupportSettings(preset.settings).sizingPreset])}
                  </span>

                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                        <Check className="h-3 w-3 shrink-0" />
                        {_(msg`Active`)}
                      </span>
                    )}
                    {isActive && dirty && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-secondary)' }}>
                        {_(msg`Unsaved`)}
                      </span>
                    )}
                    <span
                      className="text-[10px] uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                      title={preset.isBuiltIn
                        ? _(msg`Built-in preset: a reserved id with the factory block, savable over but not renameable or deletable`)
                        : _(msg`Your own preset`)}
                    >
                      {preset.isBuiltIn ? _(msg`Built-in`) : _(msg`Custom`)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* New: captures the current (draft) block under a new name. */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="ui-input h-8 min-w-0 flex-1 text-xs"
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
            className="ui-button ui-button-secondary !h-8 shrink-0 px-3 text-xs"
            title={_(msg`Create a preset from the current settings and select it`)}
          >
            {_(msg`New`)}
          </button>
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
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => saveDraftIntoActivePreset(draft, setDraft)}
            disabled={!activeId}
            className="ui-button ui-button-secondary !h-8 px-3 text-xs disabled:opacity-40"
            title={_(msg`Overwrite the selected preset with the current settings`)}
          >
            {_(msg`Save`)}
          </button>
          <button
            type="button"
            onClick={() => {
              if (activePreset && !activePreset.isBuiltIn) startInlineRename(activePreset.id, activePreset.name);
            }}
            disabled={!activePreset || activePreset.isBuiltIn}
            className="ui-button ui-button-secondary !h-8 px-3 text-xs disabled:opacity-40"
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
            className="ui-button ui-button-secondary !h-8 px-3 text-xs disabled:opacity-40"
            title={_(msg`Copy the selected preset under a new name`)}
          >
            {_(msg`Duplicate`)}
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
            className="ui-button ui-button-secondary !h-8 px-3 text-xs disabled:opacity-40"
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
            className="ui-button ui-button-secondary !h-8 px-3 text-xs"
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
          <button
            type="button"
            onClick={onRestoreFactoryPresets}
            className="ui-button ui-button-secondary !h-8 px-3 text-xs"
            title={_(msg`Put the built-in presets back to their factory settings; your own presets are left alone`)}
          >
            {_(msg`Restore factory presets`)}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activePreset && !activePreset.isBuiltIn) setPendingDeleteId(activePreset.id);
          }}
          disabled={!activePreset || activePreset.isBuiltIn}
          className="ui-button ui-button-secondary !h-8 shrink-0 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
          style={{
            color: !activePreset || activePreset.isBuiltIn ? 'var(--text-muted)' : 'var(--danger)',
            borderColor: 'color-mix(in srgb, var(--danger), var(--border-subtle) 55%)',
          }}
          title={activePreset?.isBuiltIn
            ? _(msg`Built-in presets cannot be deleted`)
            : _(msg`Delete the selected preset`)}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          {_(msg`Delete`)}
        </button>
      </div>

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
    </>
  );
}

/**
 * The surface over the dialog: a backdrop, the header, and the one Escape
 * registration that keeps a press from reaching the dialog behind it.
 */
export function AutoSupportPresetManagerModal({
  open,
  onClose,
  draft,
  setDraft,
  onRestoreFactoryPresets,
}: AutoSupportPresetManagerModalProps) {
  const { _ } = useLingui();

  useEscapeToClose(open, onClose);

  // Closed is the common case, and the portal below needs a document.
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 ui-modal-backdrop-enter"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[760px] max-h-[88vh] rounded-xl border shadow-2xl ui-modal-panel-enter flex flex-col"
        style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-0)' }}
        role="dialog"
        aria-modal="true"
        aria-label={_(msg`Manage presets`)}
      >
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {_(msg`Manage Presets`)}
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              {_(msg`Saved auto-support policies: pick one, tweak and save it, or share it as a file.`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}
            aria-label={_(msg`Close preset manager`)}
            title={_(msg`Close preset manager`)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <AutoSupportPresetManagerSurface
          draft={draft}
          setDraft={setDraft}
          onRestoreFactoryPresets={onRestoreFactoryPresets}
        />
      </div>
    </div>,
    document.body,
  );
}
