export interface AutoSupportSettings {
    enabled: boolean;
    minIslandAreaMm2: number;
    tipInfluenceRadiusMm: number;
    prioritizeIntersection: boolean;
    /** Max combined leaves + branches that can attach to a single trunk. */
    maxAttachmentsPerTrunk: number;
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
    | 'maxAttachmentsPerTrunk';

export const AUTO_SUPPORT_CONSTRAINTS = {
    minIslandAreaMm2: { min: 0.01, max: 10, step: 0.01, defaultValue: 0.02 },
    tipInfluenceRadiusMm: { min: 0.1, max: 10, step: 0.1, defaultValue: 0.5 },
    maxAttachmentsPerTrunk: { min: 2, max: 50, step: 1, defaultValue: 12, integer: true },
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
