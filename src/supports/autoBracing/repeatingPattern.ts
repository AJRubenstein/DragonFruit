import type { BracePair } from './initialPattern';

export function applyRepeatingPattern<T>(
    pairs: BracePair<T>[],
    place: (low: T, high: T, section: 'repeating') => void,
): void {
    for (const edge of pairs) {
        place(edge.a, edge.b, 'repeating');
    }
}
