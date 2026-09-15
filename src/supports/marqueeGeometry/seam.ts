import type { SupportState } from '../types';
import type { SupportTypeId } from '../supportTypeRegistry';

/**
 * How a support type contributes its pickable polyline.
 *
 * A slot for the same reason the proxy and export seams are ones: which points a
 * type's polyline runs through is a fact about that type -- a twig spans its two
 * disks, a stick runs socket to socket, a stump starts at its own root -- so the
 * recipe lives in that type's folder and registers itself here. Nothing else
 * names a type: `collectSupportMarqueeShapes` walks `SUPPORT_TYPES` and asks each
 * one for its points.
 *
 * The registry declares what a type IS, not what a drag should hit, so this seam
 * lives beside the supports rather than in `supportTypeRegistry.ts`.
 */

/** Where a recipe appends its polyline. */
export interface MarqueeShapeSink {
    /**
     * One entity's polyline, from the points in the order they are joined.
     *
     * A null or repeated point is dropped, and an empty list emits nothing, so a
     * recipe may pass whatever its own fields happen to be.
     */
    chain(
        id: string,
        modelId: string | undefined,
        positions: Array<{ x: number; y: number; z: number } | null | undefined>,
    ): void;
}

/** What a recipe is handed. */
export interface MarqueeShapeContext extends MarqueeShapeSink {
    /** The live store, for the roots and host knots a recipe reaches by id. */
    state: SupportState;
}

type SupportMarqueeShapeBuilder = (entity: never, context: MarqueeShapeContext) => void;

const MARQUEE_SHAPE_BUILDERS = new Map<SupportTypeId, SupportMarqueeShapeBuilder>();

/**
 * Called once per type from its own folder's registration module.
 *
 * The entity parameter is annotated by the implementer (`(stick: Stick) => …`),
 * which is what keeps each recipe's body typed without the caller casting.
 */
export function registerSupportMarqueeShape<T>(
    typeId: SupportTypeId,
    build: (entity: T, context: MarqueeShapeContext) => void,
): void {
    MARQUEE_SHAPE_BUILDERS.set(typeId, build as SupportMarqueeShapeBuilder);
}

/** This type's recipe, or null when its folder registered none. */
export function supportMarqueeShapeOf(
    typeId: SupportTypeId,
): SupportMarqueeShapeBuilder | null {
    return MARQUEE_SHAPE_BUILDERS.get(typeId) ?? null;
}

/**
 * Types whose folder registered no marquee polyline.
 *
 * A type that registers none is skipped by the walk, so it is not SELECTABLE by
 * a drag at all -- which looks like a hit-test that misses rather than a
 * forgotten registration. The completeness test holds this to empty.
 */
export function typesMissingMarqueeShape(
    typeIds: readonly SupportTypeId[],
): readonly SupportTypeId[] {
    return typeIds.filter((typeId) => !MARQUEE_SHAPE_BUILDERS.has(typeId));
}
