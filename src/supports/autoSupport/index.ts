export type {
  CandidatePoint,
  AutoPlaceResult,
  AutoPlaceAnalytics,
  SizingDebugInfo,
  RejectReason,
} from "./types";

export {
  AUTO_SUPPORT_CONSTRAINTS,
  createDefaultAutoSupportSettings,
  normalizeAutoSupportSettings,
  applyAutoSupportSettingsPatch,
} from "./settings";
export type { AutoSupportSettings } from "./settings";

export {
  generateCandidates,
  deduplicateCandidates,
  candidateFromIsland,
} from "./candidateGeneration";

export { sizeParameters } from "./parameterSizing";
export type { SizeOverrides } from "./parameterSizing";

export { runAutoPlace } from "./autoPlace";
export { setModelMesh, getModelMesh } from "./meshStore";
