import { registerSegmentPreviewBatchBuilder } from './seam';
import { buildBracePlacementPreviewBatch } from '../SupportTypes/Brace/bracePreviewBatch';
import type { BracePreviewData } from '../SupportTypes/Brace/bracePlacementState';

/**
 * Wires each type's own preview geometry into the segment-preview seam.
 *
 * Loaded by the RENDERER, not by the store. Preview geometry is a render-layer
 * concern: the store's registration modules run while `supports/state.ts`
 * initialises, and pulling render-layer modules into that load reaches back into
 * the store it is still building. Registering here keeps the two apart.
 *
 * One line per type that needs a builder of its own. A type whose preview is a
 * whole provisional support needs nothing -- the shared batch covers it.
 */
registerSegmentPreviewBatchBuilder<BracePreviewData>('brace', buildBracePlacementPreviewBatch);
