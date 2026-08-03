import { MaterialAntiAliasingSettings } from '@/features/profiles/profileStore';
import { computePhysicalAaConfig, AaPreset } from '@/features/slicing/autoAaPhysics';

/**
 * Resolves the total penetration distance for support contact tips into the model.
 * 
 * @param settings The AA settings from the active material profile
 * @param layerHeightMm The Z layer height in mm
 * @param pixelPitchMm The X pixel pitch in mm
 * @param pixelPitchYMm The Y pixel pitch in mm (defaults to pixelPitchMm)
 * @returns The calculated offset in mm
 */
export function calculateTipOffset(
    settings: MaterialAntiAliasingSettings,
    layerHeightMm: number,
    pixelPitchMm: number,
    pixelPitchYMm: number = pixelPitchMm
): number {
    const mode = settings.tipOffsetMode ?? 'disabled';

    if (mode === 'disabled') {
        return 0.05;
    }

    if (mode === 'manual') {
        return settings.tipOffsetMm ?? 0.05;
    }

    // Auto mode
    // Get actual Rz from either custom override or physics calculation
    let Rz = settings.zBlurRadiusLayers;
    
    if (!settings.enableCustomSettings || (settings.enableCustomSettings && !settings.useCustomZBlurRadius)) {
        // Find preset label for auto mode, default to balanced
        let preset: AaPreset = 'balanced';
        if (settings.level === 'sharp') preset = 'sharp';
        else if (settings.level === 'smooth') preset = 'smooth';
        
        const cfg = computePhysicalAaConfig(preset, pixelPitchMm, layerHeightMm, pixelPitchYMm);
        Rz = cfg.zBlurRadiusLayers;
    }

    // Formula: (2 * Rz + 1) * Hz
    return Number(((2 * Rz + 1) * layerHeightMm).toFixed(3));
}

