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
  const selectionBounds = new THREE.Box3().makeEmpty();

  models.forEach((model) => {
    if (!targetIdSet.has(model.id)) return;
    selectionBounds.union(computePreciseModelWorldBounds(model.geometry, model.transform));
  });

  return selectionBounds.isEmpty()
    ? null
    : selectionBounds.getCenter(new THREE.Vector3());
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

  const currentCenter = getSelectionPositionOrigin(models, targetIds);
  if (!currentCenter) return [];
  return translateModels(
    models,
    targetIds,
    new THREE.Vector3(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y, 0),
  );
}