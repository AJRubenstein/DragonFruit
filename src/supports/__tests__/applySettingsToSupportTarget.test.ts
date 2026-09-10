import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addBranch,
    addKnot,
    addLeaf,
    addRoot,
    addSupportEntity,
    addTrunk,
    applySettingsToSupportTarget,
    getSnapshot,
    resetStore,
} from '../state';
import { EDITABLE_SUPPORT_TYPES, getSupportTypeDescriptor } from '../supportTypeRegistry';
import { createDefaultSettings } from '../Settings/types';
import { DEFAULT_TIP_PROFILE } from '../SupportPrimitives/ContactCone/types';
import type { Branch, Leaf, Trunk } from '../types';

/**
 * Writing sidebar settings onto the selected support.
 *
 * Pins what each editable type writes.
 */

const MODEL = 'model-a';

const segment = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: { id: `${id}-bj`, pos: { x: 0, y: 0, z: 0 }, diameter: 1 },
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
});

const cone = (id: string) => ({
    id,
    socketJointId: `${id}-socket`,
    pos: { x: 0, y: 0, z: 4 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1,
    height: 1,
    profile: { ...DEFAULT_TIP_PROFILE },
});

function scene() {
    resetStore();
    addRoot({
        id: 'root-a', modelId: MODEL,
        transform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addTrunk({
        id: 'trunk-a', modelId: MODEL, rootId: 'root-a',
        segments: [segment('seg-ta')], contactCone: cone('cone-ta'),
    } as unknown as Trunk);
    addKnot({ id: 'knot-a', parentShaftId: 'seg-ta', t: 0.5, pos: { x: 0, y: 0, z: 2 }, diameter: 1 } as never);
    addBranch({
        id: 'branch-a', modelId: MODEL, parentKnotId: 'knot-a',
        segments: [segment('seg-ba')], contactCone: cone('cone-ba'),
    } as unknown as Branch);
    addLeaf({ id: 'leaf-a', modelId: MODEL, parentKnotId: 'knot-a', contactCone: cone('cone-la') } as unknown as Leaf);
    addRoot({
        id: 'root-k', modelId: MODEL,
        transform: { pos: { x: 5, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
    } as never);
    addSupportEntity('kickstand', {
        id: 'kickstand-a', modelId: MODEL, rootId: 'root-k',
        hostKnotId: 'knot-a', hostSegmentId: 'seg-ta',
        segments: [segment('seg-ka')],
    } as never);
}

/** Settings distinguishable from the defaults in every field this reads. */
function settings() {
    const base = createDefaultSettings();
    return {
        ...base,
        shaft: { ...base.shaft, diameterMm: 2.75 },
        tip: { ...base.tip, contactDiameterMm: 0.85, bodyDiameterMm: 1.9, lengthMm: 3.25, penetrationMm: 0.2 },
        roots: { ...base.roots, diameterMm: 6.5, diskHeightMm: 1.25, coneHeightMm: 2.5 },
    };
}

test('every editable type applies without falling through', () => {
    // The leaf branch used to be an unguarded fallthrough, so an unhandled kind
    // was silently written as a leaf.
    for (const descriptor of EDITABLE_SUPPORT_TYPES) {
        scene();
        assert.equal(
            applySettingsToSupportTarget({ kind: descriptor.id, id: `${descriptor.id}-a` }, settings() as never),
            true,
            `${descriptor.id} should apply`,
        );
    }
});

test('a trunk rewrites its root, shaft and tip', () => {
    scene();
    applySettingsToSupportTarget({ kind: 'trunk', id: 'trunk-a' }, settings() as never);

    const state = getSnapshot();
    const trunk = state.trunks['trunk-a'];
    const root = state.roots['root-a'];

    assert.equal(root.diameter, 6.5);
    assert.equal(root.diskHeight, 1.25);
    assert.equal(root.coneHeight, 2.5);
    assert.equal(trunk.baseDiameterMm, 2.75);
    assert.equal(trunk.segments[0].diameter, 2.75);
    assert.equal(trunk.contactCone?.profile.contactDiameterMm, 0.85);
    assert.equal(trunk.contactCone?.profile.lengthMm, 3.25);
    assert.ok(trunk.settingsCodeHex, 'the trunk should cache its settings hex');
});

test('a branch rewrites its shaft and tip but no root', () => {
    scene();
    const before = getSnapshot().roots['root-a'];
    applySettingsToSupportTarget({ kind: 'branch', id: 'branch-a' }, settings() as never);

    const state = getSnapshot();
    const branch = state.branches['branch-a'];

    assert.equal(branch.segments[0].diameter, 2.75);
    assert.equal(branch.contactCone?.profile.contactDiameterMm, 0.85);
    assert.equal(branch.contactCone?.profile.lengthMm, 3.25);
    // Only a root-owning type records the shaft width on itself.
    assert.equal((branch as { baseDiameterMm?: number }).baseDiameterMm, undefined);
    assert.deepEqual(state.roots['root-a'], before, 'a branch must not touch the root');
});

test('a leaf takes the contact diameter but not the body or length', () => {
    scene();
    const originalProfile = { ...getSnapshot().leaves['leaf-a'].contactCone.profile };
    applySettingsToSupportTarget({ kind: 'leaf', id: 'leaf-a' }, settings() as never);

    const leaf = getSnapshot().leaves['leaf-a'];
    assert.equal(leaf.contactCone.profile.contactDiameterMm, 0.85);
    // A leaf has no shaft, so the shaft-to-tip transition does not apply.
    assert.equal(leaf.contactCone.profile.bodyDiameterMm, originalProfile.bodyDiameterMm);
    assert.equal(leaf.contactCone.profile.lengthMm, originalProfile.lengthMm);
    assert.ok(leaf.settingsCodeHex);
});

test('a kickstand rewrites its shaft and its own root', () => {
    scene();
    const trunkRootBefore = getSnapshot().roots['root-a'];
    applySettingsToSupportTarget({ kind: 'kickstand', id: 'kickstand-a' }, settings() as never);

    const state = getSnapshot();
    const kickstand = state.kickstands['kickstand-a'];

    assert.equal(kickstand.segments[0].diameter, 2.75, 'the shaft takes the diameter');
    assert.equal((kickstand as { baseDiameterMm?: number }).baseDiameterMm, 2.75);
    assert.equal(state.roots['root-k'].diameter, 6.5, 'its own root takes the root settings');
    assert.deepEqual(state.roots['root-a'], trunkRootBefore, "a kickstand must not touch the trunk's root");
    assert.ok(kickstand.settingsCodeHex);
});

test('a kickstand has no contact cone to write a tip onto', () => {
    // contactFields is empty, so the tip half of the settings has no target.
    assert.deepEqual(getSupportTypeDescriptor('kickstand').contactFields, []);
    scene();
    applySettingsToSupportTarget({ kind: 'kickstand', id: 'kickstand-a' }, settings() as never);
    const kickstand = getSnapshot().kickstands['kickstand-a'] as unknown as Record<string, unknown>;
    assert.equal(kickstand.contactCone, undefined);
});

test('a missing entity or non-editable type applies nothing', () => {
    scene();
    assert.equal(applySettingsToSupportTarget({ kind: 'trunk', id: 'nope' }, settings() as never), false);
    assert.equal(applySettingsToSupportTarget({ kind: 'stick', id: 'stick-a' } as never, settings() as never), false);
});

test('a trunk whose root is missing applies nothing', () => {
    scene();
    const trunk = getSnapshot().trunks['trunk-a'];
    // Reload without the root the trunk points at.
    resetStore();
    addTrunk(trunk);
    assert.equal(applySettingsToSupportTarget({ kind: 'trunk', id: 'trunk-a' }, settings() as never), false);
});
