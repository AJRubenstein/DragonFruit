import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildAnchorBands, ANCHOR_SCALE_NONE } from '../autoSupport/anchorBands';
import type { DetectedIsland } from '../../volumeAnalysis/Islands/types';

function overhang(id: string, baseZ: number): DetectedIsland {
    return {
        id,
        source: 'overhang',
        contact: new THREE.Vector3(0, 0, baseZ),
        baseZ,
        areaMm2: 100,
    };
}

function voxel(id: string, baseZ: number): DetectedIsland {
    return {
        id,
        source: 'voxel',
        contact: new THREE.Vector3(0, 0, baseZ),
        baseZ,
        areaMm2: 100,
    };
}

test('multiple patches at similar heights form one cluster, all in-band', () => {
    const bands = buildAnchorBands(
        [overhang('a', 3.0), overhang('b', 3.5), overhang('c', 3.2)],
        5,
        0.7,
    );

    assert.equal(bands.clusterCount, 1);
    assert.deepEqual(bands.inBandIds.sort(), ['a', 'b', 'c']);
    assert.equal(bands.scaleById.get('a'), 0.7);
    assert.equal(bands.scaleById.get('c'), 0.7);
});

test('only the lowest cluster is anchored (higher shelves are suction surfaces)', () => {
    const bands = buildAnchorBands(
        [overhang('low', 3), overhang('high', 12)],
        5,
        0.7,
    );

    assert.equal(bands.clusterCount, 2);
    assert.deepEqual(bands.inBandIds, ['low'], 'only the first-printed cluster densifies');
    assert.equal(bands.scaleById.get('low'), 0.7);
    assert.equal(bands.scaleById.get('high'), ANCHOR_SCALE_NONE);
});

test('chain members beyond the cluster band are not anchors (staircase)', () => {
    const bands = buildAnchorBands(
        [overhang('z2', 2), overhang('z6', 6), overhang('z10', 10)],
        5,
        0.7,
    );

    // One chain cluster (gaps 4, 4 ≤ 5), but only members within 5 of the
    // cluster min (2) are in-band — z10 is 8 above the min: suction, not anchor.
    assert.equal(bands.clusterCount, 1);
    assert.deepEqual(bands.inBandIds.sort(), ['z2', 'z6']);
    assert.equal(bands.scaleById.get('z10'), ANCHOR_SCALE_NONE);
});

test('a gap larger than the band starts a new cluster (higher one not anchored)', () => {
    const bands = buildAnchorBands(
        [overhang('a', 2), overhang('b', 9)],
        5,
        0.7,
    );

    assert.equal(bands.clusterCount, 2);
    assert.deepEqual(bands.inBandIds, ['a'], 'only the lowest cluster is in-band');
    assert.equal(bands.scaleById.get('b'), ANCHOR_SCALE_NONE);
});

test('band height 0 disables densification', () => {
    const bands = buildAnchorBands([overhang('a', 3)], 0, 0.7);

    assert.equal(bands.clusterCount, 0);
    assert.equal(bands.inBandIds.length, 0);
    assert.equal(bands.scaleById.size, 0);
});

test('factor >= 1 disables densification (no denser-than-base allowed)', () => {
    const bands = buildAnchorBands([overhang('a', 3)], 5, 1);

    assert.equal(bands.clusterCount, 0);
    assert.equal(bands.inBandIds.length, 0);
});

test('non-overhang islands are ignored', () => {
    const bands = buildAnchorBands([voxel('v', 1), overhang('o', 10)], 5, 0.7);

    assert.equal(bands.clusterCount, 1);
    assert.deepEqual(bands.inBandIds, ['o']);
    assert.equal(bands.scaleById.has('v'), false);
});

test('deterministic for shuffled input', () => {
    const input = [overhang('a', 3), overhang('b', 9), overhang('c', 4), overhang('d', 14)];
    const first = buildAnchorBands(input, 5, 0.7);
    const second = buildAnchorBands(input.slice().reverse(), 5, 0.7);

    assert.deepEqual(first.inBandIds.sort(), second.inBandIds.sort());
    assert.equal(first.clusterCount, second.clusterCount);
});
