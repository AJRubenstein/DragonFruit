'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { StructuredDialogModal } from '@/components/ui/StructuredDialogModal';

type UndrainedWarningModalProps = {
  isOpen: boolean;
  onAcknowledge: () => void;
};

export function UndrainedWarningModal({
  isOpen,
  onAcknowledge,
}: UndrainedWarningModalProps) {
  return (
    <StructuredDialogModal
      open={isOpen}
      ariaLabel="Hollowing or Resin Traps Missing Drain Holes!"
      title="Hollowing or Resin Traps Missing Drain Holes!"
      subtitle="Missing drain holes detected"
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      zIndexClassName="z-[130]"
      onBackdropClick={() => {}}
      actions={(
        <button
          type="button"
          className="ui-button ui-button-accent !h-9 w-full px-3 text-xs"
          onClick={onAcknowledge}
        >
          OK
        </button>
      )}
    >
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Model import detected potential hollowing or resin trap volumes inside the model which do not have holes draining to the outside.
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Please check the model for hollowing and resin traps and add drain holes in the Prepare -&gt; Hollow tab.
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        After adding drain holes, automatically recognized support components may revert to model designation (pink). Right-click -&gt; Scan for Supports after adding holes.
      </p>
    </StructuredDialogModal>
  );
}
