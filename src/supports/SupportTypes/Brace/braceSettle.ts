import { registerSupportSettle } from '../../settle/seam';
import {
  getChangedKnotPositions,
  recomputeConeHostKnotGeometry,
  recomputeKnotDependentGeometry,
  recomputeSpanHostKnotGeometry,
} from '../../state';

/**
 * A written brace settles the knots it spans, and only then the leaves hanging
 * off them.
 *
 * ORDER IS THE WHOLE POINT, and it is the opposite of the leaf's: the brace's
 * own knots move first -- that is what changed -- and the leaf pass runs only if
 * they actually did. `settleKnotDependentGeometry` starts from the leaf side and
 * cannot express this, which is why brace kept a body of its own in the store.
 *
 * The second span-host pass exists because moving a leaf's cone can move the
 * knot that leaf rides, and a brace spanning that knot has to be recomputed
 * again from the moved position.
 */
registerSupportSettle('brace', ({ next }) => {
  const spanHost1 = recomputeSpanHostKnotGeometry(next.braces, next.knots);
  const changedByBrace1 = getChangedKnotPositions(next.knots, spanHost1.knots);

  if (Object.keys(changedByBrace1).length === 0) {
    return { knots: spanHost1.knots };
  }

  const nextLeaves = recomputeKnotDependentGeometry(next.leaves, changedByBrace1);
  const coneHost = recomputeConeHostKnotGeometry(nextLeaves, spanHost1.knots);
  const spanHost2 = recomputeSpanHostKnotGeometry(next.braces, coneHost.knots);
  return { knots: spanHost2.knots, leaves: nextLeaves };
});
