import * as THREE from 'three';
// Pinned to three-mesh-bvh@0.8.3 (same version drei bundles) to avoid version conflicts
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * Augment THREE.BufferGeometry with BVH acceleration methods.
 * This must be called once at app initialization.
 */
export function initializeBVH() {
  // Add BVH methods to BufferGeometry prototype
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  
  // Replace default raycast with accelerated version
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

/**
 * How many triangles a BVH leaf holds. three-mesh-bvh's own default is 10.
 *
 * 32 is measured on two real models (869k and 1.79M triangles, non-indexed
 * soups, the shape every import has): the build drops from 466ms to 287ms and
 * from 835ms to 508ms — a third of the build, on the import's critical path, and
 * three-mesh-bvh spends it on the SAH split evaluations a deeper tree needs.
 * Query cost moves the other way only slightly and only sometimes (2000 rays:
 * 38ms -> 18ms on the first model, 15ms -> 33ms on the second), and what the app
 * casts here is a handful of picking rays per frame, where 0.02ms a ray is not
 * the number to protect. The hit set is identical at every leaf size: the leaf
 * is a granularity, not an approximation.
 */
const BVH_MAX_LEAF_TRIS = 32;

/**
 * Add BVH acceleration to a geometry.
 * This builds a spatial acceleration structure that makes raycasting 100-1000x faster.
 * 
 * @param geometry - The geometry to accelerate
 * @returns The same geometry with BVH computed
 */
export function accelerateGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Check if computeBoundsTree is available (should be after initializeBVH)
  if (typeof geometry.computeBoundsTree === 'function') {
    console.log('[BVH] Computing bounds tree for geometry...');
    const startTime = performance.now();
    
    geometry.computeBoundsTree({ maxLeafTris: BVH_MAX_LEAF_TRIS });
    
    const endTime = performance.now();
    console.log(`[BVH] Bounds tree computed in ${(endTime - startTime).toFixed(2)}ms`);
  } else {
    console.warn('[BVH] computeBoundsTree not available. Did you call initializeBVH()?');
  }
  
  return geometry;
}

/**
 * Dispose BVH data from a geometry to free memory.
 * 
 * @param geometry - The geometry to clean up
 */
export function disposeGeometryBVH(geometry: THREE.BufferGeometry): void {
  if (typeof geometry.disposeBoundsTree === 'function') {
    geometry.disposeBoundsTree();
  }
}
