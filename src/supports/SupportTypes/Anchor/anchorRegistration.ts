import * as THREE from 'three';

import { registerSupportExportGroup } from '../../exportGeometry/seam';
import { addModelMetadata, appendConeGeometry, appendShafts, SupportGeometryGenerator } from '../../exportGeometry/helpers';
import { getFinalSocketPosition } from '../../SupportPrimitives/ContactCone';
import type { Anchor, Vec3 } from '../../types';

// An anchor is a near-plate stub: a frustum root, ONE joint, one segment and a
// contact cone. It has no Roots entry -- the frustum IS its root -- which is why
// its geometry is built here rather than through the shared generator.
registerSupportExportGroup<Anchor>('anchor', (anchor) => {
    const group = new THREE.Group();
    addModelMetadata(group, anchor.modelId);

    const rootHeight = Math.max(0.001, anchor.rootHeight);
    const rootMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
            Math.max(0.001, anchor.rootTopDiameter / 2),
            Math.max(0.001, anchor.rootBaseDiameter / 2),
            rootHeight,
            20,
        ),
    );
    rootMesh.position.set(anchor.rootPos.x, anchor.rootPos.y, anchor.rootPos.z + (rootHeight / 2));
    rootMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    group.add(rootMesh);

    group.add(SupportGeometryGenerator.generateJointMesh(anchor.joint));

    let currentStart: Vec3 = anchor.joint.pos;
    anchor.segments.forEach((segment) => {
        const end = segment.topJoint
            ? segment.topJoint.pos
            : anchor.contactCone
                ? getFinalSocketPosition(anchor.contactCone)
                : currentStart;

        appendShafts(group, segment, currentStart, end);

        if (segment.topJoint) {
            group.add(SupportGeometryGenerator.generateJointMesh(segment.topJoint));
        }

        currentStart = end;
    });

    appendConeGeometry(group, anchor.contactCone);
    return group;
});
