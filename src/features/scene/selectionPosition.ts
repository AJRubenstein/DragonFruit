import * as THREE from 'three';

import type { GeometryWithBounds } from '@/hooks/useStlGeometry';
import type { ModelTransform } from '@/hooks/useModelTransform';
import { computePreciseModelWorldBounds } from '@/utils/modelBounds';

export type SelectionPositionModel = {
  id: string;
  geometry: GeometryWithBounds;
  transform: ModelTransform;
};

export function getSelectionPositionOrigin(
  models: readonly SelectionPositionModel[],
  targetIds: readonly string[],
): THREE.Vector3 | null {
  const targetIdSet = new Set(targetIds);
  const origin = new THREE.Vector3();
  let count = 0;

  models.forEach((model) => {
    if (!targetIdSet.has(model.id)) return;
    origin.add(model.transform.position);
    count += 1;
  });

  return count > 0 ? origin.multiplyScalar(1 / count) : null;
}

function translateModels(
  models: readonly SelectionPositionModel[],
  targetIds: readonly string[],
  delta: THREE.Vector3,
): Array<{ id: string; transform: ModelTransform }> {
  const targetIdSet = new Set(targetIds);

  return models
    .filter((model) => targetIdSet.has(model.id))
    .map((model) => ({
      id: model.id,
      transform: {
        position: model.transform.position.clone().add(delta),
        rotation: model.transform.rotation.clone(),
        scale: model.transform.scale.clone(),
      },
    }));
}

export function buildSelectionPositionUpdates(
  models: readonly SelectionPositionModel[],
  targetIds: readonly string[],
  nextSelectionOrigin: THREE.Vector3,
): Array<{ id: string; transform: ModelTransform }> {
  const currentOrigin = getSelectionPositionOrigin(models, targetIds);
  if (!currentOrigin) return [];

  const delta = nextSelectionOrigin.clone().sub(currentOrigin);
  return translateModels(models, targetIds, delta);
}

export function buildCenterSelectionUpdates(
  models: readonly SelectionPositionModel[],
  targetIds: readonly string[],
  targetCenter: THREE.Vector2,
): Array<{ id: string; transform: ModelTransform }> {
  const targetIdSet = new Set(targetIds);
  const targetModels = models.filter((model) => targetIdSet.has(model.id));
  if (targetModels.length === 1) {
    const position = targetModels[0].transform.position;
    return translateModels(
      models,
      targetIds,
      new THREE.Vector3(targetCenter.x - position.x, targetCenter.y - position.y, 0),
    );
  }

  const selectionBounds = new THREE.Box3().makeEmpty();

  targetModels.forEach((model) => {
    selectionBounds.union(computePreciseModelWorldBounds(model.geometry, model.transform));
  });

  if (selectionBounds.isEmpty()) return [];

  const currentCenter = selectionBounds.getCenter(new THREE.Vector3());
  return translateModels(
    models,
    targetIds,
    new THREE.Vector3(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y, 0),
  );
}