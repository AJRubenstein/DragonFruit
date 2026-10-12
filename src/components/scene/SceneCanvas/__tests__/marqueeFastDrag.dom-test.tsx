import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMarqueeSelectionHandlers } from '../useMarqueeSelectionHandlers';

type MarqueeBox = { start: { x: number; y: number }; current: { x: number; y: number } };

const CONTAINER_W = 2000;
const CONTAINER_H = 1200;

/** What the commit saw, kept outside the tree so the harness mutates nothing. */
let recordedBox: MarqueeBox | null = null;
let recordedIds: string[] = [];

/** The hook on a container, driven by pointer events the way the canvas drives it. */
function Harness() {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const suppressNextCanvasClickRef = React.useRef(false);

    const {
        handleMarqueePointerDownCapture,
        handleMarqueePointerMoveCapture,
        endMarqueeSelection,
    } = useMarqueeSelectionHandlers({
        containerRef,
        mode: 'prepare',
        prepareMarqueeEnabled: true,
        isGizmoDragging: false,
        isPostGizmoInteractionGuardActive: false,
        hoveredModelId: null,
        supportHoveredCategory: 'none',
        selectedModelIds: [],
        onMarqueeSelectionChange: (ids) => { recordedIds = ids; },
        resolveMarqueeSelectedIds: (selection) => {
            // The commit's view of the box is what this test is about.
            recordedBox = {
                start: { ...selection.start },
                current: { ...selection.current },
            };
            return ['model-a'];
        },
        resolveMarqueeSelectedSupportIds: () => [],
        suppressNextCanvasClickRef,
    });

    return (
        <div
            ref={containerRef}
            onPointerDownCapture={handleMarqueePointerDownCapture}
            onPointerMoveCapture={handleMarqueePointerMoveCapture}
            onPointerUpCapture={endMarqueeSelection}
            style={{ width: CONTAINER_W, height: CONTAINER_H }}
        />
    );
}

function pointerEvent(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
        pointerId: 1,
        button: 0,
        buttons: 1,
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        clientX: x,
        clientY: y,
        ...extra,
    });
    return event;
}

test('a drag whose moves outrun React still commits the box it ended on', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    recordedBox = null;
    recordedIds = [];

    try {
        await act(async () => {
            root.render(<Harness />);
        });

        const host = container.firstElementChild as HTMLDivElement;
        assert.ok(host, 'the harness mounted');

        // happy-dom gives an unlaid-out element a zero rect, and the hook clamps
        // every point into it. Report the size the drag is written against.
        host.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: CONTAINER_W, bottom: CONTAINER_H,
            width: CONTAINER_W, height: CONTAINER_H, toJSON: () => ({}),
        }) as DOMRect;
        host.setPointerCapture = () => {};
        host.releasePointerCapture = () => {};

        // One act for the whole gesture: every move is dispatched before React
        // commits, which is what a heavy scene does to a real drag.
        await act(async () => {
            host.dispatchEvent(pointerEvent('pointerdown', 1700, 200));
            for (const [x, y] of [[1690, 250], [1640, 330], [1200, 700], [544, 1058]]) {
                host.dispatchEvent(pointerEvent('pointermove', x, y));
            }
            host.dispatchEvent(pointerEvent('pointerup', 544, 1058, { buttons: 0 }));
        });

        const committed = recordedBox as MarqueeBox | null;
        assert.ok(committed, 'the drag committed a selection');
        assert.deepEqual(
            committed.start,
            { x: 1700, y: 200 },
            'the box starts where the pointer went down',
        );
        assert.deepEqual(
            committed.current,
            { x: 544, y: 1058 },
            'and ends where it came up, not at the last point React had rendered',
        );
        assert.deepEqual(recordedIds, ['model-a'], 'what the box caught is published');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
