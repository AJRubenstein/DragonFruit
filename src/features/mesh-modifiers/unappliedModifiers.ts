import type { ModelMeshModifiers } from './types';

/**
 * Which of a model's modifiers are still unapplied — the state the UI is about
 * to change its mind about.
 *
 * Hole punches and hollowing are baked into the mesh at different moments:
 * slicing/export applies both (`prepareModelGeometry`), while support
 * generation runs against the mesh as it stands right now. So a model with
 * unapplied holes or unapplied hollowing can have supports generated across
 * geometry that is about to be cut away or hollowed out.
 */
export function getUnappliedModifiers(modifiers: ModelMeshModifiers | undefined): {
    holePunches: boolean;
    hollowing: boolean;
} {
    const punches = modifiers?.holePunches;
    return {
        holePunches: Boolean(punches && punches.length > 0 && !modifiers?.holePunchesBakedIntoGeometry),
        hollowing: Boolean(modifiers?.hollowing?.enabled && !modifiers.hollowing.bakedIntoGeometry),
    };
}
