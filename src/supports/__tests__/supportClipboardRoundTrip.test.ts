import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
    captureModelSupportsToClipboard,
    pasteModelSupportsFromClipboard,
} from '../PlacementLogic/supportClipboard';
import { addSupportEntity, addKnot, addRoot, getSnapshot, resetStore } from '../state';
import { SUPPORT_TYPES, type SupportCollectionKey } from '../supportTypeRegistry';

/**
 * Copy/paste of a supported model.
 *
 * A duplicated model's supports are captured, re-identified and re-parented in
 * one pass. The list of collections that pass touches used to be written out by
 * hand and omitted `anchors`, so anchors were captured and then dropped -- a
 * model supported only by anchors pasted nothing. Both halves derive from the
 * registry now, and these hold that.
 */

const SOURCE = 'model-source';
const TARGET = 'model-target';

const identity = () => ({
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
});

const joint = (id: string, z: number) => ({ id, pos: { x: 0, y: 0, z }, diameter: 1 });

const segment = (id: string) => ({
    id,
    diameter: 1,
    bottomJoint: joint(`${id}-bj`, 0),
    topJoint: joint(`${id}-tj`, 10),
});

const cone = (id: string) => ({
    id,
    socketJointId: `${id}-socket`,
    pos: { x: 0, y: 0, z: 10 },
    normal: { x: 0, y: 0, z: 1 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    diameter: 1,
    height: 1,
});

const disk = (id: string) => ({ id, pos: { x: 0, y: 0, z: 5 }, normal: { x: 0, y: 0, z: 1 }, diameter: 1 });

/** One entity of `typeId`, carrying whatever its descriptor declares. */
function entityFor(typeId: string, id: string): Record<string, unknown> {
    const descriptor = SUPPORT_TYPES.find((d) => d.id === typeId)!;
    const entity: Record<string, unknown> = { id, modelId: SOURCE };

    if (descriptor.hasSegments) entity.segments = [segment(`${id}-seg`)];
    if (descriptor.ownsRoot) entity.rootId = `${id}-root`;

    for (const field of descriptor.contactFields) {
        entity[field] = field.startsWith('contactDisk') ? disk(`${id}-${field}`) : cone(`${id}-${field}`);
    }

    for (const edge of descriptor.edges) {
        if (edge.to === 'knots') entity[edge.field] = 'knot-host';
        if (edge.to === 'segment') entity[edge.field] = 'trunk-1-seg';
    }

    // Anchor alone carries a bare joint and an inline root position.
    if (typeId === 'anchor') {
        entity.joint = joint(`${id}-joint`, 0);
        entity.rootPos = { x: 0, y: 0, z: 0 };
        entity.rootBaseDiameter = 3;
        entity.rootTopDiameter = 2;
        entity.rootHeight = 1;
    }

    return entity;
}

/** A source model carrying one of every declared type. */
function seedOneOfEach() {
    resetStore();

    addRoot({ id: 'trunk-1-root', modelId: SOURCE, transform: { pos: { x: 0, y: 0, z: 0 } }, diskHeight: 1, coneHeight: 1 } as never);
    addSupportEntity('trunk', entityFor('trunk', 'trunk-1') as never);
    addKnot({ id: 'knot-host', parentShaftId: 'trunk-1-seg', t: 0.5, pos: { x: 0, y: 0, z: 5 }, diameter: 1 } as never);

    for (const descriptor of SUPPORT_TYPES) {
        if (descriptor.id === 'trunk') continue;
        if (descriptor.ownsRoot) {
            addRoot({ id: `${descriptor.id}-1-root`, modelId: SOURCE, transform: { pos: { x: 0, y: 0, z: 0 } }, diskHeight: 1, coneHeight: 1 } as never);
        }
        addSupportEntity(descriptor.id, entityFor(descriptor.id, `${descriptor.id}-1`) as never);
    }
}

const countFor = (key: SupportCollectionKey, modelId: string) => {
    const record = getSnapshot()[key] as unknown as Record<string, { modelId?: string }>;
    return Object.values(record ?? {}).filter((entity) => entity.modelId === modelId).length;
};

test('every declared type survives a copy and paste', () => {
    // The anchor bug: captured, then dropped by a hand-written merge that did
    // not name its collection. Driven from the registry, a type is copied by
    // being declared.
    seedOneOfEach();

    const clipboard = captureModelSupportsToClipboard(SOURCE);
    assert.ok(clipboard, 'the source model produced a clipboard payload');

    pasteModelSupportsFromClipboard(clipboard, TARGET, identity(), identity(), { recordHistory: false });

    for (const descriptor of SUPPORT_TYPES) {
        assert.equal(
            countFor(descriptor.location.key, TARGET),
            1,
            `${descriptor.id} did not survive the paste`,
        );
    }
});

test('a model supported only by anchors pastes its anchors', () => {
    // The reported symptom's floor: the paste used to count collections by
    // hand, omit anchors, read zero and return without pasting anything.
    resetStore();
    addSupportEntity('anchor', entityFor('anchor', 'anchor-only') as never);

    const clipboard = captureModelSupportsToClipboard(SOURCE);
    assert.ok(clipboard, 'an anchor-only model produces a payload');

    const pasted = pasteModelSupportsFromClipboard(clipboard, TARGET, identity(), identity(), { recordHistory: false });

    assert.ok(pasted > 0, 'the paste reported work done');
    assert.equal(countFor('anchors', TARGET), 1, 'the anchor reached the target model');
});

test('the paste leaves the source model untouched', () => {
    seedOneOfEach();

    const before = SUPPORT_TYPES.map((d) => countFor(d.location.key, SOURCE));
    const clipboard = captureModelSupportsToClipboard(SOURCE);
    pasteModelSupportsFromClipboard(clipboard, TARGET, identity(), identity(), { recordHistory: false });

    const after = SUPPORT_TYPES.map((d) => countFor(d.location.key, SOURCE));
    assert.deepEqual(after, before, 'the source model lost or gained supports');
});

test('pasted entities carry fresh ids', () => {
    // Re-identification is what keeps the copy independent; a shared id would
    // make edits to one copy move the other.
    seedOneOfEach();

    const sourceIds = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) {
        const record = getSnapshot()[descriptor.location.key] as unknown as Record<string, { modelId?: string }>;
        for (const [id, entity] of Object.entries(record ?? {})) {
            if (entity.modelId === SOURCE) sourceIds.add(id);
        }
    }

    const clipboard = captureModelSupportsToClipboard(SOURCE);
    pasteModelSupportsFromClipboard(clipboard, TARGET, identity(), identity(), { recordHistory: false });

    for (const descriptor of SUPPORT_TYPES) {
        const record = getSnapshot()[descriptor.location.key] as unknown as Record<string, { modelId?: string }>;
        for (const [id, entity] of Object.entries(record ?? {})) {
            if (entity.modelId !== TARGET) continue;
            assert.ok(!sourceIds.has(id), `${descriptor.id} reused the source id ${id}`);
        }
    }
});

test('a knot riding a leaf cone follows its leaf to the copy', () => {
    // `leafCone:` and `braceSegment:` are pseudo-shafts, declared as
    // `knotHostPrefix`. A knot on one has to be remapped through the host's new
    // id, not treated as a real segment.
    seedOneOfEach();
    addKnot({ id: 'knot-on-cone', parentShaftId: 'leafCone:leaf-1', t: 0.5, pos: { x: 0, y: 0, z: 8 }, diameter: 1 } as never);

    const clipboard = captureModelSupportsToClipboard(SOURCE);
    assert.ok(clipboard, 'the source model produced a clipboard payload');
    assert.ok(
        clipboard.knots.some((knot) => knot.id === 'knot-on-cone'),
        'the leaf-cone knot was captured',
    );

    pasteModelSupportsFromClipboard(clipboard, TARGET, identity(), identity(), { recordHistory: false });

    const leaves = getSnapshot().leaves as unknown as Record<string, { modelId?: string }>;
    const pastedLeafId = Object.entries(leaves).find(([, leaf]) => leaf.modelId === TARGET)?.[0];
    assert.ok(pastedLeafId, 'the leaf reached the target');

    const knots = getSnapshot().knots as unknown as Record<string, { parentShaftId: string }>;
    const riders = Object.values(knots).filter((knot) => knot.parentShaftId === `leafCone:${pastedLeafId}`);
    assert.equal(riders.length, 1, 'exactly one knot rides the pasted leaf cone');
});
