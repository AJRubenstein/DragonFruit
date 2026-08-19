import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTwig } from '../SupportTypes/Twig/twigBuilder';

test('twigs are a bit smaller than the tip contact, and the free end scales with span', () => {
    const short = buildTwig({
        modelId: 'm',
        aPos: { x: 0, y: 0, z: 10 }, aNormal: { x: 0, y: 0, z: -1 },
        bPos: { x: 0, y: 0, z: 13 }, bNormal: { x: 0, y: 0, z: 1 },
    });
    const long = buildTwig({
        modelId: 'm',
        aPos: { x: 0, y: 0, z: 10 }, aNormal: { x: 0, y: 0, z: -1 },
        bPos: { x: 0, y: 0, z: 35 }, bNormal: { x: 0, y: 0, z: 1 },
    });

    assert.ok(!short.error && !long.error, 'twigs build');
    const shortSeg = short.twig.segments[0];
    const longSeg = long.twig.segments[0];
    const shortBottom = shortSeg.bottomJoint?.diameter ?? 0;
    const shortTop = shortSeg.topJoint?.diameter ?? 0;
    const longTop = longSeg.topJoint?.diameter ?? 0;

    // Host end: 0.9× the tip contact (0.3 default) → joints under 0.33.
    assert.ok(shortBottom < 0.3 * 1.1,
        `host end slightly smaller (${shortBottom.toFixed(3)})`);

    // Free end: shorter twig → thinner tip (3 mm span ≈ 60%, 25 mm ≈ full).
    assert.ok(shortTop < longTop,
        `short twig free end thinner (${shortTop.toFixed(3)} vs ${longTop.toFixed(3)})`);
    assert.ok(shortTop < shortBottom,
        'free end tapers below the host end on a short twig');
    assert.ok(Math.abs(longTop - shortBottom) < 1e-9,
        'a long twig keeps the full free-end diameter');
});
