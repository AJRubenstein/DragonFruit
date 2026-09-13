import { registerSegmentPreviewBatchBuilder, segmentPreviewTypesMissingBuilder } from './seam';
import { buildBracePlacementPreviewBatch } from '../SupportTypes/Brace/bracePreviewBatch';
import type { BracePreviewData } from '../SupportTypes/Brace/bracePlacementState';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

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

/**
 * The type the builder below belongs to: the one declaring the segment preview
 * shape, which is the shape it draws. Read off the registry rather than written
 * here, and read through the same declaration the check underneath uses, so the
 * two cannot disagree about which types need a builder.
 */
const [segmentPreviewTypeId] = SUPPORT_TYPES
    .filter((descriptor) => descriptor.previewShape === 'segment')
    .map((descriptor) => descriptor.id);
if (!segmentPreviewTypeId) {
    throw new Error('no support type declares `previewShape: \'segment\'`, so there is no builder to register.');
}

registerSegmentPreviewBatchBuilder<BracePreviewData>(segmentPreviewTypeId, buildBracePlacementPreviewBatch);

// A type declaring `previewShape: 'segment'` draws nothing without a builder, and
// nothing else would notice: the shared batch covers only whole supports.
const missingPreviewBuilders = segmentPreviewTypesMissingBuilder();
if (missingPreviewBuilders.length > 0) {
    throw new Error(
        `segment-preview types have no registered batch builder: ${missingPreviewBuilders.join(', ')}. `
        + 'Register one above.',
    );
}
