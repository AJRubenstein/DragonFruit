import * as THREE from 'three';

import { registerSupportExportGroup } from '../../exportGeometry/seam';
import { addModelMetadata, raftSettingsFor, SupportGeometryGenerator } from '../../exportGeometry/helpers';
import type { Trunk } from '../../types';

// A trunk yields its grid node to a higher candidate, rehosting its own
// attachments onto the promoted shaft. Registered here because those rules are
// the trunk's; the grid engine only decides WHICH host yields.
import './trunkHostPromotion';

// A trunk's export geometry is its plate root plus the shaft above it. The root
// is looked up from the live store rather than carried on the entity, so a
// trunk whose root is gone exports nothing.
registerSupportExportGroup<Trunk>('trunk', (trunk, context) => {
    const root = context.supportState.roots[trunk.rootId];
    if (!root) return null;

    const modelId = trunk.modelId ?? root.modelId ?? null;
    const group: THREE.Group = SupportGeometryGenerator.generateSupportGroup(
        {
            id: trunk.id,
            roots: root,
            segments: trunk.segments,
            contactCone: trunk.contactCone,
        },
        raftSettingsFor(modelId),
    );
    addModelMetadata(group, modelId);
    return group;
});
