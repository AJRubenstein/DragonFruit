import { JOINT_DIAMETER_OFFSET_MM } from '../../constants';
import type { Brace, Knot } from '../../types';

/**
 * How wide a brace is at each of the knots it spans.
 *
 * A brace has no root to size it, so each end takes its host knot's width less
 * the joint offset, capped by the brace's own profile. The two ends differ
 * whenever the knots do, which is what makes a brace taper.
 *
 * One home for the rule: the renderer, the proxy layer and the exporter each
 * draw the same brace and must agree on how wide it is.
 */
export function braceSpanDiameters(
    brace: Pick<Brace, 'profile'>,
    startKnot: Pick<Knot, 'diameter'> | undefined,
    endKnot: Pick<Knot, 'diameter'> | undefined,
): { startDiameterMm: number; endDiameterMm: number; isTapered: boolean } {
    const profileDiameter = Math.max(0.001, brace.profile?.diameter ?? 1);
    const atKnot = (knot: Pick<Knot, 'diameter'> | undefined) => Math.min(
        profileDiameter,
        Math.max(
            0.001,
            (knot?.diameter ?? (profileDiameter + JOINT_DIAMETER_OFFSET_MM)) - JOINT_DIAMETER_OFFSET_MM,
        ),
    );

    const startDiameterMm = atKnot(startKnot);
    const endDiameterMm = atKnot(endKnot);
    return {
        startDiameterMm,
        endDiameterMm,
        isTapered: Math.abs(startDiameterMm - endDiameterMm) > 1e-4,
    };
}
