import React from 'react';
import * as THREE from 'three';
import { blendTintColor, clampTintStrength } from './tint';

// Maximum number of support-coverage tips the shader can render at once.
// Each tip is one vec4 (xyz = world-space contact pos, w = halo radius).
// WebGL has a global vec4 uniform limit (typically 256+); 64 is far below
// that and covers the vast majority of resin-print support counts.
const MAX_SUPPORT_TIPS = 64;

// Shader version — bump whenever onBeforeCompile body changes so the
// `customProgramCacheKey` returns a new value and Three.js recompiles
// instead of reusing the cached program from an earlier HMR cycle.
const SOFTCLAY_SHADER_VERSION = 'support-coverage-v8-diagnostic-stripped';

export interface SupportCoverageTipData {
  // Flat Float32Array of length MAX_SUPPORT_TIPS * 4, in xyzr quartets.
  // We pre-pack on the CPU rather than uploading an array of Vector4
  // objects on every state change — keeps the uniform update branchless
  // and stable across React render passes.
  tips: Float32Array;
  count: number;
}

export function SoftClayMaterial({
  isSelected,
  isHovered,
  useVertexColors,
  meshColor,
  hoverTintColor,
  selectedTintColor,
  hoverTintStrength,
  selectedTintStrength,
  materialRoughness,
  clippingPlanes,
  supportCoverageTips,
  supportCoverageColor,
  supportCoverageIntensity = 0.7,
}: {
  isSelected: boolean;
  isHovered: boolean;
  useVertexColors?: boolean;
  meshColor?: string;
  hoverTintColor?: string;
  selectedTintColor?: string;
  hoverTintStrength?: number;
  selectedTintStrength?: number;
  materialRoughness?: number;
  clippingPlanes: THREE.Plane[];
  // When provided AND count > 0, the shader's fragment stage blends
  // toward supportCoverageColor for any fragment whose world position is
  // within the per-tip radius. Computed pixel-by-pixel, so the gradient
  // edge is buttery smooth and never follows mesh triangulation.
  supportCoverageTips?: SupportCoverageTipData;
  supportCoverageColor?: string;
  supportCoverageIntensity?: number;
}) {
  const baseColor = meshColor ?? '#a3a3a3';
  const selectedStrength = clampTintStrength(selectedTintStrength, 0.75);
  const hoverStrength = clampTintStrength(hoverTintStrength, 0.5);
  const tintColor = isSelected
    ? blendTintColor(baseColor, selectedTintColor, selectedStrength)
    : isHovered
      ? blendTintColor(baseColor, hoverTintColor, hoverStrength)
      : baseColor;

  const AO_STRENGTH = 0.2;
  const FAKE_LIGHT_DIRECTION = new THREE.Vector3(0.35, 0.58, 0.74).normalize();

  // Uniforms held in a ref so their .value references stay stable across
  // React re-renders. The compiled GLSL program binds these once at
  // compile time; mutating .value (or .value's contents) every frame is
  // what reaches the GPU.
  const uniformsRef = React.useRef({
    uFakeAoStrength: { value: AO_STRENGTH },
    uFakeLightDir: { value: FAKE_LIGHT_DIRECTION.clone() },
    uSupportTips: {
      value: new Float32Array(MAX_SUPPORT_TIPS * 4),
    },
    uSupportTipCount: { value: 0 },
    uSupportCoverageColor: {
      value: new THREE.Color(supportCoverageColor ?? '#00ff00'),
    },
    uSupportCoverageIntensity: { value: supportCoverageIntensity },
  });

  // Live-sync support-coverage uniforms whenever the source data changes.
  // We copy into the existing Float32Array rather than reassigning so the
  // shader's bound uniform location keeps pointing at the same buffer.
  React.useEffect(() => {
    const buf = uniformsRef.current.uSupportTips.value;
    if (supportCoverageTips && supportCoverageTips.count > 0) {
      const len = Math.min(buf.length, supportCoverageTips.tips.length);
      for (let i = 0; i < len; i += 1) buf[i] = supportCoverageTips.tips[i];
      // Zero the tail so a shrinking tip list doesn't keep ghost entries.
      for (let i = len; i < buf.length; i += 1) buf[i] = 0;
      uniformsRef.current.uSupportTipCount.value = Math.min(
        MAX_SUPPORT_TIPS,
        supportCoverageTips.count,
      );
    } else {
      uniformsRef.current.uSupportTipCount.value = 0;
    }
  }, [supportCoverageTips]);

  React.useEffect(() => {
    uniformsRef.current.uSupportCoverageColor.value.set(
      supportCoverageColor ?? '#00ff00',
    );
  }, [supportCoverageColor]);

  React.useEffect(() => {
    uniformsRef.current.uSupportCoverageIntensity.value = supportCoverageIntensity;
  }, [supportCoverageIntensity]);

  // Set `customProgramCacheKey` via a ref callback so it's assigned the
  // moment R3F instantiates the material — BEFORE Three's renderer
  // compiles + caches the program for the first frame. A useEffect would
  // run after the first paint, when the program is already compiled and
  // cached under the previous key, so subsequent renders just keep
  // reusing the broken cached program.
  //
  // SOFTCLAY_SHADER_VERSION must be in the deps so HMR-replaced modules
  // get a new callback identity. With `[]`, the cached arrow keeps
  // referencing the *old* module's const binding — the live material
  // would still report the old cache key and Three would keep serving
  // the stale (pre-fix) program. Empirically verified in the shader-lab
  // sandbox at /Users/mag1/dev_tmp/ora/shader-lab/.
  const materialRefCallback = React.useCallback((mat: THREE.MeshStandardMaterial | null) => {
    if (!mat) return;
    mat.customProgramCacheKey = () => SOFTCLAY_SHADER_VERSION;
    mat.needsUpdate = true;
  }, [SOFTCLAY_SHADER_VERSION]);


  return (
    <meshStandardMaterial
      ref={materialRefCallback}
      vertexColors={useVertexColors ?? true}
      color={tintColor}
      emissive="#000000"
      emissiveIntensity={0}
      metalness={0.02}
      roughness={materialRoughness ?? 0.9}
      envMapIntensity={0.34}
      clippingPlanes={clippingPlanes}
      side={THREE.FrontSide}
      flatShading={false}
      onBeforeCompile={(shader) => {
        shader.uniforms.uFakeAoStrength = uniformsRef.current.uFakeAoStrength;
        shader.uniforms.uFakeLightDir = uniformsRef.current.uFakeLightDir;
        shader.uniforms.uSupportTips = uniformsRef.current.uSupportTips;
        shader.uniforms.uSupportTipCount = uniformsRef.current.uSupportTipCount;
        shader.uniforms.uSupportCoverageColor = uniformsRef.current.uSupportCoverageColor;
        shader.uniforms.uSupportCoverageIntensity = uniformsRef.current.uSupportCoverageIntensity;

        // Forward world position to the fragment shader. We need it for
        // distance comparison against support-tip positions. We compute
        // world position ourselves rather than reading from Three's
        // `worldpos_vertex` chunk's `worldPosition` variable — that
        // variable is only conditionally declared (envMap / shadows /
        // transmission), so referencing it on a plain meshStandardMaterial
        // fails with "worldPosition: undeclared identifier".
        shader.vertexShader = `
          varying vec3 vSupportWorldPos;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
            #include <begin_vertex>
            vSupportWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          `,
        );

        shader.fragmentShader = `
          uniform float uFakeAoStrength;
          uniform vec3 uFakeLightDir;
          uniform vec4 uSupportTips[${MAX_SUPPORT_TIPS}];
          uniform int uSupportTipCount;
          uniform vec3 uSupportCoverageColor;
          uniform float uSupportCoverageIntensity;
          varying vec3 vSupportWorldPos;
        ` + shader.fragmentShader;

        // NOTE: Three.js r152+ renamed `<output_fragment>` to
        // `<opaque_fragment>`. r181 only ships the new name; using the
        // old one makes .replace() a silent no-op, dropping the halo +
        // diagnostic into a black hole.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
            #include <opaque_fragment>
            vec3 n = normalize(normal);
            float nDotL = max(dot(n, normalize(uFakeLightDir)), 0.0);
            float cavity = pow(1.0 - nDotL, 1.35);
            float fakeAo = 1.0 - (cavity * uFakeAoStrength);
            gl_FragColor.rgb *= fakeAo;

            // Support-coverage halo, computed per-pixel from world-space
            // distance to the nearest support tip. Polygon-independent —
            // the gradient is smooth regardless of mesh triangulation.
            float halo = 0.0;
            for (int i = 0; i < ${MAX_SUPPORT_TIPS}; i++) {
              if (i >= uSupportTipCount) break;
              vec4 tip = uSupportTips[i];
              float radius = tip.w;
              if (radius <= 0.0) continue;
              float d = distance(vSupportWorldPos, tip.xyz);
              if (d >= radius) continue;
              float t = d / radius;
              // 1 - smoothstep gives soft falloff: full at centre, 0 at edge.
              float contribution = 1.0 - t * t * (3.0 - 2.0 * t);
              halo = max(halo, contribution);
            }
            halo *= uSupportCoverageIntensity;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, uSupportCoverageColor, halo);
          `,
        );
      }}
    />
  );
}
