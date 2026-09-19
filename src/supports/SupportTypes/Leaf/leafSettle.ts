import { registerSupportSettle } from '../../settle/seam';
import { recomputeConeHostKnotGeometry, recomputeSpanHostKnotGeometry } from '../../state';

/**
 * A written leaf settles the knots on the shaft it hangs from.
 *
 * Two passes, in this order: a leaf's contact cone sits on the model while its
 * knot rides a host shaft, so the cone-host pass moves the knot and the
 * span-host pass then moves whatever spans hang off the knots that moved. The
 * reverse order would compute the span endpoints from knots the cone pass had
 * not yet moved.
 *
 * The inputs are the state the write produced: the leaf collection already
 * replaced, every other collection still as it was.
 */
registerSupportSettle('leaf', ({ next }) => {
  const coneHost = recomputeConeHostKnotGeometry(next.leaves, next.knots);
  const spanHost = recomputeSpanHostKnotGeometry(next.braces, coneHost.knots);
  return { knots: spanHost.knots };
});
