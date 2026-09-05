import assert from 'node:assert/strict';
import test from 'node:test';

import {
    selectTypeForPlacement,
    typesForPlacementMetric,
    SUPPORT_TYPES,
    type SupportPlacementMetric,
} from '../supportTypeRegistry';
import { ANCHOR_HEIGHT_THRESHOLD_MM } from '../autoSupport/constants';

/**
 * Which type an automatic placement picks, by measurement.
 *
 * Three sites chose these by hand -- `useTrunkPlacement`,
 * `BranchPlacementController` and `gridPlacement` -- each comparing against a
 * constant it imported itself.
 */

const CUTOFF = 5;
const readSetting = () => CUTOFF;
const pick = (metric: SupportPlacementMetric, mm: number) =>
    selectTypeForPlacement(metric, mm, readSetting);

test('the two rules disagree about their boundary, as they always did', () => {
    // The span rule used `dist > cutoff`, the height rule `z < threshold`.
    assert.equal(pick('contactSpan', CUTOFF), 'twig');
    assert.equal(pick('tipHeight', ANCHOR_HEIGHT_THRESHOLD_MM), 'trunk');
});

test('a short span is a twig, a long one a stick', () => {
    assert.equal(pick('contactSpan', 0), 'twig');
    assert.equal(pick('contactSpan', CUTOFF - 0.001), 'twig');
    assert.equal(pick('contactSpan', CUTOFF), 'twig', 'the bound belongs to the lower type');
    assert.equal(pick('contactSpan', 50), 'stick');
});

test('a near-plate tip is an anchor, a higher one a trunk', () => {
    assert.equal(pick('tipHeight', 0), 'anchor');
    assert.equal(pick('tipHeight', ANCHOR_HEIGHT_THRESHOLD_MM - 0.001), 'anchor');
    assert.equal(pick('tipHeight', ANCHOR_HEIGHT_THRESHOLD_MM), 'trunk', 'the height rule gives the bound to the upper type');
    assert.equal(pick('tipHeight', 40), 'trunk');
});

test('the settings value is read, not the fallback', () => {
    // A user-raised cutoff should extend the twig range.
    const wide = (mm: number) => selectTypeForPlacement('contactSpan', mm, () => 20);
    assert.equal(wide(10), 'twig', 'inside the raised cutoff');
    assert.equal(wide(25), 'stick');
});

test('the fallback applies when the setting is absent', () => {
    const noSetting = (mm: number) => selectTypeForPlacement('contactSpan', mm, () => undefined);
    assert.equal(noSetting(4), 'twig');
    assert.equal(noSetting(6), 'stick');
});

test('every metric is covered with no gap and no overlap', () => {
    // Two types sharing a value, or a value no type claims, would make the
    // choice depend on registry order.
    for (const metric of ['contactSpan', 'tipHeight'] as const) {
        const rules = typesForPlacementMetric(metric);
        assert.ok(rules.length >= 2, `${metric} should have at least two types`);

        for (const mm of [0, 0.5, 4.999, 5, 5.001, 12, 100]) {
            const matches = rules.filter((d) => {
                const min = typeof d.placementRule!.minMm === 'number'
                    ? d.placementRule!.minMm
                    : d.placementRule!.minMm?.fallback;
                const max = typeof d.placementRule!.maxMm === 'number'
                    ? d.placementRule!.maxMm
                    : d.placementRule!.maxMm?.fallback;
                const owner = d.placementRule!.boundary ?? 'lower';
                const aboveMin = min === undefined || (owner === 'lower' ? mm > min : mm >= min);
                const belowMax = max === undefined || (owner === 'lower' ? mm <= max : mm < max);
                return aboveMin && belowMax;
            });
            assert.equal(matches.length, 1, `${metric} at ${mm}mm matched ${matches.length} types`);
        }
    }
});

test('exactly the automatic types declare a rule', () => {
    const ruled = SUPPORT_TYPES.filter((d) => d.placementRule).map((d) => d.id).sort();
    assert.deepEqual(ruled, ['anchor', 'stick', 'trunk', 'twig']);
});

test('an unmeasurable value picks nothing', () => {
    // NaN satisfies no comparison, so a type bounded on one side only would
    // otherwise claim it.
    for (const metric of ['contactSpan', 'tipHeight'] as const) {
        assert.equal(pick(metric, NaN), null, metric);
        assert.equal(pick(metric, Infinity), null, metric);
    }
});

test('auto-bracing samples exactly the plate-to-model shafts', () => {
    // A brace wants a shaft running plate to model, not one bridging two model
    // contacts. That is trunk, branch and kickstand.
    const braceable = SUPPORT_TYPES.filter((d) => d.isAutoBraceable).map((d) => d.id).sort();
    assert.deepEqual(braceable, ['branch', 'kickstand', 'trunk']);

    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.isAutoBraceable) {
            assert.equal(descriptor.hasSegments, true, `${descriptor.id} needs a shaft to brace`);
        }
    }
});
