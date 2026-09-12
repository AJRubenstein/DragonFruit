import type * as THREE from 'three';

import { registerContactOverride } from '../../supportTypeRegistry';
import { buildAnchorData } from './anchorBuilder';

/**
 * The anchor OVERRIDES auto-placement's default build for its band.
 *
 * Auto-placement stands a trunk on a contact by default. An anchor claims the
 * near-plate band (the `tipHeight` rule on its descriptor) and puts a stub
 * there instead — a different primitive entirely. Registering that here is what
 * lets the grid engine ask "what does this contact's type build, and build it"
 * without importing this module or naming the anchor.
 */
registerContactOverride('anchor', (request) => {
    const built = buildAnchorData({
        tipPos: request.tipPos,
        tipNormal: request.tipNormal,
        modelId: request.modelId,
        // The registry passes a structural mesh so it need not depend on the
        // renderer; the builder wants the real one, and only ever reads it.
        mesh: request.mesh as THREE.Mesh | undefined,
    });
    return {
        // An anchor declares no `edges`: its frustum root IS the support, so it
        // carries no separate primitive into the draft.
        typeId: 'anchor',
        entity: built.anchor,
        supplied: {},
        supportData: built.supportData,
    };
});
