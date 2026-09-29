import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@lingui/react';
import { i18n } from '../../i18n';
import type { AutoSupportSettings, ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import type { AutoSupportSettingsBodyProps } from '@/components/controls/autoSupport/AutoSupportSettingsBody';
import type { AutoSupportSectionDef } from '@/components/controls/autoSupport/autoSupportPanelTabs';
import { getSettings } from '@/supports/Settings/state';
import {
  getActiveAutoSupportPresetId,
  getAutoSupportPreset,
  getAutoSupportPresets,
} from '@/supports/Settings/autoSupportPresets';

/**
 * The panel's settings dialog, mounted without a DOM.
 *
 * `AutoSupportSettingsBody` is the dialog's whole surface (the preset strip, the
 * field cards, the disclosure and the footer), so rendering it is the panel's
 * settings surface under test. There is no jsdom in this repo — component tests
 * render to static markup — which the body supports by construction: it is
 * store-free, taking the draft it edits plus the last run's diagnostics as props.
 *
 * The macro resolve hook has to be registered before anything that calls `msg`
 * is *evaluated*, which is why the panel modules arrive through a dynamic
 * `import()` in the `before` hook and why nothing here statically imports a
 * `.tsx` from the panel. See `linguiMacroStub.mjs`.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@lingui/core/macro') {
      return { url: new URL('./linguiMacroStub.mjs', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

let AutoSupportSettingsBody: React.ComponentType<AutoSupportSettingsBodyProps>;
let selectAutoSupportPreset: (id: string, setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>) => void;
let autoSupportSections: ReadonlyArray<AutoSupportSectionDef>;
let policySections: ReadonlyArray<AutoSupportSectionDef>;

// Dynamic on purpose: these modules call `msg`, so the resolve hook above must
// already be registered — a static import would be evaluated first.
before(async () => {
  ({ AutoSupportSettingsBody } = await import('@/components/controls/autoSupport/AutoSupportSettingsBody'));
  ({ selectAutoSupportPreset } = await import('@/components/controls/autoSupport/AutoSupportPresets'));
  ({
    AUTO_SUPPORT_SECTIONS: autoSupportSections,
    AUTO_SUPPORT_POLICY_SECTIONS: policySections,
  } = await import('@/components/controls/autoSupport/autoSupportPanelTabs'));
});

/**
 * Labels that belong to the Debug & Advanced surface. They are all inside the
 * disclosure, so none of them may appear before it in the markup.
 */
const DEBUG_ONLY_MARKERS = [
  'Origin Colors',
  'No Brace',
  'Simplified',
  'Sizing Debug',
  'Forest Report',
  'Advanced (calibration)',
  'Calibration, not preferences.',
];

const SIZING_DEBUG: SizingDebugInfo = {
  modelVolumeMm3: 12_345,
  estimatedWeightG: 13.2,
  totalCandidates: 187,
  weightPerSupportG: 0.07,
  modelSizeMm: 82,
  loadShareG: 0.06,
  sizeFactor: 1.12,
  loadFactor: 1.0,
  avgIslandAreaMm2: 3.4,
  standaloneHosts: 41,
  gridInfillHosts: 44,
  shaftDiameterRange: { min: 0.98, max: 1.21, avg: 1.04 },
  tipContactRange: { min: 0.28, max: 0.42, avg: 0.34 },
};

const BODY_PROPS = {
  setDraft: () => {},
  debugSimpleRender: false,
  onToggleDebugSimpleRender: () => {},
  sizingDebug: null,
  forestReport: null,
  onShowForestReport: () => {},
  onCancel: () => {},
  onApply: () => {},
} satisfies Omit<AutoSupportSettingsBodyProps, 'draft'>;

const FOREST_REPORT = {
  hostCount: 56,
  leafCount: 70,
  branchCount: 12,
  trees: [{}, {}],
} as unknown as ForestReport;

function renderBody(diagnostics: { sizingDebug?: SizingDebugInfo } = {}): string {
  // `createElement` rather than JSX so this stays a `.ts` file, which is the
  // glob the supports suite is run with.
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { i18n },
      React.createElement(AutoSupportSettingsBody, {
        ...BODY_PROPS,
        draft: getSettings().autoSupport,
        sizingDebug: diagnostics.sizingDebug ?? null,
        forestReport: FOREST_REPORT,
      }),
    ),
  );
  // Static markup escapes text ("Density &amp; Sizing"); the assertions read labels.
  return markup.replace(/&amp;/g, '&');
}

test('the dialog renders every section, and no debug control outside the closed disclosure', () => {
  const markup = renderBody({ sizingDebug: SIZING_DEBUG });

  for (const section of autoSupportSections) {
    assert.ok(markup.includes(String(section.label.message)), `the dialog is missing the "${section.label.message}" section`);
  }
  for (const section of policySections) {
    assert.ok(markup.includes(String(section.subtitle.message)), `the "${section.label.message}" card is missing its one-liner`);
  }

  // Debug & Advanced is a `<details>` with no `open` attribute: closed by
  // default, and every debug control is inside it.
  const disclosureIndex = markup.indexOf('<details');
  assert.ok(disclosureIndex > 0, 'the Debug & Advanced disclosure is not rendered');
  assert.ok(!/<details[^>]*\sopen(=|>|\s)/.test(markup), 'the Debug & Advanced disclosure renders open');

  const policyMarkup = markup.slice(0, disclosureIndex);
  for (const marker of DEBUG_ONLY_MARKERS) {
    assert.ok(
      !policyMarkup.includes(marker),
      `"${marker}" renders above the Debug & Advanced disclosure, in the policy surface`,
    );
  }

  // Every debug control — including the diagnostics and the calibration fields —
  // is inside the disclosure.
  const disclosureMarkup = markup.slice(disclosureIndex);
  assert.ok(disclosureMarkup.includes('Origin Colors'));
  assert.ok(disclosureMarkup.includes('No Brace'));
  assert.ok(disclosureMarkup.includes('Simplified'));
  assert.ok(disclosureMarkup.includes('Sizing Debug'));
  assert.ok(disclosureMarkup.includes('Forest Report'));
  assert.ok(disclosureMarkup.includes('56H 70L 12B'));
  assert.ok(disclosureMarkup.includes('Model-Scale Sizing'));
  assert.ok(disclosureMarkup.includes('Advanced (calibration)'));
  assert.ok(disclosureMarkup.includes('Tip Fit Margin'));
  assert.ok(disclosureMarkup.includes('measured'));
  assert.ok(disclosureMarkup.includes('Reset to measured defaults'));
  // The calibration warning states what breaks, not just that something might.
  assert.ok(disclosureMarkup.includes('Calibration, not preferences.'));
});

test('a numeric knob is a labelled field with its unit and a stepper, never a slider', () => {
  const markup = renderBody();

  // No slider survives anywhere in the dialog.
  assert.ok(!markup.includes('type="range"'), 'a slider is still rendered');

  // The label carries the unit, the way the material editor's fields do.
  assert.ok(markup.includes('Min Island Size (mm²)'));
  assert.ok(markup.includes('Self-Support Angle (°)'));
  assert.ok(markup.includes('Coverage Target (%)'));
  // The stepper is the field's own, and its two carets name the field.
  assert.ok(markup.includes('aria-label="Increase Min Island Size (mm²)"'));
  assert.ok(markup.includes('aria-label="Decrease Min Island Size (mm²)"'));

  // A toggle is the pill the material editor's switches use, not a slider.
  assert.ok(markup.includes('role="switch"'));
  assert.ok(markup.includes('aria-checked="true"'));
});

test('the preset selector and its action row carry the whole preset lifecycle', () => {
  const markup = renderBody();

  // The selector sits above the fields, with the two apply actions beside it.
  assert.ok(markup.includes('Preset'));
  assert.ok(markup.includes('Save'));
  assert.ok(markup.includes('Revert'));
  assert.ok(markup.includes('aria-label="Auto-support preset"'));
  assert.ok(markup.indexOf('Auto-support preset') < markup.indexOf('Min Island Size'), 'the preset strip must sit above the fields');

  // The collection's action bar is a row of its own under the selector — no
  // management surface to open, and nothing hidden inside the menu.
  const visibleText = markup.replace(/<[^>]*>/g, ' ');
  for (const action of ['New', 'Rename', 'Duplicate', 'Import', 'Export', 'Restore factory presets', 'Delete']) {
    assert.ok(visibleText.includes(action), `the preset action row is missing the "${action}" action`);
  }
  assert.ok(markup.indexOf('Restore factory presets') < markup.indexOf('Detection'), 'the action row sits with the preset strip, above the sections');

  // The dialog footer is the commit bar: the collection actions are not repeated there.
  const footer = markup.slice(markup.lastIndexOf('border-top'));
  assert.ok(footer.includes('Cancel'));
  assert.ok(footer.includes('Apply'));
  assert.ok(!footer.includes('Restore factory presets'), 'the footer repeats the preset row');

  const builtIns = getAutoSupportPresets().filter((preset) => preset.isBuiltIn);
  assert.deepEqual(builtIns.map((preset) => preset.id), ['light', 'medium', 'heavy']);
});

test('selecting a preset applies its block to the settings and to the dialog draft', () => {
  const applied = getAutoSupportPreset('light');
  assert.ok(applied);

  let draft = getSettings().autoSupport;
  selectAutoSupportPreset('light', (next) => {
    draft = typeof next === 'function' ? next(draft) : next;
  });

  assert.equal(getActiveAutoSupportPresetId(), 'light');
  assert.deepEqual(getSettings().autoSupport, applied.settings);
  assert.deepEqual(draft, getSettings().autoSupport);
});
