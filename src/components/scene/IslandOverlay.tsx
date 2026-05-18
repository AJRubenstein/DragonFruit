
import React from 'react';
import * as THREE from 'three';
import type { IslandMarker } from '@/volumeAnalysis/IslandScan/islandOverlayLogic';
import type { ModelTransform } from '@/hooks/useModelTransform';
import { getScanVisualPosition } from '@/utils/scanPositioning';
import { VolumetricHaloMaterial } from '@/features/shaders/mesh/volumetricHalo';

type IslandOverlayProps = {
  markers: IslandMarker[];
  meshRef?: THREE.Mesh | null;
  brushRadiusMm: number;
  color: string;
  // `opacity` is part of the public IslandOverlay prop contract because
  // page.tsx wires the legacy painter knob through this component; the
  // painter consumes it directly. The halo shader path here ignores it.
  opacity: number;
  transform?: ModelTransform;
  centerOffset?: THREE.Vector3;
  selectedIslandId?: number | null;
  clipLower?: number | null;
  clipUpper?: number | null;
  haloIntensity?: number;
  haloPulseEnabled?: boolean;
};

// Render orders for the halo layers. Negative-id seed/center markers keep
// the legacy 99999 so debug overlays stay above everything.
const HALO_RENDER_ORDER_BASE = 500;
const HALO_RENDER_ORDER_OCCLUDED = 999;
const HALO_RENDER_ORDER_VISIBLE = 1000;

/**
 * Renders volumetric halos for detected islands. The geometry is still the
 * tapered hull / cylinder built by islandOverlayLogic; the material is the
 * weight-aware halo shader.
 *
 * Selection model:
 *   - non-selected island: single mesh, depthTest=true, halo falloff dims
 *     it to ambient information while any island is selected
 *   - selected island: two meshes — visible pass (depthTest=true, rim) +
 *     occluded pass (depthTest=false, uOccludedDim×intensity, desaturated
 *     rim). Preserves Renato's "see the selected island through the model"
 *     trick that Ty validated.
 *
 * The legacy vertex-color brush path (islandOverlayPainter.ts) is
 * orthogonal — it writes onto the main mesh's vertex colors. It still
 * functions; brushRadiusMm / color / opacity are consumed by the painter,
 * not this overlay's halo shader.
 */
export function IslandOverlay({
  markers,
  color,
  transform,
  selectedIslandId,
  clipLower,
  clipUpper,
  haloIntensity = 0.7,
  haloPulseEnabled = true,
}: IslandOverlayProps) {
  // Initialize clipping planes once (update in-place to avoid recreation)
  const clippingPlanesRef = React.useRef<THREE.Plane[]>([]);

  React.useEffect(() => {
    const planes: THREE.Plane[] = [];
    if (clipLower != null) {
      planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipLower));
    }
    if (clipUpper != null) {
      planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), clipUpper));
    }
    clippingPlanesRef.current = planes;
  }, [clipLower, clipUpper]);

  const clippingPlanes = clippingPlanesRef.current;
  const anyIslandSelected = selectedIslandId != null;

  if (markers.length === 0) return null;

  // Pass-through for caller-supplied "color" knob from Advanced controls.
  // Empty string / null disables the override and the shader falls back to
  // the OKLCH mid stop.
  const colorOverride = color && color.length > 0 ? color : null;

  return (
    <group position={getScanVisualPosition(transform)}>
      {markers.map((marker) => {
        if (!marker.geometry) return null;

        // Negative ids are debug overlays — seed voxels and center markers.
        // Keep the legacy basic-material treatment so they're always visible.
        if (marker.id < 0) {
          const isSeed = marker.id < -1_000_000;
          const markerColor = isSeed ? '#00ff00' : '#ffff00';
          return (
            <mesh key={marker.id} geometry={marker.geometry} renderOrder={99999}>
              <meshBasicMaterial
                color={markerColor}
                depthTest={false}
                depthWrite={false}
                clippingPlanes={clippingPlanes}
              />
            </mesh>
          );
        }

        const isSelected = marker.id === selectedIslandId;

        if (isSelected) {
          return (
            <group key={marker.id}>
              {/* Occluded pass — visible behind model geometry, slightly dimmed
                  to preserve readability without competing with the model. */}
              <mesh geometry={marker.geometry} renderOrder={HALO_RENDER_ORDER_OCCLUDED}>
                <VolumetricHaloMaterial
                  weight={marker.weight}
                  intensity={haloIntensity}
                  isSelected
                  occludedPass
                  pulseEnabled={false}
                  colorOverride={colorOverride}
                  clippingPlanes={clippingPlanes}
                  baseZ={marker.baseZ}
                  height={marker.geometryHeight}
                />
              </mesh>
              {/* Visible pass — front of model only, full brightness + rim. */}
              <mesh geometry={marker.geometry} renderOrder={HALO_RENDER_ORDER_VISIBLE}>
                <VolumetricHaloMaterial
                  weight={marker.weight}
                  intensity={haloIntensity}
                  isSelected
                  pulseEnabled={haloPulseEnabled}
                  colorOverride={colorOverride}
                  clippingPlanes={clippingPlanes}
                  baseZ={marker.baseZ}
                  height={marker.geometryHeight}
                />
              </mesh>
            </group>
          );
        }

        return (
          <mesh
            key={marker.id}
            geometry={marker.geometry}
            renderOrder={HALO_RENDER_ORDER_BASE}
          >
            <VolumetricHaloMaterial
              weight={marker.weight}
              intensity={haloIntensity}
              pulseEnabled={haloPulseEnabled}
              dimNonSelected={anyIslandSelected ? 1 : 0}
              colorOverride={colorOverride}
              clippingPlanes={clippingPlanes}
              baseZ={marker.baseZ}
              height={marker.geometryHeight}
            />
          </mesh>
        );
      })}
    </group>
  );
}
