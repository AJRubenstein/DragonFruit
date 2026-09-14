/**
 * Loads each type's renderer, which registers its detail renderer into the
 * seam. Kept as one import site so the shared renderer pulls in the whole set
 * at once -- and so a test can wire the seam without importing the whole
 * renderer. Mirrors `previewGeometry/registerBuiltinPreviewBuilders`.
 *
 * Loaded by the RENDERER, not the store: each entry closes over live scene
 * state, and pulling render-layer modules into the store's load reaches back
 * into the store it is still building.
 *
 * The IMPORTS are generated from the type folders, so a type's name is not
 * written down here in a path: renaming a type used to leave this module
 * pointing at a folder that no longer existed, which broke every consumer
 * rather than the one type.
 */
import { detailRenderersMissingTypes } from './seam';
import './generatedDetailRendererImports';

// Every declared type must have registered, or it draws nothing and says so to
// nobody. `detailRenderersMissingTypes` was written for this and only a test
// called it, so the assertion it promised lived in the suite rather than at
// load -- the gap that let three anatomy previews fall through unnoticed.
const missingRenderers = detailRenderersMissingTypes();
if (missingRenderers.length > 0) {
    throw new Error(
        `support types have no registered detail renderer: ${missingRenderers.join(', ')}. `
        + 'Add an import above -- a module nothing imports never registers.',
    );
}
