import assert from 'node:assert/strict';
import test from 'node:test';

import { addSupportEntity, resetStore } from '../state';
import { commitJointDragSupport, JOINT_DRAG_COMMIT_TYPES } from '../SupportPrimitives/Joint/jointDragController';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Segment } from '../types';

/**
 * Committing a joint drag clears that support's live preview.
 *
 * Twig and stick used to commit with `updateSupportEntity` and then clear the
 * preview by hand, which is what kept them out of the shared controller. Both
 * routes end at the same `dragonfruit-part-drag-update` event carrying a null
 * support, so this watches the event rather than the call.
 */

const EVENT_NAME = 'dragonfruit-part-drag-update';

// The preview clear is a window CustomEvent, so the emit needs somewhere to go.
const listeners: Record<string, Array<(e: unknown) => void>> = {};
(global as { window?: unknown }).window = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
        (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
    },
    dispatchEvent: (event: { type: string }) => {
        for (const fn of listeners[event.type] ?? []) fn(event);
        return true;
    },
};
(global as { CustomEvent?: unknown }).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
    }
};

const seg = (id: string): Segment => ({
    id, diameter: 1,
    topJoint: { id: `${id}-tj`, pos: { x: 0, y: 0, z: 4 }, diameter: 1 },
} as Segment);

/** Clears seen for `kind`, as `{ supportId, cleared }`. */
function recordClears(): { seen: { kind: string; supportId: string; cleared: boolean }[]; stop: () => void } {
    const seen: { kind: string; supportId: string; cleared: boolean }[] = [];
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ kind: string; supportId: string; support: unknown }>).detail;
        if (detail) seen.push({ kind: detail.kind, supportId: detail.supportId, cleared: detail.support === null });
    };
    window.addEventListener(EVENT_NAME, handler);
    return { seen, stop: () => window.removeEventListener(EVENT_NAME, handler) };
}

const SHAFTED = SUPPORT_TYPES.filter((d) => d.hasSegments);

for (const descriptor of SHAFTED) {
    test(`committing a ${descriptor.id} drag clears its preview`, () => {
        resetStore();
        const id = `${descriptor.id}-a`;
        addSupportEntity(descriptor.id as never, {
            id, modelId: 'model-a', segments: [seg(`seg-${id}`)],
            rootId: `${id}-root`, parentKnotId: `${id}-knot`,
            hostKnotId: `${id}-knot`, hostSegmentId: 'seg-host', hostMinT: 0.2,
        } as never);

        const { seen, stop } = recordClears();
        commitJointDragSupport(descriptor.id as never, { id, segments: [seg('seg-moved')] } as never);
        stop();

        assert.deepEqual(
            seen.filter((e) => e.cleared),
            [{ kind: descriptor.id, supportId: id, cleared: true }],
            `${descriptor.id}: commit did not clear exactly its own preview`,
        );
    });
}

test('every shafted type commits through the shared controller', () => {
    // Twig and stick joined when their hand-written commit+clear pair was
    // shown to be what the controller already does.
    assert.deepEqual(
        [...JOINT_DRAG_COMMIT_TYPES].sort(),
        SHAFTED.map((d) => d.id).sort(),
    );
});
