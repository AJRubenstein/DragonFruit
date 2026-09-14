import type * as THREE from 'three';

import { registerContactOverride, type PlacedSupport } from '../../supportTypeRegistry';
import { getFinalSocketPosition } from '../../SupportPrimitives/ContactCone';
import { buildStumpData } from './stumpBuilder';

/**
 * The anchor OVERRIDES auto-placement's default build for its band.
 *
 * Auto-placement stands a trunk on a contact by default. An anchor claims the
 * near-plate band (the `tipHeight` rule on its descriptor) and puts a stub
 * there instead — a different primitive entirely. Registering that here is what
 * lets the grid engine ask "what does this contact's type build, and build it"
 * without importing this module or naming the anchor.
 */
registerContactOverride('stump', (request) => {
    const built = buildStumpData({
        tipPos: request.tipPos,
        tipNormal: request.tipNormal,
        modelId: request.modelId,
        // The registry passes a structural mesh so it need not depend on the
        // renderer; the builder wants the real one, and only ever reads it.
        mesh: request.mesh as THREE.Mesh | undefined,
    });

    const { anchor, supportData } = built;
    const placed: PlacedSupport = {
        // An anchor declares no `edges`: its frustum root IS the support, so it
        // carries no separate primitive into the draft.
        typeId: 'stump',
        entity: anchor,
        supplied: {},
    };

    // The anchor's OWN invariant, tested here rather than in the grid engine:
    // the cone body spans contact disk → socket and must never dip below the
    // root joint, or an over-long cone on a downward axis pushes the shaft below
    // the root, into -Z. The engine has no business reading an anchor's joints
    // and cone to check this.
    const jointZ = anchor.joint.pos.z;
    const lowestShaftZ = Math.min(
        anchor.contactCone.pos.z,
        getFinalSocketPosition(anchor.contactCone).z,
    );
    if (lowestShaftZ < jointZ - 1e-3) {
        // Preview the invalid anchor (red, with the reason as `error`) so the
        // hover tooltip explains the rejection.
        return {
            placed,
            refusal: 'STUMP_BELOW_ROOT',
            supportData: { ...supportData, error: 'STUMP_BELOW_ROOT' },
        };
    }
    return { placed, supportData };
});
