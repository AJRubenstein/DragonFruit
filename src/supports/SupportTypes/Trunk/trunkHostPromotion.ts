import type { Branch, Knot, Roots, SupportState, Trunk } from '../../types';
import { registerHostPromotion } from '../../supportTypeRegistry';
import { draftAddEntity, draftAddPrimitive } from '../../autoSupport/supportDraft';
import { planTrunkReplacement } from './TrunkReplacement/planTrunkReplacement';
import { applyTrunkReplacement } from './TrunkReplacement/applyTrunkReplacement';
import { getSnapshot, setSnapshot } from '../../state';

/**
 * A trunk yields its grid node to a candidate whose contact sits HIGHER.
 *
 * The candidate is promoted to a trunk and the trunk underneath it is removed,
 * with the removed one's own attachments rebuilt onto the promoted shaft. That
 * last part is why this is registered rather than inlined in the engine: the
 * rehosting rules belong to the trunk and nothing else can run them.
 */
export function promoteTrunkToHigherCandidate(
    draft: SupportState,
    hostId: string,
    promoteKnot: Knot,
    promoteBranch: Branch,
    trunkToAdd: Trunk,
    rootToAdd: Roots,
    nodeKey: string,
): SupportState | null {
    // Add the candidate's contact and member to the draft first: the planner
    // resolves the promoted branch by id, so it has to be present.
    let working = draftAddPrimitive(draft, 'knots', promoteKnot);
    working = draftAddEntity(working, 'branch', promoteBranch);

    const planned = planTrunkReplacement({
        snapshot: working,
        trunkIdToRemove: hostId,
        mode: 'grid_promote_candidate_to_trunk',
        nodeKey,
        promoteBranchId: promoteBranch.id,
    });
    const plan = planned?.plan;
    if (!plan) return null;

    // Store-bound by necessity: the plan phase re-reads the live snapshot, so
    // the draft is committed, applied, and read back. The run wraps this in one
    // history entry and its own rollback guard, so the intermediate commit is
    // never user-visible.
    setSnapshot(working);
    const ok = applyTrunkReplacement(
        { ...plan, trunkToAdd, rootToAdd },
        undefined,
        { skipHistory: true }, // the whole run is one undoable entry
    );
    if (!ok) return null;

    return getSnapshot();
}

registerHostPromotion('trunk', (request) => promoteTrunkToHigherCandidate(
    request.draft,
    request.hostId,
    request.promoteKnot,
    request.promoteBranch,
    request.trunkToAdd,
    request.rootToAdd,
    request.nodeKey,
));
