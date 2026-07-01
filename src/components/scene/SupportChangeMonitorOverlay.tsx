import React from 'react';
import { buildSupportChangeReportPlainText, type SupportChangeEntry } from '@/supports/SupportInspector/supportChangeMonitor';
import { fmtV3, shortId } from '@/supports/SupportInspector/supportProblemScan';
import { armSupportChangeMonitor, closeSupportChangeMonitorPanel } from '@/supports/SupportInspector/supportChangeMonitorState';

const C = {
    bright: '#e5eefb',
    dim: '#64748b',
    label: '#94a3b8',
    added: '#86efac',
    removed: '#fca5a5',
    changed: '#fcd34d',
    src: '#38bdf8',
} as const;

function kindColor(kind: SupportChangeEntry['kind']): string {
    if (kind === 'added') return C.added;
    if (kind === 'removed') return C.removed;
    return C.changed;
}

function fmtValue(v: unknown): string {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? (v.toFixed(4).replace(/\.?0+$/, '') || '0') : String(v);
    if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}...` : v;
    if (typeof v === 'boolean') return String(v);
    const json = JSON.stringify(v);
    return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

function ChangeRow({ change }: { change: SupportChangeEntry }) {
    const color = kindColor(change.kind);
    return (
        <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `2px solid ${color}` }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>
                    {change.kind}
                </span>
                {change.sourceLabel && (
                    <span style={{ color: C.src, fontSize: 10, fontWeight: 600 }}>src:{change.sourceLabel}</span>
                )}
                <span style={{ color: C.dim, fontSize: 10 }}>
                    {change.entityType} {shortId(change.entityId)}
                </span>
            </div>
            {change.pos && (
                <div style={{ color: C.label, fontSize: 10 }}>at {fmtV3(change.pos)}</div>
            )}
            {change.kind === 'changed' ? (
                <div style={{ color: C.bright, fontSize: 11 }}>
                    <span style={{ color: C.label }}>{change.path}:</span> {fmtValue(change.before)} <span style={{ color: C.dim }}>{'->'}</span> {fmtValue(change.after)}
                </div>
            ) : (
                <div style={{ color: C.bright, fontSize: 11 }}>
                    {change.kind === 'added' ? fmtValue(change.after) : fmtValue(change.before)}
                </div>
            )}
        </div>
    );
}

export function SupportChangeMonitorHud({
    changes,
    armedAtMs,
    lastDiffAtMs,
}: {
    changes: SupportChangeEntry[];
    armedAtMs: number | null;
    lastDiffAtMs: number | null;
}) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(() => {
        const text = buildSupportChangeReportPlainText(changes, armedAtMs, lastDiffAtMs);
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    }, [changes, armedAtMs, lastDiffAtMs]);

    const addedCount = changes.filter((c) => c.kind === 'added').length;
    const removedCount = changes.filter((c) => c.kind === 'removed').length;
    const changedCount = changes.filter((c) => c.kind === 'changed').length;

    return (
        <div
            style={{
                pointerEvents: 'auto',
                position: 'absolute',
                right: 12,
                top: 'calc(50% + 12px)',
                zIndex: 64,
                color: C.bright,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                lineHeight: 1.4,
                width: 'min(440px, calc(100vw - 24px))',
                maxHeight: 'min(70vh, 620px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(9, 14, 26, 0.92), rgba(21, 33, 53, 0.82))',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.36)',
                backdropFilter: 'blur(6px)',
                whiteSpace: 'normal',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>Change Monitor</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                        onClick={() => armSupportChangeMonitor()}
                        style={{
                            background: 'rgba(148,163,184,0.12)',
                            border: '1px solid rgba(148,163,184,0.3)',
                            borderRadius: 4,
                            color: C.label,
                            cursor: 'pointer',
                            fontSize: 10,
                            padding: '2px 7px',
                        }}
                    >
                        re-arm
                    </button>
                    <button
                        onClick={handleCopy}
                        style={{
                            background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.12)',
                            border: `1px solid ${copied ? 'rgba(34,197,94,0.5)' : 'rgba(148,163,184,0.3)'}`,
                            borderRadius: 4,
                            color: copied ? '#86efac' : C.label,
                            cursor: 'pointer',
                            fontSize: 10,
                            padding: '2px 7px',
                            transition: 'all 0.15s',
                        }}
                    >
                        {copied ? 'copied!' : 'copy'}
                    </button>
                    <button
                        onClick={() => closeSupportChangeMonitorPanel()}
                        style={{
                            background: 'rgba(148,163,184,0.12)',
                            border: '1px solid rgba(148,163,184,0.3)',
                            borderRadius: 4,
                            color: C.label,
                            cursor: 'pointer',
                            fontSize: 10,
                            padding: '2px 7px',
                        }}
                    >
                        close
                    </button>
                </div>
            </div>

            <div style={{ color: C.dim, fontSize: 10, marginBottom: 4 }}>
                tap c×3 to re-arm · armed {armedAtMs ? new Date(armedAtMs).toLocaleTimeString() : '—'} · updated {lastDiffAtMs ? new Date(lastDiffAtMs).toLocaleTimeString() : '—'}
            </div>

            {changes.length === 0 ? (
                <div style={{ color: C.label }}>No changes since arming.</div>
            ) : (
                <>
                    <div style={{ color: C.label, fontWeight: 600 }}>
                        {addedCount} added, {removedCount} removed, {changedCount} field change{changedCount !== 1 ? 's' : ''}
                    </div>
                    {changes.map((c, i) => (
                        <ChangeRow key={`${c.entityType}-${c.entityId}-${c.path}-${i}`} change={c} />
                    ))}
                </>
            )}
        </div>
    );
}
