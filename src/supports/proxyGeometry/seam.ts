import type { Segment, SupportState, Vec3 } from '../types';
import type { SupportTypeId } from '../supportTypeRegistry';
import type { InstancedShaft } from '../SupportPrimitives/Shaft/InstancedShaftGroup';
import type { InstancedRoot } from '../SupportPrimitives/Roots/InstancedRootsGroup';
import type { InstancedJoint } from '../SupportPrimitives/Joint/InstancedJointGroup';
import type { InstancedContactCone } from '../SupportPrimitives/ContactCone/InstancedContactConeGroup';

/**
 * How a support type contributes its primitives to the proxy view.
 *
 * The primitives a type is drawn from are a fact about that type -- a stump is
 * a frustum with its own radii, a stick is two cones, a twig is two disks -- so
 * each recipe lives in that type's own folder and registers itself here.
 * `collectProxyPrimitives` walks `SUPPORT_TYPES` and asks each one what it
 * emits, naming no type itself. Mirrors `exportGeometry/seam.ts`.
 *
 * Lives beside the proxy layer rather than in the registry, which declares what
 * a type is rather than how it draws.
 */

/** Where a recipe puts the primitives it builds. */
export interface ProxyPrimitiveSink {
    pushShaft(shaft: InstancedShaft): void;
    /** One segment as a shaft, curved ones as their batched bezier form. */
    pushSegmentShafts(
        segment: Segment,
        start: Vec3,
        end: Vec3,
        supportId: string,
        modelId?: string,
    ): void;
    pushRoot(root: InstancedRoot): void;
    pushJoint(joint: InstancedJoint, dedupeKey?: string, diameterBlendMm?: number): void;
    pushCone(cone: InstancedContactCone, dedupeKey?: string): void;
}

/**
 * What a recipe is handed.
 *
 * `state` is the live store, for the roots and host knots a recipe reaches
 * through the ids its entity carries. The two flags are the layer's, passed
 * through so a recipe can gate its own parts the way each one already did.
 */
export interface ProxyGeometryContext extends ProxyPrimitiveSink {
    state: SupportState;
    includeDetailedPrimitives: boolean;
}

/**
 * What a type's recipe declares about WHEN it runs, as opposed to what it
 * builds.
 *
 * Both are per type: a brace connects supports rather than facing the model, so
 * the interior view hides it; a leaf is a cone and a rod, so the coarse view has
 * nothing to show.
 */
export interface ProxyGeometryRegistration {
    /** Skipped entirely in the interior view. */
    skipInInteriorView?: boolean;
    /** Emitted only when detailed primitives are on. */
    detailedOnly?: boolean;
}

type SupportProxyGeometryBuilder = (entity: never, context: ProxyGeometryContext) => void;

const PROXY_GEOMETRY_BUILDERS = new Map<SupportTypeId, SupportProxyGeometryBuilder>();
const PROXY_GEOMETRY_REGISTRATIONS = new Map<SupportTypeId, ProxyGeometryRegistration>();

/**
 * Called once per type from its own folder's registration module.
 *
 * The entity parameter is annotated by the implementer (`(stick: Stick) => …`),
 * which is what keeps each recipe's body typed without the caller casting.
 */
export function registerSupportProxyGeometry<T>(
    typeId: SupportTypeId,
    build: (entity: T, context: ProxyGeometryContext) => void,
    registration: ProxyGeometryRegistration = {},
): void {
    PROXY_GEOMETRY_BUILDERS.set(typeId, build as SupportProxyGeometryBuilder);
    PROXY_GEOMETRY_REGISTRATIONS.set(typeId, registration);
}

/** This type's builder, or null when its folder registered none. */
export function supportProxyGeometryOf(
    typeId: SupportTypeId,
): { build: SupportProxyGeometryBuilder; registration: ProxyGeometryRegistration } | null {
    const build = PROXY_GEOMETRY_BUILDERS.get(typeId);
    if (!build) return null;
    return { build, registration: PROXY_GEOMETRY_REGISTRATIONS.get(typeId) ?? {} };
}

/** Types whose folder registered no proxy geometry, for the completeness test. */
export function typesMissingProxyGeometry(
    typeIds: readonly SupportTypeId[],
): readonly SupportTypeId[] {
    return typeIds.filter((typeId) => !PROXY_GEOMETRY_BUILDERS.has(typeId));
}
