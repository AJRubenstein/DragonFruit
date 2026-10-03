import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { creaseWeldGeometry } from '../creaseWeldGeometry';

function soup(positions: number[], normals: number[]): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    return g;
}

/** Two coplanar triangles sharing an edge, every corner its own vertex. */
function flatQuad(): THREE.BufferGeometry {
    return soup(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0],
        Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
    );
}

test('shares vertices between faces that agree', () => {
    const welded = creaseWeldGeometry(flatQuad());
    assert.equal(welded.getAttribute('position').count, 4, 'the quad keeps four corners');
    assert.equal(welded.getIndex()?.count, 6, 'both triangles are still drawn');
});

test('keeps faces apart across a crease', () => {
    // Same two triangles, but the second faces +x: a 90 degree fold.
    const folded = soup(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0],
    );
    const welded = creaseWeldGeometry(folded, 30);
    assert.equal(welded.getAttribute('position').count, 6, 'no corner is shared across the fold');
});

test('preserves the drawn triangles', () => {
    const welded = creaseWeldGeometry(flatQuad());
    const index = welded.getIndex();
    const pos = welded.getAttribute('position');
    assert.ok(index);

    const drawn: string[] = [];
    for (let i = 0; i < index.count; i++) {
        const v = index.getX(i);
        drawn.push(`${pos.getX(v)},${pos.getY(v)},${pos.getZ(v)}`);
    }
    assert.deepEqual(drawn, [
        '0,0,0', '1,0,0', '0,1,0',
        '0,1,0', '1,0,0', '1,1,0',
    ], 'every corner resolves to the position it had before');
});

test('leaves an already indexed geometry alone', () => {
    const indexed = flatQuad();
    indexed.setIndex([0, 1, 2, 3, 4, 5]);
    assert.equal(creaseWeldGeometry(indexed), indexed);
});

test('carries other attributes onto the welded vertices', () => {
    const withAo = flatQuad();
    // One value per corner, distinct so the mapping is visible.
    withAo.setAttribute('aBakedAo', new THREE.BufferAttribute(new Float32Array([0.1, 0.2, 0.3, 0.3, 0.2, 0.4]), 1));

    const welded = creaseWeldGeometry(withAo);
    const ao = welded.getAttribute('aBakedAo');
    assert.ok(ao, 'the attribute survives the weld');
    assert.equal(ao.count, welded.getAttribute('position').count, 'one value per welded vertex');
    assert.equal(ao.itemSize, 1);
    // Corners 0,1,2 claim vertices 0,1,2; corner 5 is the only new one after that.
    assert.deepEqual(Array.from(ao.array as Float32Array).map((v) => +v.toFixed(2)), [0.1, 0.2, 0.3, 0.4]);
});

test('leaves a mesh with nothing to share alone', () => {
    const apart = soup(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5, 6, 5, 5, 5, 6, 5],
        Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
    );
    assert.equal(creaseWeldGeometry(apart), apart);
});
