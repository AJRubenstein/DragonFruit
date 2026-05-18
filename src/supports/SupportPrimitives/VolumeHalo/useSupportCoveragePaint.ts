import React from 'react';
import * as THREE from 'three';
import { subscribe, getSnapshot } from '@/supports/state';
import {
  paintSupportCoverage,
  clearSupportCoveragePaint,
  type SupportCoverageTip,
} from './supportCoveragePainter';

// Brush radius = support contact-disk diameter × this. Scales the halo
// footprint with each support's actual tip size — small contact tips get
// small halos, larger contact tips get proportionally larger halos.
// Value tuned so a typical 0.2mm contact diameter produces a ~2mm radius
// halo (4mm footprint) — large enough to read against the surrounding
// mesh, small enough to clearly belong to its support.
const COVERAGE_RADIUS_FACTOR = 10;
// Strength at the centre of each tip's brush. The picker tint multiplied
// by this strength becomes the additive contribution; higher = brighter
// halo, capped at the picker colour at strength 1.
const COVERAGE_MAX_STRENGTH = 1.0;

// "No halo" vertex colour. Black is the additive identity — for the
// overlay mesh rendered with THREE.AdditiveBlending, vertices at (0,0,0)
// add nothing to the final pixel.
const COVERAGE_NEUTRAL_HEX = '#000000';

interface UseSupportCoveragePaintArgs {
  meshRef: React.MutableRefObject<THREE.Mesh | null> | { current: THREE.Mesh | null };
  enabled: boolean;
  tintColor: string;
  intensity?: number;
  modelId?: string | null;
}

interface ContactConeLike {
  pos?: { x: number; y: number; z: number };
  profile?: { contactDiameterMm?: number };
}

interface ContactDiskLike {
  pos?: { x: number; y: number; z: number };
  contactDiameterMm?: number;
}

interface SupportWithContact {
  modelId?: string;
  contactCone?: ContactConeLike;
  contactConeA?: ContactConeLike;
  contactConeB?: ContactConeLike;
  contactDiskA?: ContactDiskLike;
  contactDiskB?: ContactDiskLike;
}

function pushConeTip(
  tips: SupportCoverageTip[],
  cone: ContactConeLike | undefined,
  fallbackDiameter: number,
): void {
  if (!cone?.pos) return;
  tips.push({
    x: cone.pos.x,
    y: cone.pos.y,
    z: cone.pos.z,
    diameter: cone.profile?.contactDiameterMm ?? fallbackDiameter,
  });
}

function pushDiskTip(
  tips: SupportCoverageTip[],
  disk: ContactDiskLike | undefined,
  fallbackDiameter: number,
): void {
  if (!disk?.pos) return;
  tips.push({
    x: disk.pos.x,
    y: disk.pos.y,
    z: disk.pos.z,
    diameter: disk.contactDiameterMm ?? fallbackDiameter,
  });
}

function collectTips(modelId: string | null | undefined): SupportCoverageTip[] {
  const snap = getSnapshot();
  const tips: SupportCoverageTip[] = [];

  const visit = (collection: Record<string, unknown> | undefined, kind: 'cone' | 'sticklike' | 'twiglike') => {
    if (!collection) return;
    for (const value of Object.values(collection)) {
      const sup = value as SupportWithContact;
      if (modelId != null && sup.modelId != null && sup.modelId !== modelId) continue;
      const fallback = 0.4;
      if (kind === 'cone') {
        pushConeTip(tips, sup.contactCone, fallback);
      } else if (kind === 'sticklike') {
        pushConeTip(tips, sup.contactConeA, fallback);
        pushConeTip(tips, sup.contactConeB, fallback);
      } else if (kind === 'twiglike') {
        pushDiskTip(tips, sup.contactDiskA, fallback);
        pushDiskTip(tips, sup.contactDiskB, fallback);
      }
    }
  };

  const anySnap = snap as unknown as Record<string, Record<string, unknown>>;
  visit(anySnap.trunks, 'cone');
  visit(anySnap.branches, 'cone');
  visit(anySnap.leaves, 'cone');
  visit(anySnap.sticks, 'sticklike');
  visit(anySnap.twigs, 'twiglike');

  return tips;
}

// Subscribes to support state and paints vertex colours on the model
// geometry's `color` attribute. SupportCoveragePaintLayer mounts a
// separate overlay mesh that consumes these vertex colours with
// THREE.AdditiveBlending — so the halo GLOWS additively on top of the
// model rather than being multiplied through its diffuse shader.
//
// The main StlMesh material is never touched: black=base means unpainted
// vertices contribute nothing to the additive overlay, leaving the
// model's natural appearance intact.
export function useSupportCoveragePaint({
  meshRef,
  enabled,
  tintColor,
  intensity = 1,
  modelId = null,
}: UseSupportCoveragePaintArgs): void {
  const [tick, setTick] = React.useState(0);
  const appliedRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;
    const unsub = subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, [enabled]);

  React.useEffect(() => {
    const mesh = meshRef.current;
    const geometry = mesh?.geometry as THREE.BufferGeometry | undefined;
    if (!geometry || !mesh) return;

    const cleanup = () => {
      if (!appliedRef.current) return;
      clearSupportCoveragePaint(geometry, new THREE.Color(COVERAGE_NEUTRAL_HEX));
      appliedRef.current = false;
    };

    if (!enabled) {
      cleanup();
      return;
    }

    const worldTips = collectTips(modelId);
    if (worldTips.length === 0) {
      cleanup();
      return;
    }

    // collectTips returns world-space contact-cone positions. The painter
    // walks geometry.position which is in the mesh's LOCAL space, so we
    // must transform each tip with the mesh's inverse world matrix
    // before painting — otherwise the world coords land on whichever
    // local-space vertex happens to match them (e.g. the face area).
    mesh.updateWorldMatrix(true, false);
    const worldToLocal = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const scratch = new THREE.Vector3();
    const tips = worldTips.map((tip) => {
      scratch.set(tip.x, tip.y, tip.z).applyMatrix4(worldToLocal);
      return {
        x: scratch.x,
        y: scratch.y,
        z: scratch.z,
        diameter: tip.diameter,
      };
    });

    const baseThree = new THREE.Color(COVERAGE_NEUTRAL_HEX);
    const tintThree = new THREE.Color(tintColor);

    paintSupportCoverage(geometry, {
      tips,
      baseColor: baseThree,
      tint: tintThree,
      radiusFactor: COVERAGE_RADIUS_FACTOR,
      maxStrength: Math.min(1, COVERAGE_MAX_STRENGTH * Math.max(0, intensity)),
    });

    appliedRef.current = true;
  }, [meshRef, enabled, tintColor, intensity, modelId, tick]);

  React.useEffect(() => {
    return () => {
      const mesh = meshRef.current;
      const geometry = mesh?.geometry as THREE.BufferGeometry | undefined;
      if (!appliedRef.current || !geometry || !mesh) return;
      clearSupportCoveragePaint(geometry, new THREE.Color(COVERAGE_NEUTRAL_HEX));
      appliedRef.current = false;
    };
  }, [meshRef]);
}
