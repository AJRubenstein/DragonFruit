import assert from 'node:assert/strict';
import test from 'node:test';

import { captureSupportEditSnapshot } from '../history/supportEditHistory';
import { setSnapshot, getSnapshot } from '../state';
import { createEmptySupportCollections, SUPPORT_COLLECTION_KEYS } from '../supportTypeRegistry';

/**
 * The edit-history snapshot carried a `kickstand` view beside `support`. Every
 * collection that view holds is already in `support`, so a change to any of
 * them is visible without it -- which is why comparing the view separately
 * could never detect a difference the support comparison had missed.
 */

function seed(kickstandId: string) {
    setSnapshot({
        ...createEmptySupportCollections(),
        selectedId: null,
        roots: { 'r1': { id: 'r1', modelId: 'm1' } },
        knots: { 'k1': { id: 'k1', parentShaftId: 's1', pos: { x: 0, y: 0, z: 1 }, diameter: 1 } },
        kickstands: {
            [kickstandId]: {
                id: kickstandId, modelId: 'm1', rootId: 'r1',
                hostKnotId: 'k1', hostSegmentId: 's1', segments: [],
            },
        },
    } as unknown as ReturnType<typeof getSnapshot>);
}

test('the support half of the snapshot already carries kickstands', () => {
    seed('ks-1');
    const snapshot = captureSupportEditSnapshot();

    assert.ok('kickstands' in snapshot.support, 'support does not carry kickstands');
    assert.deepEqual(Object.keys(snapshot.support.kickstands), ['ks-1']);
});

test('a kickstand change is visible in the support half alone', () => {
    seed('ks-1');
    const before = captureSupportEditSnapshot();

    seed('ks-2');
    const after = captureSupportEditSnapshot();

    assert.notEqual(
        JSON.stringify(before.support.kickstands),
        JSON.stringify(after.support.kickstands),
        'a kickstand change did not show in the support snapshot',
    );
});

test('every collection the kickstand view held is a support collection', () => {
    // What makes the separate view redundant rather than merely duplicated.
    for (const key of ['kickstands', 'roots', 'knots'] as const) {
        assert.ok(
            (SUPPORT_COLLECTION_KEYS as readonly string[]).includes(key),
            `${key} is not part of SupportState, so the view held something unique`,
        );
    }
});
