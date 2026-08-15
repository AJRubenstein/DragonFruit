export type BracePair<T> = { a: T; b: T };

export function applyInitialPattern<T>(
    pairs: BracePair<T>[],
    place: (low: T, high: T, section: 'initial') => void,
): void {
    for (const edge of pairs) {
        place(edge.a, edge.b, 'initial');
    }
}
