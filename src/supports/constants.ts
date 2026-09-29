/**
 * Derived constants for support geometry.
 * 
 * Note: User-adjustable defaults are in Settings/defaults.ts
 * This file contains only derived/calculated values.
 */

// --- Joint Sizing ---
/** How much larger the joint diameter is compared to the shaft/body diameter */
export const JOINT_DIAMETER_OFFSET_MM = 0.1;

/**
 * Calculate joint diameter from shaft/body diameter.
 */
export function getJointDiameter(shaftDiameter: number): number {
    return shaftDiameter + JOINT_DIAMETER_OFFSET_MM;
}

/**
 * Calculate joint radius from shaft/body diameter.
 */
export function getJointRadius(shaftDiameter: number): number {
    return getJointDiameter(shaftDiameter) / 2;
}

// --- Member sizing ---
/**
 * Least shaft diameter a hosted member takes, as a fraction of the host shaft
 * it sprouts from.
 *
 * A host trunk's diameter rides the model factors (height, print scale, mass
 * per support) while a hosted member is built from the profile band, so on a
 * scaled part a branch came out at the band beside a markedly fatter trunk —
 * the "supports read thin next to their hosts" report. The two meet at the
 * knot, so the member is floored here: a step between them is right (a member
 * carries a fraction of the host's load) but not a needle. The floor is a
 * maximum with the band, so a host at the band is untouched.
 */
export const MEMBER_HOST_SHAFT_RATIO = 0.8;

/**
 * The shaft a hosted member is built with: the profile band, floored at
 * {@link MEMBER_HOST_SHAFT_RATIO} of the host shaft it sprouts from.
 */
export function memberShaftDiameterMm(bandShaftMm: number, hostDiameterMm: number): number {
    return Math.max(bandShaftMm, hostDiameterMm * MEMBER_HOST_SHAFT_RATIO);
}
