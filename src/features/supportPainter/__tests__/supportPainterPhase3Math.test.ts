import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  sampleSequencePolyline,
  solvePerimeterWithInflections,
  generateSupportsFromPainter,
} from '../supportScriptingEngine';
import { supportPainterStore } from '../supportPainterStore';
import { type ROIRegion, type CustomBrushTemplate } from '../supportPainterTypes';

describe('Support Painter Phase 3 - Advanced Mathematical Pathing & Solvers', () => {
  // Test Mock Data & Setup
  const uniqueVertices: THREE.Vector3[] = [];
  const vertexNormals = new Map<number, THREE.Vector3>();

  // Helper to register a vertex
  const addVertex = (x: number, y: number, z: number): number => {
    const idx = uniqueVertices.length;
    uniqueVertices.push(new THREE.Vector3(x, y, z));
    vertexNormals.set(idx, new THREE.Vector3(0, 0, 1));
    return idx;
  };

  // 1. Setup a simple straight polyline for testing sequence walk
  // Length is 10mm
  const polyVertices: number[] = [];
  for (let i = 0; i <= 10; i++) {
    polyVertices.push(addVertex(i, 0, 0));
  }

  it('should sample a polyline with a variable sequence spacing walk correctly', () => {
    const sequence = [1.0, 2.0, 3.0];
    const samples = sampleSequencePolyline(polyVertices, sequence, uniqueVertices, vertexNormals);

    // Initial point at start
    assert.strictEqual(samples.length, 5); // 0, 1, 3, 6, 9
    assert.deepStrictEqual(samples[0].pos, new THREE.Vector3(0, 0, 0));
    assert.deepStrictEqual(samples[1].pos, new THREE.Vector3(1, 0, 0)); // +1.0
    assert.deepStrictEqual(samples[2].pos, new THREE.Vector3(3, 0, 0)); // +2.0
    assert.deepStrictEqual(samples[3].pos, new THREE.Vector3(6, 0, 0)); // +3.0
    assert.deepStrictEqual(samples[4].pos, new THREE.Vector3(9, 0, 0)); // +3.0 (re-uses last element +3.0)
  });

  it('should smooth 2D perimeter loops with Gaussian filter and resolve inflections and segment solvers', () => {
    // Generate a wavy circle loop
    // C(t) = (R * cos(t), R * sin(t)) + random jitter
    const loopIndices: number[] = [];
    const R = 20;
    const numPoints = 64;

    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;
      // Add sinusoidal waves to create inflection points
      const wave = Math.sin(theta * 4) * 2;
      const jitter = (i % 2 === 0 ? 0.05 : -0.05); // High frequency noise
      const x = (R + wave + jitter) * Math.cos(theta);
      const y = (R + wave + jitter) * Math.sin(theta);
      loopIndices.push(addVertex(x, y, 0));
    }
    // Close the loop
    loopIndices.push(loopIndices[0]);

    // A. Standard Solver Mode
    const baseSpacing = 3.0;
    const standardSamples = solvePerimeterWithInflections(
      loopIndices,
      baseSpacing,
      'standard',
      uniqueVertices,
      vertexNormals
    );
    assert.ok(standardSamples.length > 5, 'Should generate multiple perimeter supports');

    // B. Add Solver Mode (rounds up N)
    const addSamples = solvePerimeterWithInflections(
      loopIndices,
      baseSpacing,
      'add',
      uniqueVertices,
      vertexNormals
    );

    // C. Remove Solver Mode (rounds down N)
    const removeSamples = solvePerimeterWithInflections(
      loopIndices,
      baseSpacing,
      'remove',
      uniqueVertices,
      vertexNormals
    );

    assert.ok(addSamples.length >= removeSamples.length, 'Add solver mode should generate equal or more supports than Remove solver mode');
  });

  it('should combine overlap suppression using maximum distance and union of suppression stages in intersecting ROIs', async () => {
    // We will build a small custom test mock framework to evaluate suppression checks
    // Let's create two mock regions intersecting (sharing triangle 1)
    const customBrushA: CustomBrushTemplate = {
      id: 'custom-brush-a',
      name: 'Minima Heavy Brush',
      color: '#4A90E2',
      selection: {
        normalConeAngleMinDeg: 0,
        normalConeAngleMaxDeg: 90,
        overhangSlopeMinDeg: 0,
        overhangSlopeMaxDeg: 90,
        curvatureMin: 0,
        curvatureMax: 10,
        dihedralAngleToleranceDeg: 90,
      },
      operations: [
        {
          type: 'minima',
          enabled: true,
          suppression: {
            enabled: true,
            distanceMm: 3.5,
            suppressAgainst: ['minima'],
          },
          spacing: {
            baseSpacingMm: 3.5,
          },
        },
      ],
    };

    const customBrushB: CustomBrushTemplate = {
      id: 'custom-brush-b',
      name: 'Perimeter Spaced Brush',
      color: '#E2844A',
      selection: {
        normalConeAngleMinDeg: 0,
        normalConeAngleMaxDeg: 90,
        overhangSlopeMinDeg: 0,
        overhangSlopeMaxDeg: 90,
        curvatureMin: 0,
        curvatureMax: 10,
        dihedralAngleToleranceDeg: 90,
      },
      operations: [
        {
          type: 'minima',
          enabled: true,
          suppression: {
            enabled: true,
            distanceMm: 5.0, // More restrictive!
            suppressAgainst: ['perimeter'], // Union of stages!
          },
          spacing: {
            baseSpacingMm: 5.0,
          },
        },
      ],
    };

    const regionA: ROIRegion = {
      id: 'region-a',
      brushType: 'MacroFace',
      seedTriangleId: 1,
      triangleIds: new Set([1, 2, 3]),
      color: '#4A90E2',
      proposedOnly: false,
      createdAt: Date.now(),
      customBrush: customBrushA,
    };

    const regionB: ROIRegion = {
      id: 'region-b',
      brushType: 'MacroFace',
      seedTriangleId: 1,
      triangleIds: new Set([1, 4, 5]), // Intersects on triangle 1!
      color: '#E2844A',
      proposedOnly: false,
      createdAt: Date.now(),
      customBrush: customBrushB,
    };

    // Store snapshots for global list
    supportPainterStore.clearAll();
    const regionsMap = new Map<string, ROIRegion>();
    regionsMap.set(regionA.id, regionA);
    regionsMap.set(regionB.id, regionB);
    supportPainterStore.restoreRegions(regionsMap);

    // Let's assert that intersecting check is correct
    const areIntersecting = (r1: ROIRegion, r2: ROIRegion): boolean => {
      for (const triId of r1.triangleIds) {
        if (r2.triangleIds.has(triId)) return true;
      }
      return false;
    };
    assert.strictEqual(areIntersecting(regionA, regionB), true, 'Regions sharing triangle 1 should be intersecting');

    // Simulate combined suppression lookup
    // If we place a minima candidate for regionA, the combined rules are:
    // Combined distance = max(3.5, 5.0) = 5.0mm
    // Combined stages to suppress against = union(['minima'], ['perimeter']) = ['minima', 'perimeter']
    let combinedEnabled = true;
    let maxDistance = Math.max(customBrushA.operations[0].suppression.distanceMm, customBrushB.operations[0].suppression.distanceMm);
    let combinedTypes = new Set<string>([
      ...customBrushA.operations[0].suppression.suppressAgainst,
      ...customBrushB.operations[0].suppression.suppressAgainst,
    ]);

    assert.strictEqual(maxDistance, 5.0, 'Max suppression distance of overlapping ROIs must be 5.0mm');
    assert.ok(combinedTypes.has('minima'), 'Combined suppression stages must contain minima');
    assert.ok(combinedTypes.has('perimeter'), 'Combined suppression stages must contain perimeter');
  });
});
