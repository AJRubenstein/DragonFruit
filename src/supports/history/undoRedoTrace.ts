/**
 * TEMPORARY diagnostic tracing for undo/redo. Delete this file and its two
 * call sites (historyStore undo/redo, SupportRenderer) when the hunt is over.
 *
 * Install once, then every undo and redo prints: the action, what the handlers
 * did to the store, which collections changed, and which entities ended up
 * with a link pointing at something that is not there.
 */

import { getSnapshot, setSupportNotifyProbe } from '../state';
import { setHistoryTraceHook } from '@/history/historyStore';
import { SUPPORT_GRAPH_NODES, type SupportCollectionKey } from '../supportTypeRegistry';
import type { SupportState } from '../types';

const COLLECTIONS: SupportCollectionKey[] = [
    'roots', 'trunks', 'branches', 'leaves', 'twigs', 'sticks', 'braces', 'stumps', 'knots', 'kickstands',
];

type Counts = Record<string, number>;

function countsOf(state: SupportState): Counts {
    const counts: Counts = {};
    for (const key of COLLECTIONS) {
        counts[key] = Object.keys((state as unknown as Record<string, object>)[key] ?? {}).length;
    }
    return counts;
}

/** Ids per collection, so a diff can name what arrived and what left. */
function idsOf(state: SupportState): Record<string, Set<string>> {
    const ids: Record<string, Set<string>> = {};
    for (const key of COLLECTIONS) {
        ids[key] = new Set(Object.keys((state as unknown as Record<string, object>)[key] ?? {}));
    }
    return ids;
}

/** Every entity whose declared link points at an id that is not in the store. */
function danglingLinks(state: SupportState): string[] {
    const broken: string[] = [];
    const collections = state as unknown as Record<string, Record<string, Record<string, unknown>>>;

    for (const node of SUPPORT_GRAPH_NODES) {
        const record = collections[node.key];
        if (!record) continue;
        for (const [id, entity] of Object.entries(record)) {
            for (const edge of node.edges) {
                if (edge.to === 'segment') continue;
                const target = entity[edge.field];
                if (typeof target !== 'string' || !target) continue;
                if (!collections[edge.to]?.[target]) {
                    broken.push(`${node.key}/${id.slice(0, 8)} .${edge.field} -> ${edge.to}/${String(target).slice(0, 8)} MISSING`);
                }
            }
        }
    }
    return broken;
}

function diffLine(before: Record<string, Set<string>>, after: Record<string, Set<string>>): string[] {
    const lines: string[] = [];
    for (const key of COLLECTIONS) {
        const added = [...after[key]].filter((id) => !before[key].has(id));
        const removed = [...before[key]].filter((id) => !after[key].has(id));
        if (!added.length && !removed.length) continue;
        const parts: string[] = [];
        if (added.length) parts.push(`+${added.length} [${added.map((i) => i.slice(0, 8)).join(', ')}]`);
        if (removed.length) parts.push(`-${removed.length} [${removed.map((i) => i.slice(0, 8)).join(', ')}]`);
        lines.push(`      ${key.padEnd(11)} ${parts.join('  ')}`);
    }
    return lines;
}

let notifyCount = 0;
let watching = false;
const notifyFrames: string[] = [];

/** Counts the store notifications one undo or redo produces, and what each showed. */
export function beginNotifyWatch(): void {
    notifyCount = 0;
    notifyFrames.length = 0;
    watching = true;
}

export function noteNotify(): void {
    if (!watching) return;
    notifyCount += 1;
    const counts = countsOf(getSnapshot());
    const shown = COLLECTIONS.filter((k) => counts[k] > 0).map((k) => `${k}=${counts[k]}`).join(' ');
    notifyFrames.push(`      frame ${notifyCount}: ${shown || '(empty)'}`);
}

export function endNotifyWatch(): { count: number; frames: string[] } {
    watching = false;
    return { count: notifyCount, frames: [...notifyFrames] };
}

/** Wraps one undo or redo, printing everything it did. */
export function traceHistoryDirection(
    direction: 'undo' | 'redo',
    action: { type: string; description?: string; payload?: unknown },
    run: () => void,
): void {
    const before = getSnapshot();
    const beforeIds = idsOf(before);
    const beforeCounts = countsOf(before);

    const payload = action.payload as Record<string, unknown> | undefined;
    const payloadKeys = payload && typeof payload === 'object'
        ? Object.entries(payload).map(([key, value]) => {
            if (value == null) return `${key}=null`;
            if (Array.isArray(value)) return `${key}[${value.length}]`;
            if (typeof value === 'object') {
                const id = (value as { id?: string }).id;
                return id ? `${key}{${id.slice(0, 8)}}` : `${key}{…}`;
            }
            return `${key}=${String(value)}`;
        }).join(' ')
        : '(no payload)';

    console.group(`%c[TRACE ${direction.toUpperCase()}] ${action.type}`, 'color:#e91e63;font-weight:bold');
    console.log('  action      :', action.description ?? '(no description)');
    console.log('  payload     :', payloadKeys);
    console.log('  before      :', COLLECTIONS.filter((k) => beforeCounts[k] > 0).map((k) => `${k}=${beforeCounts[k]}`).join(' ') || '(empty)');

    beginNotifyWatch();
    let threw: unknown = null;
    try {
        run();
    } catch (err) {
        threw = err;
    }
    const notifies = endNotifyWatch();

    const after = getSnapshot();
    const afterCounts = countsOf(after);
    const afterIds = idsOf(after);

    console.log('  after       :', COLLECTIONS.filter((k) => afterCounts[k] > 0).map((k) => `${k}=${afterCounts[k]}`).join(' ') || '(empty)');
    console.log(`  store writes: ${notifies.count} notification(s)`);
    for (const frame of notifies.frames) console.log(frame);

    const diff = diffLine(beforeIds, afterIds);
    if (diff.length) {
        console.log('  changed     :');
        for (const line of diff) console.log(line);
    } else {
        console.log('  changed     : NOTHING — the store is identical');
    }

    const broken = danglingLinks(after);
    if (broken.length) {
        console.log('%c  BROKEN LINKS after this step:', 'color:#f44336;font-weight:bold');
        for (const line of broken) console.log(`      ${line}`);
    } else {
        console.log('  links       : all resolve');
    }

    if (threw) console.error('  THREW       :', threw);
    console.groupEnd();

    if (threw) throw threw;
}

/** Prints what a renderer is about to draw, so a store/screen mismatch shows. */
export function traceRenderCounts(label: string, state: SupportState): void {
    const counts = countsOf(state);
    const shown = COLLECTIONS.filter((k) => counts[k] > 0).map((k) => `${k}=${counts[k]}`).join(' ');
    console.log(`%c[TRACE RENDER ${label}]`, 'color:#3f51b5', shown || '(empty)', '| dangling:', danglingLinks(state).length);
}

/** Turns tracing on. Returns a disposer. Called from the supports history hook. */
export function installUndoRedoTrace(): () => void {
    setSupportNotifyProbe(noteNotify);
    const removeHook = setHistoryTraceHook((direction, action, run) => {
        traceHistoryDirection(direction, action as unknown as { type: string; description?: string; payload?: unknown }, run);
    });
    console.log('%c[TRACE] undo/redo tracing is ON', 'color:#4caf50;font-weight:bold');
    return () => {
        setSupportNotifyProbe(null);
        removeHook();
    };
}
