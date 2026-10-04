import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Vec3 } from '../../types';
import {
    buildBatchedBezierTubes,
    isCurvedBatchedShaft,
    resolveCurvedShaftIndexForFace,
} from '../../Curves/batchedBezierTubeGeometry';
import { HIDDEN_INSTANCE_MATRIX } from '../hiddenInstanceMatrix';
import { writeInstanceColors } from '../instanceColorWriter';

export interface InstancedShaft {
    id: string;
    start: Vec3;
    end: Vec3;
    diameter: number;
    supportId?: string;
    modelId?: string;
    /**
     * Present on curved (bezier) segments. Curved entries render as a smooth
     * merged tube (visual parity with the detailed BezierRenderer) instead of
     * a straight instanced cylinder; straight entries leave these unset.
     */
    controlPoint1?: Vec3;
    controlPoint2?: Vec3;
    resolution?: number;
}

interface InstancedShaftGroupProps {
    shafts: InstancedShaft[];
    color?: string;
    emissive?: string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    clippingPlanes?: THREE.Plane[] | null;
    radialSegments?: number;
    outOfBoundsMaterial?: THREE.ShaderMaterial | null;
    /**
     * Per-instance colour, for a caller that tints a subset of the batch (the
     * selection). Every instance must be given one: the colour buffer starts
     * black, and the group's own `color` is not used once this is set.
     */
    instanceColor?: (shaft: InstancedShaft) => THREE.Color;
    /**
     * Instances to hide, by the primitive they draw. The world layer keeps an
     * excluded model in its arrays and hides it here, so an activation change
     * costs the changed instances rather than a full re-layout. Curved shafts
     * are not hidden this way: they are merged into one tube mesh.
     */
    isHidden?: (shaft: InstancedShaft) => boolean;
    /**
     * Raycast override, for a caller whose batch is too large for three's
     * per-instance walk. The hover grid answers it in O(cells crossed).
     */
    raycast?: THREE.Object3D['raycast'];
    onShaftClick?: (shaft: InstancedShaft, event: ThreeEvent<MouseEvent>) => void;
    onShaftPointerDown?: (shaft: InstancedShaft, event: ThreeEvent<PointerEvent>) => void;
    onShaftPointerMove?: (shaft: InstancedShaft, event: ThreeEvent<PointerEvent>) => void;
    onShaftPointerOut?: (shaft: InstancedShaft | null, event: ThreeEvent<PointerEvent>) => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {};

/** Grouping key for curved shafts a caller does not tint: not a colour. */
const NO_TINT_KEY = 'no-tint';

/** Layout scratch: layouts are synchronous, so the batch kinds can share it. */
const scratchObject = new THREE.Object3D();
const shaftStart = new THREE.Vector3();
const shaftEnd = new THREE.Vector3();
const shaftDirection = new THREE.Vector3();
const shaftMidpoint = new THREE.Vector3();

export function InstancedShaftGroup({
    shafts,
    color = '#ff8800',
    emissive = '#000000',
    emissiveIntensity = 0,
    transparent = false,
    opacity = 1,
    clippingPlanes = null,
    radialSegments = 12,
    outOfBoundsMaterial = null,
    instanceColor,
    isHidden,
    raycast,
    onShaftClick,
    onShaftPointerDown,
    onShaftPointerMove,
    onShaftPointerOut,
}: InstancedShaftGroupProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const overlayMeshRef = useRef<THREE.InstancedMesh>(null);
    const lastHoveredShaftRef = useRef<InstancedShaft | null>(null);

    const { straightShafts, curvedShafts } = useMemo(() => {
        const straight: InstancedShaft[] = [];
        const curved: InstancedShaft[] = [];
        for (const shaft of shafts) {
            if (isCurvedBatchedShaft(shaft)) {
                // Degenerate only when the whole control net collapses to a point.
                const points = [shaft.controlPoint1!, shaft.controlPoint2!, shaft.end];
                const collapsed = points.every((p) => {
                    const dx = p.x - shaft.start.x;
                    const dy = p.y - shaft.start.y;
                    const dz = p.z - shaft.start.z;
                    return dx * dx + dy * dy + dz * dz < 1e-6;
                });
                if (!collapsed) curved.push(shaft);
                continue;
            }
            const dx = shaft.end.x - shaft.start.x;
            const dy = shaft.end.y - shaft.start.y;
            const dz = shaft.end.z - shaft.start.z;
            if (dx * dx + dy * dy + dz * dz >= 1e-6) straight.push(shaft);
        }
        return { straightShafts: straight, curvedShafts: curved };
    }, [shafts]);

    // A merged tube mesh has one material, so a caller that tints individual
    // shafts gets one merged mesh per colour rather than vertex colours: the
    // colour then rides on the material, the same way an instanced shaft's does,
    // and two shafts that should look alike cannot diverge by which path drew
    // them. The selection tints at most two colours.
    const curvedTubeGroups = useMemo(() => {
        const byColor = new Map<string, InstancedShaft[]>();
        for (const shaft of curvedShafts) {
            const color = instanceColor ? instanceColor(shaft).getHexString() : NO_TINT_KEY;
            const bucket = byColor.get(color);
            if (bucket) bucket.push(shaft);
            else byColor.set(color, [shaft]);
        }

        return [...byColor.entries()].flatMap(([color, group]) => {
            const tubes = buildBatchedBezierTubes(group, radialSegments);
            return tubes ? [{ color, shafts: group, tubes }] : [];
        });
    }, [curvedShafts, radialSegments, instanceColor]);

    useEffect(() => {
        return () => {
            for (const group of curvedTubeGroups) group.tubes.geometry.dispose();
        };
    }, [curvedTubeGroups]);

    const hasOverlay = !!outOfBoundsMaterial;

    const hiddenStateRef = React.useRef<Map<InstancedShaft, boolean>>(new Map());

    const writeInstanceMatrix = React.useCallback((
        mesh: THREE.InstancedMesh,
        index: number,
        shaft: InstancedShaft,
        hidden: boolean,
    ) => {
        if (hidden) {
            mesh.setMatrixAt(index, HIDDEN_INSTANCE_MATRIX);
            return;
        }
        shaftStart.set(shaft.start.x, shaft.start.y, shaft.start.z);
        shaftEnd.set(shaft.end.x, shaft.end.y, shaft.end.z);
        shaftDirection.subVectors(shaftEnd, shaftStart);
        const length = shaftDirection.length();
        if (length < 0.001) {
            mesh.setMatrixAt(index, HIDDEN_INSTANCE_MATRIX);
            return;
        }
        shaftDirection.divideScalar(length);
        shaftMidpoint.addVectors(shaftStart, shaftEnd).multiplyScalar(0.5);
        scratchObject.position.copy(shaftMidpoint);
        scratchObject.quaternion.setFromUnitVectors(UP, shaftDirection);
        scratchObject.scale.set(shaft.diameter, length, shaft.diameter);
        scratchObject.updateMatrix();
        mesh.setMatrixAt(index, scratchObject.matrix);
    }, []);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        const overlayMesh = overlayMeshRef.current;
        if (!mesh) return;

        for (let i = 0; i < straightShafts.length; i += 1) {
            const shaft = straightShafts[i];
            writeInstanceMatrix(mesh, i, shaft, false);
            if (overlayMesh) writeInstanceMatrix(overlayMesh, i, shaft, false);
        }

        mesh.count = straightShafts.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (overlayMesh) {
            overlayMesh.count = straightShafts.length;
            overlayMesh.instanceMatrix.needsUpdate = true;
        }
    }, [straightShafts, hasOverlay, writeInstanceMatrix]);

    // Hiding an instance writes one matrix, not the whole batch: this is what an
    // activation change pays, and it must not re-derive every other instance.
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        const overlayMesh = overlayMeshRef.current;
        if (!mesh || !isHidden) return;

        const hiddenState = hiddenStateRef.current;
        let touched = false;
        for (let i = 0; i < straightShafts.length; i += 1) {
            const shaft = straightShafts[i];
            const hidden = isHidden(shaft);
            if ((hiddenState.get(shaft) ?? false) === hidden) continue;
            hiddenState.set(shaft, hidden);
            touched = true;
            writeInstanceMatrix(mesh, i, shaft, hidden);
            if (overlayMesh) writeInstanceMatrix(overlayMesh, i, shaft, hidden);
        }

        if (!touched) return;
        mesh.instanceMatrix.needsUpdate = true;
        if (overlayMesh) overlayMesh.instanceMatrix.needsUpdate = true;
    }, [straightShafts, isHidden, writeInstanceMatrix]);

    // Colours are a separate pass: a selection changes them and nothing else, and
    // it must not re-derive every instance matrix to do it.
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !instanceColor) return;
        writeInstanceColors(mesh, straightShafts, instanceColor);
    }, [straightShafts, instanceColor]);

    if (straightShafts.length === 0 && curvedTubeGroups.length === 0) return null;

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        if (!onShaftClick) return;
        event.stopPropagation();
        const instanceId = event.instanceId;
        if (instanceId == null) return;
        const shaft = straightShafts[instanceId];
        if (!shaft) return;
        onShaftClick(shaft, event);
    };

    const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
        if (!onShaftPointerDown) return;
        event.stopPropagation();
        const instanceId = event.instanceId;
        if (instanceId == null) return;
        const shaft = straightShafts[instanceId];
        if (!shaft) return;
        onShaftPointerDown(shaft, event);
    };

    const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
        if (!onShaftPointerMove) return;
        event.stopPropagation();
        const instanceId = event.instanceId;
        if (instanceId == null) return;
        const shaft = straightShafts[instanceId];
        if (!shaft) return;
        lastHoveredShaftRef.current = shaft;
        onShaftPointerMove(shaft, event);
    };

    const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
        if (!onShaftPointerOut) return;
        event.stopPropagation();
        onShaftPointerOut(lastHoveredShaftRef.current, event);
        lastHoveredShaftRef.current = null;
    };

    const resolveCurvedShaft = (event: { faceIndex?: number | null; object?: THREE.Object3D }): InstancedShaft | null => {
        const faceIndex = event.faceIndex;
        if (faceIndex == null) return null;
        // The tube meshes share one handler set, so which one was hit decides
        // which curve list the face index belongs to.
        const hitGeometry = event.object && 'geometry' in event.object ? event.object.geometry : null;
        const group = curvedTubeGroups.find((candidate) => candidate.tubes.geometry === hitGeometry);
        if (!group) return null;
        const index = resolveCurvedShaftIndexForFace(group.tubes.triangleRangeEnds, faceIndex);
        return index >= 0 ? group.shafts[index] ?? null : null;
    };

    const handleCurvedClick = (event: ThreeEvent<MouseEvent>) => {
        if (!onShaftClick) return;
        event.stopPropagation();
        const shaft = resolveCurvedShaft(event);
        if (!shaft) return;
        onShaftClick(shaft, event);
    };


    const handleCurvedPointerDown = (event: ThreeEvent<PointerEvent>) => {
        if (!onShaftPointerDown) return;
        event.stopPropagation();
        const shaft = resolveCurvedShaft(event);
        if (!shaft) return;
        onShaftPointerDown(shaft, event);
    };

    const handleCurvedPointerMove = (event: ThreeEvent<PointerEvent>) => {
        if (!onShaftPointerMove) return;
        event.stopPropagation();
        const shaft = resolveCurvedShaft(event);
        if (!shaft) return;
        lastHoveredShaftRef.current = shaft;
        onShaftPointerMove(shaft, event);
    };

    return (
        <>
            {straightShafts.length > 0 && (
                <instancedMesh
                    key={`straight:${straightShafts.length}`}
                    ref={meshRef}
                    args={[undefined, undefined, straightShafts.length]}
                    frustumCulled={false}
                    renderOrder={100000}
                    raycast={raycast ?? THREE.Mesh.prototype.raycast}
                    onClick={onShaftClick ? handleClick : undefined}
                    onPointerDown={onShaftPointerDown ? handlePointerDown : undefined}
                    onPointerMove={onShaftPointerMove ? handlePointerMove : undefined}
                    onPointerOut={onShaftPointerOut ? handlePointerOut : undefined}
                >
                    <cylinderGeometry args={[0.5, 0.5, 1, radialSegments, 1, false]} />
                    <meshStandardMaterial
                        color={instanceColor ? '#ffffff' : color}
                        emissive={emissive}
                        emissiveIntensity={emissiveIntensity}
                        transparent={transparent}
                        opacity={opacity}
                        depthWrite={!transparent}
                        clippingPlanes={clippingPlanes ?? undefined}
                    />
                </instancedMesh>
            )}
            {straightShafts.length > 0 && outOfBoundsMaterial && (
                <instancedMesh
                    key={`straight-overlay:${straightShafts.length}`}
                    ref={overlayMeshRef}
                    args={[undefined, undefined, straightShafts.length]}
                    frustumCulled={false}
                    raycast={NOOP_RAYCAST}
                    renderOrder={100000}
                    material={outOfBoundsMaterial}
                >
                    <cylinderGeometry args={[0.5, 0.5, 1, radialSegments, 1, false]} />
                </instancedMesh>
            )}
            {curvedTubeGroups.map((group) => (
                <mesh
                    key={`curved:${group.color}`}
                    geometry={group.tubes.geometry}
                    frustumCulled={false}
                    renderOrder={100000}
                    onClick={onShaftClick ? handleCurvedClick : undefined}
                    onPointerDown={onShaftPointerDown ? handleCurvedPointerDown : undefined}
                    onPointerMove={onShaftPointerMove ? handleCurvedPointerMove : undefined}
                    onPointerOut={onShaftPointerOut ? handlePointerOut : undefined}
                >
                    <meshStandardMaterial
                        color={instanceColor ? `#${group.color}` : color}
                        emissive={emissive}
                        emissiveIntensity={emissiveIntensity}
                        transparent={transparent}
                        opacity={opacity}
                        depthWrite={!transparent}
                        clippingPlanes={clippingPlanes ?? undefined}
                    />
                </mesh>
            ))}
            {curvedTubeGroups.map((group) => (outOfBoundsMaterial ? (
                <mesh
                    key={`curved-overlay:${group.color}`}
                    geometry={group.tubes.geometry}
                    frustumCulled={false}
                    raycast={NOOP_RAYCAST}
                    renderOrder={100000}
                    material={outOfBoundsMaterial}
                />
            ) : null))}
        </>
    );
}
