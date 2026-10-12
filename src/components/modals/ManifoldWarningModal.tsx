'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Button } from '@/components/atoms';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';

type ManifoldWarningModalProps = {
  isOpen: boolean;
  onAcknowledge: () => void;
};

export function ManifoldWarningModal({
  isOpen,
  onAcknowledge,
}: ManifoldWarningModalProps) {
  const { _ } = useLingui();
  return (
    <StructuredDialogModal
      open={isOpen}
      ariaLabel={_(msg`Possible mesh manifold issues`)}
      title={_(msg`Warning: Non-manifold mesh`)}
      subtitle={_(msg`This mesh may not be a valid solid`)}
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      zIndexClassName="z-[130]"
      // No close-X and backdrop clicks are ignored: the user must press OK to
      // acknowledge the manifold warning.
      onBackdropClick={() => {}}
      actions={(
        <Button
          variant="tinted-accent"
          className="inline-flex items-center justify-center gap-1.5"
          onClick={onAcknowledge}
        >
          <Trans>OK</Trans>
        </Button>
      )}
    >
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <Trans>Failed manifold validation. Recommend mesh repair before continuing.</Trans>
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <Trans>
          This may cause issues with printability including support placement and slicing. Some may not
          be immediately visible (e.g. slicing defects, etc.).
        </Trans>
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <Trans>Red overlay indicates individual components failing validation.</Trans>
      </p>
    </StructuredDialogModal>
  );
}
