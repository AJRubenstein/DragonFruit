/**
 * Translations for the built-in auto-support preset names.
 *
 * Presets are persisted to localStorage, so a stored `name` must stay
 * language-neutral — a user who switches language should not end up with a
 * built-in frozen in the language it was first shown in. The built-ins are
 * looked up by id at render time; anything else (a preset the user made and
 * named) falls back to what is stored, which is exactly what should be shown.
 *
 * Module level on purpose: React Compiler renames locals inside components
 * before the Lingui macro derives the message id.
 */

import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { AutoSupportPreset } from './autoSupportPresets';

type Translate = (descriptor: MessageDescriptor) => string;

const BUILT_IN_NAMES: Record<string, MessageDescriptor> = {
  light: msg({ message: 'Light', comment: 'Built-in auto-support preset for sparse supports, matching the "light" density tier button on the Auto Support panel.' }),
  medium: msg({ message: 'Medium', comment: 'Built-in auto-support preset for balanced supports, matching the "medium" density tier button on the Auto Support panel.' }),
  heavy: msg({ message: 'Heavy', comment: 'Built-in auto-support preset for dense supports, matching the "heavy" density tier button on the Auto Support panel.' }),
};

export function translateAutoSupportPresetName(preset: AutoSupportPreset, translate: Translate): string {
  const descriptor = BUILT_IN_NAMES[preset.id];
  return descriptor ? translate(descriptor) : preset.name;
}
