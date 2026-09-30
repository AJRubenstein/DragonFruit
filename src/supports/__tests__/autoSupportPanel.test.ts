import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@lingui/react';
import { i18n } from '../../i18n';
import type { AutoSupportSettings, ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import type { AutoSupportSettingsBodyProps } from '@/components/controls/autoSupport/AutoSupportSettingsBody';
import type { AutoSupportRunDiagnosticsProps } from '@/components/controls/autoSupport/AutoSupportRunDiagnostics';
import type { AutoSupportSectionDef } from '@/components/controls/autoSupport/autoSupportPanelTabs';
import { getSettings, updateAutoSupportSettings } from '@/supports/Settings/state';
import {
  createAutoSupportPreset,
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
let AutoSupportRunDiagnostics: React.ComponentType<AutoSupportRunDiagnosticsProps>;
let selectAutoSupportPreset: (id: string, setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>) => void;
let deleteActiveAutoSupportPreset: (setDraft: React.Dispatch<React.SetStateAction<AutoSupportSettings>>) => void;
let autoSupportSections: ReadonlyArray<AutoSupportSectionDef>;
let policySections: ReadonlyArray<AutoSupportSectionDef>;

// Dynamic on purpose: these modules call `msg`, so the resolve hook above must
// already be registered — a static import would be evaluated first.
before(async () => {
  ({ AutoSupportSettingsBody } = await import('@/components/controls/autoSupport/AutoSupportSettingsBody'));
  ({ AutoSupportRunDiagnostics } = await import('@/components/controls/autoSupport/AutoSupportRunDiagnostics'));
  ({ selectAutoSupportPreset, deleteActiveAutoSupportPreset } = await import('@/components/controls/autoSupport/AutoSupportPresets'));
  ({
    AUTO_SUPPORT_SECTIONS: autoSupportSections,
    AUTO_SUPPORT_POLICY_SECTIONS: policySections,
  } = await import('@/components/controls/autoSupport/autoSupportPanelTabs'));
});

/** The calibration surface, which is the one thing behind a disclosure. */
const CALIBRATION_MARKERS = [
  'Advanced (calibration)',
  'Model-Scale Sizing',
  'Tip Fit Margin',
  // The tooltip names the value the engine ships with; there is no sub-label.
  'The default, 0.9',
];

/** The diagnostics card: the debug switches, and the switch that shows the run's report. */
const DIAGNOSTICS_MARKERS = [
  'Origin Colors',
  'No Brace',
  'Simplified',
  'Debug Mode',
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
  debugMode: false,
  onToggleDebugMode: () => {},
  onCommitted: () => {},
} satisfies Omit<AutoSupportSettingsBodyProps, 'draft'>;

/** What a run hands the panel's diagnostics. */
const FOREST_REPORT = {
  hostCount: 56,
  leafCount: 70,
  branchCount: 12,
  trees: [{}, {}],
} as unknown as ForestReport;

function renderBody(
  draft: AutoSupportSettings = getSettings().autoSupport,
): string {
  // `createElement` rather than JSX so this stays a `.ts` file, which is the
  // glob the supports suite is run with.
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { i18n },
      React.createElement(AutoSupportSettingsBody, { ...BODY_PROPS, draft }),
    ),
  );
  // Static markup escapes text ("Density &amp; Sizing"); the assertions read labels.
  return markup.replace(/&amp;/g, '&');
}

function renderRunDiagnostics(
  // Defaults, not `??`: an explicit `null` is the "no run yet" case.
  sizingDebug: SizingDebugInfo | null = SIZING_DEBUG,
  forestReport: ForestReport | null = FOREST_REPORT,
): string {
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { i18n },
      React.createElement(AutoSupportRunDiagnostics, {
        sizingDebug,
        forestReport,
        onShowForestReport: () => {},
      }),
    ),
  );
  return markup.replace(/&amp;/g, '&');
}

test('every card renders, all of them visible, with calibration framed as a warning', () => {
  const markup = renderBody();

  for (const section of autoSupportSections) {
    assert.ok(markup.includes(String(section.label.message)), `the dialog is missing the "${section.label.message}" section`);
  }
  for (const section of policySections) {
    assert.ok(section.subtitle, `the "${section.label.message}" card is missing its one-liner`);
    assert.ok(markup.includes(String(section.subtitle.message)), `the "${section.label.message}" card is missing its one-liner`);
  }

  // Nothing is behind a disclosure any more: every control is on screen.
  assert.ok(!markup.includes('<details'), 'the dialog still has a disclosure');

  for (const marker of DIAGNOSTICS_MARKERS) {
    assert.ok(markup.includes(marker), `"${marker}" must be on screen`);
  }

  // The last run's report is the *panel's*, not the dialog's: the card here
  // carries the switch that shows it and nothing of the report itself.
  assert.ok(!markup.includes('Sizing Debug'), 'the dialog must not carry the sizing debug disclosure');
  assert.ok(!markup.includes('Show Forest Report'), 'the dialog must not carry the report button');

  // `Debug Mode` is a cell of the switches' own grid, the one beside
  // `Simplified`, not a row of its own further down the card.
  assert.ok(
    markup.indexOf('Simplified') < markup.indexOf('Debug Mode'),
    'the debug switch must sit beside the Simplified toggle',
  );
  assert.ok(
    markup.indexOf('Debug Mode') < markup.indexOf('Advanced (calibration)'),
    'the debug switch must sit in the diagnostics card, not past the calibration card',
  );

  for (const marker of CALIBRATION_MARKERS) {
    assert.ok(markup.includes(marker), `"${marker}" must be on screen`);
  }

  // The calibration card carries the warning tone instead of a callout: the amber
  // border/background the material modal's warning banner uses.
  assert.ok(markup.includes('color-mix(in srgb, #d97706, var(--border-subtle) 36%)'), 'no warning-toned border');
  assert.ok(markup.includes('color-mix(in srgb, #d97706, var(--surface-1) 92%)'), 'no warning-toned surface');

  // No callout text, no "measured" claim, no reset action: the tooltips carry the
  // explanation of what each value does.
  assert.ok(!markup.includes('measured'));
  assert.ok(!markup.includes('Reset to measured defaults'));
  assert.ok(!markup.includes('Calibration, not preferences'));
});

test('the run diagnostics are the panel\'s: the sizing inputs and the report button', () => {
  const markup = renderRunDiagnostics();

  // Both halves of the last run's report, where the run was started.
  assert.ok(markup.includes('Sizing Debug'), 'the sizing inputs must be on the panel');
  assert.ok(markup.includes('Show Forest Report'), 'the report button must be on the panel');
  assert.ok(markup.includes('56H 70L 12B · 2 trees'), 'the report button must carry the last run tally');

  // Disclosed, not dumped: the sizing numbers are behind the caret until it opens.
  assert.ok(!markup.includes('Model volume'), 'the sizing inputs must start disclosed, not open');

  // Nothing run yet renders neither, rather than two empty frames.
  assert.equal(
    renderRunDiagnostics(null, null),
    '',
    'a panel with no run yet must render no diagnostics',
  );
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

test('the preset strip carries the reference actions, and the footer the commit pair', () => {
  const markup = renderBody();
  const visibleText = markup.replace(/<[^>]*>/g, ' ');

  // The strip sits above the fields: the selector, then exactly the three
  // actions the reference keeps beside it.
  assert.ok(markup.includes('aria-label="Auto-support preset"'));
  assert.ok(markup.indexOf('Auto-support preset') < markup.indexOf('Detection'), 'the preset strip must sit above the sections');
  for (const action of ['Rename', 'Duplicate', 'Export', 'Import']) {
    assert.ok(visibleText.includes(action), `the preset strip is missing the "${action}" action`);
  }

  // `New` is the dropdown's own menu entry, not a button in the strip; there is no
  // second row of collection actions and no factory restore.
  assert.ok(!visibleText.includes('New'), 'the strip still shows a New control');
  assert.ok(!visibleText.includes('Restore factory presets'), 'the dropped restore action is still rendered');

  // The footer is the reference's: Delete on the left, Reset + Save on the right,
  // with no separate Apply.
  for (const action of ['Delete', 'Reset', 'Save']) {
    assert.ok(visibleText.includes(action), `the dialog footer is missing the "${action}" action`);
  }
  assert.ok(!visibleText.includes('Apply'), 'the footer still shows an Apply action');
  assert.ok(!visibleText.includes('unsaved changes'), 'the removed dirty strip is still rendered');

  const builtIns = getAutoSupportPresets().filter((preset) => preset.isBuiltIn);
  assert.deepEqual(builtIns.map((preset) => preset.id), ['light', 'medium', 'heavy']);
});

test('the modified marker rides on the dirty preset name, and only when it is dirty', () => {
  // Clean: a preset applied and untouched is not marked.
  selectAutoSupportPreset('light', () => {});
  const clean = renderBody();
  assert.ok(clean.includes('aria-label="Auto-support preset"'), 'a clean preset must not be announced as modified');
  assert.ok(!clean.includes('aria-label="Auto-support preset, modified"'));
  assert.ok(!clean.includes('Light *'), 'a clean preset must not carry the star');

  // A knob edit staged in the draft — the store is still clean — marks the name,
  // because that is what a user means by "this preset is modified".
  const edited = renderBody({ ...getSettings().autoSupport, areaPerSupportMm2: 7 });
  assert.ok(edited.includes('Light *'), 'a staged knob edit must mark the preset name');
  assert.ok(
    edited.includes('aria-label="Auto-support preset, modified"'),
    'the modified state must be exposed to assistive tech',
  );
  assert.ok(edited.includes('The settings no longer match this preset'), 'the trigger must explain the marker');

  // And so does a live block that has drifted from the preset.
  updateAutoSupportSettings({ areaPerSupportMm2: 8 });
  const drifted = renderBody();
  assert.ok(drifted.includes('Light *'), 'a drifted live block must mark the preset name');
});


test('selecting a preset applies it to the settings and to the dialog draft', () => {
  assert.ok(getAutoSupportPreset('light'));

  let draft = getSettings().autoSupport;
  selectAutoSupportPreset('light', (next) => {
    draft = typeof next === 'function' ? next(draft) : next;
  });

  // The store's own contract — the applied block, normalized — is its tests';
  // what matters here is that the dialog's draft is what was just applied, so
  // the fields show it.
  assert.equal(getActiveAutoSupportPresetId(), 'light');
  assert.deepEqual(draft, getSettings().autoSupport);
});

test('deleting the selected preset falls back to the balanced built-in', () => {
  const mine = createAutoSupportPreset('Mine');
  assert.equal(getActiveAutoSupportPresetId(), mine.id);

  deleteActiveAutoSupportPreset(() => {});

  // The store's own contract is "nothing selected"; the dialog's fallback is what
  // keeps a run policy on screen, so it is what is asserted here.
  assert.equal(getActiveAutoSupportPresetId(), 'medium');
  assert.ok(!getAutoSupportPresets().some((preset) => preset.id === mine.id), 'the deleted preset is gone');
});

test('Save refuses a built-in preset and is offered for a custom one', () => {
  const saveButton = (markup: string) => {
    const end = markup.indexOf('>Save</button>');
    if (end < 0) return '';
    return markup.slice(markup.lastIndexOf('<button', end), end);
  };

  // Something to save either way, so the preset's kind is the only difference.
  selectAutoSupportPreset('light', () => {});
  updateAutoSupportSettings({ areaPerSupportMm2: 7 });

  const builtIn = renderBody();
  assert.ok(saveButton(builtIn).includes('disabled=""'), 'Save must be refused while a built-in is selected');
  assert.ok(
    builtIn.includes('A built-in preset cannot be saved over'),
    'the refusal must say how to keep the edits',
  );

  createAutoSupportPreset('Mine');
  updateAutoSupportSettings({ areaPerSupportMm2: 8 });

  const custom = renderBody();
  assert.ok(!saveButton(custom).includes('disabled=""'), 'Save must be offered for a custom preset');
});
