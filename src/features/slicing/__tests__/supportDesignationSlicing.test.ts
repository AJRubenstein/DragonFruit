import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { LoadedModel } from '@/features/scene/useSceneCollectionManager';
import type { MaterialProfile, PrinterProfile } from '@/features/profiles/profileStore';
import {
  effectiveModelTriangleCount,
  getModelTriangleCount,
  buildSolidSliceMeshForWasm,
} from '../rasterLayerZipExport';

function createMockModel(
  id: string,
  triangleCount: number,
  isSupportGeometry?: boolean,
  nativeRepairReport?: { model_triangle_count?: number | null; likely_support_geometry?: boolean },
): LoadedModel {
  const positions = new Float32Array(triangleCount * 9);
  for (let i = 0; i < positions.length; i++) {
    positions[i] = (i + 1) * 0.1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  return {
    id,
    name: id,
    visible: true,
    color: '#a3a3a3',
    polygonCount: triangleCount,
    isSupportGeometry,
    fileUrl: '',
    geometry: {
      geometry,
      bbox: new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20)),
      center: new THREE.Vector3(0, 0, 10),
      size: new THREE.Vector3(20, 20, 20),
      flatteningPlanes: [],
      meshDefects: nativeRepairReport ? ({ nativeRepairReport } as any) : undefined,
    },
    transform: {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
    },
  } as LoadedModel;
}

const mockPrinterProfile: PrinterProfile = {
  id: 'test-printer',
  name: 'Test Printer',
  manufacturer: 'Test',
  buildVolumeMm: { width: 200, depth: 200, height: 200 },
  display: {
    resolutionX: 1000,
    resolutionY: 1000,
    outputFormat: '.nanodlp',
    mirrorX: false,
    mirrorY: false,
  },
} as PrinterProfile;

const mockMaterialProfile: MaterialProfile = {
  id: 'test-material',
  name: 'Test Material',
  layerHeightMm: 0.05,
} as MaterialProfile;

test('effectiveModelTriangleCount handles isSupportGeometry true, false, and undefined', () => {
  const model10 = createMockModel('m1', 10);
  assert.equal(getModelTriangleCount(model10), 10);

  // isSupportGeometry === true -> 0 model triangles (100% support)
  const supportModel = createMockModel('s1', 10, true);
  assert.equal(effectiveModelTriangleCount(supportModel), 0);

  // isSupportGeometry === false -> 10 model triangles (100% model)
  const modelOnlyModel = createMockModel('mOnly', 10, false);
  assert.equal(effectiveModelTriangleCount(modelOnlyModel), 10);

  // isSupportGeometry === undefined -> fallback to repair report bounds
  const reportSplitModel = createMockModel('r1', 10, undefined, { model_triangle_count: 4 });
  assert.equal(effectiveModelTriangleCount(reportSplitModel), 4);

  const reportSupportModel = createMockModel('r2', 10, undefined, { likely_support_geometry: true });
  assert.equal(effectiveModelTriangleCount(reportSupportModel), 0);

  const reportUnspecifiedModel = createMockModel('r3', 10, undefined);
  assert.equal(effectiveModelTriangleCount(reportUnspecifiedModel), 10);
});

test('buildSolidSliceMeshForWasm partitions designated support models into support section', async () => {
  const modelPart = createMockModel('m1', 2, false); // 2 model triangles
  const supportPart = createMockModel('s1', 3, true); // 3 support triangles

  const solidMesh = await buildSolidSliceMeshForWasm({
    models: [modelPart, supportPart],
    printerProfile: mockPrinterProfile,
    materialProfile: mockMaterialProfile,
    filenameBase: 'test_export',
  });

  // Model triangle count must equal designated model triangles (2)
  assert.equal(solidMesh.modelTriangleCount, 2);
  // Total triangle count in collector must equal 5 (2 model + 3 support)
  assert.equal(solidMesh.trianglesXYZ.length / 9, 5);
});
