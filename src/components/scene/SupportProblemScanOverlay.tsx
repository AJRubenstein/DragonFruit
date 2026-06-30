import React from 'react';
import { buildSupportProblemScanPlainText, fmtV3, shortId, type SupportProblem } from '@/supports/SupportInspector/supportProblemScan';
import { closeSupportProblemScan } from '@/supports/SupportInspector/supportProblemScanState';

const C = {
    bright: '#e5eefb',
    dim: '#64748b',
    label: '#94a3b8',
    error: '#fca5a5',
    warning: '#fcd34d',
    ok: '#86efac',
    src: '#38bdf8',
} as const;

function ProblemRow({ problem }: { problem: SupportProblem }) {
    const color = problem.severity === 'error' ? C.error : C.warning;
    return (
        <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `2px solid ${color}` }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>
                    {problem.severity}
                </span>
                <span style={{ color: C.label, fontSize: 10 }}>{problem.category}</span>
                {problem.sourceLabel && (
                    <span style={{ color: C.src, fontSize: 10, fontWeight: 600 }}>src:{problem.sourceLabel}</span>
                )}
                <span style={{ color: C.dim, fontSize: 10 }}>
                    {problem.entityType} {shortId(problem.entityId)}
                </span>
            </div>
            <div style={{ color: C.bright }}>{problem.message}</div>
            {problem.pos && (
                <div style={{ color: C.label, fontSize: 10 }}>at {fmtV3(problem.pos)}</div>
            )}
            {problem.detail && <div style={{ color: C.dim, fontSize: 10 }}>{problem.detail}</div>}
        </div>
    );
}

export function SupportProblemScanHud({
    problems,
    scannedAtMs,
}: {
    problems: SupportProblem[];
    scannedAtMs: number | null;
}) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(() => {
        const text = buildSupportProblemScanPlainText(problems, scannedAtMs);
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    }, [problems, scannedAtMs]);

    const errorCount = problems.filter((p) => p.severity === 'error').length;
    const warningCount = problems.filter((p) => p.severity === 'warning').length;

    return (
        <div
            style={{
                pointerEvents: 'auto',
                position: 'absolute',
                right: 12,
                top: 12,
                zIndex: 64,
                color: C.bright,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                lineHeight: 1.4,
                width: 'min(420px, calc(100vw - 24px))',
                maxHeight: 'min(80vh, 680px)',
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
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>Problem Scan</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                        onClick={() => closeSupportProblemScan()}
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
                tap x×3 to re-scan · {scannedAtMs ? new Date(scannedAtMs).toLocaleTimeString() : '—'}
            </div>

            {problems.length === 0 ? (
                <div style={{ color: C.ok }}>No problems found.</div>
            ) : (
                <>
                    <div style={{ color: errorCount > 0 ? C.error : C.label, fontWeight: 600 }}>
                        {errorCount} error{errorCount !== 1 ? 's' : ''}, {warningCount} warning{warningCount !== 1 ? 's' : ''}
                    </div>
                    {problems.map((p, i) => (
                        <ProblemRow key={`${p.entityType}-${p.entityId}-${p.category}-${i}`} problem={p} />
                    ))}
                </>
            )}
        </div>
    );
}
