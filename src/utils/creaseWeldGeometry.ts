import * as THREE from 'three';

/** Faces meeting below this angle share a vertex; above it they keep their own. */
const DEFAULT_CREASE_DEG = 30;

/** Positions are compared at this many decimals, matching the mm scale models use. */
const POSITION_DECIMALS = 4;

/**
 * Indexes a triangle soup, sharing a vertex between faces whose normals agree to
 * within `creaseDeg` and splitting it where they do not.
 *
 * `mergeVertices` keeps two vertices apart whenever any attribute differs, so a
 * faceted mesh never shares anything and the GPU runs the vertex shader once per
 * corner. Clustering by normal instead keeps the faceting while sharing the rest,
 * which on a dense model removes most of the vertices and gives a simplifier the
 * connectivity it needs.
 *
 * Other attributes come across from the first corner that claims a vertex, which
 * holds for anything varying with position and normal — baked occlusion among
 * them. Returns the input untouched when it is already indexed.
 */
export function creaseWeldGeometry(
    geometry: THREE.BufferGeometry,
    creaseDeg: number = DEFAULT_CREASE_DEG,
): THREE.BufferGeometry {
    if (geometry.getIndex()) return geometry;

    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal) return geometry;

    const carried = Object.entries(geometry.attributes)
        .filter(([name]) => name !== 'position' && name !== 'normal')
        .map(([name, attribute]) => ({
            name,
            source: attribute as THREE.BufferAttribute,
            itemSize: (attribute as THREE.BufferAttribute).itemSize,
            values: [] as number[],
        }));

    const p = position.array as ArrayLike<number>;
    const n = normal.array as ArrayLike<number>;
    const count = position.count;
    const cosLimit = Math.cos((creaseDeg * Math.PI) / 180);

    const buckets = new Map<string, Array<{ nx: number; ny: number; nz: number; index: number }>>();
    const indices = new Uint32Array(count);
    const outPositions: number[] = [];
    const outNormals: number[] = [];

    for (let i = 0; i < count; i++) {
        const x = p[i * 3];
        const y = p[i * 3 + 1];
        const z = p[i * 3 + 2];
        const nx = n[i * 3];
        const ny = n[i * 3 + 1];
        const nz = n[i * 3 + 2];

        const key = `${x.toFixed(POSITION_DECIMALS)},${y.toFixed(POSITION_DECIMALS)},${z.toFixed(POSITION_DECIMALS)}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = [];
            buckets.set(key, bucket);
        }

        let index = -1;
        for (const entry of bucket) {
            if (entry.nx * nx + entry.ny * ny + entry.nz * nz >= cosLimit) {
                index = entry.index;
                break;
            }
        }
        if (index === -1) {
            index = outPositions.length / 3;
            outPositions.push(x, y, z);
            outNormals.push(nx, ny, nz);
            for (const attribute of carried) {
                const source = attribute.source.array as ArrayLike<number>;
                for (let c = 0; c < attribute.itemSize; c++) {
                    attribute.values.push(source[i * attribute.itemSize + c]);
                }
            }
            bucket.push({ nx, ny, nz, index });
        }
        indices[i] = index;
    }

    // Nothing shared: the mesh was already one vertex per corner, and rebuilding
    // it would only add an index buffer.
    if (outPositions.length / 3 >= count) return geometry;

    const welded = new THREE.BufferGeometry();
    welded.setAttribute('position', new THREE.BufferAttribute(new Float32Array(outPositions), 3));
    welded.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(outNormals), 3));
    for (const attribute of carried) {
        welded.setAttribute(
            attribute.name,
            new THREE.BufferAttribute(new Float32Array(attribute.values), attribute.itemSize),
        );
    }
    welded.setIndex(new THREE.BufferAttribute(indices, 1));
    return welded;
}
