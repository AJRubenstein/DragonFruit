import assert from 'node:assert/strict';
import test from 'node:test';

import { getSnapshot, loadFromImportFormat, mergeFromImportFormat, resetStore } from '../state';
import type { DragonfruitImportFormat } from '../types';

/**
 * A brace knot hosted on a KICKSTAND segment must resolve to that segment.
 *
 * This is the one support relationship that spans what used to be two stores, and
 * it has broken twice: once when import remapped knots before kickstands, leaving
 * the knot pointing at an id nothing else used; and again when kickstands moved
 * onto SupportState while normalization still read the live store, which mid-import
 * holds the OUTGOING scene.
 *
 * Both regressions left the full suite green and were caught only by importing real
 * files, because nothing asserted the resolution itself. Resolution is observable
 * two ways -- no warning, and a host the store can still find -- so both are checked.
 */

const MODEL = 'model-a';

/** A kickstand whose shaft hosts one end of a brace. */
function buildKickstandHostedBraceFixture(): DragonfruitImportFormat {
    return {
        version: 1,
        meta: { source: 'kickstand-host-test', objectCenter: { x: 0, y: 0, z: 0 } },
        roots: [
            { id: 'root-a', modelId: MODEL, transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }, diameter: 3, diskHeight: 0.5, coneHeight: 1.5 },
        ],
        trunks: [
            {
                id: 'trunk-a',
                modelId: MODEL,
                rootId: 'root-a',
                segments: [{
                    id: 'seg-trunk',
                    type: 'straight',
                    diameter: 1,
                    bottomJoint: { id: 'seg-trunk-bot', pos: { x: 0, y: 0, z: 2 }, diameter: 1 },
                    topJoint: { id: 'seg-trunk-top', pos: { x: 0, y: 0, z: 12 }, diameter: 1 },
                }],
            },
        ],
        branches: [],
        leaves: [],
        twigs: [],
        sticks: [],
        // One end on the trunk, the other on the kickstand shaft: the crossing
        // relationship that regressed.
        braces: [
            { id: 'brace-a', modelId: MODEL, startKnotId: 'knot-on-trunk', endKnotId: 'knot-on-kickstand', profile: { diameter: 0.8 } },
        ],
        anchors: [],
        knots: [
            { id: 'knot-on-trunk', parentShaftId: 'seg-trunk', t: 0.5, pos: { x: 0, y: 0, z: 7 }, diameter: 1 },
            { id: 'knot-on-kickstand', parentShaftId: 'seg-kick', t: 0.5, pos: { x: 2, y: 0, z: 3 }, diameter: 1 },
        ],
        kickstands: [
            {
                root: {
                    id: 'kick-root',
                    modelId: MODEL,
                    transform: { pos: { x: 4, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
                    diameter: 2,
                    diskHeight: 0.4,
                    coneHeight: 0.6,
                },
                hostKnot: { id: 'kick-host-knot', parentShaftId: 'seg-trunk', t: 0.3, pos: { x: 0, y: 0, z: 5 }, diameter: 1 },
                kickstand: {
                    id: 'kick-a',
                    modelId: MODEL,
                    rootId: 'kick-root',
                    hostKnotId: 'kick-host-knot',
                    hostSegmentId: 'seg-trunk',
                    hostMinT: 0.2,
                    segments: [{
                        id: 'seg-kick',
                        type: 'straight',
                        diameter: 0.7,
                        bottomJoint: undefined,
                        topJoint: { id: 'seg-kick-top', pos: { x: 0, y: 0, z: 5 }, diameter: 0.7 },
                    }],
                    profile: { bodyDiameterMm: 0.7, terminalStartDiameterMm: 0.7, terminalEndDiameterMm: 0.9 },
                },
            },
        ],
    } as DragonfruitImportFormat;
}

/** Run `run`, returning the unresolved-host warnings it emitted. */
function captureUnresolvedWarnings(run: () => void): string[] {
    const warnings: string[] = [];
    const realWarn = console.warn;
    const realLog = console.log;
    console.warn = (...args: unknown[]) => {
        const first = String(args[0] ?? '');
        if (first.includes('unresolved brace host knot segment')) warnings.push(first);
    };
    console.log = () => {};
    try {
        run();
    } finally {
        console.warn = realWarn;
        console.log = realLog;
    }
    return warnings;
}

test('a brace knot hosted on a kickstand segment resolves on load', () => {
    resetStore();
    const warnings = captureUnresolvedWarnings(() => {
        loadFromImportFormat(buildKickstandHostedBraceFixture());
    });

    assert.deepEqual(warnings, [], 'kickstand-hosted brace knot should resolve');

    const state = getSnapshot();
    const knot = state.knots['knot-on-kickstand'];
    assert.ok(knot, 'knot survived the load');

    const kickstand = state.kickstands['kick-a'];
    assert.ok(kickstand, 'kickstand is in SupportState');
    assert.ok(
        kickstand.segments.some((segment) => segment.id === knot.parentShaftId),
        'knot still points at a segment the kickstand owns',
    );
});

test('a brace knot hosted on a kickstand segment resolves on merge', () => {
    resetStore();
    // Merge re-ids everything, so the knot host must be remapped in step with the
    // kickstand segments -- the ordering that broke the first time.
    const warnings = captureUnresolvedWarnings(() => {
        mergeFromImportFormat(buildKickstandHostedBraceFixture(), MODEL);
    });

    assert.deepEqual(warnings, [], 'kickstand-hosted brace knot should resolve through a merge');

    const state = getSnapshot();
    const kickstands = Object.values(state.kickstands);
    assert.equal(kickstands.length, 1, 'kickstand survived the merge');

    const kickstandSegmentIds = new Set(kickstands[0].segments.map((segment) => segment.id));
    const hostedKnots = Object.values(state.knots).filter((k) => kickstandSegmentIds.has(k.parentShaftId));
    assert.equal(hostedKnots.length, 1, 'exactly one knot is hosted on the kickstand shaft');
});

test('merging into a populated scene keeps kickstand-hosted knots resolved', () => {
    resetStore();
    // The regression that survived a green suite: normalization read the live
    // store, so with a scene already loaded it resolved incoming knots against the
    // OUTGOING kickstands.
    mergeFromImportFormat(buildKickstandHostedBraceFixture(), MODEL);

    const warnings = captureUnresolvedWarnings(() => {
        mergeFromImportFormat(buildKickstandHostedBraceFixture(), 'model-b');
    });

    assert.deepEqual(warnings, [], 'second import resolves against its own kickstands');

    const state = getSnapshot();
    assert.equal(Object.values(state.kickstands).length, 2, 'both kickstands present');

    for (const kickstand of Object.values(state.kickstands)) {
        const segmentIds = new Set(kickstand.segments.map((segment) => segment.id));
        const hosted = Object.values(state.knots).filter((k) => segmentIds.has(k.parentShaftId));
        assert.equal(hosted.length, 1, `kickstand ${kickstand.id} still hosts its knot`);
    }
});
