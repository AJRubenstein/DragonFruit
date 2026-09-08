"use client";

import React from 'react';
import * as THREE from 'three';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Card, CardHeader, IconButton } from '@/components/atoms';
import { useFloatingPanelCollapse } from '@/components/layout/FloatingPanelStack';
import { getModelMesh } from '@/supports/autoSupport/meshStore';
import {
  suggestOrientationForGeometry,
  type OrientationSuggestion,
} from '@/supports/autoSupport/orientationAdvisor';

/** Module-level labels (React Compiler must not rename Lingui locals). */
const TITLE = msg`Auto Rotation (Beta)`;
const ANALYZE = msg`Suggest Orientation`;
const APPLY = msg`Apply Rotation`;
const NO_MODEL = msg`Load a model to get an orientation suggestion.`;
const NO_GEOMETRY = msg`Active model has no readable geometry.`;
const DELTA_LINE = msg`predicted contact change`;

const SECTION_CARD: React.CSSProperties = {
  borderColor: 'var(--border-subtle)',
  background: 'var(--surface-1)',
};

const deg2rad = (d: number): number => (d * Math.PI) / 180;

export interface AutoRotationPanelProps {
  activeModelId?: string;
  /** Live scene rotation (world frame the suggestion is computed in). */
  currentRotation?: THREE.Euler;
  /** Scene-owned apply: moves the model AND its supports, with history. */
  onApplyRotation?: (modelId: string, rotation: THREE.Euler) => void;
}

export function AutoRotationPanel({ activeModelId, currentRotation, onApplyRotation }: AutoRotationPanelProps) {
  const { _ } = useLingui();
  const [expanded, setExpanded] = useFloatingPanelCollapse(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestion, setSuggestion] = React.useState<OrientationSuggestion | null>(null);

  // A new model invalidates the previous suggestion.
  React.useEffect(() => {
    setSuggestion(null);
    setError(null);
  }, [activeModelId]);

  const handleAnalyze = React.useCallback(() => {
    setError(null);
    setSuggestion(null);
    if (!activeModelId) {
      setError(_(NO_MODEL));
      return;
    }
    setBusy(true);
    try {
      const mesh = getModelMesh(activeModelId);
      const position = mesh?.geometry?.attributes?.position;
      if (!mesh || !position) {
        setError(_(NO_GEOMETRY));
        return;
      }
      // Advise in world frame: bake the model's live scene rotation into a
      // throwaway copy (never mutate the live geometry).
      const baked = new Float32Array(position.array as ArrayLike<number>);
      if (currentRotation) {
        const v = new THREE.Vector3();
        for (let i = 0; i < baked.length; i += 3) {
          v.set(baked[i], baked[i + 1], baked[i + 2]).applyEuler(currentRotation);
          baked[i] = v.x;
          baked[i + 1] = v.y;
          baked[i + 2] = v.z;
        }
      }
      const index = (mesh.geometry.index?.array as ArrayLike<number> | undefined) ?? null;
      const result = suggestOrientationForGeometry(
        { attributes: { position: { array: baked } }, index },
        {},
      );
      if (!result) {
        setError(_(NO_GEOMETRY));
        return;
      }
      setSuggestion(result);
    } finally {
      setBusy(false);
    }
  }, [activeModelId, currentRotation, _]);

  const handleApply = React.useCallback(() => {
    if (!activeModelId || !suggestion || !onApplyRotation) return;
    // Advisor evaluates Rx-then-Ry, which is THREE Euler order 'YXZ'
    // (q = qy * qx). Compose the delta onto the live scene orientation;
    // the scene path moves supports along and records history.
    const qDelta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(deg2rad(suggestion.rotXDeg), deg2rad(suggestion.rotYDeg), 0, 'YXZ'),
    );
    const qBase = currentRotation
      ? new THREE.Quaternion().setFromEuler(currentRotation)
      : new THREE.Quaternion();
    const qNew = qDelta.multiply(qBase);
    onApplyRotation(activeModelId, new THREE.Euler().setFromQuaternion(qNew));
    // Rotation changed the world frame the suggestion was computed in.
    setSuggestion(null);
  }, [activeModelId, suggestion, currentRotation, onApplyRotation]);

  const deltaText =
    suggestion == null
      ? null
      : `${suggestion.deltaPercent <= 0 ? '' : '+'}${suggestion.deltaPercent.toFixed(0)}% ${_(DELTA_LINE)}`;

  return (
    <Card>
      <CardHeader
        left={(
          <>
            <IconButton
              onClick={() => setExpanded(!expanded)}
              className="!p-0.5"
              title={expanded ? _(msg`Collapse card`) : _(msg`Expand card`)}
            >
              <svg className="w-3 h-3 transform transition-transform"
                style={{ color: expanded ? 'var(--accent)' : 'var(--text-muted)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                {expanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                )}
              </svg>
            </IconButton>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{_(TITLE)}</h3>
          </>
        )}
      />

      {expanded && (
        <div className="px-2.5 pb-3 space-y-2.5">
          <button
            type="button"
            onClick={() => { void handleAnalyze(); }}
            disabled={busy || !activeModelId}
            className="ui-button w-full !h-8 text-[11px] disabled:opacity-50"
            style={{
              borderColor: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent), var(--surface-0) 86%)',
              color: 'var(--accent)',
            }}
          >
            {busy ? _(msg`Analyzing…`) : _(ANALYZE)}
          </button>

          {error && (
            <p className="text-[11px]" style={{ color: '#f87171' }}>{error}</p>
          )}

          {suggestion && (
            <div className="rounded-md border p-2" style={SECTION_CARD}>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-strong)' }}>
                {suggestion.rotXDeg.toFixed(1)}° X · {suggestion.rotYDeg.toFixed(1)}° Y
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {deltaText}
              </div>
              <button
                type="button"
                onClick={handleApply}
                disabled={suggestion.deltaPercent >= 0}
                className="ui-button mt-1.5 w-full !h-8 text-[11px] disabled:opacity-50"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent), var(--surface-0) 86%)',
                  color: 'var(--accent)',
                }}
              >
                {_(APPLY)}
              </button>
              <p className="mt-1.5 text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                {_(msg`Rotation applies immediately. Re-run the island scan and auto-supports afterwards — tips placed for the old orientation no longer apply.`)}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
