import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExportManager } from './ExportManager';
import type { LoadedModel } from '@/features/scene/useSceneCollectionManager';

test('exportModelAsEmbeddedBinaryStlBytes concatenates sections if present to prevent scramble', () => {
  // 1. Create model section geometry: a single triangle with positions [0,0,0, 1,0,0, 0,1,0]
  const modelGeom = new THREE.BufferGeometry();
  const modelPos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  modelGeom.setAttribute('position', new THREE.BufferAttribute(modelPos, 3));

  // 2. Create support section geometry: a single triangle with positions [0,0,1, 1,0,1, 0,1,1]
  const supportGeom = new THREE.BufferGeometry();
  const supportPos = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]);
  supportGeom.setAttribute('position', new THREE.BufferAttribute(supportPos, 3));

  // 3. Create main geometry (which would normally be scrambled by BVH)
  const mainGeom = new THREE.BufferGeometry();
  // Different order: support first, then model
  const mainPos = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
  mainGeom.setAttribute('position', new THREE.BufferAttribute(mainPos, 3));

  const mockModel = {
    id: 'test-model',
    name: 'test-model.stl',
    geometry: {
      geometry: mainGeom,
      center: new THREE.Vector3(0, 0, 0),
      meshDefects: {
        modelSectionGeometry: modelGeom,
        supportSectionGeometry: supportGeom,
      },
    },
    transform: {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    },
  } as unknown as LoadedModel;

  // Call the private static method via index access
  const bytes = (ExportManager as any).exportModelAsEmbeddedBinaryStlBytes(mockModel);
  assert.ok(bytes instanceof Uint8Array);

  // Parse header and check triangle count
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(80, true);
  assert.equal(triCount, 2);

  // Read positions out of the binary STL records (each record is 50 bytes: 12 normal + 36 vertices + 2 attribute)
  // Triangle 0 positions (first triangle should be from model section, i.e., [0,0,0, 1,0,0, 0,1,0])
  const getF32 = (offset: number) => view.getFloat32(offset, true);
  
  // Tri 0 Vert 0
  const t0_v0_x = getF32(84 + 12);
  const t0_v0_y = getF32(84 + 16);
  const t0_v0_z = getF32(84 + 20);
  assert.equal(t0_v0_x, 0);
  assert.equal(t0_v0_y, 0);
  assert.equal(t0_v0_z, 0);

  // Tri 1 Vert 0 (second triangle should be from support section, i.e., [0,0,1, 1,0,1, 0,1,1])
  const t1_v0_x = getF32(84 + 50 + 12);
  const t1_v0_y = getF32(84 + 50 + 16);
  const t1_v0_z = getF32(84 + 50 + 20);
  assert.equal(t1_v0_x, 0);
  assert.equal(t1_v0_y, 0);
  assert.equal(t1_v0_z, 1);
});
