/**
 * The Auto Support settings panel, read as questions rather than as pipeline
 * phases.
 *
 * Every control lives in exactly one tab, and the tab is the question the user
 * is asking when they reach for it — what counts as a surface that needs
 * support, how supports scatter, how dense and thick they are, whether the part
 * stays put, what runs afterwards, which saved policy to use, or debugging.
 *
 * This module is the single place that mapping is written down: the panel body
 * renders from these tables and `docs/dev/auto-supports.md` documents them, so
 * a control moved between tabs is one edit here instead of a hunt through JSX.
 *
 * Message descriptors are module scope on purpose: React Compiler renames
 * locals inside components before the Lingui macro derives a message id.
 */
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { CSSProperties } from 'react';
import {
  AUTO_SUPPORT_CONSTRAINTS,
  createDefaultAutoSupportSettings,
  type AutoSupportSettings,
  type NumericAutoSupportSettingKey,
} from '@/supports/autoSupport/settings';

/** The panel's inset card, shared by the floating panel and the settings body. */
export const AUTO_SUPPORT_SECTION_CARD: CSSProperties = {
  borderColor: 'var(--border-subtle)',
  background: 'var(--surface-1)',
};

/** Shown on the settings dialog's tab row. `presets` and `debug` are the last two. */
export type AutoSupportTabKey =
  | 'detection'
  | 'distribution'
  | 'density'
  | 'stability'
  | 'postProcessing'
  | 'presets'
  | 'debug';

/** The tabs that hold settings, in row order. */
export const AUTO_SUPPORT_TABS: ReadonlyArray<{
  key: AutoSupportTabKey;
  label: MessageDescriptor;
  hint: MessageDescriptor;
}> = [
  {
    key: 'detection',
    label: msg`Detection`,
    hint: msg`What counts as a support-needing surface, and how tightly neighbouring detections merge`,
  },
  {
    key: 'distribution',
    label: msg`Distribution`,
    hint: msg`How a region's contacts scatter across it, and how far leaves fan out from a trunk`,
  },
  {
    key: 'density',
    label: msg`Density & Sizing`,
    hint: msg`How dense and how thick the supports are`,
  },
  {
    key: 'stability',
    label: msg`Stability`,
    hint: msg`How the part is held against toppling and peel — self-support angle, stabilization anchors and minima reinforcement`,
  },
  {
    key: 'postProcessing',
    label: msg`Post-processing`,
    hint: msg`Passes that run after placement — how much one trunk may carry, and the coverage the gap-filler must reach`,
  },
  {
    key: 'presets',
    label: msg`Presets`,
    hint: msg`Saved auto-support policies: pick one, tweak and save it, or share it as a file`,
  },
  {
    key: 'debug',
    label: msg`Debug & Advanced`,
    hint: msg`Debug switches, run diagnostics, and the measured calibration constants behind sizing`,
  },
];

export type KnobDef = {
  key: NumericAutoSupportSettingKey;
  /** Which tab answers the question this knob belongs to. */
  tab: AutoSupportTabKey;
  label: MessageDescriptor;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: MessageDescriptor;
  /** Advanced group only: the measured value the engine was tuned with. */
  measuredDefault?: number;
};

export type ToggleDef = {
  key: BooleanAutoSupportSettingKey;
  tab: AutoSupportTabKey;
  label: MessageDescriptor;
  hint: MessageDescriptor;
};

/** The `autoSupport` block's boolean keys the panel exposes. */
export type BooleanAutoSupportSettingKey =
  | 'enabled'
  | 'prioritizeIntersection'
  | 'stabilizationEnabled'
  | 'minimaReinforcementEnabled'
  | 'debugSupportOriginColors'
  | 'debugSkipAutoBracing'
  | 'modelScaleEnabled';

/** The numeric half of the six Advanced calibration keys. */
export const ADVANCED_CALIBRATION_NUMERIC_KEYS = [
  'tipContactMarginScale',
  'memberHostShaftRatio',
  'modelSizeFactorCap',
  'modelLoadFactorCap',
  'heightFactorCap',
] as const satisfies readonly NumericAutoSupportSettingKey[];

const KNOBS: readonly KnobDef[] = [
  // Detection — what needs support.
  { key: 'minIslandAreaMm2', tab: 'detection', label: msg`Min Island Size`, min: 0.01, max: 2, step: 0.01, unit: 'mm²', hint: msg`Skip detected areas smaller than this — tiny specks rarely need supports` },
  { key: 'tipInfluenceRadiusMm', tab: 'detection', label: msg`Merge Radius`, min: 0.1, max: 10, step: 0.1, unit: 'mm', hint: msg`A candidate within this 3D distance of an existing support merges into it instead of starting a new trunk` },
  // Distribution — where contacts land and how members fan out.
  { key: 'leafFanRadiusMm', tab: 'distribution', label: msg`Fan Reach`, min: 2, max: 15, step: 0.5, unit: 'mm', hint: msg`Max horizontal distance a fan-out leaf may span from a trunk shaft` },
  { key: 'leafFanMaxAngleDeg', tab: 'distribution', label: msg`Fan Angle`, min: 20, max: 80, step: 5, unit: '°', hint: msg`Max angle from vertical for fan-out leaves` },
  // Density & Sizing — how many and how thick.
  { key: 'areaPerSupportMm2', tab: 'density', label: msg`Support Density`, min: 1, max: 30, step: 0.5, unit: 'mm²', hint: msg`Projected area each support carries — smaller = more, tighter supports (grid spacing ≈ √value)` },
  { key: 'sizeScale', tab: 'density', label: msg`Support Size`, min: 0.5, max: 2, step: 0.05, unit: '×', hint: msg`Master multiplier over the preset sizing bands — thicker or thinner everywhere` },
  { key: 'gridAreaThresholdMm2', tab: 'density', label: msg`Grid Threshold`, min: 5, max: 200, step: 5, unit: 'mm²', hint: msg`Flat regions at/above this area get a full grid; smaller regions get a single support` },
  { key: 'flatDensityBoost', tab: 'density', label: msg`Flat Boost`, min: 0.5, max: 1, step: 0.05, unit: '×', hint: msg`Grid spacing on flat ceilings — lower = denser supports on anchor surfaces (0.7 = ~2× the supports)` },
  { key: 'slopeRelaxFactor', tab: 'density', label: msg`Slope Relax`, min: 1, max: 2, step: 0.1, unit: '×', hint: msg`Grid spacing on slopes at the self-support angle — higher = sparser` },
  { key: 'suctionAreaExponent', tab: 'density', label: msg`Suction Scale`, min: 0, max: 0.4, step: 0.05, unit: '', hint: msg`How strongly flat density grows with region area — large shallow ceilings carry more peel. 0 = off` },
  // Stability — will it stay put, and stay straight.
  { key: 'overhangSelfSupportAngleDeg', tab: 'stability', label: msg`Self-Support Angle`, min: 20, max: 75, step: 5, unit: '°', hint: msg`Surfaces flatter than this angle get supports (resin standard: 45°). Higher = fewer, mostly on the steepest parts.` },
  // Post-processing — the passes after placement.
  { key: 'maxAttachmentsPerTrunk', tab: 'postProcessing', label: msg`Branches per Column`, min: 2, max: 50, step: 1, unit: '', hint: msg`Max branches + leaves one trunk may carry before new trunks are started — the cap on chunk consolidation` },
  { key: 'coverageTargetPercent', tab: 'postProcessing', label: msg`Coverage Target`, min: 75, max: 100, step: 5, unit: '%', hint: msg`How much of each region's footprint the grid must cover before gap-filling stops` },
];

/**
 * The Advanced (calibration) sliders. Bounds and the measured default both come
 * from `AUTO_SUPPORT_CONSTRAINTS`, so the number the engine was tuned with and
 * the number the Reset button restores cannot drift apart.
 */
const CALIBRATION_KNOB_SOURCE: ReadonlyArray<{
  key: NumericAutoSupportSettingKey;
  label: MessageDescriptor;
  hint: MessageDescriptor;
}> = [
  { key: 'tipContactMarginScale', label: msg`Tip Fit Margin`, hint: msg`How much of the free width a contact tip may occupy. Measured 0.9 keeps the disc just inside the feature it lands on; lower values shrink every tip on a feature narrower than the band tip.` },
  { key: 'memberHostShaftRatio', label: msg`Member / Host Ratio`, hint: msg`Least diameter a branch or leaf takes as a fraction of the trunk it grows from. Measured 0.7 keeps a hosted member a step below its host instead of a needle beside it.` },
  { key: 'modelSizeFactorCap', label: msg`Model Size Cap`, hint: msg`Ceiling of the size factor derived from the model's bounding-box diagonal. Measured 1.45 bounds how much a large part's shafts thicken.` },
  { key: 'modelLoadFactorCap', label: msg`Model Load Cap`, hint: msg`Ceiling of the load factor derived from resin mass per support. Measured 1.3 bounds how much a heavy part's shafts thicken.` },
  { key: 'heightFactorCap', label: msg`Height Factor Cap`, hint: msg`Ceiling of the height factor for a tall column, whose buckling load falls with height. Measured 1.35 bounds how much a tall support thickens.` },
];

export const ADVANCED_CALIBRATION_KNOBS: readonly KnobDef[] = CALIBRATION_KNOB_SOURCE.map((knob) => {
  const constraint = AUTO_SUPPORT_CONSTRAINTS[knob.key];
  return {
    ...knob,
    tab: 'debug' as const,
    min: constraint.min,
    max: constraint.max,
    step: constraint.step,
    unit: '',
    measuredDefault: constraint.defaultValue,
  };
});

const TOGGLES: readonly ToggleDef[] = [
  { key: 'enabled', tab: 'detection', label: msg`Enabled`, hint: msg`Generate supports automatically on scan` },
  { key: 'prioritizeIntersection', tab: 'detection', label: msg`Prioritize Dual`, hint: msg`Islands found by BOTH the slice and mesh scans are placed first (they are the most certain)` },
  { key: 'stabilizationEnabled', tab: 'stability', label: msg`Stabilization Anchors`, hint: msg`Add contacts along the edge or corner a pose bears on, so a leaning part is held against toppling and peel (default on)` },
  { key: 'minimaReinforcementEnabled', tab: 'stability', label: msg`Minima Reinforcement`, hint: msg`Ring each mesh minima with contacts on its own flank, so a section starts on a base instead of a needle (default on)` },
  { key: 'debugSupportOriginColors', tab: 'debug', label: msg`Origin Colors`, hint: msg`Debug: color supports by origin — stump (red), overhang (orange), island (blue), standalone (purple), reinforcement (teal)` },
  { key: 'debugSkipAutoBracing', tab: 'debug', label: msg`No Brace`, hint: msg`Debug: skip automatic bracing for this run` },
];

/**
 * The sixth calibration key, and the only boolean one: it belongs in the
 * Advanced group beside the five caps it switches off, not with the debug
 * toggles or the ordinary preferences.
 */
export const ADVANCED_CALIBRATION_TOGGLE: ToggleDef = {
  key: 'modelScaleEnabled',
  tab: 'debug',
  label: msg`Model-Scale Sizing`,
  hint: msg`Master switch for the run-level size, load and height factors. Off pins all three to ×1, so sizing is the active band plus the local terms alone (measured default: on).`,
};

/** The six calibration keys as `AUTO_SUPPORT_CONSTRAINTS` defaults, plus the boolean master switch. */
export function measuredCalibrationDefaults(): Partial<AutoSupportSettings> {
  const advanced = Object.fromEntries(
    ADVANCED_CALIBRATION_NUMERIC_KEYS.map((key) => [key, AUTO_SUPPORT_CONSTRAINTS[key].defaultValue]),
  ) as Record<(typeof ADVANCED_CALIBRATION_NUMERIC_KEYS)[number], number>;

  return {
    ...advanced,
    modelScaleEnabled: createDefaultAutoSupportSettings().modelScaleEnabled,
  };
}

/** The controls of one tab, in table order, with every tab key present. */
function groupByTab<T extends { tab: AutoSupportTabKey }>(items: readonly T[]): Record<AutoSupportTabKey, T[]> {
  const grouped = Object.fromEntries(
    AUTO_SUPPORT_TABS.map((tab) => [tab.key, [] as T[]]),
  ) as Record<AutoSupportTabKey, T[]>;
  for (const item of items) grouped[item.tab].push(item);
  return grouped;
}

export const KNOBS_BY_TAB = groupByTab(KNOBS);
export const TOGGLES_BY_TAB = groupByTab(TOGGLES);

/**
 * The visible warning over the Advanced calibration group. It says what breaks,
 * not just that something might: an edited constant is exactly the state a
 * sizing complaint arrives in, and it has to be readable as such.
 */
export const ADVANCED_CALIBRATION_WARNING = msg`Calibration, not preferences. These six values were measured against the printed result, and they back the fit guarantee: a tip fits the feature it lands on, a hosted member is not a needle beside its host, and run-level factors only thicken (never thin) a support below its band. Change one and that guarantee no longer holds — reset them to the measured defaults before reporting a sizing problem.`;

/** Tooltips for the tier row, by built-in id (the built-ins the store ships). */
export const TIER_HINTS: Record<string, MessageDescriptor> = {
  light: msg`Sparse supports — the detail sizing band`,
  medium: msg`Balanced supports — the structure sizing band`,
  heavy: msg`Dense supports — the anchor sizing band`,
};
