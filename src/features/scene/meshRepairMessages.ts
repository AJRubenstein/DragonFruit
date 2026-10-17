/**
 * Toasts for the manual mesh repair. Module level for the same React Compiler
 * reason as `sceneImportMessages.ts`.
 */

import { msg, plural } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';

type Translate = (descriptor: MessageDescriptor) => string;

export function repairedModelsMessage(names: readonly string[], translate: Translate): string {
  if (names.length === 1) {
    const modelName = names[0];
    return translate(msg`Repaired ${modelName}.`);
  }
  const count = names.length;
  return translate(msg`${plural(count, { one: 'Repaired # model.', other: 'Repaired # models.' })}`);
}

export function repairFailedMessage(message: string, translate: Translate): string {
  return translate(msg`Repair failed: ${message}`);
}

export function repairFailedForModelMessage(modelName: string, message: string, translate: Translate): string {
  return translate(msg`Repair failed for ${modelName}: ${message}`);
}

export function repairCancelledMessage(count: number, translate: Translate): string {
  return translate(msg`${plural(count, {
    one: 'Repair cancelled. The model is unchanged.',
    other: 'Repair cancelled. The models are unchanged.',
  })}`);
}

export function repairStoppedMessage(repaired: number, total: number, translate: Translate): string {
  return translate(msg`Repair stopped. Repaired ${repaired} of ${total} models; the rest are unchanged.`);
}
