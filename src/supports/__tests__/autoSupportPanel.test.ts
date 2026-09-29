import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@lingui/react';
import { i18n } from '../../i18n';
import type { AutoSupportSettings, ForestReport, SizingDebugInfo } from '@/supports/autoSupport';
import type { AutoSupportSettingsBodyProps } from '@/components/controls/autoSupport/AutoSupportSettingsBody';
import type { AutoSupportTabKey } from '@/components/controls/autoSupport/autoSupportPanelTabs';
import { getSettings } from '@/supports/Settings/state';
import {
  getActiveAutoSupportPresetId,
  getAutoSupportPreset,
  getAutoSupportPresets,
} from '@/supports/Settings/autoSupportPresets';

/**
 * The panel's settings dialog, mounted without a DOM.
 *
 * `AutoSupportSettingsBody` is the dialog's whole body (tab row + tab panels),
 * so rendering it per tab is the panel's settings surface under test. There is
 * no jsdom in this repo — component tests render to static markup — which the
 * body supports by construction: it is store-free, taking the draft it edits
 * plus the last run's diagnostics as props.
 *
 * The macro resolve hook has to be registered before anything that calls `msg`
 * is *evaluated*, which is why the three panel modules arrive through a dynamic
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
let autoSupportTabs: ReadonlyArray<{ key: AutoSupportTabKey; label: { message?: string } }>;

// Dynamic on purpose: these modules call `msg`, so the resolve hook above must
// already be registered — a static import would be evaluated first.
before(async () => {
  ({ AutoSupportSettingsBody } = await import('@/components/controls/autoSupport/AutoSupportSettingsBody'));
  ({ selectAutoSupportPreset } = await import('@/components/controls/autoSupport/AutoSupportPresetsTab'));
  ({ AUTO_SUPPORT_TABS: autoSupportTabs } = await import('@/components/controls/autoSupport/autoSupportPanelTabs'));
});

/** The tabs that hold ordinary settings — everything but Presets and Debug. */
const NORMAL_TAB_KEYS: AutoSupportTabKey[] = ['detection', 'distribution', 'density', 'stability', 'postProcessing'];

/** Labels that only the Debug & Advanced tab may render. */
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
  onTabChange: () => {},
  setDraft: () => {},
  debugSimpleRender: false,
  onToggleDebugSimpleRender: () => {},
  sizingDebug: null,
  forestReport: null,
  onShowForestReport: () => {},
} satisfies Omit<AutoSupportSettingsBodyProps, 'tab' | 'draft'>;

const FOREST_REPORT = {
  hostCount: 56,
  leafCount: 70,
  branchCount: 12,
  trees: [{}, {}],
} as unknown as ForestReport;

function renderBody(tab: AutoSupportTabKey, diagnostics: { sizingDebug?: SizingDebugInfo } = {}): string {
  // `createElement` rather than JSX so this stays a `.ts` file, which is the
  // glob the supports suite is run with.
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { i18n },
      React.createElement(AutoSupportSettingsBody, {
        ...BODY_PROPS,
        tab,
        draft: getSettings().autoSupport,
        sizingDebug: diagnostics.sizingDebug ?? null,
        forestReport: tab === 'debug' ? FOREST_REPORT : null,
      }),
    ),
  );
  // Static markup escapes text ("Density &amp; Sizing"); the assertions read labels.
  return markup.replace(/&amp;/g, '&');
}

test('the settings body renders every tab, and no debug control in a normal tab', () => {
  const detection = renderBody('detection');

  for (const entry of autoSupportTabs) {
    const label = String(entry.label.message);
    assert.ok(detection.includes(label), `tab row is missing "${label}"`);
  }

  for (const tab of NORMAL_TAB_KEYS) {
    const markup = renderBody(tab, { sizingDebug: SIZING_DEBUG });
    for (const marker of DEBUG_ONLY_MARKERS) {
      assert.ok(
        !markup.includes(marker),
        `"${marker}" renders in the ${tab} tab, which is not the Debug & Advanced tab`,
      );
    }
  }

  // The Presets tab is a tab of its own, and never carries the debug surface.
  const presetsTab = renderBody('presets', { sizingDebug: SIZING_DEBUG });
  for (const marker of DEBUG_ONLY_MARKERS) {
    assert.ok(!presetsTab.includes(marker), `"${marker}" renders in the Presets tab`);
  }

  // Every debug control — including the diagnostics — is in Debug & Advanced.
  const debugTab = renderBody('debug', { sizingDebug: SIZING_DEBUG });
  assert.ok(debugTab.includes('Origin Colors'));
  assert.ok(debugTab.includes('No Brace'));
  assert.ok(debugTab.includes('Simplified'));
  assert.ok(debugTab.includes('Sizing Debug'));
  assert.ok(debugTab.includes('Forest Report'));
  assert.ok(debugTab.includes('56H 70L 12B'));
  assert.ok(debugTab.includes('Model-Scale Sizing'));
  assert.ok(debugTab.includes('Advanced (calibration)'));
  assert.ok(debugTab.includes('Tip Fit Margin'));
  assert.ok(debugTab.includes('measured'));
  assert.ok(debugTab.includes('Reset to measured defaults'));
  // The calibration warning states what breaks, not just that something might.
  assert.ok(debugTab.includes('Calibration, not preferences.'));
});

test('the Presets tab lists the built-ins first and offers the whole preset lifecycle', () => {
  const markup = renderBody('presets');

  const builtIns = getAutoSupportPresets().filter((preset) => preset.isBuiltIn);
  assert.deepEqual(builtIns.map((preset) => preset.id), ['light', 'medium', 'heavy']);
  for (const preset of builtIns) {
    assert.ok(markup.includes(preset.name), `preset list is missing the built-in "${preset.name}"`);
  }
  // Built-ins first: the list renders before the "New" control that follows it.
  assert.ok(markup.indexOf('Light') < markup.indexOf('New'));

  for (const action of ['New', 'Save', 'Revert', 'Rename', 'Duplicate', 'Delete', 'Restore factory presets', 'Export', 'Import']) {
    assert.ok(markup.includes(action), `preset tab is missing the "${action}" action`);
  }
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
