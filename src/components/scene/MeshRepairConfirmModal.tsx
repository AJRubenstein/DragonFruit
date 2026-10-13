'use client';

import React from 'react';
import { Wrench, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/atoms';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';
import type { MeshRepairConfirmPrompt } from '@/features/scene/useSceneCollectionManager';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

type Props = {
  prompt: MeshRepairConfirmPrompt;
  onRepair: () => void;
  onLoadAsIs: () => void;
  onCancelImport: () => void;
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-mono font-semibold tabular-nums" style={{ color: 'var(--text-strong)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

export function MeshRepairConfirmModal({ prompt, onRepair, onLoadAsIs, onCancelImport }: Props) {
  const { _ } = useLingui();
  const { fileName, analysis } = prompt;

  return (
    <StructuredDialogModal
      open
      zIndexClassName="z-[220]"
      ariaLabel={_(msg`Mesh repair confirmation`)}
      title={_(msg`Repair recommended before slicing`)}
      subtitle={_(msg`This model has severe mesh issues and is likely to need heavy repair.`)}
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      closeAriaLabel={_(msg`Cancel importing this model`)}
      onClose={onCancelImport}
      onBackdropClick={onCancelImport}
      actions={(
        <>
          <Button
            variant="secondary"
            className="w-full"
            onClick={onLoadAsIs}
          >
            <Trans>Load As-Is</Trans>
          </Button>
          <Button
            variant="tinted-accent"
            className="w-full gap-1.5"
            onClick={onRepair}
          >
            <Wrench className="h-3.5 w-3.5" />
            <Trans>Repair</Trans>
          </Button>
        </>
      )}
    >
      {/* File info */}
      <div className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}><Trans>File</Trans></div>
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-strong)' }} title={fileName}>
          {fileName}
        </div>
      </div>

      {/* Analysis stats */}
      <div className="rounded-md border px-3 pt-2 pb-1" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
        <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}><Trans>Analysis</Trans></div>
        <StatRow label={_(msg({ message: 'Triangles', context: 'Mesh analysis row' }))} value={analysis.triangle_count} />
        <StatRow label={_(msg({ message: 'Components', context: 'Mesh analysis row' }))} value={analysis.component_count} />
        <StatRow label={_(msg({ message: 'Non-manifold edges', context: 'Mesh analysis row' }))} value={analysis.non_manifold_edges} />
        <StatRow label={_(msg({ message: 'Boundary loops', context: 'Mesh analysis row' }))} value={analysis.boundary_loops} />
      </div>

      {/* Disclaimer */}
      <div
        className="rounded-md border px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, #d97706, var(--border-subtle) 40%)',
          background: 'color-mix(in srgb, #d97706, var(--surface-1) 92%)',
        }}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#d97706' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <Trans>
              <strong style={{ color: 'var(--text-strong)' }}>Disclaimer:</strong> Repair is recommended.
              Loading this mesh as-is may cause slicing errors or print failures, and successful output cannot be guaranteed.
            </Trans>
          </p>
        </div>
      </div>
    </StructuredDialogModal>
  );
}
