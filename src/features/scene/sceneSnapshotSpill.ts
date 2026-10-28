import * as THREE from 'three';
import { accelerateGeometry } from '@/utils/bvh';
import { releaseGeometryStorage } from '@/utils/releaseGeometry';
import type { LoadedModel, SceneSnapshotPair } from '@/features/scene/useSceneCollectionManager';

const SPILL_DIRECTORY = 'dragonfruit-undo';
const SPILL_VERSION = 1;

type TypedArrayName =
  | 'Float32Array'
  | 'Float64Array'
  | 'Uint32Array'
  | 'Uint16Array'
  | 'Uint8Array'
  | 'Uint8ClampedArray'
  | 'Int32Array'
  | 'Int16Array'
  | 'Int8Array';

type AttributeSpec = {
  name: string;
  type: TypedArrayName;
  itemSize: number;
  normalized: boolean;
  offset: number;
  byteLength: number;
};

type GeometrySpec = {
  uuid: string;
  attributes: AttributeSpec[];
  index: AttributeSpec | null;
  hadBoundsTree: boolean;
};

type SpillHeader = {
  version: number;
  geometries: GeometrySpec[];
};

export type SpilledSceneSnapshot = {
  fileHandle: FileSystemFileHandle;
  dataOffset: number;
  geometries: GeometrySpec[];
};

const spilledSceneSnapshots = new Map<string, SpilledSceneSnapshot>();
const inFlightSpills = new Set<string>();

function typedArrayName(array: ArrayBufferView): TypedArrayName | null {
  switch (array.constructor) {
    case Float32Array: return 'Float32Array';
    case Float64Array: return 'Float64Array';
    case Uint32Array: return 'Uint32Array';
    case Uint16Array: return 'Uint16Array';
    case Uint8Array: return 'Uint8Array';
    case Uint8ClampedArray: return 'Uint8ClampedArray';
    case Int32Array: return 'Int32Array';
    case Int16Array: return 'Int16Array';
    case Int8Array: return 'Int8Array';
    default: return null;
  }
}

function constructorFor(name: TypedArrayName): new (buffer: ArrayBuffer) => ArrayBufferView {
  const map = {
    Float32Array,
    Float64Array,
    Uint32Array,
    Uint16Array,
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    Int16Array,
    Int8Array,
  };
  return map[name];
}

function modelGeometries(model: Pick<LoadedModel, 'geometry'>): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [model.geometry.geometry];
  if (model.geometry.edgeGeometry) geometries.push(model.geometry.edgeGeometry);
  const defects = model.geometry.meshDefects;
  if (defects?.supportSectionGeometry) geometries.push(defects.supportSectionGeometry);
  if (defects?.modelSectionGeometry) geometries.push(defects.modelSectionGeometry);
  return geometries;
}

function pairGeometries(pair: SceneSnapshotPair): THREE.BufferGeometry[] {
  const geometries = new Set<THREE.BufferGeometry>();
  for (const model of pair.before.models) modelGeometries(model).forEach((geometry) => geometries.add(geometry));
  for (const model of pair.after.models) modelGeometries(model).forEach((geometry) => geometries.add(geometry));
  return [...geometries];
}

function canSerializeGeometry(geometry: THREE.BufferGeometry): boolean {
  if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0) return false;
  if (geometry.index && (geometry.index as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false;
  for (const attribute of Object.values(geometry.attributes)) {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false;
    if (!typedArrayName(attribute.array as ArrayBufferView)) return false;
  }
  return Object.keys(geometry.attributes).length > 0;
}

async function spillDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(SPILL_DIRECTORY, { create: true });
  } catch {
    return null;
  }
}

export function hasSpilledSceneSnapshot(key: string): boolean {
  return spilledSceneSnapshots.has(key);
}

/** Removes scratch files that no current history entry references (startup/HMR cleanup). */
export async function pruneSpilledSceneSnapshots(activeKeys: ReadonlySet<string>): Promise<void> {
  const directory = await spillDirectory();
  if (!directory) return;
  try {
    const entries = (directory as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
    for await (const [name, handle] of entries) {
      if (handle.kind !== 'file' || !name.endsWith('.bin')) continue;
      const key = name.slice('scene-'.length, -'.bin'.length);
      if (!name.startsWith('scene-') || !activeKeys.has(key)) {
        await directory.removeEntry(name).catch(() => undefined);
      }
    }
  } catch (error) {
    console.warn('[UndoSpill] Failed pruning scratch snapshots.', error);
  }
}

/**
 * Writes a snapshot's geometry arrays to the OPFS scratch store, then clears the
 * in-memory attribute storage. The model objects and support state stay in RAM:
 * they are small beside the buffers, and keeping them avoids re-creating the
 * transform/geometry wrappers on undo.
 *
 * `canRelease` is re-checked after the write because an undo may have restored
 * the models while the disk write was in flight.
 */
export async function spillSceneSnapshotPair(
  key: string,
  pair: SceneSnapshotPair,
  canRelease: (geometry: THREE.BufferGeometry) => boolean,
): Promise<boolean> {
  if (spilledSceneSnapshots.has(key) || inFlightSpills.has(key)) return false;

  const allGeometries = pairGeometries(pair);
  const candidates = allGeometries.filter((geometry) => (
    canRelease(geometry) && canSerializeGeometry(geometry)
  ));
  if (candidates.length === 0) return false;

  inFlightSpills.add(key);
  let fileHandle: FileSystemFileHandle | null = null;
  try {
    const directory = await spillDirectory();
    if (!directory) return false;

    const specs: GeometrySpec[] = [];
    const payloads: Array<{ array: ArrayBufferView; spec: AttributeSpec }> = [];
    let offset = 0;
    let id = 0;
    for (const geometry of candidates) {
      const geometrySpec: GeometrySpec = {
        uuid: geometry.uuid,
        attributes: [],
        index: null,
        hadBoundsTree: Boolean((geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree),
      };
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const array = attribute.array as ArrayBufferView;
        const type = typedArrayName(array);
        if (!type) continue;
        const spec: AttributeSpec = {
          name,
          type,
          itemSize: attribute.itemSize,
          normalized: Boolean(attribute.normalized),
          offset,
          byteLength: array.byteLength,
        };
        offset += array.byteLength;
        payloads.push({ array, spec });
        geometrySpec.attributes.push(spec);
      }
      if (geometry.index) {
        const array = geometry.index.array as ArrayBufferView;
        const type = typedArrayName(array);
        if (type) {
          const spec: AttributeSpec = {
            name: '__index',
            type,
            itemSize: geometry.index.itemSize,
            normalized: Boolean(geometry.index.normalized),
            offset,
            byteLength: array.byteLength,
          };
          offset += array.byteLength;
          payloads.push({ array, spec });
          geometrySpec.index = spec;
        }
      }
      specs.push(geometrySpec);
      id += 1;
      if (id % 4 === 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 0);
        await promise;
      }
    }

    const header: SpillHeader = { version: SPILL_VERSION, geometries: specs };
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, headerBytes.byteLength, true);

    fileHandle = await directory.getFileHandle(`scene-${key}.bin`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(prefix);
    await writable.write(headerBytes);
    for (const { array, spec } of payloads) {
      await writable.write(new Uint8Array(array.buffer, array.byteOffset, spec.byteLength) as unknown as ArrayBufferView<ArrayBuffer>);
    }
    await writable.close();

    const released: THREE.BufferGeometry[] = [];
    for (const geometry of candidates) {
      if (!canRelease(geometry)) continue;
      releaseGeometryStorage(geometry);
      released.push(geometry);
    }

    spilledSceneSnapshots.set(key, {
      fileHandle,
      dataOffset: 4 + headerBytes.byteLength,
      geometries: specs,
    });
    console.info(
      `[UndoSpill] Spilled ${(offset / 1024 / 1024).toFixed(0)} MB from ${released.length} geometries ` +
      `in scene snapshot "${key}".`,
    );
    return true;
  } catch (error) {
    console.warn('[UndoSpill] Failed spilling scene snapshot; keeping it in memory.', error);
    if (fileHandle) {
      try {
        const directory = await spillDirectory();
        await directory?.removeEntry(`scene-${key}.bin`);
      } catch {
        // A stale scratch file is pruned on the next successful spill.
      }
    }
    return false;
  } finally {
    inFlightSpills.delete(key);
  }
}

/** Re-attaches the arrays a spilled snapshot owns. Returns false when the blob is gone. */
export async function rehydrateSceneSnapshotPair(key: string, pair: SceneSnapshotPair): Promise<boolean> {
  const spilled = spilledSceneSnapshots.get(key);
  if (!spilled) return false;

  try {
    const file = await spilled.fileHandle.getFile();
    const byUuid = new Map<string, THREE.BufferGeometry>();
    for (const geometry of pairGeometries(pair)) byUuid.set(geometry.uuid, geometry);

    for (const spec of spilled.geometries) {
      const geometry = byUuid.get(spec.uuid);
      if (!geometry) continue;
      if (Object.keys(geometry.attributes).length > 0) continue;

      for (const attributeSpec of spec.attributes) {
        const Ctor = constructorFor(attributeSpec.type);
        const buffer = await file
          .slice(spilled.dataOffset + attributeSpec.offset, spilled.dataOffset + attributeSpec.offset + attributeSpec.byteLength)
          .arrayBuffer();
        geometry.setAttribute(
          attributeSpec.name,
          new THREE.BufferAttribute(new Ctor(buffer) as never, attributeSpec.itemSize, attributeSpec.normalized),
        );
      }
      if (spec.index) {
        const Ctor = constructorFor(spec.index.type);
        const buffer = await file
          .slice(spilled.dataOffset + spec.index.offset, spilled.dataOffset + spec.index.offset + spec.index.byteLength)
          .arrayBuffer();
        geometry.setIndex(new THREE.BufferAttribute(new Ctor(buffer) as never, spec.index.itemSize, spec.index.normalized));
      }
      if (spec.hadBoundsTree) accelerateGeometry(geometry);
    }

    spilledSceneSnapshots.delete(key);
    return true;
  } catch (error) {
    console.warn('[UndoSpill] Failed restoring spilled scene snapshot.', error);
    return false;
  }
}

export function disposeSpilledSceneSnapshot(key: string): void {
  const spilled = spilledSceneSnapshots.get(key);
  spilledSceneSnapshots.delete(key);
  if (!spilled) return;
  void (async () => {
    try {
      const directory = await spillDirectory();
      await directory?.removeEntry(`scene-${key}.bin`);
    } catch {
      // Already gone.
    }
  })();
}
