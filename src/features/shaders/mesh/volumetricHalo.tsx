import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { haloColorAt, ISLAND_HALO_STOPS, type HaloStops } from './haloColorRamp';

// VolumetricHaloMaterial — soft volumetric halo shader for islands and supports.
//
// Architecture:
//   Patches meshStandardMaterial via onBeforeCompile (same pattern as
//   OverhangHeatmapMaterial). useRef-held uniforms survive React re-renders
//   so the shader keeps the same uniform identity across frames.
//
// Public uniform contract (kept small on purpose — most appearance is
// derived from a few cognitive levers):
//   uIntensity      — primary "how loud" slider, 0..1
//   uWeight         — island/support severity, 0..1 (drives color + pulse)
//   uColorOverride  — optional mid-stop override (Advanced color knob)
//                     Paired with uColorOverrideActive 0/1 sentinel since
//                     GLSL has no null.
//   uIsSelected     — 0|1, drives selection rim
//   uOccludedDim    — multiplier for occluded selection pass (default 0.85
//                     to preserve Renato's existing readability)
//   uDimNonSelected — when >0, the renderer is in any-island-selected
//                     mode; this halo is non-selected; dim it.
//   uPulseEnabled   — gates breathing pulse. Forced off if user prefers
//                     reduced motion.
//   uMaxOpacity     — hard ceiling so a stack of overlapping halos can
//                     never fully obscure the model.
//
// Falloff curves (chosen via /impeccable design call sheet):
//   Radial XY  — smoothstep² (cheap, softer than a hard edge, zero at
//                boundary so abutting halos composite cleanly).
//   Vertical Z — exp(-3 * h/H), anchors the visual centre of mass at
//                the unsupported base layer instead of frosting the top.
//   Color ramp — 3-stop OKLCH lerp pre-computed CPU-side, mixed by
//                weight on the GPU.

export interface VolumetricHaloMaterialProps {
  weight: number;
  intensity: number;
  isSelected?: boolean;
  occludedDim?: number;
  dimNonSelected?: number;
  pulseEnabled?: boolean;
  selectionRimColor?: string;
  selectionBoost?: number;
  maxOpacity?: number;
  occludedPass?: boolean;
  colorOverride?: string | null;
  stops?: HaloStops;
  toneMapped?: boolean;
  clippingPlanes?: THREE.Plane[];
  renderOrder?: number; // forwarded by caller on the mesh, kept here for documentation
  // Vertical-falloff normalisation. Some halo geometries are pre-translated
  // to a non-zero base (e.g. island marker geometries land at scan baseZ
  // in their local space), so the shader needs to know the base and total
  // height to remap vHaloLocalPos.z into [0, 1]. Defaults assume geometry
  // is already in [0, 1] (the SupportVolumeHalo case).
  baseZ?: number;
  height?: number;
}

const COOL_NEAR_WHITE = '#dceaef';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (ev: MediaQueryListEvent) => setReduced(ev.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export const VolumetricHaloMaterial = React.forwardRef<
  THREE.MeshStandardMaterial,
  VolumetricHaloMaterialProps
>(function VolumetricHaloMaterial(
  {
    weight,
    intensity,
    isSelected = false,
    occludedDim = 0.85,
    dimNonSelected = 0,
    pulseEnabled = true,
    selectionRimColor = COOL_NEAR_WHITE,
    selectionBoost = 1.5,
    maxOpacity = 0.85,
    occludedPass = false,
    colorOverride = null,
    stops = ISLAND_HALO_STOPS,
    toneMapped = false,
    clippingPlanes,
    baseZ = 0,
    height = 1,
  },
  ref,
) {
  const reducedMotion = usePrefersReducedMotion();
  const effectivePulse = pulseEnabled && !reducedMotion;

  const colorLow = React.useMemo(() => haloColorAt(0, stops), [stops]);
  const colorMid = React.useMemo(() => haloColorAt(0.5, stops), [stops]);
  const colorHigh = React.useMemo(() => haloColorAt(1, stops), [stops]);

  const overrideColor = React.useMemo(
    () => (colorOverride ? new THREE.Color(colorOverride) : new THREE.Color(0, 0, 0)),
    [colorOverride],
  );

  const uniformsRef = React.useRef({
    uColorLow: { value: colorLow.clone() },
    uColorMid: { value: colorMid.clone() },
    uColorHigh: { value: colorHigh.clone() },
    uColorOverride: { value: overrideColor.clone() },
    uColorOverrideActive: { value: colorOverride ? 1 : 0 },
    uWeight: { value: weight },
    uIntensity: { value: intensity },
    uSelectionBoost: { value: selectionBoost },
    uIsSelected: { value: isSelected ? 1 : 0 },
    uOccludedPass: { value: occludedPass ? 1 : 0 },
    uOccludedDim: { value: occludedDim },
    uDimNonSelected: { value: dimNonSelected },
    uPulseEnabled: { value: effectivePulse ? 1 : 0 },
    uMaxOpacity: { value: maxOpacity },
    uSelectionRimColor: { value: new THREE.Color(selectionRimColor) },
    uTime: { value: 0 },
    uBaseZ: { value: baseZ },
    uHeight: { value: Math.max(height, 1e-4) },
  });

  // Live-sync uniforms when props change. We mutate the ref's .value rather
  // than rebuilding the uniforms object so onBeforeCompile's binding stays
  // valid across renders.
  React.useEffect(() => {
    uniformsRef.current.uColorLow.value.copy(colorLow);
    uniformsRef.current.uColorMid.value.copy(colorMid);
    uniformsRef.current.uColorHigh.value.copy(colorHigh);
  }, [colorLow, colorMid, colorHigh]);

  React.useEffect(() => {
    uniformsRef.current.uColorOverride.value.copy(overrideColor);
    uniformsRef.current.uColorOverrideActive.value = colorOverride ? 1 : 0;
  }, [overrideColor, colorOverride]);

  React.useEffect(() => {
    uniformsRef.current.uWeight.value = weight;
    uniformsRef.current.uIntensity.value = intensity;
    uniformsRef.current.uSelectionBoost.value = selectionBoost;
    uniformsRef.current.uIsSelected.value = isSelected ? 1 : 0;
    uniformsRef.current.uOccludedPass.value = occludedPass ? 1 : 0;
    uniformsRef.current.uOccludedDim.value = occludedDim;
    uniformsRef.current.uDimNonSelected.value = dimNonSelected;
    uniformsRef.current.uPulseEnabled.value = effectivePulse ? 1 : 0;
    uniformsRef.current.uMaxOpacity.value = maxOpacity;
    uniformsRef.current.uSelectionRimColor.value = new THREE.Color(selectionRimColor);
    uniformsRef.current.uBaseZ.value = baseZ;
    uniformsRef.current.uHeight.value = Math.max(height, 1e-4);
  }, [
    weight,
    intensity,
    selectionBoost,
    isSelected,
    occludedPass,
    occludedDim,
    dimNonSelected,
    effectivePulse,
    maxOpacity,
    selectionRimColor,
    baseZ,
    height,
  ]);

  useFrame(({ clock }) => {
    uniformsRef.current.uTime.value = clock.elapsedTime;
  });

  return (
    <meshStandardMaterial
      ref={ref}
      transparent
      depthWrite={false}
      toneMapped={toneMapped}
      side={THREE.DoubleSide}
      clippingPlanes={clippingPlanes}
      onBeforeCompile={(shader) => {
        shader.uniforms.uColorLow = uniformsRef.current.uColorLow;
        shader.uniforms.uColorMid = uniformsRef.current.uColorMid;
        shader.uniforms.uColorHigh = uniformsRef.current.uColorHigh;
        shader.uniforms.uColorOverride = uniformsRef.current.uColorOverride;
        shader.uniforms.uColorOverrideActive = uniformsRef.current.uColorOverrideActive;
        shader.uniforms.uWeight = uniformsRef.current.uWeight;
        shader.uniforms.uIntensity = uniformsRef.current.uIntensity;
        shader.uniforms.uSelectionBoost = uniformsRef.current.uSelectionBoost;
        shader.uniforms.uIsSelected = uniformsRef.current.uIsSelected;
        shader.uniforms.uOccludedPass = uniformsRef.current.uOccludedPass;
        shader.uniforms.uOccludedDim = uniformsRef.current.uOccludedDim;
        shader.uniforms.uDimNonSelected = uniformsRef.current.uDimNonSelected;
        shader.uniforms.uPulseEnabled = uniformsRef.current.uPulseEnabled;
        shader.uniforms.uMaxOpacity = uniformsRef.current.uMaxOpacity;
        shader.uniforms.uSelectionRimColor = uniformsRef.current.uSelectionRimColor;
        shader.uniforms.uTime = uniformsRef.current.uTime;
        shader.uniforms.uBaseZ = uniformsRef.current.uBaseZ;
        shader.uniforms.uHeight = uniformsRef.current.uHeight;

        // Pass local-space position, local-space normal, and world-space
        // position so the fragment shader can compute fresnel against the
        // camera and the vertical falloff against the geometry's local
        // base z.
        shader.vertexShader = `
          varying vec3 vHaloLocalPos;
          varying vec3 vHaloLocalNormal;
          varying vec3 vHaloWorldPos;
          varying vec3 vHaloWorldNormal;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
            #include <begin_vertex>
            vHaloLocalPos = position;
            vHaloLocalNormal = normalize(normal);
            vHaloWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vHaloWorldNormal = normalize(mat3(modelMatrix) * normal);
          `,
        );

        shader.fragmentShader = `
          uniform vec3 uColorLow;
          uniform vec3 uColorMid;
          uniform vec3 uColorHigh;
          uniform vec3 uColorOverride;
          uniform float uColorOverrideActive;
          uniform float uWeight;
          uniform float uIntensity;
          uniform float uSelectionBoost;
          uniform float uIsSelected;
          uniform float uOccludedPass;
          uniform float uOccludedDim;
          uniform float uDimNonSelected;
          uniform float uPulseEnabled;
          uniform float uMaxOpacity;
          uniform vec3 uSelectionRimColor;
          uniform float uTime;
          uniform float uBaseZ;
          uniform float uHeight;
          varying vec3 vHaloLocalPos;
          varying vec3 vHaloLocalNormal;
          varying vec3 vHaloWorldPos;
          varying vec3 vHaloWorldNormal;

          // Three-stop perceptual ramp (sRGB output domain). The hue
          // interpolation is already perceptual on the CPU; this is just
          // the GPU-side mix between the three pre-baked stops.
          vec3 haloRampSample(float w) {
            vec3 baseMid = mix(uColorMid, uColorOverride, clamp(uColorOverrideActive, 0.0, 1.0));
            if (w <= 0.5) {
              return mix(uColorLow, baseMid, w * 2.0);
            }
            return mix(baseMid, uColorHigh, (w - 0.5) * 2.0);
          }
        ` + shader.fragmentShader;

        // Drop in our own opacity calculation right before the alpha test
        // cutoff so we override every standard alpha contribution.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <output_fragment>',
          `
            // ----- Halo falloff -----
            // Silhouette glow (fresnel-style): on a transparent shell mesh,
            // every fragment lives on the geometry surface, so a true
            // radial-distance-from-axis bound is degenerate. Instead, the
            // soft halo gradient comes from the angle between the fragment
            // normal and the view direction — high at grazing angles (rim),
            // low when looking straight through. This is the classic
            // "atmosphere shell" technique and gives the volumetric read
            // honestly without raymarching.
            vec3 viewDir = normalize(cameraPosition - vHaloWorldPos);
            float facing = abs(dot(normalize(vHaloWorldNormal), viewDir));
            // smoothstep² puts more density at the silhouette edge.
            float radialFalloff = 1.0 - smoothstep(0.0, 1.0, facing);
            radialFalloff *= radialFalloff;

            // Vertical: exp decay from the geometry's base upward. uBaseZ /
            // uHeight remap the geometry's local z range (which may not be
            // [0,1] when geometry has been pre-translated) into [0,1] for
            // the falloff. Default (baseZ=0, height=1) preserves the
            // SupportVolumeHalo case where geometry is already normalised.
            float vNorm = clamp((vHaloLocalPos.z - uBaseZ) / uHeight, 0.0, 1.0);
            float verticalFalloff = exp(-3.0 * vNorm);

            // Breathing pulse: only on high-weight halos with pulse on.
            float pulse = 1.0;
            if (uPulseEnabled > 0.5 && uWeight > 0.6) {
              float phase = 0.5 + 0.5 * cos(6.2831853 * uTime / 2.4);
              pulse = 0.94 + 0.12 * phase;
            }

            vec3 rampColor = haloRampSample(clamp(uWeight, 0.0, 1.0));

            // Effective intensity: slider × selection boost when selected (clamped
            // so a max-slider user doesn't blow out the selected pass), and
            // dimmed when this halo is non-selected during an active selection.
            float selBoost = mix(1.0, uSelectionBoost, clamp(uIsSelected, 0.0, 1.0));
            float effIntensity = clamp(uIntensity * selBoost, 0.0, 1.0);
            // Occluded pass: replace the boost with the occluded-dim multiplier.
            effIntensity = mix(effIntensity, clamp(uIntensity * uOccludedDim, 0.0, 1.0), clamp(uOccludedPass, 0.0, 1.0));
            // Non-selected dimming during any active island selection.
            effIntensity *= mix(1.0, 0.4, clamp(uDimNonSelected, 0.0, 1.0));

            float falloff = radialFalloff * verticalFalloff * pulse * effIntensity;

            // Selection rim: a thin bright band where the silhouette of the
            // halo geometry meets the camera ray. fwidth widens with screen-
            // space pixel size so the band stays ~1px regardless of zoom.
            float rim = 0.0;
            if (uIsSelected > 0.5) {
              float silhouette = 1.0 - abs(dot(normalize(vHaloWorldNormal), viewDir));
              float aa = max(fwidth(silhouette) * 1.5, 0.001);
              rim = smoothstep(0.85 - aa, 0.85 + aa, silhouette);
              // Desaturate the rim on the occluded pass to 35% chroma so it
              // hints rather than competes.
              float rimDesat = mix(1.0, 0.35, clamp(uOccludedPass, 0.0, 1.0));
              rampColor = mix(rampColor, uSelectionRimColor * rimDesat + rampColor * (1.0 - rimDesat), rim);
            }

            vec3 finalRgb = rampColor;
            float finalAlpha = clamp(falloff + rim * 0.35, 0.0, uMaxOpacity);

            gl_FragColor = vec4(finalRgb, finalAlpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          `,
        );
      }}
    />
  );
});
