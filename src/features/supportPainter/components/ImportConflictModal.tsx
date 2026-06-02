import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { IconButton, Button } from '@/components/ui/primitives';
import { type ConflictItem } from '../supportPainterTypes';

interface ImportConflictModalProps {
  conflicts: ConflictItem[];
  onClose: () => void;
  onResolve: (resolutions: Record<string, 'overwrite' | 'keepLocal' | 'rename'>) => void;
}

export function ImportConflictModal({
  conflicts,
  onClose,
  onResolve,
}: ImportConflictModalProps) {
  // Track resolution choices, default to 'keepLocal'
  const [resolutions, setResolutions] = useState<Record<string, 'overwrite' | 'keepLocal' | 'rename'>>(() => {
    const initial: Record<string, 'overwrite' | 'keepLocal' | 'rename'> = {};
    for (const c of conflicts) {
      initial[c.id] = 'keepLocal';
    }
    return initial;
  });

  const handleToggleResolution = (id: string, option: 'overwrite' | 'keepLocal' | 'rename') => {
    setResolutions(prev => ({
      ...prev,
      [id]: option,
    }));
  };

  const handleApply = () => {
    onResolve(resolutions);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/45 animate-fade-in"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div
        className="w-full max-w-lg rounded-xl border flex flex-col overflow-hidden shadow-2xl"
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
            <AlertCircle className="w-5 h-5 text-sky-500" />
            <h2 className="text-sm font-bold text-sky-500">
              Import Configuration Conflicts
            </h2>
          </div>
          <IconButton onClick={onClose} className="!p-1">
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            The imported scene file contains custom support configurations that already exist on your machine, but with different parameters. Choose how you want to handle each conflict:
          </p>

          {/* Scrollable Container */}
          <div
            className="rounded border overflow-y-auto flex flex-col max-h-[250px] p-2 gap-3"
            style={{
              background: 'var(--surface-2, #0d1117)',
              borderColor: 'var(--border-subtle, #2d3748)',
            }}
          >
            {conflicts.map((c) => {
              const activeOption = resolutions[c.id];
              return (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border text-xs"
                  style={{
                    background: 'var(--surface-3, #1e2530)',
                    borderColor: 'var(--border-subtle, #2d3748)',
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-300 truncate pr-2">
                      {c.type === 'script' ? '📄 Placement Script' : '🏗️ Support Preset'}: <span className="text-white font-bold">{c.name}</span>
                    </span>
                    <span className="text-[10px] text-gray-500">ID: {c.id.substring(0, 8)}...</span>
                  </div>

                  {/* Resolution Buttons Group */}
                  <div className="flex items-center gap-1 mt-1 bg-black/30 p-0.5 rounded-lg border border-border-subtle/50">
                    <button
                      type="button"
                      onClick={() => handleToggleResolution(c.id, 'keepLocal')}
                      className={`flex-1 py-1 px-2 text-[10px] font-medium rounded-md transition-all ${
                        activeOption === 'keepLocal'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Keep Local
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleResolution(c.id, 'overwrite')}
                      className={`flex-1 py-1 px-2 text-[10px] font-medium rounded-md transition-all ${
                        activeOption === 'overwrite'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Overwrite Local
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleResolution(c.id, 'rename')}
                      className={`flex-1 py-1 px-2 text-[10px] font-medium rounded-md transition-all ${
                        activeOption === 'rename'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Import as Copy
                    </button>
                  </div>
                </div>
              );
            })}
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
            Cancel Import
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            className="!text-xs bg-sky-600 hover:bg-sky-700 text-white"
          >
            Apply &amp; Import
          </Button>
        </div>
      </div>
    </div>
  );
}
