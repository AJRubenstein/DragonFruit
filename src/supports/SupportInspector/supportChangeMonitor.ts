import type { SupportState, Vec3, Knot } from '@/supports/types';
import { findShaftOwner, fmtV3, shortId } from './supportProblemScan';

/**
 * Whole-model "what changed" diff for the Support Inspector.
 *
 * Captures a baseline SupportState and, on demand, diffs it against the
 * current state field-by-field — so a single diameter tweak can be inspected
 * for every downstream effect it had (which knots moved, which braces picked
 * up a new diameter, which ones silently did NOT update), rather than relying
 * on visual inspection of the viewport.
 *
 * Only the entity collections are diffed (roots/trunks/.../knots); the
 * interaction-only fields (selectedId, hoveredId, etc.) are intentionally
 * excluded since they churn on every click/hover and aren't "the supports".
 */

export type SupportChangeKind = 'added' | 'removed' | 'changed';

export interface SupportChangeEntry {
    kind: SupportChangeKind;
    entityType: string;
    entityId: string;
    sourceLabel?: string;
    pos?: Vec3;
    /** Dotted/bracketed path to the changed field within the entity, e.g.
     * "segments[2].topJoint.diameter". Empty for whole-entity added/removed. */
    path: string;
    before?: unknown;
    after?: unknown;
}

const TRACKED_COLLECTIONS: ReadonlyArray<{ key: keyof SupportState; entityType: string }> = [
    { key: 'roots', entityType: 'root' },
    { key: 'trunks', entityType: 'trunk' },
    { key: 'branches', entityType: 'branch' },
    { key: 'leaves', entityType: 'leaf' },
    { key: 'twigs', entityType: 'twig' },
    { key: 'sticks', entityType: 'stick' },
    { key: 'braces', entityType: 'brace' },
    { key: 'anchors', entityType: 'anchor' },
    { key: 'knots', entityType: 'knot' },
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface FieldDiff {
    path: string;
    before: unknown;
    after: unknown;
}

function deepDiffValue(before: unknown, after: unknown, path: string, out: FieldDiff[]): void {
    if (before === after) return;
    if (typeof before === 'number' && typeof after === 'number') {
        if (Math.abs(before - after) < 1e-9) return;
        out.push({ path, before, after });
        return;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
        const len = Math.max(before.length, after.length);
        for (let i = 0; i < len; i++) {
            deepDiffValue(before[i], after[i], `${path}[${i}]`, out);
        }
        return;
    }
    if (isPlainObject(before) && isPlainObject(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const k of keys) {
            deepDiffValue(before[k], after[k], path ? `${path}.${k}` : k, out);
        }
        return;
    }
    out.push({ path, before, after });
}

function entityPos(entityType: string, entity: unknown): Vec3 | undefined {
    if (!entity || typeof entity !== 'object') return undefined;
    const e = entity as Record<string, unknown>;
    if (entityType === 'knot') return (e.pos as Vec3 | undefined);
    if (entityType === 'root') return (e.transform as { pos?: Vec3 } | undefined)?.pos;
    if (entityType === 'leaf') return (e.contactCone as { pos?: Vec3 } | undefined)?.pos;
    const segments = e.segments as Array<{ bottomJoint?: { pos: Vec3 }; topJoint?: { pos: Vec3 } }> | undefined;
    return segments?.[0]?.bottomJoint?.pos ?? segments?.[0]?.topJoint?.pos;
}

function resolveSourceLabel(entityType: string, entity: unknown, state: SupportState): string | undefined {
    if (!entity || typeof entity !== 'object') return undefined;
    const e = entity as Record<string, unknown>;
    if (entityType === 'knot') {
        const knot = entity as Knot;
        return findShaftOwner(knot.parentShaftId, state)?.sourceLabel;
    }
    return e.importSourceLabel as string | undefined;
}

/** Diffs two SupportState snapshots, entity collection by entity collection. */
export function diffSupportStates(before: SupportState, after: SupportState): SupportChangeEntry[] {
    const entries: SupportChangeEntry[] = [];

    for (const { key, entityType } of TRACKED_COLLECTIONS) {
        const beforeColl = (before[key] as unknown as Record<string, unknown>) ?? {};
        const afterColl = (after[key] as unknown as Record<string, unknown>) ?? {};
        const ids = new Set([...Object.keys(beforeColl), ...Object.keys(afterColl)]);

        for (const id of ids) {
            const b = beforeColl[id];
            const a = afterColl[id];

            if (b === undefined && a !== undefined) {
                entries.push({
                    kind: 'added', entityType, entityId: id,
                    sourceLabel: resolveSourceLabel(entityType, a, after),
                    pos: entityPos(entityType, a),
                    path: '', after: a,
                });
                continue;
            }
            if (a === undefined && b !== undefined) {
                entries.push({
                    kind: 'removed', entityType, entityId: id,
                    sourceLabel: resolveSourceLabel(entityType, b, before),
                    pos: entityPos(entityType, b),
                    path: '', before: b,
                });
                continue;
            }
            if (a === undefined || b === undefined) continue;

            const fieldDiffs: FieldDiff[] = [];
            deepDiffValue(b, a, '', fieldDiffs);
            if (fieldDiffs.length === 0) continue;

            const sourceLabel = resolveSourceLabel(entityType, a, after);
            const pos = entityPos(entityType, a);
            for (const fd of fieldDiffs) {
                entries.push({
                    kind: 'changed', entityType, entityId: id, sourceLabel, pos,
                    path: fd.path || '(value)', before: fd.before, after: fd.after,
                });
            }
        }
    }

    entries.sort((x, y) => (
        x.entityType.localeCompare(y.entityType)
        || x.entityId.localeCompare(y.entityId)
        || x.path.localeCompare(y.path)
    ));
    return entries;
}

function fmtValue(v: unknown): string {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(4).replace(/\.?0+$/, '') || '0' : String(v);
    if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}...` : v;
    if (typeof v === 'boolean') return String(v);
    const json = JSON.stringify(v);
    return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

export function buildSupportChangeReportPlainText(
    changes: SupportChangeEntry[],
    armedAtMs: number | null,
    lastDiffAtMs: number | null,
): string {
    const lines: string[] = ['SUPPORT CHANGE MONITOR', '='.repeat(44)];
    lines.push(`armed:  ${armedAtMs ? new Date(armedAtMs).toISOString() : '—'}`);
    lines.push(`latest: ${lastDiffAtMs ? new Date(lastDiffAtMs).toISOString() : '—'}`);
    if (changes.length === 0) {
        lines.push('No changes since arming.');
        return lines.join('\n');
    }
    const added = changes.filter((c) => c.kind === 'added').length;
    const removed = changes.filter((c) => c.kind === 'removed').length;
    const changed = changes.filter((c) => c.kind === 'changed').length;
    lines.push(`${added} added, ${removed} removed, ${changed} field change${changed !== 1 ? 's' : ''}`);
    lines.push('');
    for (const c of changes) {
        lines.push(`[${c.kind.toUpperCase()}] ${c.entityType} ${shortId(c.entityId)}${c.sourceLabel ? `  src:${c.sourceLabel}` : ''}`);
        if (c.pos) lines.push(`  at ${fmtV3(c.pos)}`);
        if (c.kind === 'changed') {
            lines.push(`  ${c.path}: ${fmtValue(c.before)} -> ${fmtValue(c.after)}`);
        } else if (c.kind === 'added') {
            lines.push(`  + ${fmtValue(c.after)}`);
        } else {
            lines.push(`  - ${fmtValue(c.before)}`);
        }
    }
    return lines.join('\n');
}
