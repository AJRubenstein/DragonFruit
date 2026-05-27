import * as THREE from 'three';
import { BrushType } from './supportPainterTypes';

export interface ClientAdjacencyMap {
  faceCount: number;
  faceToFaces: number[][];
  faceNormals: THREE.Vector3[];
  faceCentroids: THREE.Vector3[];
  faceZBounds: { min: number; max: number }[];
}

/**
 * Builds a high-performance face adjacency map and spatial cache on the client side
 * directly from the Three.js BufferGeometry, avoiding duplicate uploads to Rust.
 */
export function buildClientAdjacencyMap(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): ClientAdjacencyMap {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) {
    return { faceCount: 0, faceToFaces: [], faceNormals: [], faceCentroids: [], faceZBounds: [] };
  }
  const positions = posAttr.array;
  const faceCount = posAttr.count / 3;

  const faceToFaces: number[][] = Array.from({ length: faceCount }, () => []);
  const faceNormals: THREE.Vector3[] = [];
  const faceCentroids: THREE.Vector3[] = [];
  const faceZBounds: { min: number; max: number }[] = [];

  // Quantization key for vertex welding (5 decimal places, 1e-5 mm tolerance)
  const vertexToFacesMap = new Map<string, number[]>();

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();

  const getVertexKey = (x: number, y: number, z: number): string => {
    return `${Math.round(x * 100000)},${Math.round(y * 100000)},${Math.round(z * 100000)}`;
  };

  for (let f = 0; f < faceCount; f++) {
    const o = f * 9;
    v0.set(positions[o], positions[o + 1], positions[o + 2]).applyMatrix4(matrixWorld);
    v1.set(positions[o + 3], positions[o + 4], positions[o + 5]).applyMatrix4(matrixWorld);
    v2.set(positions[o + 6], positions[o + 7], positions[o + 8]).applyMatrix4(matrixWorld);

    // 1. Centroid
    const centroid = new THREE.Vector3(
      (v0.x + v1.x + v2.x) / 3,
      (v0.y + v1.y + v2.y) / 3,
      (v0.z + v1.z + v2.z) / 3
    );
    faceCentroids.push(centroid);

    // 2. Normal
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    faceNormals.push(normal);

    // 3. Z Bounds
    const minZ = Math.min(v0.z, v1.z, v2.z);
    const maxZ = Math.max(v0.z, v1.z, v2.z);
    faceZBounds.push({ min: minZ, max: maxZ });

    // 4. Welding index
    const k0 = getVertexKey(v0.x, v0.y, v0.z);
    const k1 = getVertexKey(v1.x, v1.y, v1.z);
    const k2 = getVertexKey(v2.x, v2.y, v2.z);

    for (const key of [k0, k1, k2]) {
      let list = vertexToFacesMap.get(key);
      if (!list) {
        list = [];
        vertexToFacesMap.set(key, list);
      }
      list.push(f);
    }
  }

  // Build Face-to-Face Adjacency (faces sharing at least 2 coincident vertices)
  const sharedCounts = new Map<number, number>();

  for (let f = 0; f < faceCount; f++) {
    const o = f * 9;
    v0.set(positions[o], positions[o + 1], positions[o + 2]).applyMatrix4(matrixWorld);
    v1.set(positions[o + 3], positions[o + 4], positions[o + 5]).applyMatrix4(matrixWorld);
    v2.set(positions[o + 6], positions[o + 7], positions[o + 8]).applyMatrix4(matrixWorld);

    const k0 = getVertexKey(v0.x, v0.y, v0.z);
    const k1 = getVertexKey(v1.x, v1.y, v1.z);
    const k2 = getVertexKey(v2.x, v2.y, v2.z);

    sharedCounts.clear();
    for (const key of [k0, k1, k2]) {
      const list = vertexToFacesMap.get(key) || [];
      for (const other of list) {
        if (other === f) continue;
        sharedCounts.set(other, (sharedCounts.get(other) || 0) + 1);
      }
    }

    for (const [other, count] of sharedCounts.entries()) {
      if (count >= 2) {
        faceToFaces[f].push(other);
      }
    }
  }

  return {
    faceCount,
    faceToFaces,
    faceNormals,
    faceCentroids,
    faceZBounds,
  };
}

/**
 * Executes a high-performance client-side region-wrapping search based on the active smart brush.
 */
export function proposeRegionOnClient(
  map: ClientAdjacencyMap,
  seedFaceIndex: number,
  brushType: BrushType
): number[] {
  if (seedFaceIndex < 0 || seedFaceIndex >= map.faceCount) return [];

  switch (brushType) {
    case 'MacroFace':
      return walkMacroFace(map, seedFaceIndex);
    case 'Ridge':
      return walkRidge(map, seedFaceIndex);
    case 'CylinderSides':
      return walkCylinderSides(map, seedFaceIndex);
    case 'CylinderMinima':
      return walkCylinderMinima(map, seedFaceIndex);
    case 'Point':
      return walkPoint(map, seedFaceIndex);
    case 'Ring':
      return walkRing(map, seedFaceIndex);
    default:
      // Legacy 1-ring fallback
      if (map.faceNormals[seedFaceIndex].z <= 0.2) {
        const list = [seedFaceIndex, ...map.faceToFaces[seedFaceIndex]];
        return list.filter((idx) => map.faceNormals[idx].z <= 0.0);
      }
      return [];
  }
}

// --- Smart Brush Graph Search Walks ---

function walkMacroFace(map: ClientAdjacencyMap, seed: number): number[] {
  const visited = new Set<number>();
  const queue: number[] = [seed];
  visited.add(seed);

  const seedNormal = map.faceNormals[seed];
  if (seedNormal.z > 0.2) return [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const adjs = map.faceToFaces[curr];

    for (const adj of adjs) {
      if (!visited.has(adj)) {
        const nAdj = map.faceNormals[adj];
        if (nAdj.z <= 0.2) {
          const normalDeviation = seedNormal.angleTo(nAdj);
          const nCurr = map.faceNormals[curr];
          const edgeDihedral = nCurr.angleTo(nAdj);

          // 35 deg = 0.61 rad, 25 deg = 0.43 rad
          if (normalDeviation < 0.61 && edgeDihedral < 0.43) {
            visited.add(adj);
            queue.push(adj);
          }
        }
      }
    }
  }

  return Array.from(visited).filter((idx) => map.faceNormals[idx].z <= 0.0);
}

function walkRidge(map: ClientAdjacencyMap, seed: number): number[] {
  const visited = new Set<number>();
  const seedNormal = map.faceNormals[seed];
  if (seedNormal.z > 0.2) return [];

  // Checks on-the-fly if face sits on a crease fold (angle with any neighbor > 12 deg / 0.21 rad)
  const isCrease = (f: number): boolean => {
    const norm = map.faceNormals[f];
    for (const adj of map.faceToFaces[f]) {
      if (norm.angleTo(map.faceNormals[adj]) > 0.21) return true;
    }
    return false;
  };

  if (!isCrease(seed)) return [];
  visited.add(seed);

  const getCreaseNeighbors = (f: number): { adj: number; angle: number }[] => {
    const norm = map.faceNormals[f];
    const list: { adj: number; angle: number }[] = [];
    for (const adj of map.faceToFaces[f]) {
      if (visited.has(adj)) continue;
      if (map.faceNormals[adj].z > 0.2) continue;
      const angle = norm.angleTo(map.faceNormals[adj]);
      if (angle > 0.21) {
        list.push({ adj, angle });
      }
    }
    list.sort((a, b) => b.angle - a.angle);
    return list;
  };

  const candidates = getCreaseNeighbors(seed);
  
  if (candidates.length > 0) {
    let curr = candidates[0].adj;
    visited.add(curr);
    while (true) {
      const next = getCreaseNeighbors(curr);
      if (next.length === 0) break;
      curr = next[0].adj;
      visited.add(curr);
    }
  }

  if (candidates.length > 1) {
    let curr = candidates[1].adj;
    visited.add(curr);
    while (true) {
      const next = getCreaseNeighbors(curr);
      if (next.length === 0) break;
      curr = next[0].adj;
      visited.add(curr);
    }
  }

  return Array.from(visited).filter((idx) => map.faceNormals[idx].z <= 0.0);
}

function walkCylinderSides(map: ClientAdjacencyMap, seed: number): number[] {
  const visited = new Set<number>();
  const queue: number[] = [];

  const isAnisotropicCylinder = (f: number): boolean => {
    const norm = map.faceNormals[f];
    const angles = map.faceToFaces[f].map((adj) => norm.angleTo(map.faceNormals[adj]));
    if (angles.length === 0) return false;
    const maxAngle = Math.max(...angles);
    const minAngle = Math.min(...angles);
    // Anisotropic cylinder condition: curved in one direction (> 0.03 rad) and flat in another (< 0.05 rad)
    return maxAngle > 0.03 && minAngle < 0.05;
  };

  if (map.faceNormals[seed].z <= 0.2 && isAnisotropicCylinder(seed)) {
    queue.push(seed);
    visited.add(seed);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const adjs = map.faceToFaces[curr];
      for (const adj of adjs) {
        if (!visited.has(adj)) {
          if (map.faceNormals[adj].z <= 0.2 && isAnisotropicCylinder(adj)) {
            visited.add(adj);
            queue.push(adj);
          }
        }
      }
    }
  }

  return Array.from(visited).filter((idx) => map.faceNormals[idx].z <= 0.0);
}

function walkCylinderMinima(map: ClientAdjacencyMap, seed: number): number[] {
  const visited = new Set<number>();

  const isAnisotropicCylinder = (f: number): boolean => {
    const norm = map.faceNormals[f];
    const angles = map.faceToFaces[f].map((adj) => norm.angleTo(map.faceNormals[adj]));
    if (angles.length === 0) return false;
    const maxAngle = Math.max(...angles);
    const minAngle = Math.min(...angles);
    return maxAngle > 0.03 && minAngle < 0.05;
  };

  if (map.faceNormals[seed].z <= 0.2 && isAnisotropicCylinder(seed)) {
    visited.add(seed);

    const getCylinderCandidates = (f: number): number[] => {
      const list: number[] = [];
      for (const adj of map.faceToFaces[f]) {
        if (visited.has(adj)) continue;
        if (map.faceNormals[adj].z > 0.2) continue;
        if (isAnisotropicCylinder(adj)) {
          list.push(adj);
        }
      }
      list.sort((a, b) => map.faceNormals[a].z - map.faceNormals[b].z);
      return list;
    };

    const candidates = getCylinderCandidates(seed);

    if (candidates.length > 0) {
      let curr = candidates[0];
      visited.add(curr);
      while (true) {
        const next = getCylinderCandidates(curr);
        if (next.length === 0) break;
        curr = next[0];
        visited.add(curr);
      }
    }

    if (candidates.length > 1) {
      let curr = candidates[1];
      visited.add(curr);
      while (true) {
        const next = getCylinderCandidates(curr);
        if (next.length === 0) break;
        curr = next[0];
        visited.add(curr);
      }
    }
  }

  return Array.from(visited).filter((idx) => map.faceNormals[idx].z <= 0.0);
}

function walkPoint(map: ClientAdjacencyMap, seed: number): number[] {
  const proposed: number[] = [];
  const dists = new Map<number, number>();
  
  interface DijkstraState {
    cost: number;
    face: number;
  }

  const queue: DijkstraState[] = [];
  if (map.faceNormals[seed].z <= 0.2) {
    const rLimit = 8.0; // mm
    dists.set(seed, 0);
    queue.push({ cost: 0, face: seed });

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const { cost, face } = queue.shift()!;

      if (cost > rLimit) continue;
      if (!proposed.includes(face)) {
        proposed.push(face);
      }

      const centroidCurr = map.faceCentroids[face];
      const adjs = map.faceToFaces[face];

      for (const adj of adjs) {
        if (map.faceNormals[adj].z <= 0.2) {
          const centroidAdj = map.faceCentroids[adj];
          const stepCost = centroidCurr.distanceTo(centroidAdj);
          const nextCost = cost + stepCost;

          const currentBest = dists.get(adj) ?? Infinity;
          if (nextCost < currentBest && nextCost <= rLimit) {
            dists.set(adj, nextCost);
            queue.push({ cost: nextCost, face: adj });
          }
        }
      }
    }
  }

  return proposed.filter((idx) => map.faceNormals[idx].z <= 0.0);
}

function walkRing(map: ClientAdjacencyMap, seed: number): number[] {
  const visited = new Set<number>();
  const queue: number[] = [];

  if (map.faceNormals[seed].z <= 0.2) {
    const seedCentroid = map.faceCentroids[seed];
    const seedZ = seedCentroid.z;

    queue.push(seed);
    visited.add(seed);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const adjs = map.faceToFaces[curr];

      for (const adj of adjs) {
        if (!visited.has(adj)) {
          if (map.faceNormals[adj].z <= 0.2) {
            const zBounds = map.faceZBounds[adj];
            if (zBounds.min <= seedZ + 1.0 && zBounds.max >= seedZ - 1.0) {
              visited.add(adj);
              queue.push(adj);
            }
          }
        }
      }
    }
  }

  return Array.from(visited).filter((idx) => map.faceNormals[idx].z <= 0.0);
}
