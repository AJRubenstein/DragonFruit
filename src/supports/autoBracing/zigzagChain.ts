/**
 * Zigzag chains: a continuous braced path where each link ends exactly
 * where the next begins, alternating trunk ends while climbing by the
 * edge rise (dz) each link — \/\/\/ instead of independent diagonals.
 * Unlike the fixed-interval ladder, the chain steps by its own rise so
 * consecutive links join seamlessly.
 */
export interface ZigZagEdge<E> {
    a: E;
    b: E;
    /** Horizontal distance between the ends — the per-link rise. */
    hDist: number;
}

const MAX_CHAIN_LINKS = 200;

export function runZigZagChain<E>(
    edges: ZigZagEdge<E>[],
    startZ: number,
    maxZ: number,
    firstSection: 'initial' | 'repeating',
    place: (low: E, high: E, section: 'initial' | 'repeating', atZ: number) => void,
): void {
    edges.forEach((edge, edgeIndex) => {
        if (!(edge.hDist > 0)) return;
        // Alternate the starting end per edge so neighboring chains mirror.
        let low = edgeIndex % 2 === 0 ? edge.a : edge.b;
        let high = edgeIndex % 2 === 0 ? edge.b : edge.a;
        let z = startZ;
        let section = firstSection;
        for (let link = 0; link < MAX_CHAIN_LINKS && z < maxZ; link++) {
            place(low, high, section, z);
            z += edge.hDist;
            [low, high] = [high, low];
            section = 'repeating';
        }
    });
}
