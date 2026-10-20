import * as THREE from 'three';

/**
 * The width of a tapering shaft at each point of a polyline approximating it.
 *
 * A curve is drawn as a run of straight pieces, so a taper across the whole
 * curve has to be shared out between them: each piece starts where the last
 * ended, rather than every piece carrying the full taper.
 *
 * Returns a reader rather than an array so a caller asks for the two widths a
 * piece needs without allocating per segment. With no `endDiameterMm` the width
 * is constant, which is the uniform shaft every caller had before.
 */
export function taperWidthAlong(
    pointCount: number,
    startDiameterMm: number,
    endDiameterMm?: number,
): (pointIndex: number) => number {
    const spans = Math.max(1, pointCount - 1);
    const end = endDiameterMm ?? startDiameterMm;
    if (Math.abs(end - startDiameterMm) < 1e-6) return () => startDiameterMm;
    return (pointIndex: number) => THREE.MathUtils.lerp(
        startDiameterMm,
        end,
        THREE.MathUtils.clamp(pointIndex / spans, 0, 1),
    );
}
