"use client";

import React from 'react';
import type { Stick } from '@/supports/types';
import { updateStick } from '@/supports/state';
import { NumberInput } from '@/components/ui/NumberInput';

interface StickSettingsCardProps {
    stick: Stick;
}

export function StickSettingsCard({ stick }: StickSettingsCardProps) {
    const shaftDiameter = stick.segments[0]?.diameter ?? 1.0;

    const handleDiameterChange = (val: number) => {
        const next = Math.max(0.05, val);
        updateStick({
            ...stick,
            segments: stick.segments.map((seg) => ({
                ...seg,
                diameter: next,
                ...(seg.topJoint ? { topJoint: { ...seg.topJoint, diameter: next } } : {}),
                ...(seg.bottomJoint ? { bottomJoint: { ...seg.bottomJoint, diameter: next } } : {}),
            })),
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Stick</span>
            </div>

            <div className="space-y-1">
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Shaft Diameter (mm)</div>
                <NumberInput
                    value={shaftDiameter}
                    onChange={handleDiameterChange}
                    step={0.1}
                    min={0.05}
                    showStepper={false}
                    className="ui-input h-8 w-full px-2.5 text-xs sm:text-sm text-center no-spinners"
                />
            </div>

            <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                <div>Tip A: {stick.contactConeA.profile.contactDiameterMm.toFixed(2)} mm</div>
                <div>Tip B: {stick.contactConeB.profile.contactDiameterMm.toFixed(2)} mm</div>
            </div>
        </div>
    );
}
