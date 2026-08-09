"use client";

import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Check, ChevronLeft, Moon, Printer, Sun, Wrench } from 'lucide-react';
import {
  applyThemeCustomColors,
  applyThemePreference,
  getSavedThemePreference,
  getThemeProfile,
  THEME_COLORS_STORAGE_KEY,
  THEME_PRESET_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '@/components/settings/themeCustomizations';
import type { ThemePreference } from '@/components/settings/themeCustomizations';

type FirstRunOnboardingProps = {
  /** Whether a printer profile is currently active (drives the printer step auto-advance). */
  hasActivePrinter: boolean;
  /** Opens the existing printer-library modal (deep-linked to the preset picker). */
  onAddPrinter: () => void;
  /** Dismisses the empty-state "Get Started" nudge for this session (no printer). */
  onUseWithoutPrinter: () => void;
  /** The wizard was completed; the caller persists the one-time flag. */
  onCompleted: () => void;
};

const STEPS = ['welcome', 'theme', 'printer', 'done'] as const;
type WizardStep = (typeof STEPS)[number];

// Applies a built-in theme exactly like SettingsModal's apply path: writes the
// preference + preset + colors keys and live-applies the CSS variables.
function applyBuiltInThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  const preset = preference === 'light' ? 'dragonfruit-light' : 'dragonfruit-dark';
  const colors = getThemeProfile(preset).colors;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
  window.localStorage.setItem(THEME_COLORS_STORAGE_KEY, JSON.stringify(colors));
  applyThemePreference(preference);
  applyThemeCustomColors(colors);
}

export function FirstRunOnboarding({
  hasActivePrinter,
  onAddPrinter,
  onUseWithoutPrinter,
  onCompleted,
}: FirstRunOnboardingProps) {
  const { _ } = useLingui();
  const [step, setStep] = React.useState<WizardStep>('welcome');
  const [direction, setDirection] = React.useState<'forward' | 'backward'>('forward');
  const [themePreference, setThemePreference] = React.useState<ThemePreference>(() => getSavedThemePreference());

  const stepIndex = STEPS.indexOf(step);

  const goToStep = React.useCallback((next: WizardStep, dir: 'forward' | 'backward') => {
    setDirection(dir);
    setStep(next);
  }, []);

  // Once a printer is added during the printer step, move on to the wrap-up.
  React.useEffect(() => {
    if (step === 'printer' && hasActivePrinter) {
      goToStep('done', 'forward');
    }
  }, [step, hasActivePrinter, goToStep]);

  const handleThemeSelect = React.useCallback((preference: ThemePreference) => {
    applyBuiltInThemePreference(preference);
    setThemePreference(preference);
  }, []);

  const handleUseWithoutPrinter = React.useCallback(() => {
    onUseWithoutPrinter();
    onCompleted();
  }, [onUseWithoutPrinter, onCompleted]);

  return (
    <div
      className="ui-onboarding-backdrop fixed inset-0 z-40 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--accent), var(--background) 90%) 0%, ' +
          'color-mix(in srgb, var(--accent-secondary), var(--background) 93%) 58%, var(--background) 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={_(msg`DragonFruit first-time setup`)}
    >
      {/* Faded, blurred brand icon as a backdrop watermark. */}
      <img
        src="/dragonfruit_assets/branding/simple_icon.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          height: 'min(110vh, 110vw)',
          width: 'min(110vh, 110vw)',
          objectFit: 'contain',
          opacity: 0.07,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative flex h-full w-full items-center justify-center p-6">
        <div
          className="ui-onboarding-panel flex max-h-[92vh] min-h-[440px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
          style={{ background: 'var(--surface-0)', borderColor: 'var(--border-strong)' }}
        >
          {/* Step progress */}
          <div className="shrink-0 px-6 pt-5">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{
                    background: i <= stepIndex
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--surface-2), var(--border-subtle) 45%)',
                  }}
                />
              ))}
            </div>
          </div>

          <div key={step} className={`ui-onboarding-step-${direction} flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6`}>
            {step === 'welcome' && (
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 flex-col items-center justify-start text-center">
                  <img
                    src="/dragonfruit_assets/branding/text_logo.svg"
                    alt="DragonFruit"
                    className="h-11 w-auto object-contain"
                    draggable={false}
                  />
                  <h2 className="mt-6 text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
                    {_(msg`Welcome!`)}
                  </h2>
                  <p className="mt-6 max-w-[540px] text-base leading-relaxed text-pretty" style={{ color: 'var(--text-muted)' }}>
                    {_(msg`DragonFruit is a free, open-source slicer for resin 3D printing. Load a model, orient it, add supports, and slice it for your printer.`)}
                  </p>
                  <p className="mt-10 max-w-[540px] text-base leading-relaxed text-pretty" style={{ color: 'var(--text-muted)' }}>
                    {_(msg`From the community, for the community. Free to use, open to contribute, and shaped by the people who print with it.`)}
                  </p>
                </div>
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => goToStep('theme', 'forward')}
                    className="ui-button ui-button-primary !h-10 !px-7 text-[15px]"
                  >
                    {_(msg`Get Started`)}
                  </button>
                </div>
              </div>
            )}

            {step === 'theme' && (
              <div className="flex flex-1 flex-col">
                <div className="my-auto w-full">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
                    {_(msg`Choose your theme`)}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {_(msg`Pick what fits your workspace. You can change it anytime in Settings.`)}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleThemeSelect('dark')}
                      className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
                      style={{
                        borderColor: themePreference === 'dark' ? 'var(--accent)' : 'var(--border-subtle)',
                        background: themePreference === 'dark'
                          ? 'color-mix(in srgb, var(--accent), var(--surface-1) 95%)'
                          : 'var(--surface-1)',
                      }}
                    >
                      <span
                        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}
                      >
                        <Moon className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                            {_(msg`Dark`)}
                          </span>
                          {themePreference === 'dark' && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {_(msg`Low-glare surfaces for late-night printing.`)}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleThemeSelect('light')}
                      className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
                      style={{
                        borderColor: themePreference === 'light' ? 'var(--accent)' : 'var(--border-subtle)',
                        background: themePreference === 'light'
                          ? 'color-mix(in srgb, var(--accent), var(--surface-1) 95%)'
                          : 'var(--surface-1)',
                      }}
                    >
                      <span
                        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}
                      >
                        <Sun className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                            {_(msg`Light`)}
                          </span>
                          {themePreference === 'light' && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {_(msg`Bright surfaces for well-lit workspaces.`)}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goToStep('welcome', 'backward')}
                    className="ui-button ui-button-secondary !h-9 !px-3.5 text-sm"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {_(msg`Back`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStep('printer', 'forward')}
                    className="ui-button ui-button-primary !h-9 !px-5 text-sm"
                  >
                    {_(msg`Continue`)}
                  </button>
                </div>
              </div>
            )}

            {step === 'printer' && (
              <div className="flex flex-1 flex-col">
                <div className="my-auto w-full">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
                    {_(msg`Set up your printer`)}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {_(msg`Add the printer you'll be printing on so DragonFruit knows your build volume and defaults. You can add more later.`)}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={onAddPrinter}
                      className="rounded-md border px-3 py-3 text-left transition-colors"
                      style={{
                        background: 'var(--primary-button-surface)',
                        borderColor: 'color-mix(in srgb, var(--primary-button-surface), white 16%)',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      <div className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold">
                        <Printer className="h-4 w-4" />
                        <span>{_(msg`Add a printer`)}</span>
                      </div>
                      <div className="text-[11px]" style={{ color: 'color-mix(in srgb, var(--accent-contrast), black 18%)' }}>
                        {_(msg`Browse the library and pick your model.`)}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleUseWithoutPrinter}
                      className="rounded-md border px-3 py-3 text-left transition-colors"
                      style={{
                        background: 'var(--secondary-button-surface)',
                        borderColor: 'color-mix(in srgb, var(--secondary-button-surface), white 16%)',
                        color: 'var(--accent-secondary-contrast)',
                      }}
                    >
                      <div className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold">
                        <Wrench className="h-4 w-4" />
                        <span>{_(msg`Use without a printer`)}</span>
                      </div>
                      <div className="text-[11px]" style={{ color: 'color-mix(in srgb, var(--accent-secondary-contrast), black 20%)' }}>
                        {_(msg`Start preparing now. Add a printer anytime from the top bar.`)}
                      </div>
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => goToStep('theme', 'backward')}
                    className="ui-button ui-button-secondary !h-9 !px-3.5 text-sm"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {_(msg`Back`)}
                  </button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <span
                  className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border"
                  style={{
                    background: 'color-mix(in srgb, var(--accent-secondary), var(--surface-1) 90%)',
                    borderColor: 'color-mix(in srgb, var(--accent-secondary), var(--border-subtle) 50%)',
                  }}
                >
                  <Check className="h-5 w-5" style={{ color: 'var(--accent-secondary)' }} />
                </span>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-strong)' }}>
                  {_(msg`You're all set`)}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {hasActivePrinter
                    ? _(msg`Your printer is ready. Drag a model in to start preparing your first print.`)
                    : _(msg`You can add or switch printers anytime from the top bar.`)}
                </p>

                {hasActivePrinter ? (
                  <button
                    type="button"
                    onClick={onCompleted}
                    className="ui-button ui-button-primary mt-8 !h-9 !px-6 text-sm"
                  >
                    {_(msg`Start using DragonFruit`)}
                  </button>
                ) : (
                  <div className="mt-8 grid w-full max-w-sm gap-2.5">
                    <button
                      type="button"
                      onClick={handleUseWithoutPrinter}
                      className="ui-button ui-button-primary !h-9 !px-5 text-sm"
                    >
                      {_(msg`Start without a printer`)}
                    </button>
                    <button
                      type="button"
                      onClick={onAddPrinter}
                      className="ui-button ui-button-secondary !h-9 !px-5 text-sm"
                    >
                      {_(msg`Add a printer`)}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
