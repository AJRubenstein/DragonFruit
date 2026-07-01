"use client";

import React from 'react';
import type { Brace } from '@/supports/types';
import { updateBrace } from '@/supports/state';
import { NumberInput } from '@/components/ui/NumberInput';

interface BraceSettingsCardProps {
    brace: Brace;
}

export function BraceSettingsCard({ brace }: BraceSettingsCardProps) {
    const hasOverride = brace.diameterOverrideMm != null;
    const profileDiameter = brace.profile?.diameter ?? 1;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Brace</span>
            </div>

            <div className="space-y-1">
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Profile Diameter</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{profileDiameter.toFixed(2)} mm (authored ceiling)</div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={hasOverride}
                    onChange={(e) => {
                        if (e.target.checked) {
                            updateBrace({ ...brace, diameterOverrideMm: profileDiameter });
                        } else {
                            const next = { ...brace };
                            delete next.diameterOverrideMm;
                            updateBrace(next);
                        }
                    }}
                    className="rounded"
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Override diameter</span>
            </label>

            {hasOverride && (
                <div className="space-y-1">
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Diameter override (mm)</div>
                    <NumberInput
                        value={brace.diameterOverrideMm!}
                        onChange={(val) => updateBrace({ ...brace, diameterOverrideMm: Math.max(0.05, val) })}
                        step={0.1}
                        min={0.05}
                        showStepper={false}
                        className="ui-input h-8 w-full px-2.5 text-xs sm:text-sm text-center no-spinners"
                    />
                </div>
            )}
        </div>
    );
}
