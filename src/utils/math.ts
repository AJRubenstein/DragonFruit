/**
 * Constrain `value` to [`min`, `max`].
 *
 * Resolves an inverted range (min > max) in favour of `min`.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
