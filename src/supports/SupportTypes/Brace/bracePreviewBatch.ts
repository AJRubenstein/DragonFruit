import type { BracePreviewData } from './bracePlacementState';
import type { SegmentPreviewContext } from '../../previewGeometry/seam';
import {
    PLACEMENT_PREVIEW_COLOR,
    PLACEMENT_PREVIEW_OPACITY,
    type PlacementPreviewBatch,
    type PlacementPreviewTaperedShaft,
} from '../../supportPlacementPreviewMath';
import type { InstancedJoint } from '../../SupportPrimitives/Joint/InstancedJointGroup';
import type { InstancedShaft } from '../../SupportPrimitives/Shaft/InstancedShaftGroup';

/**
 * The batch a brace's placement preview draws.
 *
 * A brace previews a bare span between two snapped points, not a provisional
 * support: no plate root, no contact cone, just the shaft and a knot at each
 * end. That is the `previewShape: 'segment'` case the registry declares, and
 * this is its implementation -- in brace's own folder, beside the preview data
 * it consumes.
 *
 * A pure function of the preview state and the diameter cap, which is what makes
 * it testable without a scene: the store holds WHAT to preview, the caller
 * supplies the limit, and this turns them into primitives.
 */
export function buildBracePlacementPreviewBatch(
    id: string,
    preview: BracePreviewData,
    context: SegmentPreviewContext,
): PlacementPreviewBatch | null {
    const maxShaftDiameterMm = context.maxShaftDiameterMm;
    const start = preview.start;
    const end = preview.end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const startDiameter = Math.min(maxShaftDiameterMm, Math.max(0.001, preview.startDiameterMm));
    const endDiameter = Math.min(maxShaftDiameterMm, Math.max(0.001, preview.endDiameterMm));
    const knotStartDiameter = Math.max(0.001, preview.startDiameterMm + 0.1);
    const knotEndDiameter = Math.max(0.001, preview.endDiameterMm + 0.1);

    const joints: InstancedJoint[] = [
        {
            id: `${id}:start-joint`,
            pos: start,
            diameter: knotStartDiameter,
            supportId: id,
        },
    ];

    const shafts: InstancedShaft[] = [];
    const taperedShafts: PlacementPreviewTaperedShaft[] = [];
    if (lenSq >= 1e-6) {
        if (Math.abs(startDiameter - endDiameter) > 1e-4) {
            taperedShafts.push({
                id: `${id}:shaft`,
                start,
                end,
                diameterStart: startDiameter,
                diameterEnd: endDiameter,
            });
        } else {
            shafts.push({
                id: `${id}:shaft`,
                start,
                end,
                diameter: (startDiameter + endDiameter) / 2,
                supportId: id,
            });
        }

        joints.push({
            id: `${id}:end-joint`,
            pos: end,
            diameter: knotEndDiameter,
            supportId: id,
        });
    }

    return {
        id,
        color: PLACEMENT_PREVIEW_COLOR,
        opacity: PLACEMENT_PREVIEW_OPACITY,
        shafts,
        taperedShafts,
        disks: [],
        joints,
        roots: [],
        cones: [],
    };
}
