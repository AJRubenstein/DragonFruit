import { SUPPORT_GRAPH_NODES, SUPPORT_TYPES, type SupportCollectionKey } from './supportTypeRegistry';
import type { Segment, SupportState } from './types';

/**
 * Walks the support dependency graph to work out what a removal takes with it.
 *
 * The graph is declared on the registry as `SupportTypeDescriptor.edges`; see
 * `SupportEdge` for what `owns` and `hostedBy` mean.
 */

/** One entity, addressed by the collection it lives in. */
export interface EntityRef {
    collection: SupportCollectionKey;
    id: string;
}

const refKey = (ref: EntityRef) => `${ref.collection}:${ref.id}`;

/** Collections holding entities, plus the primitives cascades reach. */
type CascadeState = Pick<SupportState, SupportCollectionKey>;

/**
 * Segment id -> the entity that owns it.
 *
 * Knots attach to a SEGMENT, not to the entity, so following a knot back to the
 * shaft that hosts it needs this index. Rebuilt per cascade: a removal is rare
 * next to a render, and a stale index here would delete the wrong entities.
 */
function buildSegmentOwners(state: CascadeState): Map<string, EntityRef> {
    const owners = new Map<string, EntityRef>();
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasSegments) continue;
        const collection = descriptor.location.key;
        for (const entity of Object.values(state[collection])) {
            const segments = (entity as { segments?: Segment[] }).segments ?? [];
            for (const segment of segments) {
                owners.set(segment.id, { collection, id: (entity as { id: string }).id });
            }
        }
    }
    return owners;
}

interface OutgoingLink {
    edgeTo: SupportCollectionKey | 'segment';
    id: string;
    ownership: 'owns' | 'hostedBy';
    takeHost?: 'never' | 'ifUnused' | 'always';
}

/** Every id an entity points at, by the edges its type declares. */
function outgoingIds(state: CascadeState, ref: EntityRef): OutgoingLink[] {
    const node = SUPPORT_GRAPH_NODES.find((n) => n.key === ref.collection);
    if (!node) return [];

    const entity = state[ref.collection][ref.id] as unknown as Record<string, unknown> | undefined;
    if (!entity) return [];

    const out: OutgoingLink[] = [];
    for (const edge of node.edges) {
        const value = entity[edge.field];
        if (typeof value === 'string' && value) {
            out.push({ edgeTo: edge.to, id: value, ownership: edge.ownership, takeHost: edge.takeHost });
        }
    }
    return out;
}

/**
 * Whether anything outside `doomed` still points at `target`.
 *
 * A host that survives its dependent is only deleted when nothing else needs it;
 * this is the reference count `removeLeaf` performs by hand.
 */
export function isReferencedOutside(
    state: CascadeState,
    target: EntityRef,
    doomed: ReadonlySet<string>,
): boolean {
    for (const node of SUPPORT_GRAPH_NODES) {
        const collection = node.key;
        const pointsAtTarget = node.edges.filter((edge) => edge.to === target.collection);
        if (pointsAtTarget.length === 0) continue;

        for (const entity of Object.values(state[collection])) {
            const id = (entity as { id: string }).id;
            if (doomed.has(refKey({ collection, id }))) continue;

            const fields = entity as unknown as Record<string, unknown>;
            for (const edge of pointsAtTarget) {
                if (fields[edge.field] === target.id) return true;
            }
        }
    }
    return false;
}

/**
 * Everything that must go when `seed` is removed.
 *
 * Two directions, run to a fixpoint:
 *
 * - **downward** -- an entity `hostedBy` something doomed is doomed. A knot on a
 *   doomed shaft's segment goes, then the leaf on that knot, and so on.
 * - **upward** -- a target the doomed entity `owns` goes with it, and so does a
 *   host it was `hostedBy`, but only when nothing outside the doomed set still
 *   references that host.
 *
 * The returned set always contains `seed`.
 */
export function collectCascade(state: CascadeState, seed: EntityRef[]): Set<string> {
    const doomed = new Set<string>(seed.map(refKey));
    const seedKeys = new Set<string>(seed.map(refKey));
    const segmentOwners = buildSegmentOwners(state);

    /** Segment ids belonging to doomed entities, so knots on them can be found. */
    const doomedSegmentIds = () => {
        const ids = new Set<string>();
        for (const [segmentId, owner] of segmentOwners) {
            if (doomed.has(refKey(owner))) ids.add(segmentId);
        }
        return ids;
    };

    let grew = true;
    while (grew) {
        grew = false;

        // Downward: anything hosted by a doomed entity, or sitting on its shaft.
        const shaftIds = doomedSegmentIds();
        for (const node of SUPPORT_GRAPH_NODES) {
            const collection = node.key;
            for (const entity of Object.values(state[collection])) {
                const id = (entity as { id: string }).id;
                const ref = { collection, id };
                if (doomed.has(refKey(ref))) continue;

                for (const link of outgoingIds(state, ref)) {
                    if (link.ownership !== 'hostedBy') continue;
                    const hostDoomed = link.edgeTo === 'segment'
                        ? shaftIds.has(link.id)
                        : doomed.has(refKey({ collection: link.edgeTo, id: link.id }));
                    if (hostDoomed) {
                        doomed.add(refKey(ref));
                        grew = true;
                        break;
                    }
                }
            }
        }

        // Upward: a host the SEED hung from, per the edge's takeHost policy.
        //
        // Seed-only and inside the fixpoint: taking a host must then cascade
        // down to everything else on it, but a brace swept up by a cascade must
        // NOT drag its far-side knot along -- that knot belongs to a shaft
        // nobody asked to remove. The existing removers draw the line here too.
        for (const ref of seed) {
            for (const link of outgoingIds(state, ref)) {
                if (link.ownership !== 'hostedBy' || link.edgeTo === 'segment') continue;
                const policy = link.takeHost ?? 'never';
                if (policy === 'never') continue;

                const target = { collection: link.edgeTo, id: link.id };
                if (doomed.has(refKey(target))) continue;
                if (!state[target.collection][target.id]) continue;

                if (policy === 'always' || !isReferencedOutside(state, target, doomed)) {
                    doomed.add(refKey(target));
                    grew = true;
                }
            }
        }

        // Upward: anything a doomed entity OWNS goes with it, however it was
        // reached. A trunk's root dies whether the trunk was the seed or was
        // swept up by a cascade.
        for (const key of Array.from(doomed)) {
            const [collection, id] = key.split(':') as [SupportCollectionKey, string];
            for (const link of outgoingIds(state, { collection, id })) {
                if (link.ownership !== 'owns' || link.edgeTo === 'segment') continue;
                const target = { collection: link.edgeTo, id: link.id };
                if (doomed.has(refKey(target))) continue;
                if (!state[target.collection][target.id]) continue;
                doomed.add(refKey(target));
                grew = true;
            }
        }
    }

    return doomed;
}

/** Split a cascade result back into per-collection id sets. */
export function groupByCollection(doomed: ReadonlySet<string>): Map<SupportCollectionKey, Set<string>> {
    const byCollection = new Map<SupportCollectionKey, Set<string>>();
    for (const key of doomed) {
        const [collection, id] = key.split(':') as [SupportCollectionKey, string];
        const existing = byCollection.get(collection);
        if (existing) existing.add(id);
        else byCollection.set(collection, new Set([id]));
    }
    return byCollection;
}
