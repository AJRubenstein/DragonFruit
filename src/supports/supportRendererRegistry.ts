import type { ComponentType } from 'react';

import { SUPPORT_TYPES, type SupportTypeId } from './supportTypeRegistry';

/**
 * Which component draws each support type, and what it needs beyond the
 * shared props.
 *
 * A side table rather than a field on `SupportTypeDescriptor`: the registry
 * describes what a type IS, and importing renderers into it would make every
 * consumer of the registry pull in React and the whole component tree.
 * Registration is the same shape as `registerContactBridgeBuilder`.
 *
 * `SupportRenderer` owns the render loop; each type contributes:
 *
 * - `entityProp` -- the prop name the component takes its entity under. This
 *   is `singular` from the descriptor for all eight today, but declared here
 *   so a component that names it differently does not have to rename.
 * - `hosts` -- the other entities the component needs (a root, a parent knot).
 *   Returning `null` skips the entity: its host is missing or not yet loaded.
 * - `skip` -- whether this entity draws nothing this frame, which is where the
 *   per-type "only when selected" and "only when unbatchable" rules live.
 * - `extraProps` -- everything past the shared set.
 */

/** What the render loop hands a type when asking for its props. */
export interface SupportRenderContext<TEntity> {
    entity: TEntity;
    isSelected: boolean;
    /** True while the scene draws in reduced detail. */
    simpleRender: boolean;
    /** Whether this entity's shaft is in a scene batch this frame. */
    isBatchable: boolean;
}

export interface SupportRendererEntry<TEntity = unknown> {
    component: ComponentType<Record<string, unknown>>;
    entityProp: string;
    hosts?: (entity: TEntity) => Record<string, unknown> | null;
    skip?: (context: SupportRenderContext<TEntity>) => boolean;
    extraProps?: (context: SupportRenderContext<TEntity>) => Record<string, unknown>;
    /** `userData.noClipping` on the wrapping group. Trunk pins it true. */
    noClipping?: (context: SupportRenderContext<TEntity>) => boolean;
}

const SUPPORT_RENDERERS = new Map<SupportTypeId, SupportRendererEntry<never>>();

export function registerSupportRenderer<TEntity>(
    typeId: SupportTypeId,
    entry: SupportRendererEntry<TEntity>,
): void {
    SUPPORT_RENDERERS.set(typeId, entry as SupportRendererEntry<never>);
}

export function getSupportRenderer(typeId: SupportTypeId): SupportRendererEntry<never> | undefined {
    return SUPPORT_RENDERERS.get(typeId);
}

/** Every type with a registered renderer, in registry order. */
export function renderedSupportTypes(): readonly SupportTypeId[] {
    return SUPPORT_TYPES.filter((descriptor) => SUPPORT_RENDERERS.has(descriptor.id))
        .map((descriptor) => descriptor.id);
}
