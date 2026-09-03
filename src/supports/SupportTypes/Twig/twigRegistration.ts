import { registerKnotDiameterRule } from '../../supportTypeRegistry';
import type { Twig } from '../../types';
import { resolveTwigDiameterAtSegmentT, twigJointDiameterForLocalDiameter } from './twigTaper';

// Twigs taper along their length, so a knot on one is sized from the taper
// rather than the generic segment-diameter rule.
registerKnotDiameterRule<Twig>('twig', (twig, segmentId, t) => {
    const local = resolveTwigDiameterAtSegmentT(twig, segmentId, t);
    return local !== null && local > 0 ? twigJointDiameterForLocalDiameter(local) : null;
});
