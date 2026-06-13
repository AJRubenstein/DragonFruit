import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { supportPainterStore, useSupportPainterState } from '../supportPainterStore';
import type { ClientAdjacencyMap } from '../useClientAdjacencyMap';

/**
 * Computes a unique float ID for every triangle in flat/non-indexed geometry.
 */
function buildTriangleIdAttribute(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) {
    throw new Error('Position attribute is missing from geometry');
  }
  const vertexCount = positionAttr.count;
  const array = new Float32Array(vertexCount);
  for (let k = 0; k < vertexCount; k++) {
    array[k] = Math.floor(k / 3);
  }
  return new THREE.BufferAttribute(array, 1);
}

/**
 * Computes custom attributes for neighbors and barycentric coordinates.
 * Allows the fragment shader to identify boundary edges (where neighbor region state differs).
 */
function buildAdjacencyAttributes(
  geometry: THREE.BufferGeometry,
  map: ClientAdjacencyMap | null
): { neighbors: THREE.BufferAttribute; barycentrics: THREE.BufferAttribute } {
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) {
    throw new Error('Position attribute is missing from geometry');
  }
  const vertexCount = positionAttr.count;
  const faceCount = Math.floor(vertexCount / 3);
  const positions = positionAttr.array;

  const neighborsArray = new Float32Array(vertexCount * 3);
  const barycentricsArray = new Float32Array(vertexCount * 3);

  // Helper to round coordinates for vertex welding matching useClientAdjacencyMap
  const getVertexKey = (x: number, y: number, z: number): string => {
    return `${Math.round(x * 100000)},${Math.round(y * 100000)},${Math.round(z * 100000)}`;
  };

  // Pre-calculate vertex keys for all faces to avoid redundant string creation
  const faceKeys: [string, string, string][] = [];
  for (let f = 0; f < faceCount; f++) {
    const o = f * 9;
    const k0 = getVertexKey(positions[o], positions[o + 1], positions[o + 2]);
    const k1 = getVertexKey(positions[o + 3], positions[o + 4], positions[o + 5]);
    const k2 = getVertexKey(positions[o + 6], positions[o + 7], positions[o + 8]);
    faceKeys.push([k0, k1, k2]);
  }

  for (let f = 0; f < faceCount; f++) {
    const keys = faceKeys[f];

    // Default neighbors to -1.0 (no neighbor)
    let nX = -1.0; // shares v1, v2 (opposite v0)
    let nY = -1.0; // shares v2, v0 (opposite v1)
    let nZ = -1.0; // shares v0, v1 (opposite v2)

    if (map && map.faceToFaces[f]) {
      const candidates = map.faceToFaces[f];
      for (const other of candidates) {
        const otherKeys = faceKeys[other];
        if (!otherKeys) continue;

        const hasK0 = otherKeys.includes(keys[0]);
        const hasK1 = otherKeys.includes(keys[1]);
        const hasK2 = otherKeys.includes(keys[2]);

        if (hasK1 && hasK2) {
          nX = other;
        } else if (hasK2 && hasK0) {
          nY = other;
        } else if (hasK0 && hasK1) {
          nZ = other;
        }
      }
    }

    // Set neighbor indices for all 3 vertices of face f
    for (let v = 0; v < 3; v++) {
      const idx = (f * 3 + v) * 3;
      neighborsArray[idx] = nX;
      neighborsArray[idx + 1] = nY;
      neighborsArray[idx + 2] = nZ;
    }

    // Set barycentric coordinates for the 3 vertices of face f
    const idx0 = (f * 3) * 3;
    barycentricsArray[idx0] = 1.0;
    barycentricsArray[idx0 + 1] = 0.0;
    barycentricsArray[idx0 + 2] = 0.0;

    const idx1 = (f * 3 + 1) * 3;
    barycentricsArray[idx1] = 0.0;
    barycentricsArray[idx1 + 1] = 1.0;
    barycentricsArray[idx1 + 2] = 0.0;

    const idx2 = (f * 3 + 2) * 3;
    barycentricsArray[idx2] = 0.0;
    barycentricsArray[idx2 + 1] = 0.0;
    barycentricsArray[idx2 + 2] = 1.0;
  }

  return {
    neighbors: new THREE.BufferAttribute(neighborsArray, 3),
    barycentrics: new THREE.BufferAttribute(barycentricsArray, 3)
  };
}

/**
 * Renders high-quality color overlays per-triangle using a DataTexture lookup table.
 * Supports committed ROI blending and pulsing hover previews.
 */
export function useRoiHighlightMaterial(
  geometry: THREE.BufferGeometry | null,
  isActive: boolean,
  meshColor: string = '#c8c8ce',
  clippingPlanes: THREE.Plane[] = []
): { material: THREE.ShaderMaterial | null; geometry: THREE.BufferGeometry | null } {
  const timeRef = useRef<number>(0);
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const { clientAdjacencyMap } = useSupportPainterState();

  // Parse mesh base color
  const baseColor = useMemo(() => {
    return new THREE.Color(meshColor || '#c8c8ce');
  }, [meshColor]);

  // Compute non-indexed rendering geometry copy if original is indexed
  const renderingGeometry = useMemo(() => {
    if (!geometry || !isActive) return geometry;

    console.log('[ROIHighlight] Creating dedicated rendering geometry copy for paint highlighting');
    let geom: THREE.BufferGeometry;
    try {
      if (geometry.index) {
        geom = geometry.toNonIndexed();
      } else {
        geom = geometry.clone();
      }

      // Attach triangle ID attribute
      const attr = buildTriangleIdAttribute(geom);
      geom.setAttribute('aTriangleId', attr);

      // Attach adjacency and barycentric attributes
      const { neighbors, barycentrics } = buildAdjacencyAttributes(geom, clientAdjacencyMap);
      geom.setAttribute('aNeighbors', neighbors);
      geom.setAttribute('aBarycentric', barycentrics);

      // Compute BVH bounds tree for collision detection & raycasting support
      (geom as any).computeBoundsTree?.();

      console.log('[ROIHighlight] Synchronously built attributes and computed BVH boundsTree');
    } catch (err) {
      console.error('[ROIHighlight] Failed to initialize rendering geometry copy', err);
      geom = geometry;
    }
    return geom;
  }, [geometry, isActive, clientAdjacencyMap]);

  // Clean up non-indexed copy on change or unmount
  useEffect(() => {
    return () => {
      if (renderingGeometry && renderingGeometry !== geometry) {
        renderingGeometry.dispose();
      }
    };
  }, [renderingGeometry, geometry]);

  // Compute total triangle count
  const totalTriangleCount = useMemo(() => {
    if (!renderingGeometry) return 0;
    const pos = renderingGeometry.getAttribute('position');
    return pos ? Math.floor(pos.count / 3) : 0;
  }, [renderingGeometry]);

  // Setup DataTexture and ShaderMaterial
  const material = useMemo(() => {
    if (!renderingGeometry || totalTriangleCount === 0 || !isActive) return null;

    // 1. Create a 2D DataTexture to avoid GPU WebGL MAX_TEXTURE_SIZE limitations on large models
    const texWidth = 2048;
    const texHeight = Math.ceil(totalTriangleCount / texWidth);
    const size = texWidth * texHeight * 4; // RGBA
    const data = new Uint8Array(size);
    const texture = new THREE.DataTexture(
      data,
      texWidth,
      texHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false; // Explicitly disable flipping for precise row alignment
    texture.needsUpdate = true;
    textureRef.current = texture;

    // 2. Define Custom Shader Material with basic Diffuse shading for beautiful premium visuals
    const mat = new THREE.ShaderMaterial({
      precision: 'highp', // Enforce highp for high-density mesh indexing
      transparent: false, // Transition to opaque pass to guarantee absolute depth safety and GPU occlusion
      depthWrite: true,   // Write to depth buffer to align rendering queue
      depthTest: true,    // Explicitly enforce depth testing to guarantee occlusion by other surfaces
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uRoiMap: { value: texture },
        uRoiMapWidth: { value: texWidth },
        uRoiMapHeight: { value: texHeight },
        uTime: { value: 0 },
        uBaseColor: { value: baseColor },
      },
      vertexShader: `
        #include <clipping_planes_pars_vertex>
        attribute float aTriangleId;
        attribute vec3 aNeighbors;
        attribute vec3 aBarycentric;

        varying float vTriangleId;
        varying vec3 vNeighbors;
        varying vec3 vBarycentric;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          // Zero-dilation projection ensures absolute alignment with model geometry.
          // Relies entirely on GPU-hardware polygonOffset to pull the overlay in front,
          // which is mathematically immune to normal inversion or thin-wall bleeding.
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          #include <clipping_planes_vertex>
          vTriangleId = aTriangleId;
          vNeighbors = aNeighbors;
          vBarycentric = aBarycentric;
          vNormal = normalize(normalMatrix * normal);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        #include <clipping_planes_pars_fragment>
        uniform sampler2D uRoiMap;
        uniform float uRoiMapWidth;
        uniform float uRoiMapHeight;
        uniform float uTime;
        uniform vec3 uBaseColor;

        varying float vTriangleId;
        varying vec3 vNeighbors;
        varying vec3 vBarycentric;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        // Helper to retrieve ROI info for a neighbor triangle
        vec4 getNeighborRoi(float neighborId) {
          if (neighborId < -0.5) {
            return vec4(0.0);
          }
          float triId = floor(neighborId + 0.5);
          float x = mod(triId, uRoiMapWidth) + 0.5;
          float y = floor(triId / uRoiMapWidth) + 0.5;
          vec2 uv = vec2(x / uRoiMapWidth, y / uRoiMapHeight);
          return texture2D(uRoiMap, uv);
        }

        void main() {
          #include <clipping_planes_fragment>
          float triId = floor(vTriangleId + 0.5);
          float x = mod(triId, uRoiMapWidth) + 0.5;
          float y = floor(triId / uRoiMapWidth) + 0.5;
          vec2 uv = vec2(x / uRoiMapWidth, y / uRoiMapHeight);
          vec4 roi = texture2D(uRoiMap, uv);

          // Unpainted triangles are transparent/discarded from both color and depth passes
          if (roi.a <= 0.01) {
            discard;
          }

          vec3 normalVec = vNormal;
          if (length(normalVec) < 0.001) {
            normalVec = vec3(0.0, 0.0, 1.0);
          }
          vec3 normalizedNormal = normalize(normalVec);
          vec3 viewDir = normalize(vViewPosition);

          // Calculate screen-space derivatives for clean antialiased boundary outline
          vec3 widthVec = fwidth(vBarycentric) + vec3(1e-5);
          float lineWidth = 1.5; // pixel width for the outline
          vec3 edgeVal = smoothstep(vec3(0.0), lineWidth * widthVec, vBarycentric);

          // Sample neighbors to check if they are boundaries
          vec4 nRoiX = getNeighborRoi(vNeighbors.x);
          vec4 nRoiY = getNeighborRoi(vNeighbors.y);
          vec4 nRoiZ = getNeighborRoi(vNeighbors.z);

          vec3 isBoundary = vec3(0.0);
          if (nRoiX.a <= 0.01 || distance(nRoiX.rgb, roi.rgb) > 0.01 || abs(nRoiX.a - roi.a) > 0.01) isBoundary.x = 1.0;
          if (nRoiY.a <= 0.01 || distance(nRoiY.rgb, roi.rgb) > 0.01 || abs(nRoiY.a - roi.a) > 0.01) isBoundary.y = 1.0;
          if (nRoiZ.a <= 0.01 || distance(nRoiZ.rgb, roi.rgb) > 0.01 || abs(nRoiZ.a - roi.a) > 0.01) isBoundary.z = 1.0;

          float boundaryOutline = 1.0;
          if (isBoundary.x > 0.5) boundaryOutline = min(boundaryOutline, edgeVal.x);
          if (isBoundary.y > 0.5) boundaryOutline = min(boundaryOutline, edgeVal.y);
          if (isBoundary.z > 0.5) boundaryOutline = min(boundaryOutline, edgeVal.z);

          // Base color logic
          vec3 finalColor = roi.rgb;
          float emissiveBoost = 0.0;
          float rimPower = 4.0;
          float rimGlowScale = 0.25;

          if (roi.a < 0.6) {
            // Proposed preview: pulse color blend between model base color and active brush color
            float pulse = 0.35 + 0.45 * sin(uTime * 8.0);
            finalColor = mix(uBaseColor, roi.rgb, pulse);
            emissiveBoost = pulse * 0.5;
          } else if (roi.a < 0.85) {
            // Selected/Focused region: active pulsing selection with strong volume glow
            float pulse = 0.5 + 0.5 * sin(uTime * 8.0); // 1.27 Hz pulse
            finalColor = roi.rgb;
            emissiveBoost = 1.0 + 1.5 * pulse; // Stronger self-emissive
            rimPower = 2.5; // Wider rim light for "volume" glow
            rimGlowScale = 1.2 + 0.8 * pulse; // Brighter rim glow
          } else {
            // Committed inactive ROI
            finalColor = roi.rgb;
            emissiveBoost = 0.45;
          }

          // Harmonic Diffuse Lambertian Lighting
          vec3 lightDir = normalize(vec3(0.5, 0.75, 1.0));
          float diffuse = max(0.28, dot(normalizedNormal, lightDir));
          vec3 litColor = finalColor * diffuse;

          // Boost self-emissive glow for high contrast
          litColor += finalColor * 0.25 * emissiveBoost;

          // Add a subtle rim light/ambient glow to the selection
          float rim = 1.0 - max(0.0, dot(normalizedNormal, viewDir));
          litColor += finalColor * pow(rim, rimPower) * rimGlowScale * emissiveBoost;

          // Wrap the outer boundary in a crisp black line
          litColor = mix(vec3(0.0), litColor, boundaryOutline);

          gl_FragColor = vec4(litColor, 1.0);
        }
      `,
      side: THREE.FrontSide,
      clipping: true,
    });

    materialRef.current = mat;
    return mat;
  }, [renderingGeometry, totalTriangleCount, isActive, baseColor]);

  // Sync clipping planes dynamically
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.clippingPlanes = clippingPlanes;
    }
  }, [clippingPlanes]);

  // Sync state changes with the DataTexture using dynamic instantiation & disposal
  useEffect(() => {
    if (totalTriangleCount === 0 || !isActive || !material) return;

    const texWidth = 2048;
    const texHeight = Math.ceil(totalTriangleCount / texWidth);

    const handleUpdate = () => {
      const snap = supportPainterStore.getSnapshot();
      
      let texture = textureRef.current;
      const bufferSize = texWidth * texHeight * 4;

      if (!texture) {
        console.log('[ROIHighlight] Instantiating reusable DataTexture.');
        const data = new Uint8Array(bufferSize);
        texture = new THREE.DataTexture(
          data,
          texWidth,
          texHeight,
          THREE.RGBAFormat,
          THREE.UnsignedByteType
        );
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.flipY = false;
        
        material.uniforms.uRoiMap.value = texture;
        textureRef.current = texture;
      } else {
        // Clear previous colors (reset all to 0 / transparent)
        (texture.image.data as Uint8Array).fill(0);
      }

      const data = texture.image.data as Uint8Array;

      // Write committed regions & hover previews into texture data
      let writeCount = 0;
      for (const [triId, [r, g, b, a]] of snap.triangleColorMap.entries()) {
        if (triId >= 0 && triId < totalTriangleCount) {
          const offset = triId * 4;
          data[offset] = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = a;
          writeCount++;
        }
      }

      texture.needsUpdate = true;
      console.log(`[ROIHighlight] Updated reusable DataTexture with ${writeCount} triangles.`);
    };


    // Initialize with current state
    handleUpdate();

    // Subscribe to store updates
    const unsubscribe = supportPainterStore.subscribe(handleUpdate);
    return () => {
      unsubscribe();
      // Clean up texture when the effect is destroyed
      if (textureRef.current) {
        console.log('[ROIHighlight] Disposing final DataTexture on cleanup.');
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, [totalTriangleCount, isActive, material]);

  // Drive the pulse animations in useFrame
  useFrame((state) => {
    timeRef.current = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = timeRef.current;
    }
  });

  // Clean up WebGL resources
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      if (materialRef.current) {
        materialRef.current.dispose();
        materialRef.current = null;
      }
    };
  }, []);

  return { material, geometry: renderingGeometry };
}
