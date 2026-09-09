"use client";

import React from 'react';
import * as THREE from 'three';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Card, CardHeader, IconButton, Select } from '@/components/atoms';
import { useFloatingPanelCollapse } from '@/components/layout/FloatingPanelStack';
import { getModelMesh } from '@/supports/autoSupport/meshStore';
import {
  suggestOrientationForGeometry,
  type OrientationObjective,
} from '@/supports/autoSupport/orientationAdvisor';
import type { OrientationToastReport } from '@/features/notifications/useEditorToasts';

/** Module-level labels (React Compiler must not rename Lingui locals). */
const TITLE = msg`Auto Orientation (Beta)`;
const ORIENT = msg`Orient Model`;
const OPT_SUPPORTS = msg`Fewest Supports`;
const OPT_HEIGHT = msg`Shortest Print Time`;
const NO_MODEL = msg`Load a model to get an orientation suggestion.`;
const NO_GEOMETRY = msg`Active model has no readable geometry.`;

const deg2rad = (d: number): number => (d * Math.PI) / 180;

export interface AutoRotationPanelProps {
  activeModelId?: string;
  /** Live scene rotation (world frame the suggestion is computed in). */
  currentRotation?: THREE.Euler;
  /** Scene-owned apply: moves the model AND its supports, with history. */
  onApplyRotation?: (modelId: string, rotation: THREE.Euler) => void;
  /** Display name for the toast receipt; falls back to the model id. */
  activeModelName?: string;
  /** Shell-toast receipt for the orient run (data only — the stack renders it). */
  onOrientationReport?: (report: Omit<OrientationToastReport, 'id'>) => void;
  /**
   * Gate before a destructive apply: receives the apply continuation. Returns
   * true when the apply may run immediately (no dialog); false means the gate
   * kept the continuation and will run it after confirm. Absent → apply directly.
   */
  onBeforeOrientApply?: (continueApply: () => void) => boolean;
}

export function AutoRotationPanel({ activeModelId, activeModelName, currentRotation, onApplyRotation, onOrientationReport, onBeforeOrientApply }: AutoRotationPanelProps) {
  const { _ } = useLingui();
  const [expanded, setExpanded] = useFloatingPanelCollapse(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [objective, setObjective] = React.useState<OrientationObjective>('supports');

  // A new model or goal clears a stale error.
  React.useEffect(() => {
    setError(null);
  }, [activeModelId, objective]);

  const handleOrient = React.useCallback(() => {
    setError(null);
    if (!activeModelId) {
      setError(_(NO_MODEL));
      return;
    }
    if (!onApplyRotation) return;
    setBusy(true);
    try {
      const mesh = getModelMesh(activeModelId);
      const position = mesh?.geometry?.attributes?.position;
      if (!mesh || !position) {
        setError(_(NO_GEOMETRY));
        return;
      }
      // Orient in world frame: bake the model's live scene rotation into a
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
        { objective },
      );
      if (!result) {
        setError(_(NO_GEOMETRY));
        return;
      }
      // The scene apply path records history unconditionally, so only
      // apply a strict improvement — never a no-op rotation.
      const improved =
        objective === 'height'
          ? result.suggested.heightMm < result.baseline.heightMm
          : result.suggested.cost < result.baseline.cost;
      if (!improved) {
        onOrientationReport?.({
          status: 'already-optimal',
          modelName: activeModelName ?? activeModelId,
        });
        return;
      }
      // Advisor evaluates Rx-then-Ry, which is THREE Euler order 'YXZ'
      // (q = qy * qx). Compose the delta onto the live scene orientation;
      // the scene path moves supports along and records history.
      const doApply = () => {
        const qDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(deg2rad(result.rotXDeg), deg2rad(result.rotYDeg), 0, 'YXZ'),
        );
        const qBase = currentRotation
          ? new THREE.Quaternion().setFromEuler(currentRotation)
          : new THREE.Quaternion();
        const qNew = qDelta.multiply(qBase);
        onApplyRotation(activeModelId, new THREE.Euler().setFromQuaternion(qNew));
        onOrientationReport?.({
          status: 'applied',
          modelName: activeModelName ?? activeModelId,
        });
      };
      if (!onBeforeOrientApply || onBeforeOrientApply(doApply)) doApply();
    } finally {
      setBusy(false);
    }
  }, [activeModelId, activeModelName, currentRotation, objective, onApplyRotation, onOrientationReport, onBeforeOrientApply, _]);

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
            onClick={() => { void handleOrient(); }}
            disabled={busy || !activeModelId}
            className="ui-button w-full !h-8 text-[11px] disabled:opacity-50"
            style={{
              borderColor: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent), var(--surface-0) 86%)',
              color: 'var(--accent)',
            }}
          >
            {busy ? _(msg`Analyzing…`) : _(ORIENT)}
          </button>
          <div className="flex flex-col gap-1">
            <Select
              value={objective}
              onChange={(e) => setObjective(e.target.value as OrientationObjective)}
              disabled={busy || !activeModelId}
            >
              <option value="supports">{_(OPT_SUPPORTS)}</option>
              <option value="height">{_(OPT_HEIGHT)}</option>
            </Select>
          </div>

          {error && (
            <p className="text-[11px]" style={{ color: '#f87171' }}>{error}</p>
          )}
        </div>
      )}
    </Card>
  );
}
