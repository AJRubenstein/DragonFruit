import assert from 'node:assert/strict';
import test from 'node:test';

import { getTargetFocusState } from '../Settings/AnatomyPreview/AnatomyPreviewCameraLogic';
import {
    BRANCH_HOME_FOCUS_STATE,
    LEAF_HOME_FOCUS_STATE,
    TRUNK_HOME_FOCUS_STATE,
} from '../Settings/AnatomyPreview/PreviewTypes/Trunk/camera';
import { kindHas, SUPPORT_KINDS, tabKindFor, type SupportKind } from '../Settings/supportKindState';

/**
 * What the sidebar offers each tool.
 *
 * The field guards used to read `activeKind === 'trunk' || ... === 'branch'`,
 * repeated per field, and the preview camera dispatched down an ordered chain
 * of the same literals. Both are declared on `SUPPORT_KINDS` now, so a new tool
 * that forgets a group gets the default rather than silently inheriting one
 * type's answer.
 */

const KINDS = Object.keys(SUPPORT_KINDS) as SupportKind[];

test('every kind declares all four sidebar properties', () => {
    // A missing property reads `undefined`, which is falsy -- the field would
    // just never appear, with nothing to notice it.
    for (const kind of KINDS) {
        const entry = SUPPORT_KINDS[kind] as Record<string, unknown>;
        for (const group of ['drawsOwnPreview', 'hasContactCone', 'hasShaft', 'hasPlateRoot']) {
            assert.equal(typeof entry[group], 'boolean', `${kind} does not declare ${group}`);
        }
    }
});

test('the field groups match what each tool actually builds', () => {
    // Pinned against the behaviour the literal guards had: contact-cone fields
    // for trunk/branch/leaf, shaft for trunk/branch, roots for trunk alone.
    assert.deepEqual(KINDS.filter((k) => kindHas(k, 'hasContactCone')).sort(), ['branch', 'leaf', 'trunk']);
    assert.deepEqual(KINDS.filter((k) => kindHas(k, 'hasShaft')).sort(), ['branch', 'trunk']);
    assert.deepEqual(KINDS.filter((k) => kindHas(k, 'hasPlateRoot')).sort(), ['trunk']);
});

test('kindHas is safe on a null kind', () => {
    // The sidebar reads it before a tool is chosen.
    assert.equal(kindHas(null, 'hasShaft'), false);
    assert.equal(kindHas(undefined, 'hasContactCone'), false);
});

test('every kind resolves a preview camera focus, with and without a key', () => {
    // The chain this replaced fell through to a shared default; a table lookup
    // that missed would return undefined instead.
    for (const kind of KINDS) {
        for (const key of [null, '', 'tip.lengthMm']) {
            const focus = getTargetFocusState(kind, key);
            assert.ok(focus, `${kind} with key ${JSON.stringify(key)} resolved nothing`);
            assert.equal(focus.position.length, 3, `${kind} focus has no camera position`);
            assert.equal(focus.target.length, 3, `${kind} focus has no camera target`);
            assert.ok(Number.isFinite(focus.zoom), `${kind} focus has no finite zoom`);
        }
    }
});

test('a kind declaring a home focus rests there when no setting is focused', () => {
    // The ordered chain checked `!key` before the per-kind target, and for
    // trunk the two genuinely differ -- its target function at `null` returns a
    // different zoom and target-z from TRUNK_HOME_FOCUS_STATE. Comparing
    // against the declared constants is what pins the branch; comparing the
    // function against itself would pass with the home lookup deleted.
    assert.deepEqual(getTargetFocusState('trunk', null), TRUNK_HOME_FOCUS_STATE);
    assert.deepEqual(getTargetFocusState('branch', null), BRANCH_HOME_FOCUS_STATE);
    assert.deepEqual(getTargetFocusState('leaf', null), LEAF_HOME_FOCUS_STATE);

    // An empty-string key counts as no key, exactly as the chain's `!key` did.
    assert.deepEqual(getTargetFocusState('trunk', ''), TRUNK_HOME_FOCUS_STATE);

    // And a focused setting moves the camera off home.
    assert.notDeepEqual(getTargetFocusState('trunk', 'roots.diameterMm'), TRUNK_HOME_FOCUS_STATE);
});

test('every kind names a tab that is itself a kind', () => {
    for (const kind of Object.keys(SUPPORT_KINDS) as SupportKind[]) {
        assert.ok(kind in SUPPORT_KINDS, `${kind} is not a kind`);
        assert.ok(tabKindFor(kind) in SUPPORT_KINDS, `${kind} names a tab that is not a kind`);
    }
});

test('the shaft-family kinds share the trunk tab', () => {
    // Editing a branch, leaf or twig shows the trunk tab's fields.
    for (const kind of ['branch', 'leaf', 'twig'] as const) {
        assert.equal(tabKindFor(kind), 'trunk', `${kind} should be edited under the trunk tab`);
    }
});

test('every other kind is its own tab', () => {
    for (const kind of ['trunk', 'raft', 'stick', 'grid', 'auto'] as const) {
        assert.equal(tabKindFor(kind), kind, `${kind} should be its own tab`);
    }
});

test('a tab kind is never itself redirected', () => {
    // Otherwise resolving a tab would need repeating until it settled.
    for (const kind of Object.keys(SUPPORT_KINDS) as SupportKind[]) {
        const tab = tabKindFor(kind);
        assert.equal(tabKindFor(tab), tab, `${kind} resolves to ${tab}, which redirects again`);
    }
});
