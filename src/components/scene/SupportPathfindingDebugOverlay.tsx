import React from 'react';
import * as THREE from 'three';
import type { Vec3 } from '@/supports/types';
import type { GridAStarDebugPassSnapshot, SupportPathfindingDebugSnapshot } from '@/supports/PlacementLogic/Pathfinding/pathfindingDebugState';

function buildPositionArray(points: Vec3[]): Float32Array {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const base = i * 3;
    positions[base] = point.x;
    positions[base + 1] = point.y;
    positions[base + 2] = point.z;
  }
  return positions;
}

function DebugPoints({
  points,
  color,
  size,
  opacity,
}: {
  points: Vec3[];
  color: string;
  size: number;
  opacity: number;
}) {
  const positions = React.useMemo(() => buildPositionArray(points), [points]);
  if (points.length === 0) return null;

  return (
    <points renderOrder={1000} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation={false}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </points>
  );
}

function DebugLine({
  points,
  color,
  opacity,
}: {
  points: Vec3[];
  color: string;
  opacity: number;
}) {
  const line = React.useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buildPositionArray(points), 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const object = new THREE.Line(geometry, material);
    object.renderOrder = 1001;
    object.frustumCulled = false;
    return object;
  }, [color, opacity, points]);

  React.useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  if (points.length < 2) return null;

  return <primitive object={line} />;
}

function fmtMm(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(2)}mm`;
}

function fmtDeg(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(1)}deg`;
}

function severityColor(severity: 'info' | 'success' | 'warning' | 'error'): string {
  if (severity === 'success') return '#86efac';
  if (severity === 'warning') return '#fde68a';
  if (severity === 'error') return '#fca5a5';
  return '#bfdbfe';
}

export function SupportPathfindingDebugHud({ snapshot }: { snapshot: SupportPathfindingDebugSnapshot | null }) {
  if (!snapshot) return null;

  const passLines = snapshot.passes.map((pass) => {
    const flags = [
      pass.reached ? 'reached' : 'miss',
      pass.stagnated ? 'stagnated' : null,
      pass.hitExpansionLimit ? 'budget' : null,
    ].filter(Boolean).join(', ');
    return `${pass.label}: ${flags} | exp ${pass.expansions} | step ${pass.searchStepMm}mm | raw ${pass.rawPath.length} simp ${pass.simplifiedPath.length}`;
  });
  const latestEvents = (snapshot.events ?? []).slice(-8);
  const cone = snapshot.cone;
  const outcome = snapshot.outcome;
  const socketShift = snapshot.nominalSocketPos
    ? Math.hypot(
      snapshot.socketPos.x - snapshot.nominalSocketPos.x,
      snapshot.socketPos.y - snapshot.nominalSocketPos.y,
      snapshot.socketPos.z - snapshot.nominalSocketPos.z,
    )
    : 0;

  return (
    <div
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 12,
        top: 12,
        zIndex: 64,
        color: '#e5eefb',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.35,
        width: 'min(360px, calc(100vw - 24px))',
        maxHeight: 'min(42vh, 360px)',
        overflow: 'hidden',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(9, 14, 26, 0.92), rgba(21, 33, 53, 0.82))',
        border: '1px solid rgba(148, 163, 184, 0.45)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.36)',
        backdropFilter: 'blur(6px)',
        whiteSpace: 'normal',
      }}
    >
      <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 6 }}>
        Support Pathfinding Debug
      </div>
      <div>
        <span style={{ color: '#94a3b8' }}>outcome:</span>{' '}
        <span style={{ color: outcome?.status === 'blocked' ? '#fca5a5' : '#86efac' }}>
          {outcome ? `${outcome.status} (${outcome.reason})` : 'pending'}
        </span>
      </div>
      {cone && (
        <div style={{ marginTop: 6 }}>
          <div><span style={{ color: '#94a3b8' }}>cone:</span> nominal {cone.nominalClear ? 'clear' : 'blocked'}, active {cone.activeClear ? 'clear' : 'blocked'}</div>
          <div>
            <span style={{ color: '#94a3b8' }}>disk angle:</span>{' '}
            <span style={{ color: cone.diskAngleLimitExceeded ? '#fca5a5' : '#e5eefb' }}>
              {fmtDeg(cone.activeDiskAngleDeg)} / {fmtDeg(cone.maxDiskAngleDeg)}
            </span>
            {' '}<span style={{ color: '#94a3b8' }}>length:</span> {fmtMm(cone.activeConeLengthMm)}
          </div>
          <div><span style={{ color: '#94a3b8' }}>socket shift:</span> {fmtMm(socketShift)} <span style={{ color: '#94a3b8' }}>added cone:</span> {fmtMm(cone.activeAddedLengthMm)}</div>
        </div>
      )}
      {snapshot.envelope && (
        <div style={{ marginTop: 6 }}>
          <span style={{ color: '#94a3b8' }}>envelope:</span> lateral {fmtMm(snapshot.envelope.maxTotalLateralMm)}, clearance {fmtMm(snapshot.envelope.clearanceMm)}, rescue radii {snapshot.envelope.rescueRadiiMm.length}
        </div>
      )}
      {passLines.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#94a3b8' }}>passes:</div>
          {passLines.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}
      {latestEvents.length > 0 && (
        <div
          style={{
            marginTop: 6,
            maxHeight: '124px',
            overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(to bottom, black 82%, transparent)',
            maskImage: 'linear-gradient(to bottom, black 82%, transparent)',
          }}
        >
          <div style={{ color: '#94a3b8' }}>events:</div>
          {latestEvents.map((event, index) => (
            <div key={`${event.stage}-${index}`}>
              <span style={{ color: severityColor(event.severity) }}>{event.stage}</span>: {event.message}
              {event.details ? <span style={{ color: '#94a3b8' }}> | {event.details}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PassOverlay({
  pass,
  expandedColor,
  frontierColor,
  rawPathColor,
  simplifiedPathColor,
}: {
  pass: GridAStarDebugPassSnapshot;
  expandedColor: string;
  frontierColor: string;
  rawPathColor: string;
  simplifiedPathColor: string;
}) {
  return (
    <>
      <DebugPoints points={pass.expandedNodes} color={expandedColor} size={4.5} opacity={0.22} />
      <DebugPoints points={pass.frontierNodes} color={frontierColor} size={6.5} opacity={0.8} />
      <DebugLine points={pass.rawPath} color={rawPathColor} opacity={0.45} />
      <DebugLine points={pass.simplifiedPath} color={simplifiedPathColor} opacity={0.95} />
    </>
  );
}

export function SupportPathfindingDebugOverlay({
  snapshot,
}: {
  snapshot: SupportPathfindingDebugSnapshot | null;
}) {
  const socketPoint = React.useMemo(() => (snapshot ? [snapshot.socketPos] : []), [snapshot]);
  const rootTargetPoint = React.useMemo(() => (
    snapshot
      ? [{ x: snapshot.socketPos.x, y: snapshot.socketPos.y, z: snapshot.rootTopZ }]
      : []
  ), [snapshot]);
  const basePoint = React.useMemo(() => (snapshot?.basePos ? [snapshot.basePos] : []), [snapshot]);
  const finalChain = snapshot?.finalChain ?? [];

  if (!snapshot) return null;

  const finePass = snapshot.passes.find((pass) => pass.label === 'fine') ?? null;
  const widePass = snapshot.passes.find((pass) => pass.label === 'wide') ?? null;

  return (
    <group name="support-pathfinding-debug-overlay">
      <DebugPoints points={socketPoint} color="#ff4fd8" size={11} opacity={1} />
      <DebugPoints points={rootTargetPoint} color="#5eead4" size={9} opacity={0.95} />
      <DebugPoints points={basePoint} color="#f8fafc" size={8} opacity={0.95} />
      <DebugLine points={finalChain} color="#ffffff" opacity={0.9} />

      {finePass && (
        <PassOverlay
          pass={finePass}
          expandedColor="#f59e0b"
          frontierColor="#fde68a"
          rawPathColor="#f97316"
          simplifiedPathColor="#22c55e"
        />
      )}

      {widePass && (
        <PassOverlay
          pass={widePass}
          expandedColor="#38bdf8"
          frontierColor="#bfdbfe"
          rawPathColor="#60a5fa"
          simplifiedPathColor="#a855f7"
        />
      )}
    </group>
  );
}
