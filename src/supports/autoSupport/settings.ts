export interface AutoSupportSettings {
    enabled: boolean;
    minIslandAreaMm2: number;
    tipInfluenceRadiusMm: number;
    prioritizeIntersection: boolean;
    /** Max combined leaves + branches that can attach to a single trunk. */
    maxAttachmentsPerTrunk: number;
    /** Projected surface area each grid support carries (mm²) — the density knob.
     *  Grid spacing = √areaPerSupportMm2. */
    areaPerSupportMm2: number;
    /** Overhang regions at or above this projected area (mm²) get a density
     *  grid; smaller regions get a single support. */
    gridAreaThresholdMm2: number;
    /** Surface angle from horizontal (deg) at and below which a face counts
     *  as an overhang needing supports. 0° = flat ceiling; the resin standard
     *  is 45°. Steeper faces are considered self-supporting. */
    overhangSelfSupportAngleDeg: number;
    /** Master multiplier over the preset sizing bands (shaft/tip/root). */
    sizeScale: number;
    /** Grid spacing multiplier on flat ceilings (0°) — the densest case.
     *  <1 = denser than the area setting implies. */
    flatDensityBoost: number;
    /** Grid spacing multiplier at the self-support angle — the sparsest case.
     *  >1 = sparser than the area setting implies. */
    slopeRelaxFactor: number;
    /** Z-band (mm) above each anchor cluster's lowest overhang region. Regions
     *  within the band (per contact patch, see anchorBands.ts) get the anchor
     *  spacing factor — the first-printed underside of a fully-supported print.
     *  0 disables anchor densification. */
    anchorBandHeightMm: number;
    /** Spacing multiplier inside an anchor band (lower = denser). Empirical —
     *  calibrated to commercial heavy presets (≈1.4 mm spacing on flats with
     *  defaults), no load model. */
    anchorSpacingFactor: number;
    /** Area-scaling exponent for flat-region density: spacing ∝ (threshold/area)^exp
     *  on the flat end. Higher = denser on large shallow ceilings (peel force
     *  grows with cross-section — direction physical, values calibration).
     *  0 disables area scaling. */
    suctionAreaExponent: number;
    /** Distribution strategy: 'auto' = per-region shape dispatch (planar →
     *  dynamic grid, organic/curved → Poisson disk, by flatness threshold),
     *  density still governed by the anchor band; 'grid' / 'poisson' force
     *  one distribution for all regions. */
    distributionMode: 'auto' | 'grid' | 'poisson';
    /** Local surface-angle spread (std, degrees) above which a region counts
     *  as organic → Poisson disk in 'auto' mode. Lower = more regions Poisson. */
    poissonFlatnessThresholdDeg: number;
    /** Poisson perimeter spacing multiplier (< 1 = tighter ring than the
     *  interior). The boundary of an anchor region engages peel first, so its
     *  perimeter is deliberately denser than its infill. */
    anchorPerimeterFactor: number;
    /** Poisson-disk interior spacing multiplier. Organic regions carry the
     *  slope-relax angle term (up to slopeRelaxFactor) on top of the shared
     *  region spacing, so they read looser than the flat grid; this knob
     *  re-tightens the disk independently of the grid. < 1 = denser. */
    poissonSpacingFactor: number;
    /** Percentage of each region's projected footprint the auto grid must
     *  cover before gap-fill stops (75–100). */
    coverageTargetPercent: number;
    /** Leaf fanning: max horizontal reach from a trunk shaft (mm). */
    leafFanRadiusMm: number;
    /** Leaf fanning: max angle from vertical for a fan leaf (deg). */
    leafFanMaxAngleDeg: number;
    /** Debug: color supports by placement origin (anchor/overhang/island/
     *  standalone) in the scene instead of the model color. */
    debugSupportOriginColors: boolean;
    debugSkipAutoBracing: boolean;
}

type NumericConstraint = {
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    integer?: boolean;
};

type NumericAutoSupportSettingKey =
    | 'minIslandAreaMm2'
    | 'tipInfluenceRadiusMm'
    | 'maxAttachmentsPerTrunk'
    | 'areaPerSupportMm2'
    | 'gridAreaThresholdMm2'
    | 'overhangSelfSupportAngleDeg'
    | 'sizeScale'
    | 'flatDensityBoost'
    | 'slopeRelaxFactor'
    | 'anchorBandHeightMm'
    | 'anchorSpacingFactor'
    | 'suctionAreaExponent'
    | 'anchorPerimeterFactor'
    | 'poissonFlatnessThresholdDeg'
    | 'poissonSpacingFactor'
    | 'coverageTargetPercent'
    | 'leafFanRadiusMm'
    | 'leafFanMaxAngleDeg';

export const AUTO_SUPPORT_CONSTRAINTS = {
    minIslandAreaMm2: { min: 0.01, max: 10, step: 0.01, defaultValue: 0.02 },
    tipInfluenceRadiusMm: { min: 0.1, max: 10, step: 0.1, defaultValue: 0.5 },
    maxAttachmentsPerTrunk: { min: 2, max: 50, step: 1, defaultValue: 12, integer: true },
    areaPerSupportMm2: { min: 1, max: 30, step: 0.5, defaultValue: 10 },
    gridAreaThresholdMm2: { min: 5, max: 200, step: 5, defaultValue: 25 },
    overhangSelfSupportAngleDeg: { min: 20, max: 75, step: 5, defaultValue: 45 },
    sizeScale: { min: 0.5, max: 2, step: 0.05, defaultValue: 1 },
    flatDensityBoost: { min: 0.5, max: 1, step: 0.05, defaultValue: 0.7 },
    slopeRelaxFactor: { min: 1, max: 2, step: 0.1, defaultValue: 1.3 },
    anchorBandHeightMm: { min: 0, max: 20, step: 1, defaultValue: 5, integer: true },
    anchorSpacingFactor: { min: 0.4, max: 1, step: 0.05, defaultValue: 0.7 },
    suctionAreaExponent: { min: 0, max: 0.4, step: 0.05, defaultValue: 0.15 },
    anchorPerimeterFactor: { min: 0.6, max: 1, step: 0.05, defaultValue: 0.8 },
    poissonFlatnessThresholdDeg: { min: 5, max: 30, step: 1, defaultValue: 12, integer: true },
    poissonSpacingFactor: { min: 0.5, max: 1.5, step: 0.05, defaultValue: 0.85 },
    coverageTargetPercent: { min: 75, max: 100, step: 5, defaultValue: 95, integer: true },
    leafFanRadiusMm: { min: 2, max: 15, step: 0.5, defaultValue: 5 },
    leafFanMaxAngleDeg: { min: 20, max: 80, step: 5, defaultValue: 60, integer: true },
} satisfies Record<NumericAutoSupportSettingKey, NumericConstraint>;

function precisionFromStep(step: number): number {
    const text = String(step);
    const parts = text.split('.');
    return parts[1] ? parts[1].length : 0;
}

function clampNumeric(value: unknown, constraint: NumericConstraint): number {
    const raw = typeof value === 'number' && Number.isFinite(value)
        ? value
        : constraint.defaultValue;

    const clamped = Math.min(constraint.max, Math.max(constraint.min, raw));

    if (constraint.integer) {
        return Math.round(clamped);
    }

    const stepsFromMin = Math.round((clamped - constraint.min) / constraint.step);
    const stepped = constraint.min + stepsFromMin * constraint.step;
    const precision = Math.max(0, precisionFromStep(constraint.step));
    const rounded = Number(stepped.toFixed(precision));

    return Math.min(constraint.max, Math.max(constraint.min, rounded));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

export function createDefaultAutoSupportSettings(): AutoSupportSettings {
    return {
        enabled: true,
        minIslandAreaMm2: AUTO_SUPPORT_CONSTRAINTS.minIslandAreaMm2.defaultValue,
        tipInfluenceRadiusMm: AUTO_SUPPORT_CONSTRAINTS.tipInfluenceRadiusMm.defaultValue,
        prioritizeIntersection: false,
        maxAttachmentsPerTrunk: AUTO_SUPPORT_CONSTRAINTS.maxAttachmentsPerTrunk.defaultValue,
        areaPerSupportMm2: AUTO_SUPPORT_CONSTRAINTS.areaPerSupportMm2.defaultValue,
        gridAreaThresholdMm2: AUTO_SUPPORT_CONSTRAINTS.gridAreaThresholdMm2.defaultValue,
        overhangSelfSupportAngleDeg: AUTO_SUPPORT_CONSTRAINTS.overhangSelfSupportAngleDeg.defaultValue,
        sizeScale: AUTO_SUPPORT_CONSTRAINTS.sizeScale.defaultValue,
        flatDensityBoost: AUTO_SUPPORT_CONSTRAINTS.flatDensityBoost.defaultValue,
        slopeRelaxFactor: AUTO_SUPPORT_CONSTRAINTS.slopeRelaxFactor.defaultValue,
        anchorBandHeightMm: AUTO_SUPPORT_CONSTRAINTS.anchorBandHeightMm.defaultValue,
        anchorSpacingFactor: AUTO_SUPPORT_CONSTRAINTS.anchorSpacingFactor.defaultValue,
        suctionAreaExponent: AUTO_SUPPORT_CONSTRAINTS.suctionAreaExponent.defaultValue,
        distributionMode: 'auto',
        anchorPerimeterFactor: AUTO_SUPPORT_CONSTRAINTS.anchorPerimeterFactor.defaultValue,
        poissonFlatnessThresholdDeg: AUTO_SUPPORT_CONSTRAINTS.poissonFlatnessThresholdDeg.defaultValue,
        poissonSpacingFactor: AUTO_SUPPORT_CONSTRAINTS.poissonSpacingFactor.defaultValue,
        coverageTargetPercent: AUTO_SUPPORT_CONSTRAINTS.coverageTargetPercent.defaultValue,
        leafFanRadiusMm: AUTO_SUPPORT_CONSTRAINTS.leafFanRadiusMm.defaultValue,
        leafFanMaxAngleDeg: AUTO_SUPPORT_CONSTRAINTS.leafFanMaxAngleDeg.defaultValue,
        debugSupportOriginColors: false,
        debugSkipAutoBracing: false,
    };
}

export function normalizeAutoSupportSettings(input?: Partial<AutoSupportSettings> | null): AutoSupportSettings {
    const defaults = createDefaultAutoSupportSettings();
    const source = input ?? defaults;

    return {
        enabled: normalizeBoolean(source.enabled, defaults.enabled),
        minIslandAreaMm2: clampNumeric(source.minIslandAreaMm2, AUTO_SUPPORT_CONSTRAINTS.minIslandAreaMm2),
        tipInfluenceRadiusMm: clampNumeric(source.tipInfluenceRadiusMm, AUTO_SUPPORT_CONSTRAINTS.tipInfluenceRadiusMm),
        prioritizeIntersection: normalizeBoolean(source.prioritizeIntersection, defaults.prioritizeIntersection),
        maxAttachmentsPerTrunk: clampNumeric(source.maxAttachmentsPerTrunk, AUTO_SUPPORT_CONSTRAINTS.maxAttachmentsPerTrunk),
        areaPerSupportMm2: clampNumeric(source.areaPerSupportMm2, AUTO_SUPPORT_CONSTRAINTS.areaPerSupportMm2),
        gridAreaThresholdMm2: clampNumeric(source.gridAreaThresholdMm2, AUTO_SUPPORT_CONSTRAINTS.gridAreaThresholdMm2),
        overhangSelfSupportAngleDeg: clampNumeric(source.overhangSelfSupportAngleDeg, AUTO_SUPPORT_CONSTRAINTS.overhangSelfSupportAngleDeg),
        sizeScale: clampNumeric(source.sizeScale, AUTO_SUPPORT_CONSTRAINTS.sizeScale),
        flatDensityBoost: clampNumeric(source.flatDensityBoost, AUTO_SUPPORT_CONSTRAINTS.flatDensityBoost),
        slopeRelaxFactor: clampNumeric(source.slopeRelaxFactor, AUTO_SUPPORT_CONSTRAINTS.slopeRelaxFactor),
        anchorBandHeightMm: clampNumeric(source.anchorBandHeightMm, AUTO_SUPPORT_CONSTRAINTS.anchorBandHeightMm),
        anchorSpacingFactor: clampNumeric(source.anchorSpacingFactor, AUTO_SUPPORT_CONSTRAINTS.anchorSpacingFactor),
        suctionAreaExponent: clampNumeric(source.suctionAreaExponent, AUTO_SUPPORT_CONSTRAINTS.suctionAreaExponent),
        distributionMode: source.distributionMode === 'grid' || source.distributionMode === 'poisson'
            ? source.distributionMode
            : defaults.distributionMode,
        anchorPerimeterFactor: clampNumeric(source.anchorPerimeterFactor, AUTO_SUPPORT_CONSTRAINTS.anchorPerimeterFactor),
        poissonFlatnessThresholdDeg: clampNumeric(source.poissonFlatnessThresholdDeg, AUTO_SUPPORT_CONSTRAINTS.poissonFlatnessThresholdDeg),
        poissonSpacingFactor: clampNumeric(source.poissonSpacingFactor, AUTO_SUPPORT_CONSTRAINTS.poissonSpacingFactor),
        coverageTargetPercent: clampNumeric(source.coverageTargetPercent, AUTO_SUPPORT_CONSTRAINTS.coverageTargetPercent),
        leafFanRadiusMm: clampNumeric(source.leafFanRadiusMm, AUTO_SUPPORT_CONSTRAINTS.leafFanRadiusMm),
        leafFanMaxAngleDeg: clampNumeric(source.leafFanMaxAngleDeg, AUTO_SUPPORT_CONSTRAINTS.leafFanMaxAngleDeg),
        debugSupportOriginColors: normalizeBoolean(source.debugSupportOriginColors, defaults.debugSupportOriginColors),
        debugSkipAutoBracing: normalizeBoolean(source.debugSkipAutoBracing, defaults.debugSkipAutoBracing),
    };
}

export function applyAutoSupportSettingsPatch(
    current: AutoSupportSettings,
    patch: Partial<AutoSupportSettings>,
): AutoSupportSettings {
    return normalizeAutoSupportSettings({
        ...current,
        ...patch,
    });
}
