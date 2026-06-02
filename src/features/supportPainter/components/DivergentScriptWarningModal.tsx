import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { IconButton, Button } from '@/components/ui/primitives';
import { type ROIRegion, type SupportPlacementScript } from '../supportPainterTypes';

interface DivergentScriptWarningModalProps {
  selectedRegions: ROIRegion[];
  placementScripts: Map<string, SupportPlacementScript>;
  onClose: () => void;
  onConfirm: () => void;
}

export function DivergentScriptWarningModal({
  selectedRegions,
  placementScripts,
  onClose,
  onConfirm,
}: DivergentScriptWarningModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/45 animate-fade-in"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div
        className="w-full max-w-md rounded-xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'var(--surface-1, #151a22)',
          borderColor: 'var(--border-subtle, #2d3748)',
          color: 'var(--text-strong, #f7fafc)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle, #2d3748)' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-amber-500">
              Divergent Scripts Warning
            </h2>
          </div>
          <IconButton onClick={onClose} className="!p-1">
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            The selected regions have different assigned support sequences. Clicking <strong>Overwrite &amp; Edit</strong> will apply the new configuration to all {selectedRegions.length} selected ROIs.
          </p>

          {/* Scrollable Container (Exactly 120px tall) */}
          <div
            className="rounded border overflow-y-auto text-[11px]"
            style={{
              height: '120px',
              maxHeight: '120px',
              background: 'var(--surface-2, #0d1117)',
              borderColor: 'var(--border-subtle, #2d3748)',
            }}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  className="border-b sticky top-0"
                  style={{
                    background: 'var(--surface-3, #1e2530)',
                    borderColor: 'var(--border-subtle, #2d3748)',
                    color: 'var(--text-muted, #9ca3af)',
                  }}
                >
                  <th className="p-2 font-bold uppercase tracking-wider text-[9px]">Region (ROI)</th>
                  <th className="p-2 font-bold uppercase tracking-wider text-[9px]">Assigned Sequence Script</th>
                </tr>
              </thead>
              <tbody>
                {selectedRegions.map((region) => {
                  const scriptId = region.placementScriptId;
                  const script = scriptId ? placementScripts.get(scriptId) : null;
                  const scriptName = script
                    ? script.name
                    : region.customBrush?.name || 'Custom ROI Config (Unsaved)';

                  return (
                    <tr
                      key={region.id}
                      className="border-b last:border-0 hover:bg-white/5"
                      style={{ borderColor: 'var(--border-subtle, #2d3748)' }}
                    >
                      <td className="p-2 font-medium flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ background: region.color }}
                        />
                        {region.brushType} (ROI-{region.id.substring(0, 4)})
                      </td>
                      <td className="p-2 text-gray-300">{scriptName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="flex items-center justify-end gap-2.5 px-5 py-4 border-t"
          style={{
            borderColor: 'var(--border-subtle, #2d3748)',
            background: 'var(--surface-2, #0d1117)',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose} className="!text-xs">
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} className="!text-xs bg-amber-600 hover:bg-amber-700 text-white">
            Overwrite &amp; Edit
          </Button>
        </div>
      </div>
    </div>
  );
}
