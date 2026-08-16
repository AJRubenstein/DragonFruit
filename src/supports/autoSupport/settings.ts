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
    | 'overhangSelfSupportAngleDeg';

export const AUTO_SUPPORT_CONSTRAINTS = {
    minIslandAreaMm2: { min: 0.01, max: 10, step: 0.01, defaultValue: 0.02 },
    tipInfluenceRadiusMm: { min: 0.1, max: 10, step: 0.1, defaultValue: 0.5 },
    maxAttachmentsPerTrunk: { min: 2, max: 50, step: 1, defaultValue: 12, integer: true },
    areaPerSupportMm2: { min: 1, max: 30, step: 0.5, defaultValue: 8 },
    gridAreaThresholdMm2: { min: 5, max: 200, step: 5, defaultValue: 25 },
    overhangSelfSupportAngleDeg: { min: 20, max: 75, step: 5, defaultValue: 45 },
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
