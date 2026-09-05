import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SUPPORT_TYPES,
    previewTypesByPriority,
    type SegmentPreviewTypeId,
    type SupportTypeId,
} from '../supportTypeRegistry';

/**
 * The order previews are consulted in, when several are live at once.
 *
 * SceneCanvas asked this twice with two hand-written orders, and the two
 * disagree -- one consults kickstand, the other does not. Transcribed here
 * from the originals so a derivation can be compared against them rather
 * than assumed equivalent.
 */

type Actives = Partial<Record<SupportTypeId, boolean>>;

/** SceneCanvas:1943-1955, verbatim. Active mode first, then a fixed order. */
function originalGuideWidthOrder(actives: Actives): SupportTypeId[] {
    const ordered: SupportTypeId[] = [];
    if (actives.branch) ordered.push('branch');
    if (actives.leaf) ordered.push('leaf');
    if (actives.kickstand) ordered.push('kickstand');
    ordered.push('trunk', 'branch', 'leaf', 'kickstand');
    return ordered;
}

/** SceneCanvas:7513-7521, verbatim. Leaf, then branch only while placing, then trunk. */
function originalFeedbackOrder(actives: Actives): SupportTypeId[] {
    const ordered: SupportTypeId[] = ['leaf'];
    if (actives.branch) ordered.push('branch');
    ordered.push('trunk');
    return ordered;
}

const ALL_ACTIVE_COMBINATIONS: Actives[] = (() => {
    const modes: SupportTypeId[] = ['branch', 'leaf', 'brace', 'kickstand'];
    const out: Actives[] = [];
    for (let mask = 0; mask < 1 << modes.length; mask += 1) {
        const actives: Actives = {};
        modes.forEach((id, i) => { if (mask & (1 << i)) actives[id] = true; });
        out.push(actives);
    }
    return out;
})();

test('the guide-width order matches the original across every mode combination', () => {
    for (const actives of ALL_ACTIVE_COMBINATIONS) {
        assert.deepEqual(
            previewTypesByPriority('contactGuideWidth', actives),
            originalGuideWidthOrder(actives),
            JSON.stringify(actives),
        );
    }
});

test('the feedback order matches the original across every mode combination', () => {
    for (const actives of ALL_ACTIVE_COMBINATIONS) {
        assert.deepEqual(
            previewTypesByPriority('limitationFeedback', actives),
            originalFeedbackOrder(actives),
            JSON.stringify(actives),
        );
    }
});

test('the two orders really do disagree, so neither can stand in for the other', () => {
    // Guide width consults kickstand; limitation feedback never does. Keeping
    // them separate is the point -- unifying them would change behaviour.
    const none: Actives = {};
    assert.ok(previewTypesByPriority('contactGuideWidth', none).includes('kickstand'));
    assert.ok(!previewTypesByPriority('limitationFeedback', none).includes('kickstand'));
});

test('only types that actually have a preview appear in either order', () => {
    const withPreview = new Set(SUPPORT_TYPES.filter((d) => d.hasPlacementPreview).map((d) => d.id));
    for (const purpose of ['contactGuideWidth', 'limitationFeedback'] as const) {
        for (const actives of ALL_ACTIVE_COMBINATIONS) {
            for (const id of previewTypesByPriority(purpose, actives)) {
                assert.ok(withPreview.has(id), `${id} has no placement preview but is consulted for ${purpose}`);
            }
        }
    }
});

test('the segment-preview alias matches what the descriptors declare', () => {
    // `SegmentPreviewTypeId` is a type-level mirror of `previewShape`, so it
    // cannot derive from the descriptors. This is what keeps the two in step.
    const declared = SUPPORT_TYPES
        .filter((d) => d.previewShape === 'segment')
        .map((d) => d.id)
        .sort();
    const alias: SegmentPreviewTypeId[] = ['brace'];
    assert.deepEqual(declared, alias.sort());
});

test('every type with a preview declares what shape it is', () => {
    for (const descriptor of SUPPORT_TYPES) {
        if (!descriptor.hasPlacementPreview) continue;
        assert.ok(descriptor.previewShape, `${descriptor.id} has a preview but no declared shape`);
    }
});

test('brace is in neither order, because its preview is a different shape', () => {
    // BracePreviewData is a bare segment -- no contact cones to measure, and no
    // error/warning fields to report.
    for (const purpose of ['contactGuideWidth', 'limitationFeedback'] as const) {
        const all = ALL_ACTIVE_COMBINATIONS.flatMap((a) => previewTypesByPriority(purpose, a));
        assert.ok(!all.includes('brace'), purpose);
    }
});
