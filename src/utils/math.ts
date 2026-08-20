/**
 * Constrain `value` to [`min`, `max`].
 *
 * Resolves an inverted range (min > max) in favour of `min`.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Snap `value` to a grid of `cellSize`, returning the integer cell index. */
export function quantizeToCell(value: number, cellSize: number): number {
    return Math.round(value / cellSize);
}

/** Round `value` to `scale` steps per unit (e.g. scale 1e5 keeps 5 decimals). */
export function quantizeToScale(value: number, scale: number): number {
    return Math.round(value * scale) / scale;
}
