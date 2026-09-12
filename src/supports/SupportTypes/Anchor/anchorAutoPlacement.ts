import type * as THREE from 'three';

import { registerAutoPlacementBuilder } from '../../supportTypeRegistry';
import type { SupportData } from '../../rendering/SupportBuilder';
import type { Anchor } from '../../types';
import { buildAnchorData } from './anchorBuilder';

/**
 * The anchor OVERRIDES auto-placement's default for its band.
 *
 * Auto-placement's default is to stand a trunk on a contact. An anchor claims
 * the near-plate band (see the `tipHeight` rule on its descriptor) and puts a
 * stub there instead, which is a different primitive entirely. Registering that
 * here is what lets the grid engine ask "which type claims this height, and
 * build it" without importing the anchor's builder or naming the anchor.
 */
registerAutoPlacementBuilder('anchor', (request) => {
    const built = buildAnchorData({
        tipPos: request.tipPos,
        tipNormal: request.tipNormal,
        modelId: request.modelId,
        // The registry passes a structural mesh so it need not depend on the
        // renderer; the builder wants the real one, and only ever reads it.
        mesh: request.mesh as THREE.Mesh | undefined,
    });
    const extras: { anchor: Anchor; supportData: SupportData } = {
        anchor: built.anchor,
        supportData: built.supportData,
    };
    return { entity: built.anchor, extras };
});
