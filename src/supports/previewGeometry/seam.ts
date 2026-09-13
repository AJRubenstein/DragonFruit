import type { PlacementPreviewBatch } from '../supportPlacementPreviewMath';
import { SUPPORT_TYPES, type SupportTypeId } from '../supportTypeRegistry';

/**
 * How a type whose placement preview is not a whole provisional support builds
 * its preview batch.
 *
 * The registry declares the SHAPE (`previewShape: 'segment'`); this is where the
 * IMPLEMENTATION for that shape lives -- in the type's own folder, registered
 * from its registration module. So the renderer asks "give me this type's
 * segment preview" without naming the type or importing its geometry.
 *
 * Not a store: a preview batch is a pure function of the preview state the
 * type's store already holds. The store holds WHAT to preview; this builds the
 * primitives to draw it with.
 */
/**
 * What a segment preview needs beyond its own state.
 *
 * Supplied by the caller rather than read here: the seam is imported while the
 * support store initialises, so it must not reach into the settings store.
 */
export interface SegmentPreviewContext {
    /**
     * The thickest shaft the type's own builder will produce, so the preview
     * never overpromises a shaft thicker than the finished support.
     */
    maxShaftDiameterMm: number;
}

type SegmentPreviewBatchBuilder = (
    id: string,
    preview: never,
    context: SegmentPreviewContext,
) => PlacementPreviewBatch | null;

const SEGMENT_BATCH_BUILDERS = new Map<SupportTypeId, SegmentPreviewBatchBuilder>();

/**
 * Called once per type from its own folder's registration module.
 *
 * The `preview` parameter is annotated by the implementer, which is what keeps
 * the builder's body typed from the preview shape the type's store publishes.
 */
export function registerSegmentPreviewBatchBuilder<P>(
    typeId: SupportTypeId,
    build: (id: string, preview: P, context: SegmentPreviewContext) => PlacementPreviewBatch | null,
): void {
    SEGMENT_BATCH_BUILDERS.set(typeId, build as SegmentPreviewBatchBuilder);
}

/**
 * Segment-shaped types that registered no builder.
 *
 * A type declaring `previewShape: 'segment'` has no contact to describe, so the
 * shared batch does not cover it: without a builder its preview draws nothing.
 * `registerBuiltinPreviewBuilders` asserts this list is empty at load, the same
 * way the detail-renderer and anatomy-preview barrels do.
 */
export function segmentPreviewTypesMissingBuilder(): readonly SupportTypeId[] {
    return SUPPORT_TYPES
        .filter((descriptor) => descriptor.previewShape === 'segment')
        .filter((descriptor) => !SEGMENT_BATCH_BUILDERS.has(descriptor.id))
        .map((descriptor) => descriptor.id);
}

/**
 * The preview batch for a segment-shaped type, or null when there is nothing to
 * draw or the type never registered one.
 */
export function buildSegmentPreviewBatch(
    typeId: SupportTypeId,
    id: string,
    preview: unknown,
    context: SegmentPreviewContext,
): PlacementPreviewBatch | null {
    const build = SEGMENT_BATCH_BUILDERS.get(typeId);
    if (!build) return null;
    return (build as unknown as (batchId: string, value: unknown, ctx: SegmentPreviewContext) => PlacementPreviewBatch | null)(id, preview, context);
}
