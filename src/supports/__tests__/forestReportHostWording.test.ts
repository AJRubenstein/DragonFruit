import assert from 'node:assert/strict';
import test from 'node:test';

import { forestReportToText } from '../autoSupport/autoPlace';
import type { ForestReport } from '../autoSupport/types';

/**
 * The report's own wording: it describes hosts as a set, so the word has to
 * come from the registry's declared host types. Spelling "Trunks" in the
 * renderer would be a type name in a second place -- the thing the registry
 * exists to prevent -- while dropping the word for a generic "hosts" loses the
 * type the reader came for.
 */
test('the forest report names the declared host type, not a bare concept', () => {
    const report = {
        hostCount: 3,
        anchorCount: 0,
        leafCount: 2,
        branchCount: 1,
        stickCount: 0,
        twigCount: 0,
        trees: [],
        bareHosts: [{ id: 'v1', z: 10, shaftDiameterMm: 1, sizingNote: '' }],
        diagnostics: {
            candidatesBySource: { voxel: 0, minima: 0, intersection: 0, overhang: 0, stabilization: 0 },
            hostsByKind: { gridInfill: 2, coverageFill: 1, standalone: 1 },
            fanRefusals: {},
            mergeRefusals: {},
            consolidationRefusals: {},
            cavityFallbacks: [],
        },
    } as unknown as ForestReport;

    const text = forestReportToText(report);

    assert.ok(text.includes('Trunks by kind: grid 2'), `names the host type: ${text}`);
    assert.ok(text.includes('3 trunks · 2 leaves · 1 branches'), 'counts name their types');
    assert.ok(text.includes('STANDALONE TRUNKS'), 'the bare-host heading names the type');
});
