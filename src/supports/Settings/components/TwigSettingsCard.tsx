"use client";

import React from 'react';
import type { Twig } from '@/supports/types';
import { updateTwig } from '@/supports/state';
import { NumberInput } from '@/components/ui/NumberInput';
import { twigJointDiameterForLocalDiameter } from '@/supports/SupportTypes/Twig/twigTaper';

interface TwigSettingsCardProps {
    twig: Twig;
}

export function TwigSettingsCard({ twig }: TwigSettingsCardProps) {
    const handleDiskAChange = (val: number) => {
        const next = Math.max(0.05, val);
        const jointDiameter = twigJointDiameterForLocalDiameter(next);
        const firstSeg = twig.segments[0];
        updateTwig({
            ...twig,
            contactDiskA: { ...twig.contactDiskA, contactDiameterMm: next },
            segments: twig.segments.map((seg, i) =>
                i === 0 && firstSeg && seg.bottomJoint
                    ? { ...seg, bottomJoint: { ...seg.bottomJoint, diameter: jointDiameter } }
                    : seg
            ),
        });
    };

    const handleDiskBChange = (val: number) => {
        const next = Math.max(0.05, val);
        const jointDiameter = twigJointDiameterForLocalDiameter(next);
        const lastIdx = twig.segments.length - 1;
        updateTwig({
            ...twig,
            contactDiskB: { ...twig.contactDiskB, contactDiameterMm: next },
            segments: twig.segments.map((seg, i) =>
                i === lastIdx && seg.topJoint
                    ? { ...seg, topJoint: { ...seg.topJoint, diameter: jointDiameter } }
                    : seg
            ),
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Twig</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Tip A (mm)</div>
                    <NumberInput
                        value={twig.contactDiskA.contactDiameterMm}
                        onChange={handleDiskAChange}
                        step={0.05}
                        min={0.05}
                        showStepper={false}
                        className="ui-input h-8 w-full px-2.5 text-xs sm:text-sm text-center no-spinners"
                    />
                </div>
                <div className="space-y-1">
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Tip B (mm)</div>
                    <NumberInput
                        value={twig.contactDiskB.contactDiameterMm}
                        onChange={handleDiskBChange}
                        step={0.05}
                        min={0.05}
                        showStepper={false}
                        className="ui-input h-8 w-full px-2.5 text-xs sm:text-sm text-center no-spinners"
                    />
                </div>
            </div>
        </div>
    );
}
