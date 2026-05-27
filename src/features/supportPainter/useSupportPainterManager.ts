import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { supportPainterStore, useSupportPainterState } from './supportPainterStore';
import { PAINT_ROI_ADD, PAINT_ROI_REMOVE } from './supportPainterHistoryTypes';
import { pushHistory, registerHistoryHandler } from '@/history/historyStore';
import { type ROIRegion } from './supportPainterTypes';
import { buildClientAdjacencyMap, proposeRegionOnClient } from './useClientAdjacencyMap';

/**
 * Pure Client-Side Headless coordinator for Support Painter mode.
 * Coordinates hover region proposals using local JS adjacency walks (zero Tauri/Rust IPC delay)
 * and drives instant highlights and commits.
 */
export function useSupportPainterManager(
  isActive: boolean,
  activeModelId: string | null = null,
  geometry: THREE.BufferGeometry | null = null,
  meshResolver?: () => THREE.Mesh | null
) {
  const { hoveredTriangleId, activeBrush } = useSupportPainterState();
  const [initializedModelId, setInitializedModelId] = useState<string | null>(null);

  // 1. Register history undo/redo handlers for painting
  useEffect(() => {
    if (!isActive) return;

    const undoAdd = registerHistoryHandler(PAINT_ROI_ADD, (action, direction) => {
      const { region } = action.payload as { region: ROIRegion };
      if (direction === 'undo') {
        supportPainterStore.removeRegion(region.id);
      } else {
        const currentRegions = new Map(supportPainterStore.getSnapshot().regions);
        currentRegions.set(region.id, region);
        supportPainterStore.restoreRegions(currentRegions);
      }
    });

    const undoRemove = registerHistoryHandler(PAINT_ROI_REMOVE, (action, direction) => {
      const { region } = action.payload as { region: ROIRegion };
      if (direction === 'undo') {
        const currentRegions = new Map(supportPainterStore.getSnapshot().regions);
        currentRegions.set(region.id, region);
        supportPainterStore.restoreRegions(currentRegions);
      } else {
        supportPainterStore.removeRegion(region.id);
      }
    });

    return () => {
      undoAdd();
      undoRemove();
    };
  }, [isActive]);

  // 2. Track modifier key state and pointer up at window level
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keys: { alt?: boolean; shift?: boolean } = {};
      if (e.key === 'Alt') keys.alt = true;
      if (e.key === 'Shift') keys.shift = true;

      if (Object.keys(keys).length > 0) {
        supportPainterStore.setModifierKeys(keys);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keys: { alt?: boolean; shift?: boolean } = {};
      if (e.key === 'Alt') keys.alt = false;
      if (e.key === 'Shift') keys.shift = false;

      if (Object.keys(keys).length > 0) {
        supportPainterStore.setModifierKeys(keys);
      }
    };

    const handlePointerUp = () => {
      supportPainterStore.setInteractionPhase('Idle');
    };

    const handleBlur = () => {
      supportPainterStore.setModifierKeys({ alt: false, shift: false });
      supportPainterStore.setInteractionPhase('Idle');
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('blur', handleBlur);
      supportPainterStore.setModifierKeys({ alt: false, shift: false });
      supportPainterStore.setInteractionPhase('Idle');
    };
  }, [isActive]);

  // 3. Build & Cache the Client Adjacency Map locally
  useEffect(() => {
    if (!isActive || !activeModelId || !geometry) {
      supportPainterStore.setClientAdjacencyMap(null);
      setInitializedModelId(null);
      return;
    }

    const currentMap = supportPainterStore.getClientAdjacencyMap();
    if (currentMap && initializedModelId === activeModelId) {
      return;
    }

    try {
      console.log(`[SupportPainterManager] Indexing client-side face adjacency map for model ${activeModelId}`);
      const mesh = meshResolver?.();
      const matrixWorld = mesh?.matrixWorld || new THREE.Matrix4();
      const newMap = buildClientAdjacencyMap(geometry, matrixWorld);
      
      supportPainterStore.setClientAdjacencyMap(newMap);
      setInitializedModelId(activeModelId);
      console.log(`[SupportPainterManager] Indexing complete! ${newMap.faceCount} faces cached in JavaScript.`);
    } catch (err) {
      console.error('[SupportPainterManager] Adjacency map construction failed', err);
      supportPainterStore.setClientAdjacencyMap(null);
      setInitializedModelId(null);
    }
  }, [isActive, activeModelId, geometry, meshResolver, initializedModelId]);

  // 4. Synchronous, Low-Latency Client-Side Region Proposal (runs in <1ms!)
  useEffect(() => {
    if (!isActive || !activeModelId || hoveredTriangleId === null || initializedModelId !== activeModelId) {
      return;
    }

    const map = supportPainterStore.getClientAdjacencyMap();
    if (!map) return;

    try {
      // Execute the brush walk synchronously in JavaScript
      const proposedIds = proposeRegionOnClient(map, hoveredTriangleId, activeBrush);
      supportPainterStore.setProposedTriangleIds(proposedIds);
    } catch (err) {
      console.error('[SupportPainterManager] Client proposal failed', err);
    }
  }, [isActive, activeModelId, hoveredTriangleId, activeBrush, initializedModelId]);
}
