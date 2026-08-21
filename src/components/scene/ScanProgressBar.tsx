import React from 'react';

export type ScanProgress = {
  done: number;
  total: number;
  phase?: string;
  phaseNumber?: number;
  phaseCount?: number;
};

/**
 * Determinate progress for the island scan, phase by phase.
 *
 * The scan is a sequence of passes and each one restarts at zero, so a single
 * bar would appear to go backwards. It shows which pass is running out of how
 * many — a count that travels with the report, because the two scan paths have
 * a different number of phases — and fills for the current one.
 *
 * Falls back to an indeterminate stripe only while no progress has arrived yet.
 */
export function ScanProgressBar({ progress }: { progress: ScanProgress | null }) {
  const total = progress?.total ?? 0;
  const percent = total > 0
    ? Math.min(100, Math.max(0, (progress!.done / total) * 100))
    : null;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-baseline justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span>
          {progress?.phase ?? 'Starting'}
          {progress?.phaseNumber && progress?.phaseCount
            ? ` (${progress.phaseNumber}/${progress.phaseCount})`
            : ''}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {percent === null ? '' : `${Math.round(percent)}%`}
        </span>
      </div>

      {/* ui-loading-track is what makes this the positioning context. The
          indeterminate stripe is absolutely positioned, so without it the
          stripe lays itself out against the modal and sweeps across the whole
          screen as a giant ellipse. */}
      <div
        className="ui-loading-track h-2.5 w-full rounded-full"
        style={{ background: 'color-mix(in srgb, var(--surface-2), black 20%)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        aria-label={progress?.phase ?? 'Scan progress'}
      >
        {percent === null ? (
          <div className="ui-loading-dot" style={{ background: 'var(--accent)' }} />
        ) : (
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${percent}%`, background: 'linear-gradient(90deg, var(--accent), #ff79c6)' }}
          />
        )}
      </div>

      {total > 0 && (
        <div className="text-[11px]" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {progress!.done.toLocaleString()} / {total.toLocaleString()}
        </div>
      )}
    </div>
  );
}
