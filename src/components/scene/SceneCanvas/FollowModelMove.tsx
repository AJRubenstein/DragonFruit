import React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ModelTransform } from '@/hooks/useModelTransform';

type FollowModelMoveProps = {
  modelId: string;
  /** The transform the children were drawn for. */
  baseTransform: ModelTransform;
  /** Live per-model transforms of a drag in flight; the model is absent when it is not moving. */
  liveTransformsRef: React.RefObject<Map<string, ModelTransform>>;
  children: React.ReactNode;
};

/**
 * Carries plate-level helpers along with a model being moved. A drag moves the model
 * imperatively without rerendering the scene, so anything drawn from React props stays
 * where the drag began; this shifts it by the model's live XY offset every frame
 * instead. Only for moves: a rotation or scale changes the helper's shape, not just its
 * place, and Z is left out so the helper stays on the plate.
 */
export function FollowModelMove({ modelId, baseTransform, liveTransformsRef, children }: FollowModelMoveProps) {
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const live = liveTransformsRef.current?.get(modelId);
    if (live) {
      group.position.set(
        live.position.x - baseTransform.position.x,
        live.position.y - baseTransform.position.y,
        0,
      );
    } else {
      group.position.set(0, 0, 0);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
