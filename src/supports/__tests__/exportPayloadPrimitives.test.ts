import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { extractScopedSupportPayload } from '../../features/export/logic/supportExportReconstruction';
import { addRoot, addKnot, addSupportEntity, getSnapshot, resetStore } from '../state';

/**
 * The scoped payload carries each primitive once.
 *
 * It used to carry `kickstandRoots` and `kickstandKnots` beside `roots` and
 * `knots`, filtered by a different rule. Both were strict subsets: a kickstand's
 * root and host knot live in the shared collections like every other type's.
 */

const SOURCE = readFileSync(
    new URL('../../features/export/logic/supportExportReconstruction.ts', import.meta.url),
    'utf8',
);

const seg = (id: string) => ({
    id, diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 10 }, diameter: 1 },
});

function sceneWithKickstand() {
    resetStore();
    addRoot({
        id: 'r-t', modelId: 'm',
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('trunk', { id: 't', modelId: 'm', rootId: 'r-t', segments: [seg('s')] } as never);
    addKnot({ id: 'k', parentShaftId: 's', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1 } as never);
    addRoot({
        id: 'r-k', modelId: 'm',
        transform: { pos: { x: 5, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('kickstand', {
        id: 'ks', modelId: 'm', rootId: 'r-k',
        hostKnotId: 'k', hostSegmentId: 's', segments: [seg('sk')],
    } as never);
}

test('a kickstand root and host knot ride the shared arrays', () => {
    // The premise: nothing is lost by dropping the per-type arrays.
    sceneWithKickstand();
    const payload = extractScopedSupportPayload(getSnapshot(), ['m']);

    assert.ok(payload.roots.some((r) => r.id === 'r-k'), 'the kickstand root is in roots');
    assert.ok(payload.knots.some((k) => k.id === 'k'), 'the host knot is in knots');
});

test('the payload declares no per-type primitive arrays', () => {
    assert.ok(
        !/kickstandRoots|kickstandKnots/.test(SOURCE),
        'a per-type primitive array is back; every type reads the shared ones',
    );
});

test('the export document still nests the kickstand bundle', () => {
    // `serialisedAsBundle` is a real wire-format fact -- the loader unwraps
    // `{root, hostKnot, kickstand}` -- so the bundle stays; only the lookups
    // it builds from moved to the shared arrays.
    assert.match(SOURCE, /root, hostKnot, kickstand/, 'the bundled wire format is gone');
});
