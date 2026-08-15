import { GENERATED_BUILTIN_COMPLEX_PLUGIN_DEFINITIONS } from './generatedBuiltinComplexPlugins';

/**
 * File extensions contributed by built-in fileType plugins (without leading dot, lowercase).
 * Derived at module load time from the auto-generated plugin registry.
 */
export const PLUGIN_CONTRIBUTED_FILE_EXTENSIONS: readonly string[] = Object.freeze(
  GENERATED_BUILTIN_COMPLEX_PLUGIN_DEFINITIONS.flatMap((def) => def.fileTypes ?? []).map((ft) =>
    ft.fileExtension.replace(/^\./, '').toLowerCase(),
  ),
);

/**
 * Scene file extensions contributed by built-in plugins (without leading dot,
 * lowercase). Only `isSceneFile` types are included -- these are the formats the
 * host routes through a plugin handler rather than loading as a plain mesh.
 */
export const PLUGIN_SCENE_FILE_EXTENSIONS: readonly string[] = Object.freeze(
  GENERATED_BUILTIN_COMPLEX_PLUGIN_DEFINITIONS
    .flatMap((def) => def.fileTypes ?? [])
    .filter((ft) => ft.isSceneFile)
    .map((ft) => ft.fileExtension.replace(/^\./, '').toLowerCase()),
);

/**
 * Every scene extension the app can open: the built-in `.voxl` plus whatever
 * plugins contribute. Mirrors the Rust-side list the native file dialog builds,
 * so both pickers offer the same formats.
 */
export const SCENE_FILE_EXTENSIONS: readonly string[] = Object.freeze([
  'voxl',
  ...PLUGIN_SCENE_FILE_EXTENSIONS,
]);

/**
 * `accept` attribute for a scene `<input type="file">`, e.g. ".voxl,.lys,.zip".
 * `.zip` is appended because scene bundles are accepted alongside loose files.
 */
export function sceneFileInputAccept(includeZip = true): string {
  const exts = SCENE_FILE_EXTENSIONS.map((ext) => `.${ext}`);
  if (includeZip) exts.push('.zip');
  return exts.join(',');
}

/** Uppercase scene format names for display, e.g. "VOXL, LYS, CHITUBOX". */
export function sceneFileExtensionLabels(): string[] {
  return SCENE_FILE_EXTENSIONS.map((ext) => ext.toUpperCase());
}

/**
 * Regex that strips all known source file extensions from the tail of a filename,
 * including chained suffixes (e.g. "model.stl.lys" → "model").
 *
 * Core extensions are hardcoded here; plugin-contributed extensions are included
 * automatically from the generated plugin registry.
 */
export const KNOWN_SOURCE_EXTENSION_STRIP_RE: RegExp = (() => {
  const core = ['stl', 'obj', '3mf', 'json', 'voxl'];
  const all = [...core, ...PLUGIN_CONTRIBUTED_FILE_EXTENSIONS];
  return new RegExp(`(\\.(${all.join('|')}))+$`, 'i');
})();
