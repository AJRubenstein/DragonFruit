import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { createInteriorSideTester, isInteriorContact } from '../interiorSupportGeometry';

/** A single triangle in the z=0 plane with its face normal along +z. */
function planeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0,
        10, 0, 0,
        0, 10, 0,
    ], 3));
    geometry.computeVertexNormals();
    (geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree = new MeshBVH(geometry);
    return geometry;
}

test('an unstamped point is classified against the cavity wall, not assumed visible', () => {
    const geometry = planeGeometry();
    const isInterior = createInteriorSideTester(new Map([['m', geometry]]));

    assert.equal(isInterior({ x: 1, y: 1, z: 2 }), true, 'cavity side of the wall');
    assert.equal(isInterior({ x: 1, y: 1, z: -0.5 }), true, 'within the shell thickness of the wall');
    assert.equal(isInterior({ x: 1, y: 1, z: -5 }), false, 'outside the shell on the solid side');
});

test('a stamped placement surface wins over the geometry', () => {
    const geometry = planeGeometry();
    const isInteriorSide = createInteriorSideTester(new Map([['m', geometry]]));

    assert.equal(isInteriorContact({ pos: { x: 1, y: 1, z: 2 }, placementSurface: 'exterior' }, 'm', isInteriorSide), false);
    assert.equal(isInteriorContact({ pos: { x: 1, y: 1, z: -5 }, placementSurface: 'interior' }, 'm', isInteriorSide), true);
    assert.equal(isInteriorContact({ pos: { x: 1, y: 1, z: 2 } }, 'm', isInteriorSide), true,
        'no stamp goes to the cavity test');
});

test('no cavity geometry means no point is classified interior', () => {
    const isInterior = createInteriorSideTester(new Map());
    assert.equal(isInterior({ x: 0, y: 0, z: 0 }), false);
});
