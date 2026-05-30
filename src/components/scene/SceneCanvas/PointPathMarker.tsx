import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Custom vertex shader that computes a time-based scaling pulse.
 */
const vertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    
    // Pulse scale factor (ranges between 0.95 and 1.25)
    float pulse = 1.1 + 0.15 * sin(uTime * 7.0);
    vec3 pos = position * pulse;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Custom fragment shader that calculates a spherical radial glow-fade.
 */
const fragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Local sphere coordinates: local radius is 1.0
    float dist = length(vPosition);
    float intensity = max(0.0, 1.0 - dist);
    
    // Soft exponential fadeout
    float glow = pow(intensity, 2.5);
    
    // Pulse opacity subtly
    float pulseAlpha = 0.6 + 0.4 * sin(uTime * 7.0);
    float alpha = glow * pulseAlpha * 0.95;
    
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface PointPathMarkerProps {
  position: [number, number, number];
  color: THREE.Color;
  isFirst: boolean;
  registerRef?: (el: THREE.ShaderMaterial | null) => void;
  firstPointShaderRef?: React.RefObject<THREE.ShaderMaterial | null>;
}

/**
 * Isolated sphere marker component to maintain strict Hook Order safety.
 * This component is in its own file to prevent Next.js/SWC from inlining it,
 * ensuring its hooks remain isolated in their own fiber context.
 */
export function PointPathMarker({
  position,
  color,
  isFirst,
  registerRef,
  firstPointShaderRef,
}: PointPathMarkerProps) {
  // Safely use hooks inside the sub-component structure
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uColor: { value: color },
    }),
    []
  );

  // Keep uColor in sync with prop updates
  useMemo(() => {
    uniforms.uColor.value = color;
  }, [color, uniforms]);

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.2, 24, 24]} />
      <shaderMaterial
        ref={isFirst ? firstPointShaderRef : registerRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent={true}
        depthTest={false}
        depthWrite={false}
        uniforms={uniforms}
      />
    </mesh>
  );
}
