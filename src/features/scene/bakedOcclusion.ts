import * as THREE from 'three';
import { invoke } from '@tauri-apps/api/core';
import { expandGeometryToTriangleSoup } from '@/utils/tauriMeshBridge';

/**
 * Model ambient occlusion, baked per vertex by the native side and attached to
 * the geometry as an attribute.
 *
 * The native bake (`bake_vertex_occlusion`, see
 * `dragonfruit-mesh-core::vertex_occlusion`) fires a hemisphere fan per vertex
 * from the mesh's own normal and returns one `f32` per vertex in the geometry's
 * own order, so this module's whole job is to fetch it and set the attribute.
 *
 * Why per-vertex, rather than the volumetric or screen-space approaches that
 * were tried first (all three measured, see `docs/dev/backlog.md`): a volumetric
 * grid is smooth but its grid *is* the resolution, so sub-voxel relief — a
 * figurine's feather scallops — bakes away to nothing, and a screen-space pass
 * doubles the frame time while compositing the whole scene. Per-vertex sampling
 * resolves whatever the mesh resolves, and it is affordable only because the
 * bake is native and parallel: 12 ms / 56 ms / 263 ms for 40k / 160k / 640k
 * triangle meshes, against ~15 µs *per vertex* in TypeScript before.
 */

/** The geometry attribute the bake's values are attached as. */
export const BAKED_OCCLUSION_ATTRIBUTE = 'aBakedAo';

/**
 * How much of the baked occlusion the material applies.
 *
 * Higher than it looks like it should be, because the bake weights each ray by
 * its hit distance: the field it returns is cleaner than an unweighted one, with
 * a flat base near 1.0 and crevices around 0.6, and this maps that range back to
 * the contrast the surface wants. Paired with `FALLOFF_EDGE_MULTIPLE` in
 * `dragonfruit-mesh-core`: changing one without the other makes the model flat or
 * dirty.
 */
export const BAKED_OCCLUSION_STRENGTH = 0.9;

/** Whether the native bake is reachable — false in the plain web build. */
export function canBakeOcclusion(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Bake one model's occlusion and return its per-vertex values, or `null` when
 * the native bake is unreachable (plain web build), the mesh has no usable
 * vertices, or the returned count does not line up with the geometry. Throws
 * only on a real IPC failure, which the caller logs and degrades from.
 *
 * **The soup is sent in the request body, and it is built from the very geometry
 * the values are attached to.** The obvious alternative — stage the mesh, then
 * bake from the staging buffer — is what the island scanner used to do, and it
 * is wrong for the same reason there: staging is process-wide mutable state that
 * repair, hole punching and hollowing all write, so a bake landing after one of
 * those writes computes occlusion for a *different* mesh and indexes it into
 * this one. That renders as misaligned triangles, on exactly the models that
 * happened to touch the buffer in between.
 */
export async function bakeOcclusionForGeometry(
  geometry: THREE.BufferGeometry,
): Promise<Float32Array | null> {
  if (!canBakeOcclusion()) return null;

  const soup = expandGeometryToTriangleSoup(geometry);
  const body = new Uint8Array(soup.buffer, soup.byteOffset, soup.byteLength);
  const payload = await invoke<ArrayBuffer | Uint8Array | number[]>(
    'bake_vertex_occlusion',
    body,
    { headers: { 'Content-Type': 'application/octet-stream' } },
  );

  const bytes = payload instanceof ArrayBuffer
    ? new Uint8Array(payload)
    : payload instanceof Uint8Array
      ? payload
      : new Uint8Array(payload);
  // Copy into an aligned buffer: the IPC buffer is not guaranteed to outlive the
  // call, and a Float32Array view needs 4-byte alignment.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const cornerValues = new Float32Array(copy.buffer);

  const values = mapCornerValuesToVertices(cornerValues, geometry);
  if (!values) {
    console.warn(
      '[ao] bake does not map onto this geometry:',
      `${cornerValues.length} corner values,`,
      `${geometry.getAttribute('position')?.count ?? 0} vertices,`,
      geometry.getIndex() ? 'indexed' : 'soup',
    );
    return null;
  }
  return values;
}

/**
 * Turn the bake's per-corner values into a per-*vertex* attribute, or `null` when
 * the two do not describe the same mesh.
 *
 * The bake returns one value per triangle corner, in the order the soup was
 * sent. A non-indexed geometry *is* that soup, so the mapping is the identity. An
 * indexed geometry is not: the index buffer is the corner order, and slot `s` of
 * it draws `cornerValues[s]` at vertex `index.getX(s)`. Reading it the other way
 * round — `values[vertex] = cornerValues[index.getX(vertex)]` — silently assumes
 * the buffer is its own inverse, which is true only for an identity index. On a
 * welded mesh it hands nearly every vertex a neighbouring vertex's occlusion,
 * which renders as a mosaic of triangles and looks exactly like broken shading.
 */
export function mapCornerValuesToVertices(
  cornerValues: Float32Array,
  geometry: THREE.BufferGeometry,
): Float32Array | null {
  const positionCount = geometry.getAttribute('position')?.count ?? 0;
  if (positionCount === 0) return null;

  const index = geometry.getIndex();
  if (!index) {
    return cornerValues.length === positionCount ? cornerValues : null;
  }

  const array = index.array as ArrayLike<number>;
  if (array.length !== cornerValues.length) return null;

  // Unreferenced vertices keep "open sky"; a baked mesh has none, but a
  // half-built attribute shades as black rather than as a bug if one appears.
  const values = new Float32Array(positionCount).fill(1);
  for (let slot = 0; slot < array.length; slot += 1) {
    values[array[slot]] = cornerValues[slot];
  }
  return values;
}
