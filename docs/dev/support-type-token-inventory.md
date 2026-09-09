# Support type token inventory

Every distinct token containing a support type name, outside tests, each
type's own `SupportTypes/<Type>/` folder, and the registry. Comments are
stripped, so these are code references only.

Point-in-time snapshot, for planning a rename or spotting hand-typed walks.
It will drift as the code changes; regenerate rather than trusting the counts.

Regenerate with `lysdiag/tools/inventory.py` then `report.py` (diagnostic
tooling, deliberately not committed to this repo).

## Totals

- **951** distinct tokens, **8894** occurrences
- **908** tokens (8576 occurrences) name a support type
- **43** tokens (318 occurrences) are false positives

| type | occurrences |
| --- | ---: |
| trunk | 1847 |
| branch | 1486 |
| leaf | 1309 |
| twig | 478 |
| stick | 340 |
| brace | 1290 |
| anchor | 584 |
| kickstand | 1242 |
| **total** | **8576** |

## Every token, by frequency

`n` is total occurrences; files are listed `path (n)`.

| token | n | types | files |
| --- | ---: | --- | --- |
| `trunk` | 574 | trunk | src/supports/autoSupport/autoPlace.ts (89), src/supports/state.ts (65), src/supports/Curves/curveUtils.ts (50), src/supports/autoBracing/autoBrace.ts (40), src/supports/SupportPrimitives/Joint/jointUtils.ts (37), src/supports/PlacementLogic/Grid/gridPlacement.ts (28), src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (26), src/supports/SupportRenderer.tsx (22), src/supports/SupportProxyMeshLayer.tsx (20), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (18), src/components/scene/SceneCanvas/SceneCanvas.tsx (15), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (14), src/features/export/logic/supportExportReconstruction.ts (12), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (11), src/features/scene/importDefaultsPreferences.ts (10), src/features/slicing/rasterLayerZipExport.ts (9), src/supports/Curves/CurveSettingsCard.tsx (9), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (8), src/supports/Settings/supportKindState.ts (7), src/supports/autoBracing/heightCoverageAnalysis.ts (7), src/features/supports/useSupportInteractionManager.ts (6), src/supports/Settings/SupportSidebar.tsx (6), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (6), src/features/scene/useSceneCollectionManager.ts (5), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (5), src/supports/history/actionTypes.ts (5), src/app/page.tsx (4), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (4), src/supports/interaction/jointDragPreviewMath.ts (4), src/components/controls/AutoSupportPanel.tsx (3), src/components/modals/ModelSupportsModal.tsx (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (3), src/supports/autoSupport/types.ts (3), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (2), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2), src/supports/SupportTypes/Kickstand/kickstandRules.ts (2), src/supports/interaction/jointDragPreview.ts (2), src/supports/types.ts (2), src/components/settings/GeneralSettingsTab.tsx (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/components/SupportKindTabs.tsx (1), src/supports/SupportTypes/Kickstand/types.ts (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/history/useSupportHistoryHandlers.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `branch` | 431 | branch | src/supports/autoSupport/autoPlace.ts (58), src/supports/state.ts (51), src/supports/SupportProxyMeshLayer.tsx (28), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (27), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (26), src/components/scene/SceneCanvas/SceneCanvas.tsx (24), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (22), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (22), src/features/export/logic/supportExportReconstruction.ts (20), src/supports/SupportRenderer.tsx (20), src/supports/interaction/supportPreviewOverlay.ts (15), src/supports/PlacementLogic/JointConstraintSolver.ts (13), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (9), src/features/supports/useSupportInteractionManager.ts (8), src/supports/PlacementLogic/Grid/gridPlacement.ts (8), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (8), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (8), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (7), src/features/scene/useSceneCollectionManager.ts (5), src/supports/SupportPrimitives/Joint/jointUtils.ts (5), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (5), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (4), src/supports/autoSupport/types.ts (4), src/supports/history/actionTypes.ts (4), src/components/modals/ModelSupportsModal.tsx (3), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3), src/supports/interaction/jointDragPreviewMath.ts (3), src/supports/SupportTypes/Kickstand/kickstandRules.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2), src/supports/types.ts (2), src/app/api/plugins/github-manifest/route.ts (1), src/features/updater/UpdatesSettingsTab.tsx (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/Settings/supportKindState.ts (1), src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Kickstand/types.ts (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1), src/supports/placementControllers.ts (1) |
| `leaf` | 359 | leaf | src/supports/autoSupport/autoPlace.ts (52), src/supports/state.ts (52), src/supports/SupportRenderer.tsx (43), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (23), src/supports/SupportProxyMeshLayer.tsx (23), src/components/scene/SceneCanvas/SceneCanvas.tsx (21), src/supports/SupportTypes/Brace/BracePlacementController.tsx (21), src/features/export/logic/supportExportReconstruction.ts (17), src/features/supports/useSupportInteractionManager.ts (11), src/supports/interaction/supportPreviewOverlay.ts (10), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (9), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (8), src/supports/SupportTypes/Twig/TwigRenderer.tsx (7), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (6), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (5), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (5), src/supports/supportPlacementPreviewMath.ts (5), src/features/scene/useSceneCollectionManager.ts (4), src/supports/SupportTypes/Twig/twigDragPreview.ts (4), src/supports/autoSupport/types.ts (4), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (4), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (4), src/supports/history/actionTypes.ts (3), src/app/page.tsx (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2), src/supports/types.ts (2), src/components/controls/AutoSupportPanel.tsx (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/Settings/supportKindState.ts (1), src/supports/SupportTypes/Brace/bracePlacementState.ts (1), src/supports/placementControllers.ts (1) |
| `brace` | 347 | brace | src/supports/SupportRenderer.tsx (53), src/supports/state.ts (49), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (23), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (22), src/features/export/logic/supportExportReconstruction.ts (21), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (18), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (16), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (16), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (15), src/supports/SupportProxyMeshLayer.tsx (14), src/supports/interaction/supportPreviewOverlay.ts (14), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (12), src/supports/autoBracing/autoBrace.ts (11), src/app/page.tsx (10), src/components/scene/SceneCanvas/SceneCanvas.tsx (10), src/supports/autoSupport/autoPlace.ts (9), src/supports/interaction/supportRenderLookupMath.ts (8), src/components/controls/AutoSupportPanel.tsx (6), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (5), src/features/supports/useSupportInteractionManager.ts (4), src/supports/history/actionTypes.ts (4), src/supports/autoBracing/autoBraceMessages.ts (2), src/supports/types.ts (2), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/placementControllers.ts (1) |
| `kickstand` | 308 | kickstand | src/supports/state.ts (61), src/supports/SupportRenderer.tsx (33), src/features/export/logic/supportExportReconstruction.ts (25), src/supports/autoBracing/autoBrace.ts (22), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (21), src/components/scene/SceneCanvas/SceneCanvas.tsx (15), src/supports/PlacementLogic/supportClipboard.ts (15), src/supports/SupportProxyMeshLayer.tsx (15), src/app/page.tsx (14), src/features/scene/useSceneCollectionManager.ts (9), src/features/slicing/rasterLayerZipExport.ts (9), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (7), src/supports/autoSupport/autoPlace.ts (6), src/supports/interaction/jointDragPreviewMath.ts (6), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (6), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (5), src/features/scene/voxl/codec.ts (4), src/supports/PlacementLogic/SupportModelLinker.ts (4), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (4), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (4), src/supports/history/actionTypes.ts (3), src/supports/history/useSupportHistoryHandlers.ts (3), src/supports/interaction/supportRenderLookupMath.ts (3), src/features/scene/importDefaultsPreferences.ts (2), src/features/supports/useSupportInteractionManager.ts (2), src/supports/Settings/SupportSidebar.tsx (2), src/supports/history/supportEditHistory.ts (2), src/supports/types.ts (2), src/supports/autoSupport/types.ts (1), src/supports/interaction/jointDragPreview.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1), src/supports/placementControllers.ts (1) |
| `anchor` | 254 | anchor | src/features/export/logic/supportExportReconstruction.ts (20), src/app/page.tsx (19), src/supports/SupportProxyMeshLayer.tsx (19), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (17), src/supports/autoSupport/autoPlace.ts (15), src/supports/state.ts (14), src/components/scene/SceneCanvas/SceneCanvas.tsx (13), src/components/settings/PluginStudioModal.tsx (8), src/features/organicCut/tenonLeanTransform.ts (8), src/features/printing/usePrintingMonitorManager.ts (8), src/features/slicing/rasterLayerZipExport.ts (8), src/supports/PlacementLogic/Pathfinding/FieldDeterministicSolver.ts (8), src/supports/Settings/presets.ts (8), src/supports/SupportRenderer.tsx (8), src/components/settings/SettingsModal.tsx (6), src/features/slicing/components/LutCurveEditor.tsx (6), src/supports/PlacementLogic/Grid/gridPlacement.ts (6), src/supports/SupportPrimitives/Knot/segmentEndpoints.ts (6), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (6), src/supports/Rafts/Crenelated/raftFootprintCircles.ts (5), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (4), src/supports/Settings/SupportSidebar.tsx (4), src/supports/autoSupport/types.ts (4), src/supports/history/actionTypes.ts (4), src/supports/PlacementLogic/Pathfinding/GridAStar.ts (3), src/supports/PlacementLogic/Pathfinding/PotentialFieldSolver.ts (3), src/supports/PlacementLogic/smartPlacementCandidateSearch.ts (3), src/supports/SupportTypes/Stick/StickRenderer.tsx (3), src/supports/autoSupport/parameterSizing.ts (3), src/components/controls/AutoSupportPanel.tsx (2), src/features/organicCut/OrganicCutTenonGizmo.tsx (2), src/features/organicCut/OrganicCutTool.tsx (2), src/supports/Settings/presetMessages.ts (2), src/supports/autoSupport/settings.ts (2), src/supports/types.ts (2), src/features/organicCut/types.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/PlacementLogic/SupportLimitations.tsx (1) |
| `twig` | 153 | twig | src/supports/SupportProxyMeshLayer.tsx (43), src/features/export/logic/supportExportReconstruction.ts (24), src/supports/state.ts (17), src/components/scene/SceneCanvas/SceneCanvas.tsx (13), src/supports/SupportRenderer.tsx (10), src/features/scene/useSceneCollectionManager.ts (6), src/supports/SupportTypes/Brace/BracePlacementController.tsx (6), src/supports/SupportPrimitives/Joint/jointUtils.ts (5), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (4), src/supports/history/actionTypes.ts (4), src/components/modals/ModelSupportsModal.tsx (3), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (3), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (3), src/supports/autoSupport/types.ts (3), src/supports/types.ts (2), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/Settings/supportKindState.ts (1), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `stick` | 138 | stick | src/supports/SupportProxyMeshLayer.tsx (25), src/supports/state.ts (23), src/components/scene/SceneCanvas/SceneCanvas.tsx (20), src/features/export/logic/supportExportReconstruction.ts (13), src/supports/SupportRenderer.tsx (8), src/features/scene/useSceneCollectionManager.ts (6), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (6), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (5), src/supports/SupportPrimitives/Joint/jointUtils.ts (5), src/supports/history/actionTypes.ts (4), src/components/modals/ModelSupportsModal.tsx (3), src/supports/Settings/SupportSidebar.tsx (3), src/supports/autoSupport/types.ts (3), src/supports/Settings/supportKindState.ts (2), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (2), src/supports/autoSupport/autoPlace.ts (2), src/supports/types.ts (2), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/Settings/AnatomyPreview/anatomyPreviews.ts (1), src/supports/Settings/components/SupportKindTabs.tsx (1), src/supports/autoBracing/autoBracingHotkey.ts (1) |
| `trunks` | 135 | trunk | src/supports/autoSupport/autoPlace.ts (43), src/supports/state.ts (17), src/components/controls/AutoSupportPanel.tsx (12), src/features/export/logic/supportExportReconstruction.ts (8), src/features/scene/useSceneCollectionManager.ts (8), src/supports/Curves/CurveSettingsCard.tsx (6), src/supports/SupportRenderer.tsx (5), src/components/scene/SceneCanvas/SceneCanvas.tsx (4), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (4), src/features/supports/useSupportInteractionManager.ts (3), src/supports/types.ts (3), src/components/modals/ModelSupportsModal.tsx (2), src/features/scene/voxl/codec.ts (2), src/features/slicing/rasterLayerZipExport.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/history/useSupportHistoryHandlers.ts (2), src/supports/interaction/useSupportRenderLookup.ts (2), src/app/page.tsx (1), src/features/export/logic/ExportManager.ts (1), src/features/scene/importDefaultsPreferences.ts (1), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/autoSupport/coverage.ts (1), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `kickstands` | 134 | kickstand | src/supports/state.ts (34), src/supports/autoBracing/autoBrace.ts (20), src/supports/SupportRenderer.tsx (11), src/features/export/logic/supportExportReconstruction.ts (9), src/supports/PlacementLogic/supportClipboard.ts (9), src/features/scene/useSceneCollectionManager.ts (8), src/components/controls/AutoSupportPanel.tsx (7), src/features/supports/supportSnapshotHelpers.ts (6), src/components/scene/SceneCanvas/SceneCanvas.tsx (5), src/features/scene/importDefaultsPreferences.ts (3), src/features/scene/voxl/codec.ts (3), src/supports/types.ts (3), src/features/slicing/rasterLayerZipExport.ts (2), src/supports/PlacementLogic/SupportModelLinker.ts (2), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (2), src/supports/history/actionTypes.ts (2), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2), src/app/page.tsx (1), src/components/modals/ModelSupportsModal.tsx (1), src/features/export/logic/ExportManager.ts (1), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/interaction/supportRenderLookupMath.ts (1) |
| `Trunk` | 118 | trunk | src/supports/state.ts (18), src/supports/Curves/curveUtils.ts (14), src/supports/PlacementLogic/Grid/gridPlacement.ts (8), src/supports/history/actionTypes.ts (8), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (7), src/supports/SupportPrimitives/Joint/jointUtils.ts (6), src/supports/Settings/SupportSidebar.tsx (5), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (5), src/supports/SupportRenderer.tsx (5), src/supports/autoSupport/autoPlace.ts (5), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (4), src/features/export/logic/supportExportReconstruction.ts (3), src/supports/SupportPrimitives/Joint/jointDragController.ts (3), src/supports/interaction/jointDragPreviewMath.ts (3), src/supports/types.ts (3), src/features/scene/importDefaultsPreferences.ts (2), src/features/supports/useSupportInteractionManager.ts (2), src/supports/PlacementLogic/JointConstraintSolver.ts (2), src/supports/interaction/jointDragPreview.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Raft/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/Settings/components/PresetCard.tsx (1), src/supports/Settings/components/SupportKindTabs.tsx (1), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/rendering/SupportBuilder.tsx (1) |
| `branches` | 117 | branch | src/supports/autoSupport/autoPlace.ts (22), src/supports/state.ts (19), src/components/controls/AutoSupportPanel.tsx (8), src/features/export/logic/supportExportReconstruction.ts (8), src/features/scene/useSceneCollectionManager.ts (8), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (8), src/supports/SupportRenderer.tsx (7), src/components/scene/SceneCanvas/SceneCanvas.tsx (5), src/features/supports/useSupportInteractionManager.ts (4), src/supports/interaction/supportPreviewOverlay.ts (4), src/supports/types.ts (3), src/components/modals/ModelSupportsModal.tsx (2), src/features/scene/voxl/codec.ts (2), src/supports/PlacementLogic/JointConstraintSolver.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/history/actionTypes.ts (2), src/supports/interaction/useSupportRenderLookup.ts (2), src/features/export/logic/ExportManager.ts (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (1), src/supports/autoSupport/coverage.ts (1), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `Branch` | 116 | branch | src/supports/state.ts (13), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (11), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (8), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (7), src/supports/history/actionTypes.ts (6), src/supports/interaction/supportPreviewOverlay.ts (6), src/features/export/logic/supportExportReconstruction.ts (5), src/supports/SupportRenderer.tsx (5), src/supports/PlacementLogic/Grid/types.ts (4), src/supports/PlacementLogic/JointConstraintSolver.ts (4), src/supports/autoSupport/autoPlace.ts (4), src/supports/SupportPrimitives/Joint/jointUtils.ts (3), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (3), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (3), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (3), src/supports/interaction/jointDragPreviewMath.ts (3), src/supports/types.ts (3), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (2), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (2), src/supports/SupportPrimitives/Joint/jointDragController.ts (2), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (2), src/supports/interaction/jointDragPreview.ts (2), src/supports/interaction/knotDragPreview.ts (2), src/features/supports/useSupportInteractionManager.ts (1), src/hotkeys/hotkeyConfig.ts (1), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Brace/BraceRenderer.tsx (1), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/placementControllers.ts (1), src/supports/rendering/SupportBuilder.tsx (1) |
| `braces` | 107 | brace | src/supports/state.ts (30), src/features/export/logic/supportExportReconstruction.ts (9), src/supports/autoBracing/autoBrace.ts (8), src/features/scene/useSceneCollectionManager.ts (7), src/supports/SupportRenderer.tsx (5), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (5), src/components/controls/AutoSupportPanel.tsx (4), src/components/scene/SceneCanvas/SceneCanvas.tsx (4), src/app/page.tsx (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (3), src/supports/types.ts (3), src/features/scene/voxl/codec.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (2), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (2), src/supports/autoBracing/autoBraceMessages.ts (2), src/supports/history/actionTypes.ts (2), src/supports/interaction/supportPreviewOverlay.ts (2), src/supports/interaction/useSupportRenderLookup.ts (2), src/components/modals/DiagnosticsModal.tsx (1), src/components/modals/ModelSupportsModal.tsx (1), src/features/export/logic/ExportManager.ts (1), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/Curves/useCurveHotkey.ts (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/autoBracing/meshClearance.ts (1), src/supports/autoSupport/autoPlace.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1) |
| `leafId` | 98 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (46), src/supports/SupportRenderer.tsx (13), src/supports/state.ts (11), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (8), src/supports/autoSupport/autoPlace.ts (7), src/supports/SupportTypes/Brace/bracePlacementState.ts (3), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (3), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2), src/supports/interaction/supportPreviewOverlay.ts (2), src/app/page.tsx (1) |
| `'branch'` | 95 | branch | src/supports/autoSupport/autoPlace.ts (16), src/supports/state.ts (12), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (8), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (7), src/features/supports/useSupportInteractionManager.ts (6), src/supports/SupportRenderer.tsx (6), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (5), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (5), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (5), src/supports/autoSupport/types.ts (4), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/PlacementLogic/JointConstraintSolver.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/SupportPrimitives/Joint/jointUtils.ts (1), src/supports/SupportTypes/Kickstand/kickstandRules.ts (1), src/supports/SupportTypes/Kickstand/types.ts (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1), src/supports/interaction/jointDragPreviewMath.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1), src/supports/interaction/supportPreviewOverlay.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `'trunk'` | 93 | trunk | src/supports/state.ts (13), src/supports/autoSupport/autoPlace.ts (8), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (7), src/supports/SupportRenderer.tsx (7), src/supports/Settings/supportKindState.ts (6), src/supports/autoBracing/autoBrace.ts (6), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (5), src/supports/Settings/SupportSidebar.tsx (5), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (4), src/supports/Curves/CurveSettingsCard.tsx (3), src/supports/autoSupport/types.ts (3), src/features/supports/useSupportInteractionManager.ts (2), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2), src/supports/interaction/jointDragPreview.ts (2), src/supports/interaction/jointDragPreviewMath.ts (2), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/Settings/components/SupportKindTabs.tsx (1), src/supports/SupportPrimitives/Joint/jointUtils.ts (1), src/supports/SupportTypes/Kickstand/kickstandRules.ts (1), src/supports/SupportTypes/Kickstand/types.ts (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/history/useSupportHistoryHandlers.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `Leaf` | 92 | leaf | src/supports/autoSupport/autoPlace.ts (14), src/supports/state.ts (11), src/supports/SupportRenderer.tsx (7), src/features/export/logic/supportExportReconstruction.ts (6), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (6), src/supports/interaction/supportPreviewOverlay.ts (6), src/supports/SupportTypes/Twig/twigDragPreview.ts (5), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (4), src/supports/history/actionTypes.ts (4), src/app/page.tsx (3), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (3), src/supports/types.ts (3), src/hotkeys/hotkeyConfig.ts (2), src/supports/PlacementLogic/Grid/types.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (2), src/supports/supportPlacementPreviewMath.ts (2), src/features/supports/useSupportInteractionManager.ts (1), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Renderers/BezierRenderer.tsx (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/SupportPrimitives/Knot/KnotRenderer.tsx (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/SupportTypes/Kickstand/KickstandPlacementController.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1), src/supports/placementControllers.ts (1) |
| `trunkId` | 92 | trunk | src/supports/autoSupport/autoPlace.ts (54), src/supports/PlacementLogic/Grid/gridPlacement.ts (8), src/supports/state.ts (8), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (7), src/features/supports/useSupportInteractionManager.ts (6), src/supports/autoBracing/heightCoverageAnalysis.ts (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (2), src/supports/SupportPrimitives/Joint/useJointCreation.ts (2), src/supports/autoBracing/autoBrace.ts (2) |
| `'leaf'` | 77 | leaf | src/supports/autoSupport/autoPlace.ts (20), src/supports/SupportTypes/Brace/BracePlacementController.tsx (9), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (9), src/supports/state.ts (9), src/features/supports/useSupportInteractionManager.ts (7), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (6), src/supports/SupportRenderer.tsx (5), src/supports/autoSupport/types.ts (4), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (2), src/app/page.tsx (1), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/SupportTypes/Brace/bracePlacementState.ts (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1) |
| `Brace` | 77 | brace | src/supports/SupportRenderer.tsx (11), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7), src/supports/state.ts (6), src/features/export/logic/supportExportReconstruction.ts (5), src/components/organisms/panels/SharedPanelStack.tsx (4), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (4), src/supports/history/actionTypes.ts (4), src/supports/interaction/supportPreviewOverlay.ts (4), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (3), src/supports/autoBracing/AutoBracingSettingsCard.tsx (3), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (3), src/supports/types.ts (3), src/supports/Settings/SupportSidebar.tsx (2), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (2), src/supports/autoBracing/autoBrace.ts (2), src/app/page.tsx (1), src/components/controls/AutoSupportPanel.tsx (1), src/features/supports/useSupportInteractionManager.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Renderers/BezierRenderer.tsx (1), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (1), src/supports/Settings/AnatomyPreview/anatomyPreviews.ts (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/autoBracing/autoBraceMessages.ts (1), src/supports/interaction/shared/placement/preview/placementPreviewResolver.ts (1), src/supports/interaction/shared/placement/preview/previewTypes.ts (1), src/supports/placementControllers.ts (1), src/supports/rendering/placementPreviews.ts (1), src/supports/supportPlacementPreviewMath.ts (1) |
| `branchId` | 76 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (28), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (11), src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (10), src/supports/state.ts (8), src/supports/interaction/supportPreviewOverlay.ts (7), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (6), src/supports/autoSupport/autoPlace.ts (3), src/features/supports/useSupportInteractionManager.ts (1), src/supports/PlacementLogic/ElasticChainSolver.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `Kickstand` | 75 | kickstand | src/supports/state.ts (13), src/features/export/logic/supportExportReconstruction.ts (6), src/supports/SupportRenderer.tsx (6), src/supports/interaction/jointDragPreviewMath.ts (5), src/supports/PlacementLogic/supportClipboard.ts (4), src/supports/history/actionTypes.ts (4), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (3), src/supports/interaction/jointDragPreview.ts (3), src/supports/types.ts (3), src/components/organisms/panels/SharedPanelStack.tsx (2), src/features/scene/useSceneCollectionManager.ts (2), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (2), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2), src/supports/autoSupport/autoPlace.ts (2), src/app/page.tsx (1), src/components/controls/AutoSupportPanel.tsx (1), src/components/scene/SceneCanvas/SceneCanvas.tsx (1), src/features/export/logic/ExportManager.ts (1), src/features/scene/voxl/codec.ts (1), src/features/slicing/rasterLayerZipExport.ts (1), src/features/supports/supportSnapshotHelpers.ts (1), src/features/supports/useSupportInteractionManager.ts (1), src/hotkeys/hotkeyConfig.ts (1), src/supports/Renderers/BezierRenderer.tsx (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/autoSupport/types.ts (1), src/supports/history/supportEditHistory.ts (1), src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1), src/supports/placementControllers.ts (1) |
| `twigs` | 63 | twig | src/supports/state.ts (15), src/features/scene/useSceneCollectionManager.ts (9), src/features/export/logic/supportExportReconstruction.ts (7), src/components/controls/AutoSupportPanel.tsx (5), src/components/scene/SceneCanvas/SceneCanvas.tsx (4), src/supports/SupportRenderer.tsx (3), src/supports/SupportTypes/Brace/BracePlacementController.tsx (3), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (3), src/supports/types.ts (3), src/components/modals/ModelSupportsModal.tsx (2), src/features/scene/voxl/codec.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/interaction/useSupportRenderLookup.ts (2), src/features/export/logic/ExportManager.ts (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/autoSupport/autoPlace.ts (1) |
| `anchors` | 61 | anchor | src/supports/state.ts (12), src/components/layout/FloatingPanelStack.tsx (8), src/features/export/logic/supportExportReconstruction.ts (7), src/components/controls/AutoSupportPanel.tsx (5), src/supports/autoSupport/autoPlace.ts (4), src/supports/RaftProxyMeshLayer.tsx (3), src/supports/Rafts/Crenelated/rendering/FootprintBorderRenderer.tsx (3), src/supports/SupportProxyMeshLayer.tsx (3), src/supports/SupportRenderer.tsx (3), src/supports/types.ts (3), src/features/scene/voxl/codec.ts (2), src/supports/Rafts/Crenelated/raftFootprintCircles.ts (2), src/supports/Rafts/Crenelated/rendering/LineRaftRenderer.tsx (2), src/supports/Rafts/Crenelated/rendering/RaftRenderer.tsx (2), src/components/scene/SceneCanvas/SceneCanvas.tsx (1), src/supports/autoSupport/coverage.ts (1) |
| `sticks` | 61 | stick | src/supports/state.ts (15), src/features/scene/useSceneCollectionManager.ts (9), src/features/export/logic/supportExportReconstruction.ts (7), src/components/controls/AutoSupportPanel.tsx (5), src/supports/autoSupport/autoPlace.ts (5), src/components/scene/SceneCanvas/SceneCanvas.tsx (4), src/supports/SupportRenderer.tsx (3), src/supports/types.ts (3), src/components/modals/ModelSupportsModal.tsx (2), src/features/scene/voxl/codec.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/interaction/useSupportRenderLookup.ts (2), src/features/export/logic/ExportManager.ts (1), src/supports/SupportProxyMeshLayer.tsx (1) |
| `braceSegment` | 47 | brace | src/supports/state.ts (16), src/supports/SupportRenderer.tsx (8), src/features/export/logic/supportExportReconstruction.ts (4), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (4), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (4), src/supports/SupportProxyMeshLayer.tsx (2), src/app/page.tsx (1), src/supports/Curves/useCurveHotkey.ts (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1) |
| `Twig` | 42 | twig | src/supports/state.ts (8), src/features/export/logic/supportExportReconstruction.ts (5), src/supports/SupportRenderer.tsx (5), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3), src/supports/SupportPrimitives/Joint/jointUtils.ts (3), src/supports/supportPlacementPreviewMath.ts (3), src/supports/types.ts (3), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/SupportSidebar.tsx (1), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (1), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (1), src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1) |
| `leafCone` | 42 | leaf | src/supports/state.ts (19), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7), src/supports/SupportRenderer.tsx (6), src/supports/SupportTypes/Brace/BracePlacementController.tsx (4), src/features/export/logic/supportExportReconstruction.ts (2), src/supports/SupportPrimitives/Knot/knotUtils.ts (2), src/components/controls/AutoSupportPanel.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (1) |
| `'kickstand'` | 38 | kickstand | src/supports/SupportRenderer.tsx (8), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (6), src/supports/state.ts (6), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (4), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (3), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/features/supports/useSupportInteractionManager.ts (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/history/actionTypes.ts (1), src/supports/interaction/jointDragPreview.ts (1), src/supports/interaction/jointDragPreviewMath.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/supportRenderLookupMath.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `kickstandKnots` | 38 | kickstand | src/supports/interaction/jointDragPreview.ts (16), src/supports/PlacementLogic/supportClipboard.ts (5), src/supports/SupportProxyMeshLayer.tsx (5), src/features/export/logic/supportExportReconstruction.ts (4), src/supports/interaction/jointDragPreview.worker.ts (4), src/supports/interaction/jointDragPreview.worker.shared.ts (2), src/features/scene/useSceneCollectionManager.ts (1), src/supports/SupportRenderer.tsx (1) |
| `'braceSegment:'` | 37 | brace | src/supports/state.ts (14), src/supports/SupportRenderer.tsx (6), src/features/export/logic/supportExportReconstruction.ts (4), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (4), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (4), src/supports/autoBracing/autoBrace.ts (1) |
| `braceId` | 37 | brace | src/supports/state.ts (14), src/supports/SupportRenderer.tsx (8), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (4), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (4), src/supports/interaction/supportPreviewOverlay.ts (3) |
| `hostTrunkId` | 35 | trunk | src/supports/autoSupport/autoPlace.ts (15), src/supports/PlacementLogic/Grid/gridPlacement.ts (8), src/supports/autoBracing/autoBrace.ts (5), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (4), src/supports/PlacementLogic/Grid/types.ts (3) |
| `kickstandState` | 35 | kickstand | src/features/export/logic/supportExportReconstruction.ts (12), src/features/slicing/rasterLayerZipExport.ts (6), src/features/scene/voxl/codec.ts (4), src/supports/SupportProxyMeshLayer.tsx (4), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (4), src/features/export/logic/ExportManager.ts (2), src/features/scene/useSceneCollectionManager.ts (2), src/supports/SupportRenderer.tsx (1) |
| `kickstandRoots` | 34 | kickstand | src/supports/RaftProxyMeshLayer.tsx (6), src/supports/PlacementLogic/supportClipboard.ts (5), src/supports/SupportProxyMeshLayer.tsx (5), src/features/export/logic/supportExportReconstruction.ts (4), src/supports/Rafts/Crenelated/rendering/FootprintBorderRenderer.tsx (4), src/supports/Rafts/Crenelated/rendering/LineRaftRenderer.tsx (4), src/supports/Rafts/Crenelated/rendering/RaftRenderer.tsx (4), src/supports/Rafts/Crenelated/raftFootprintCircles.ts (2) |
| `'brace'` | 33 | brace | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (6), src/supports/SupportRenderer.tsx (5), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (5), src/supports/state.ts (3), src/app/page.tsx (1), src/features/export/logic/supportExportReconstruction.ts (1), src/features/supports/useSupportInteractionManager.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `leafPlacement` | 32 | leaf | src/features/supports/useSupportInteractionManager.ts (29), src/app/page.tsx (3) |
| `'anchor'` | 31 | anchor | src/supports/autoSupport/autoPlace.ts (7), src/supports/Settings/presets.ts (6), src/supports/autoSupport/types.ts (3), src/supports/state.ts (3), src/supports/SupportRenderer.tsx (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/autoSupport/parameterSizing.ts (2), src/supports/autoSupport/settings.ts (2), src/supports/history/actionTypes.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/PlacementLogic/Grid/gridPlacement.ts (1) |
| `kickstandsChanged` | 31 | kickstand | src/features/scene/useSceneCollectionManager.ts (18), src/supports/state.ts (8), src/app/page.tsx (5) |
| `Anchor` | 29 | anchor | src/features/export/logic/supportExportReconstruction.ts (4), src/supports/state.ts (4), src/supports/Settings/presetMessages.ts (3), src/supports/types.ts (3), src/components/layout/TopBar.tsx (2), src/supports/PlacementLogic/Grid/types.ts (2), src/supports/Rafts/Crenelated/raftFootprintCircles.ts (2), src/supports/SupportRenderer.tsx (2), src/components/controls/ArrangePanel.tsx (1), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/Settings/components/PresetSelector.tsx (1), src/supports/Settings/presets.ts (1), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `'stick'` | 27 | stick | src/supports/SupportRenderer.tsx (6), src/supports/autoSupport/types.ts (3), src/supports/state.ts (3), src/supports/Settings/SupportSidebar.tsx (2), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (2), src/supports/autoSupport/autoPlace.ts (2), src/supports/history/actionTypes.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/Settings/components/SupportKindTabs.tsx (1), src/supports/Settings/supportKindState.ts (1), src/supports/SupportPrimitives/Joint/jointUtils.ts (1), src/supports/autoBracing/autoBracingHotkey.ts (1) |
| `Stick` | 27 | stick | src/supports/state.ts (7), src/features/export/logic/supportExportReconstruction.ts (4), src/supports/SupportPrimitives/Joint/jointUtils.ts (3), src/supports/SupportRenderer.tsx (3), src/supports/types.ts (3), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (1), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (1), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1) |
| `getKickstandSnapshot` | 27 | kickstand | src/app/page.tsx (5), src/components/controls/AutoSupportPanel.tsx (3), src/components/scene/SceneCanvas/SceneCanvas.tsx (3), src/features/scene/useSceneCollectionManager.ts (3), src/features/supports/supportSnapshotHelpers.ts (3), src/supports/autoSupport/autoPlace.ts (3), src/features/slicing/rasterLayerZipExport.ts (2), src/supports/history/supportEditHistory.ts (2), src/features/export/logic/ExportManager.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (1) |
| `KickstandState` | 24 | kickstand | src/features/export/logic/supportExportReconstruction.ts (5), src/features/scene/useSceneCollectionManager.ts (5), src/supports/autoSupport/autoPlace.ts (4), src/supports/PlacementLogic/supportClipboard.ts (3), src/features/scene/voxl/codec.ts (2), src/supports/autoSupport/types.ts (2), src/supports/history/supportEditHistory.ts (2), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `previewBranchSegmentsByIdRef` | 23 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (14), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (9) |
| `branchPlacement` | 22 | branch | src/features/supports/useSupportInteractionManager.ts (19), src/app/page.tsx (3) |
| `kickstandBefore` | 22 | kickstand | src/app/page.tsx (14), src/features/scene/useSceneCollectionManager.ts (5), src/supports/autoSupport/autoPlace.ts (3) |
| `maxAttachmentsPerTrunk` | 22 | trunk | src/supports/autoSupport/autoPlace.ts (11), src/supports/autoSupport/settings.ts (8), src/components/controls/AutoSupportPanel.tsx (3) |
| `'leafCone:'` | 21 | leaf | src/supports/state.ts (11), src/supports/SupportRenderer.tsx (6), src/features/export/logic/supportExportReconstruction.ts (2), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2) |
| `'twig'` | 21 | twig | src/supports/SupportRenderer.tsx (5), src/supports/SupportTypes/Branch/BranchPlacementController.tsx (3), src/supports/autoSupport/types.ts (3), src/supports/state.ts (3), src/supports/history/actionTypes.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1), src/supports/SupportPrimitives/Joint/jointUtils.ts (1), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `leafStage` | 21 | leaf | src/supports/SupportRenderer.tsx (15), src/supports/Renderers/BezierRenderer.tsx (3), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (3) |
| `braceAltActive` | 20 | brace | src/supports/SupportRenderer.tsx (13), src/components/organisms/panels/SharedPanelStack.tsx (2), src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2), src/app/page.tsx (1) |
| `kickstandStateForBounds` | 20 | kickstand | src/components/scene/SceneCanvas/SceneCanvas.tsx (20) |
| `minRoutedTrunkAngleDeg` | 20 | trunk | src/supports/PlacementLogic/smartPlacementRouteEvaluation.ts (6), src/supports/PlacementLogic/SmartPlacement.ts (4), src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/Settings/state.ts (3), src/supports/Settings/presets.ts (2), src/supports/Settings/types.ts (2) |
| `newTrunk` | 20 | trunk | src/supports/Curves/CurveSettingsCard.tsx (14), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (6) |
| `selectedTrunk` | 20 | trunk | src/supports/Curves/CurveSettingsCard.tsx (20) |
| `gridTrunkIds` | 18 | trunk | src/supports/autoSupport/autoPlace.ts (18) |
| `leafFanMaxAngleDeg` | 18 | leaf | src/supports/autoSupport/settings.ts (8), src/supports/autoSupport/autoPlace.ts (7), src/components/controls/AutoSupportPanel.tsx (3) |
| `maxBraceLengthMm` | 18 | brace | src/supports/autoBracing/settings.ts (8), src/supports/autoBracing/autoBrace.ts (4), src/supports/autoBracing/AutoBracingSettingsCard.tsx (2), src/supports/autoBracing/heightCoverageAnalysis.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (1) |
| `trunksByKind` | 18 | trunk | src/supports/autoSupport/autoPlace.ts (16), src/supports/autoSupport/types.ts (2) |
| `braceDiameterMm` | 17 | brace | src/supports/autoBracing/settings.ts (8), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2), src/supports/autoBracing/AutoBracingSettingsCard.tsx (2), src/supports/autoBracing/autoBrace.ts (2), src/supports/autoBracing/braceDiameter.ts (2), src/supports/supportPlacementPreviewMath.ts (1) |
| `getKickstandRoots` | 17 | kickstand | src/supports/RaftProxyMeshLayer.tsx (4), src/supports/Rafts/Crenelated/rendering/FootprintBorderRenderer.tsx (3), src/supports/Rafts/Crenelated/rendering/LineRaftRenderer.tsx (3), src/supports/Rafts/Crenelated/rendering/RaftRenderer.tsx (3), src/supports/SupportRenderer.tsx (3), src/supports/state.ts (1) |
| `twigBySegmentId` | 17 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (7), src/supports/SupportTypes/Brace/BracePlacementController.tsx (5), src/supports/SupportRenderer.tsx (3), src/supports/supportPlacementPreviewMath.ts (2) |
| `branchSegmentsById` | 16 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (8), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (6), src/supports/SupportRenderer.tsx (1), src/supports/interaction/knotDragPreview.ts (1) |
| `leafFanRadiusMm` | 16 | leaf | src/supports/autoSupport/settings.ts (8), src/supports/autoSupport/autoPlace.ts (5), src/components/controls/AutoSupportPanel.tsx (3) |
| `trunkBuild` | 16 | trunk | src/supports/autoSupport/autoPlace.ts (7), src/supports/PlacementLogic/Grid/gridPlacement.ts (6), src/supports/PlacementLogic/Grid/types.ts (3) |
| `TrunkPlacementResult` | 15 | trunk | src/supports/PlacementLogic/smartPlacementRouteEvaluation.ts (6), src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (4), src/supports/PlacementLogic/SmartPlacement.ts (3), src/supports/PlacementLogic/StandardPlacement.ts (2) |
| `KickstandBuildResult` | 14 | kickstand | src/supports/state.ts (5), src/features/export/logic/supportExportReconstruction.ts (3), src/supports/autoBracing/autoBrace.ts (2), src/supports/history/actionTypes.ts (2), src/supports/types.ts (2) |
| `TrunkBuildResult` | 14 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (9), src/supports/PlacementLogic/Grid/types.ts (5) |
| `isBranchPlacementActive` | 14 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (11), src/components/scene/SceneCanvas/StlMesh.tsx (2), src/app/page.tsx (1) |
| `floatingTrunkPreviewFadeTimeoutRef` | 13 | trunk | src/supports/Settings/SupportSidebar.tsx (13) |
| `floatingTrunkPreviewHideTimeoutRef` | 13 | trunk | src/supports/Settings/SupportSidebar.tsx (13) |
| `hostTrunk` | 13 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (7), src/supports/autoSupport/autoPlace.ts (6) |
| `isLeafPlacementActive` | 13 | leaf | src/components/scene/SceneCanvas/SceneCanvas.tsx (10), src/components/scene/SceneCanvas/StlMesh.tsx (2), src/app/page.tsx (1) |
| `kickstandHotkeyActive` | 13 | kickstand | src/supports/SupportRenderer.tsx (6), src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2), src/features/supports/useSupportInteractionManager.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `leafHotkeyActive` | 13 | leaf | src/supports/SupportRenderer.tsx (6), src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2), src/features/supports/useSupportInteractionManager.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `nextKickstands` | 13 | kickstand | src/supports/state.ts (11), src/features/scene/importDefaultsPreferences.ts (2) |
| `placedTrunks` | 13 | trunk | src/supports/autoSupport/autoPlace.ts (12), src/supports/autoSupport/types.ts (1) |
| `fanLeafToTrunk` | 12 | leaf, trunk | src/supports/autoSupport/autoPlace.ts (12) |
| `isBracePlacementActive` | 12 | brace | src/components/scene/SceneCanvas/SceneCanvas.tsx (9), src/components/scene/SceneCanvas/StlMesh.tsx (2), src/app/page.tsx (1) |
| `kickstandKnotIdsByParentShaftId` | 12 | kickstand | src/supports/SupportRenderer.tsx (5), src/supports/interaction/supportRenderLookupMath.ts (5), src/supports/interaction/supportRenderLookup.worker.ts (1), src/supports/interaction/useSupportRenderLookup.ts (1) |
| `kickstandStore` | 12 | kickstand | src/app/page.tsx (1), src/components/controls/AutoSupportPanel.tsx (1), src/components/scene/SceneCanvas/SceneCanvas.tsx (1), src/features/export/logic/ExportManager.ts (1), src/features/scene/useSceneCollectionManager.ts (1), src/features/slicing/rasterLayerZipExport.ts (1), src/features/supports/supportSnapshotHelpers.ts (1), src/supports/PlacementLogic/supportClipboard.ts (1), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (1), src/supports/SupportProxyMeshLayer.tsx (1), src/supports/autoSupport/autoPlace.ts (1), src/supports/history/supportEditHistory.ts (1) |
| `leafMeta` | 12 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (10), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `trunkUpdate` | 12 | trunk | src/supports/history/useSupportHistoryHandlers.ts (6), src/features/supports/useSupportInteractionManager.ts (4), src/supports/history/actionTypes.ts (2) |
| `FanLeafRefusal` | 11 | leaf | src/supports/autoSupport/autoPlace.ts (9), src/supports/autoSupport/types.ts (2) |
| `branchesByParentKnotId` | 11 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (5), src/supports/SupportRenderer.tsx (3), src/supports/interaction/supportPreviewOverlay.ts (3) |
| `buildBranchData` | 11 | branch | src/supports/autoSupport/autoPlace.ts (4), src/supports/PlacementLogic/Grid/gridPlacement.ts (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `hoveredLeafRef` | 11 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (11) |
| `initialTrunkRef` | 11 | trunk | src/supports/SupportPrimitives/Joint/JointGizmo.tsx (6), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (5) |
| `kickstandKnotsById` | 11 | kickstand | src/supports/SupportRenderer.tsx (7), src/features/export/logic/supportExportReconstruction.ts (4) |
| `kickstandStateOverride` | 11 | kickstand | src/features/scene/useSceneCollectionManager.ts (11) |
| `leafIds` | 11 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (3), src/supports/interaction/supportPreviewOverlay.ts (3), src/volumeAnalysis/IslandVolumes/components/IslandVolumesHierarchyCard.tsx (3), src/features/export/logic/supportExportReconstruction.ts (2) |
| `nextTrunks` | 11 | trunk | src/supports/autoSupport/autoPlace.ts (7), src/supports/state.ts (4) |
| `promoteBranch` | 11 | branch | src/supports/autoSupport/autoPlace.ts (5), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (4), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1) |
| `resolveTwigDiameterAtSegmentT` | 11 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (3), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2), src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/supportPlacementPreviewMath.ts (2), src/supports/SupportRenderer.tsx (1), src/supports/state.ts (1) |
| `sourceSupportAnchor` | 11 | anchor | src/components/scene/SceneCanvas/SceneCanvas.tsx (11) |
| `trunkPlacementV2` | 11 | trunk | src/features/supports/useSupportInteractionManager.ts (11) |
| `trunksToRemove` | 11 | trunk | src/supports/autoSupport/autoPlace.ts (11) |
| `useLeafPlacementState` | 11 | leaf | src/supports/SupportRenderer.tsx (3), src/app/page.tsx (2), src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Knot/KnotRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2) |
| `'trunk:pre-a-star'` | 10 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (9), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunks'` | 10 | trunk | src/supports/Curves/CurveSettingsCard.tsx (2), src/supports/autoSupport/autoPlace.ts (2), src/supports/history/useSupportHistoryHandlers.ts (2), src/features/export/logic/supportExportReconstruction.ts (1), src/features/scene/useSceneCollectionManager.ts (1), src/supports/state.ts (1), src/supports/types.ts (1) |
| `BracePreviewData` | 10 | brace | src/supports/SupportRenderer.tsx (2), src/supports/interaction/shared/placement/preview/placementPreviewResolver.ts (2), src/supports/interaction/shared/placement/preview/previewTypes.ts (2), src/supports/rendering/placementPreviews.ts (2), src/supports/supportPlacementPreviewMath.ts (2) |
| `LEAF_FAN_MAX_ANGLE_DEG` | 10 | leaf | src/supports/autoSupport/autoPlace.ts (9), src/supports/autoSupport/constants.ts (1) |
| `SUPPORT_UPDATE_TRUNK` | 10 | trunk | src/features/supports/useSupportInteractionManager.ts (2), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (2), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (2), src/supports/SupportPrimitives/Joint/useJointInteraction.ts (2), src/supports/history/actionTypes.ts (2) |
| `bareTrunks` | 10 | trunk | src/supports/autoSupport/autoPlace.ts (9), src/supports/autoSupport/types.ts (1) |
| `braceIds` | 10 | brace | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (3), src/supports/interaction/supportPreviewOverlay.ts (3), src/features/export/logic/supportExportReconstruction.ts (2), src/supports/autoBracing/autoBrace.ts (2) |
| `bracedAxesByTrunkId` | 10 | brace, trunk | src/supports/autoBracing/autoBrace.ts (10) |
| `branchFamily` | 10 | branch | src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (6), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (3), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `branchH` | 10 | branch | src/features/scene/useSceneCollectionManager.ts (10) |
| `branchHoverPosition` | 10 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (9), src/app/page.tsx (1) |
| `branchTipPosition` | 10 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (9), src/app/page.tsx (1) |
| `leafTipPosition` | 10 | leaf | src/components/scene/SceneCanvas/SceneCanvas.tsx (9), src/app/page.tsx (1) |
| `nextBranches` | 10 | branch | src/supports/autoSupport/autoPlace.ts (6), src/supports/state.ts (4) |
| `placedBranches` | 10 | branch | src/supports/autoSupport/autoPlace.ts (9), src/supports/autoSupport/types.ts (1) |
| `trunkSamples` | 10 | trunk | src/supports/autoBracing/autoBrace.ts (10) |
| `braceHostKnotIds` | 9 | brace | src/supports/state.ts (9) |
| `bracePlacementSnapshot` | 9 | brace | src/app/page.tsx (9) |
| `bracePlacementState` | 9 | brace | src/supports/SupportRenderer.tsx (2), src/app/page.tsx (1), src/supports/Renderers/BezierRenderer.tsx (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/interaction/shared/placement/preview/placementPreviewResolver.ts (1), src/supports/interaction/shared/placement/preview/previewTypes.ts (1), src/supports/rendering/placementPreviews.ts (1), src/supports/supportPlacementPreviewMath.ts (1) |
| `branchChanged` | 9 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (6), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (3) |
| `branchEnd` | 9 | branch | src/supports/PlacementLogic/JointConstraintSolver.ts (9) |
| `branchFamilyBinding` | 9 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (5), src/supports/SupportTypes/Brace/BraceRenderer.tsx (2), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (2) |
| `branchesToRemove` | 9 | branch | src/supports/autoSupport/autoPlace.ts (9) |
| `buildLeafData` | 9 | leaf | src/supports/autoSupport/autoPlace.ts (3), src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `buildTrunkData` | 9 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Raft/previewSupports.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2), src/supports/autoSupport/autoPlace.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (1) |
| `connectedBranchIds` | 9 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (7), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `existingLeaf` | 9 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (9) |
| `kickstandAfter` | 9 | kickstand | src/features/scene/useSceneCollectionManager.ts (5), src/app/page.tsx (4) |
| `kickstandRootsById` | 9 | kickstand | src/supports/SupportRenderer.tsx (5), src/features/export/logic/supportExportReconstruction.ts (4) |
| `kickstandSnapshot` | 9 | kickstand | src/features/export/logic/ExportManager.ts (6), src/app/page.tsx (3) |
| `leafHoverPosition` | 9 | leaf | src/components/scene/SceneCanvas/SceneCanvas.tsx (8), src/app/page.tsx (1) |
| `leafPlacementSurfaceById` | 9 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (9) |
| `leafSnap` | 9 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (9) |
| `minBranchAngleDeg` | 9 | branch | src/supports/Settings/state.ts (3), src/supports/Settings/presets.ts (2), src/supports/Settings/types.ts (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1) |
| `trunkRef` | 9 | trunk | src/supports/state.ts (9) |
| `visitedBraceIds` | 9 | brace | src/supports/state.ts (5), src/supports/SupportRenderer.tsx (4) |
| `'kickstands'` | 8 | kickstand | src/supports/autoBracing/autoBrace.ts (3), src/features/scene/importDefaultsPreferences.ts (1), src/features/supports/supportSnapshotHelpers.ts (1), src/supports/SupportRenderer.tsx (1), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1), src/supports/types.ts (1) |
| `'placement-preview:leaf'` | 8 | leaf | src/supports/SupportRenderer.tsx (8) |
| `BraceCurve` | 8 | brace | src/supports/state.ts (6), src/supports/types.ts (2) |
| `SUPPORT_AUTO_BRACE_REPLACE` | 8 | brace | src/features/supports/useSupportInteractionManager.ts (2), src/supports/autoBracing/autoBrace.ts (2), src/supports/history/actionTypes.ts (2), src/supports/history/useSupportHistoryHandlers.ts (2) |
| `activeTwigDragPreview` | 8 | twig | src/supports/SupportRenderer.tsx (8) |
| `autoBraceStatusTimeoutRef` | 8 | brace | src/supports/Settings/SupportSidebar.tsx (8) |
| `axesByTrunkId` | 8 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (8) |
| `braceHotkeyActive` | 8 | brace | src/features/supports/useSupportInteractionManager.ts (3), src/supports/SupportTypes/Branch/useBranchPlacement.ts (3), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `branchFamilyHeld` | 8 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (4), src/supports/SupportTypes/Brace/BraceRenderer.tsx (2), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (2) |
| `branchList` | 8 | branch | src/supports/SupportRenderer.tsx (8) |
| `branchPlacementStore` | 8 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (4), src/supports/SupportTypes/Brace/BraceRenderer.tsx (2), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (2) |
| `branchRef` | 8 | branch | src/supports/state.ts (8) |
| `connectedLeafIds` | 8 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (6), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `curvedBrace` | 8 | brace | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (8) |
| `isKickstandPlacementActive` | 8 | kickstand | src/components/scene/SceneCanvas/SceneCanvas.tsx (7), src/app/page.tsx (1) |
| `isTrunkAtAttachmentCapacity` | 8 | trunk | src/supports/autoSupport/autoPlace.ts (8) |
| `isTrunkKind` | 8 | trunk | src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (8) |
| `kickstandStoreUpdatedAt` | 8 | kickstand | src/app/page.tsx (5), src/components/organisms/panels/SharedPanelStack.tsx (3) |
| `leafClampWarningTimeout` | 8 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (8) |
| `leafPlacementState` | 8 | leaf | src/supports/SupportPrimitives/Knot/KnotRenderer.tsx (3), src/app/page.tsx (1), src/supports/Renderers/BezierRenderer.tsx (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/SupportRenderer.tsx (1), src/supports/SupportTypes/Kickstand/KickstandPlacementController.tsx (1) |
| `newBrace` | 8 | brace | src/supports/state.ts (5), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3) |
| `nextBraces` | 8 | brace | src/supports/state.ts (8) |
| `nextPreviewBranchSegmentsById` | 8 | branch | src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (4), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4) |
| `placedAnchors` | 8 | anchor | src/supports/autoSupport/autoPlace.ts (7), src/supports/autoSupport/types.ts (1) |
| `placedSticks` | 8 | stick | src/supports/autoSupport/autoPlace.ts (7), src/supports/autoSupport/types.ts (1) |
| `recomputeBraceSegmentKnotGeometry` | 8 | brace | src/supports/state.ts (8) |
| `stickVsTwigCutoffMm` | 8 | stick, twig | src/supports/Settings/presets.ts (4), src/supports/Settings/types.ts (4) |
| `supportAnchors` | 8 | anchor | src/supports/RaftProxyMeshLayer.tsx (5), src/supports/SupportProxyMeshLayer.tsx (3) |
| `'leafCone'` | 7 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (5), src/supports/SupportPrimitives/Knot/knotUtils.ts (2) |
| `ANCHOR_BELOW_ROOT` | 7 | anchor | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/PlacementLogic/SupportLimitations.tsx (1), src/supports/types.ts (1) |
| `ANCHOR_PRESET` | 7 | anchor | src/supports/Settings/presets.ts (4), src/components/controls/AutoSupportPanel.tsx (3) |
| `BRANCH_PLACEMENT` | 7 | branch | src/hotkeys/hotkeyConfig.ts (1), src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Brace/BraceRenderer.tsx (1), src/supports/SupportTypes/Brace/useBracePlacement.ts (1), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `LEAF_FAN_RADIUS_MM` | 7 | leaf | src/supports/autoSupport/autoPlace.ts (6), src/supports/autoSupport/constants.ts (1) |
| `braceRenderKnotsById` | 7 | brace | src/supports/SupportRenderer.tsx (7) |
| `braceSeg1` | 7 | brace | src/supports/state.ts (7) |
| `braceShaftsBySupport` | 7 | brace | src/supports/SupportRenderer.tsx (7) |
| `connectedBraceIds` | 7 | brace | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (6), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `generatedBraceCount` | 7 | brace | src/supports/autoBracing/autoBrace.ts (5), src/supports/autoBracing/autoBraceMessages.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `hoveredLeafSnap` | 7 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (7) |
| `kickstandKnotIds` | 7 | kickstand | src/components/controls/AutoSupportPanel.tsx (3), src/features/export/logic/supportExportReconstruction.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2) |
| `kickstandRoot` | 7 | kickstand | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (7) |
| `kickstandRootsRef` | 7 | kickstand | src/supports/RaftProxyMeshLayer.tsx (3), src/supports/SupportProxyMeshLayer.tsx (3), src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `lastEmittedBranchPreviewRef` | 7 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7) |
| `leafHigh` | 7 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7) |
| `leafLow` | 7 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (7) |
| `localTwigDia` | 7 | twig | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/supportPlacementPreviewMath.ts (3) |
| `promoteBranchId` | 7 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (4), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `recomputeLeafPreviewContactCone` | 7 | leaf | src/supports/SupportRenderer.tsx (3), src/supports/interaction/supportPreviewOverlay.ts (3), src/supports/supportPlacementPreviewMath.ts (1) |
| `removedBraceCount` | 7 | brace | src/supports/autoBracing/autoBrace.ts (5), src/supports/autoBracing/autoBraceMessages.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `renderLeafList` | 7 | leaf | src/supports/SupportRenderer.tsx (7) |
| `resolveLeafSnapFromClick` | 7 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (7) |
| `segmentOwnerTrunkId` | 7 | trunk | src/supports/autoBracing/autoBrace.ts (4), src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `setKickstandSnapshot` | 7 | kickstand | src/components/controls/AutoSupportPanel.tsx (2), src/supports/PlacementLogic/supportClipboard.ts (2), src/supports/autoSupport/autoPlace.ts (2), src/features/scene/useSceneCollectionManager.ts (1) |
| `trunkAdjacency` | 7 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (7) |
| `trunkGridMap` | 7 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (7) |
| `trunkResult` | 7 | trunk | src/supports/autoSupport/autoPlace.ts (7) |
| `twigJointDiameterForLocalDiameter` | 7 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (4), src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/state.ts (1) |
| `'ANCHOR_BELOW_ROOT'` | 6 | anchor | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/types.ts (1) |
| `'BRANCH_PLACEMENT'` | 6 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Brace/BraceRenderer.tsx (1), src/supports/SupportTypes/Brace/useBracePlacement.ts (1), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `'branch:cavity-stick'` | 6 | branch, stick | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (4), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (2) |
| `'place_branch'` | 6 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `AutoBraceResult` | 6 | brace | src/supports/autoBracing/autoBrace.ts (3), src/supports/autoBracing/autoBraceMessages.ts (2), src/supports/autoBracing/index.ts (1) |
| `DEFAULT_MESH_TO_MESH_STICK_VS_TWIG_CUTOFF_MM` | 6 | stick, twig | src/supports/Settings/types.ts (4), src/supports/Settings/defaults.ts (2) |
| `HomeKickstandCollectionsSnapshot` | 6 | kickstand | src/features/supports/supportSnapshotHelpers.ts (5), src/app/page.tsx (1) |
| `MAX_AUTO_LEAF_SPAN_MM` | 6 | leaf | src/supports/autoSupport/autoPlace.ts (3), src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/autoSupport/constants.ts (1) |
| `TrunkPlacementInput` | 6 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (2), src/supports/PlacementLogic/SmartPlacement.ts (2), src/supports/PlacementLogic/StandardPlacement.ts (2) |
| `addBranch` | 6 | branch | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (3), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/state.ts (1) |
| `allBranches` | 6 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4), src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (2) |
| `braceContextsById` | 6 | brace | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (6) |
| `braceDiameter` | 6 | brace | src/supports/SupportProxyMeshLayer.tsx (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2), src/supports/autoBracing/autoBrace.ts (1) |
| `braceHost` | 6 | brace | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (6) |
| `braceIdsByKnotId` | 6 | brace | src/supports/SupportRenderer.tsx (3), src/supports/interaction/supportPreviewOverlay.ts (3) |
| `bracePlacement` | 6 | brace | src/features/supports/useSupportInteractionManager.ts (5), src/app/page.tsx (1) |
| `bracePreviewData` | 6 | brace | src/supports/interaction/shared/placement/preview/placementPreviewResolver.ts (4), src/supports/interaction/shared/placement/preview/previewTypes.ts (2) |
| `braceResult` | 6 | brace | src/supports/autoSupport/autoPlace.ts (6) |
| `braceSeg` | 6 | brace | src/supports/state.ts (6) |
| `braceSegmentId` | 6 | brace | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (3), src/supports/interaction/supportRenderLookupMath.ts (3) |
| `braceSnapLeafId` | 6 | brace, leaf | src/components/organisms/panels/SharedPanelStack.tsx (4), src/app/page.tsx (2) |
| `branchCandidateKnotIdsByBranchId` | 6 | branch | src/supports/SupportRenderer.tsx (3), src/supports/interaction/supportPreviewOverlay.ts (3) |
| `branchIds` | 6 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (6) |
| `committedBranch` | 6 | branch | src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (3), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (3) |
| `floatingTrunkPreviewPlacement` | 6 | trunk | src/supports/Settings/SupportSidebar.tsx (6) |
| `generatedBraces` | 6 | brace | src/supports/autoBracing/autoBrace.ts (6) |
| `ghostedBraceIdSet` | 6 | brace | src/supports/SupportRenderer.tsx (6) |
| `initialTrunkSnapshot` | 6 | trunk | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (6) |
| `keptBraces` | 6 | brace | src/supports/autoBracing/autoBrace.ts (6) |
| `kickstandBuilds` | 6 | kickstand | src/features/scene/importDefaultsPreferences.ts (4), src/features/export/logic/supportExportReconstruction.ts (2) |
| `kickstandId` | 6 | kickstand | src/supports/state.ts (3), src/supports/PlacementLogic/SupportModelLinker.ts (2), src/features/supports/useSupportInteractionManager.ts (1) |
| `kickstandKnotIdMap` | 6 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (3), src/supports/state.ts (3) |
| `kickstandPlacement` | 6 | kickstand | src/features/supports/useSupportInteractionManager.ts (5), src/app/page.tsx (1) |
| `kickstandRootIdMap` | 6 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (3), src/supports/state.ts (3) |
| `kickstandStateBefore` | 6 | kickstand | src/features/scene/useSceneCollectionManager.ts (6) |
| `leafDecision` | 6 | leaf | src/supports/PlacementLogic/Grid/gridPlacement.ts (6) |
| `leafIdsByParentKnotId` | 6 | leaf | src/supports/SupportRenderer.tsx (3), src/supports/interaction/supportPreviewOverlay.ts (3) |
| `modelTrunks` | 6 | trunk | src/supports/autoBracing/autoBrace.ts (6) |
| `newBranch` | 6 | branch | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (6) |
| `nextLeaf` | 6 | leaf | src/supports/state.ts (6) |
| `place_branch` | 6 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `processedBranchIds` | 6 | branch | src/supports/interaction/supportPreviewOverlay.ts (6) |
| `recomputeLeafConeKnotGeometry` | 6 | leaf | src/supports/state.ts (6) |
| `trunkBuilder` | 6 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Grid/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Raft/previewSupports.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/autoSupport/autoPlace.ts (1) |
| `trunkCompactByOverflow` | 6 | trunk | src/supports/Settings/SupportSidebar.tsx (6) |
| `trunkEntry` | 6 | trunk | src/supports/autoSupport/autoPlace.ts (6) |
| `twigDia` | 6 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (6) |
| `twigTaper` | 6 | twig | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (1), src/supports/SupportRenderer.tsx (1), src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (1), src/supports/state.ts (1), src/supports/supportPlacementPreviewMath.ts (1) |
| `updateBranch` | 6 | branch | src/supports/state.ts (4), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `updatedBranchIds` | 6 | branch | src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (3), src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (3) |
| `useBracePlacementState` | 6 | brace | src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2), src/supports/SupportRenderer.tsx (2) |
| `useKickstandPlacementState` | 6 | kickstand | src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2), src/supports/SupportRenderer.tsx (2) |
| `'brace-leaf-click'` | 5 | brace, leaf | src/supports/SupportRenderer.tsx (2), src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1) |
| `'place_anchor'` | 5 | anchor | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `'place_leaf'` | 5 | leaf | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `BRANCH_HOME_FOCUS_STATE` | 5 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (3), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2) |
| `LEAF_HOME_FOCUS_STATE` | 5 | leaf | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (3), src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2) |
| `SupportBranchRemovePayload` | 5 | branch | src/features/supports/useSupportInteractionManager.ts (3), src/supports/history/actionTypes.ts (2) |
| `addLeaf` | 5 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/state.ts (1) |
| `anchorDistSq` | 5 | anchor | src/features/scene/arrange/highPrecisionArrange.ts (5) |
| `anchorL` | 5 | anchor | src/features/organicCut/OrganicCutTenonGizmo.tsx (3), src/features/organicCut/OrganicCutTool.tsx (2) |
| `anchorTargetId` | 5 | anchor | src/components/layout/FloatingPanelStack.tsx (5) |
| `assignedHostTrunkId` | 5 | trunk | src/supports/autoBracing/autoBrace.ts (5) |
| `assignedTrunkId` | 5 | trunk | src/supports/autoBracing/autoBrace.ts (5) |
| `attachedBranches` | 5 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (3), src/supports/PlacementLogic/JointConstraintSolver.ts (2) |
| `autoBrace` | 5 | brace | src/supports/autoBracing/index.ts (2), src/supports/Settings/SupportSidebar.tsx (1), src/supports/autoBracing/autoBraceMessages.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `braceBezierToBatchedShaft` | 5 | brace | src/supports/SupportProxyMeshLayer.tsx (2), src/supports/SupportRenderer.tsx (2), src/supports/Curves/batchedBezierShaft.ts (1) |
| `braceList` | 5 | brace | src/supports/SupportRenderer.tsx (5) |
| `braceRadius` | 5 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (5) |
| `bracesToRemove` | 5 | brace | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (4), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `branchByParentKnot` | 5 | branch | src/features/export/logic/supportExportReconstruction.ts (5) |
| `branchCount` | 5 | branch | src/supports/autoSupport/autoPlace.ts (3), src/components/controls/AutoSupportPanel.tsx (1), src/supports/autoSupport/types.ts (1) |
| `branchHotkeyActive` | 5 | branch | src/features/supports/useSupportInteractionManager.ts (3), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `buildAutoBracedSnapshot` | 5 | brace | src/supports/autoBracing/autoBrace.ts (2), src/supports/autoSupport/autoPlace.ts (2), src/supports/autoBracing/index.ts (1) |
| `buildKickstandPathSnapTargets` | 5 | kickstand | src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (2), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `candidateAnchors` | 5 | anchor | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (5) |
| `candidateBranch` | 5 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (5) |
| `clampedBranchJointPos` | 5 | branch | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (5) |
| `clampedKickstandJointPos` | 5 | kickstand | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (5) |
| `clampedTrunkJointPos` | 5 | trunk | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (5) |
| `existingBranch` | 5 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (5) |
| `expectedKickstandStoreVersion` | 5 | kickstand | src/app/page.tsx (5) |
| `getAllMeshEntriesForAutoBrace` | 5 | brace | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2), src/supports/autoBracing/meshClearance.ts (2), src/supports/autoBracing/meshGeometryStore.ts (1) |
| `groupTrunks` | 5 | trunk | src/supports/autoBracing/autoBrace.ts (5) |
| `kickstandCountByModel` | 5 | kickstand | src/features/scene/useSceneCollectionManager.ts (5) |
| `kickstandStoreVersionRef` | 5 | kickstand | src/app/page.tsx (5) |
| `knotDragPreviewBranchSegmentsById` | 5 | branch | src/supports/SupportRenderer.tsx (5) |
| `leafByParentKnot` | 5 | leaf | src/features/export/logic/supportExportReconstruction.ts (5) |
| `leafCount` | 5 | leaf | src/supports/autoSupport/autoPlace.ts (3), src/components/controls/AutoSupportPanel.tsx (1), src/supports/autoSupport/types.ts (1) |
| `leafJointsBySupport` | 5 | leaf | src/supports/SupportRenderer.tsx (5) |
| `mergedKickstandState` | 5 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (5) |
| `overrideHostDiameterForTwig` | 5 | twig | src/supports/SupportTypes/Brace/BracePlacementController.tsx (5) |
| `place_anchor` | 5 | anchor | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `place_leaf` | 5 | leaf | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `prevBranchHoverDotVisibleRef` | 5 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (5) |
| `prevLeafHoverDotVisibleRef` | 5 | leaf | src/components/scene/SceneCanvas/SceneCanvas.tsx (5) |
| `previewTwig` | 5 | twig | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (5) |
| `removeBranch` | 5 | branch | src/features/supports/useSupportInteractionManager.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/state.ts (1) |
| `removeLeaf` | 5 | leaf | src/features/supports/useSupportInteractionManager.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2), src/supports/state.ts (1) |
| `renderBraceList` | 5 | brace | src/supports/SupportRenderer.tsx (5) |
| `renderTrunkList` | 5 | trunk | src/supports/SupportRenderer.tsx (5) |
| `resolveLeafSurface` | 5 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (5) |
| `selectedLeafIds` | 5 | leaf | src/supports/SupportRenderer.tsx (5) |
| `selectedTrunkIds` | 5 | trunk | src/supports/SupportRenderer.tsx (5) |
| `setAutoBraceStatus` | 5 | brace | src/supports/Settings/SupportSidebar.tsx (5) |
| `setFloatingTrunkPreviewFadingOut` | 5 | trunk | src/supports/Settings/SupportSidebar.tsx (5) |
| `sourceSupportAnchorCount` | 5 | anchor | src/components/scene/SceneCanvas/SceneCanvas.tsx (5) |
| `supportBranches` | 5 | branch | src/supports/SupportProxyMeshLayer.tsx (5) |
| `supportSticks` | 5 | stick | src/supports/SupportProxyMeshLayer.tsx (5) |
| `supportTwigs` | 5 | twig | src/supports/SupportProxyMeshLayer.tsx (5) |
| `targetKickstandId` | 5 | kickstand | src/supports/state.ts (5) |
| `trunkCount` | 5 | trunk | src/supports/autoSupport/autoPlace.ts (3), src/components/controls/AutoSupportPanel.tsx (1), src/supports/autoSupport/types.ts (1) |
| `twigKnots` | 5 | twig | src/supports/SupportRenderer.tsx (5) |
| `twigSegmentDiameters` | 5 | twig | src/supports/supportPlacementPreviewMath.ts (5) |
| `updateKickstand` | 5 | kickstand | src/supports/state.ts (4), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (1) |
| `visitedTrunks` | 5 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (5) |
| `'Anchor'` | 4 | anchor | src/supports/Settings/presetMessages.ts (3), src/supports/Settings/presets.ts (1) |
| `'brace-leaf-hover'` | 4 | brace, leaf | src/supports/SupportRenderer.tsx (2), src/supports/SupportTypes/Brace/BracePlacementController.tsx (2) |
| `'brace-leaf-leave'` | 4 | brace, leaf | src/supports/SupportRenderer.tsx (2), src/supports/SupportTypes/Brace/BracePlacementController.tsx (2) |
| `'braces'` | 4 | brace | src/features/scene/useSceneCollectionManager.ts (1), src/supports/autoBracing/autoBrace.ts (1), src/supports/state.ts (1), src/supports/types.ts (1) |
| `'branches'` | 4 | branch | src/features/scene/useSceneCollectionManager.ts (1), src/supports/autoSupport/autoPlace.ts (1), src/supports/state.ts (1), src/supports/types.ts (1) |
| `'hover:cavity-stick'` | 4 | stick | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (4) |
| `'leafFanMaxAngleDeg'` | 4 | leaf | src/components/controls/AutoSupportPanel.tsx (3), src/supports/autoSupport/settings.ts (1) |
| `'leafFanRadiusMm'` | 4 | leaf | src/components/controls/AutoSupportPanel.tsx (3), src/supports/autoSupport/settings.ts (1) |
| `'maxAttachmentsPerTrunk'` | 4 | trunk | src/components/controls/AutoSupportPanel.tsx (3), src/supports/autoSupport/settings.ts (1) |
| `'place_trunk'` | 4 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `'trunk:cone-rescue'` | 4 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:cone-rescue:jointed'` | 4 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:cone-rescue:seed'` | 4 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:preflight'` | 4 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:v2-setup'` | 4 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (3), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `BRACE_HOME_FOCUS_STATE` | 4 | brace | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/camera.ts (2) |
| `BRANCH_TIP_CONE_FOCUS_STATE` | 4 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (4) |
| `BracePair` | 4 | brace | src/supports/autoBracing/initialPattern.ts (2), src/supports/autoBracing/repeatingPattern.ts (2) |
| `BracePreview` | 4 | brace | src/supports/Settings/AnatomyPreview/anatomyPreviews.ts (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1) |
| `KICKSTAND_MAX_EDGES_PER_TRUNK` | 4 | kickstand, trunk | src/supports/autoBracing/autoBrace.ts (4) |
| `LEAF_TIP_CONE_FOCUS_STATE` | 4 | leaf | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (4) |
| `LeafConeSnapMeta` | 4 | leaf | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (4) |
| `SUPPORT_ADD_ANCHOR` | 4 | anchor | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_BRANCH` | 4 | branch | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_LEAF` | 4 | leaf | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_BRACE` | 4 | brace | src/features/supports/useSupportInteractionManager.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_BRANCH` | 4 | branch | src/features/supports/useSupportInteractionManager.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_LEAF` | 4 | leaf | src/features/supports/useSupportInteractionManager.ts (2), src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REPLACE_TRUNK` | 4 | trunk | src/supports/history/actionTypes.ts (2), src/supports/history/useSupportHistoryHandlers.ts (2) |
| `SUPPORT_UPDATE_BRANCH` | 4 | branch | src/features/supports/useSupportInteractionManager.ts (2), src/supports/history/actionTypes.ts (2) |
| `SnappedTrunkRouteResult` | 4 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (4) |
| `TrunkPreview` | 4 | trunk | src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (3), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1) |
| `anchorId` | 4 | anchor | src/components/controls/ModelManagerPanel.tsx (2), src/supports/state.ts (2) |
| `anchorMode` | 4 | anchor | src/components/controls/ArrangePanel.tsx (3), src/components/organisms/panels/PreparePanelStack.tsx (1) |
| `braceIdMap` | 4 | brace | src/supports/state.ts (4) |
| `braceKnotIds` | 4 | brace | src/supports/autoBracing/autoBrace.ts (4) |
| `bracePlacementStore` | 4 | brace | src/app/page.tsx (4) |
| `braceSeg2` | 4 | brace | src/supports/state.ts (4) |
| `branchBuilder` | 4 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `branchCollidesWithSDF` | 4 | branch | src/supports/autoSupport/autoPlace.ts (4) |
| `branchParentKnotIds` | 4 | branch | src/supports/state.ts (4) |
| `branchQueue` | 4 | branch | src/supports/interaction/supportPreviewOverlay.ts (4) |
| `branchResult` | 4 | branch | src/supports/autoSupport/autoPlace.ts (4) |
| `branchSegmentMap` | 4 | branch | src/supports/state.ts (4) |
| `branchesById` | 4 | branch | src/supports/interaction/supportPreviewOverlay.ts (3), src/supports/SupportRenderer.tsx (1) |
| `branchesByParentKnot` | 4 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (4) |
| `committedKnotIsOnTwig` | 4 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (4) |
| `compactTrunkPairClass` | 4 | trunk | src/supports/Settings/SupportSidebar.tsx (4) |
| `directChildBranchIds` | 4 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (4) |
| `existingBraceEdges` | 4 | brace | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (4) |
| `floatingTrunkPreviewHeldOpen` | 4 | trunk | src/supports/Settings/SupportSidebar.tsx (4) |
| `gapFilledTrunks` | 4 | trunk | src/supports/autoSupport/autoPlace.ts (4) |
| `getHomeKickstandCollectionsSnapshot` | 4 | kickstand | src/app/page.tsx (3), src/features/supports/supportSnapshotHelpers.ts (1) |
| `getKickstandKnots` | 4 | kickstand | src/supports/SupportRenderer.tsx (3), src/supports/state.ts (1) |
| `handleAutoBrace` | 4 | brace | src/supports/Settings/SupportSidebar.tsx (4) |
| `isBraceFocused` | 4 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (4) |
| `kickstandDiameter` | 4 | kickstand | src/features/scene/importDefaultsPreferences.ts (4) |
| `kickstandDraft` | 4 | kickstand | src/supports/autoSupport/autoPlace.ts (4) |
| `kickstandIds` | 4 | kickstand | src/supports/SupportRenderer.tsx (2), src/supports/interaction/supportRenderLookupMath.ts (2) |
| `kickstandKnotList` | 4 | kickstand | src/supports/SupportRenderer.tsx (4) |
| `kickstandKnotsRef` | 4 | kickstand | src/supports/SupportProxyMeshLayer.tsx (3), src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `kickstandOwner` | 4 | kickstand | src/features/supports/useSupportInteractionManager.ts (4) |
| `kickstandRootIds` | 4 | kickstand | src/features/export/logic/supportExportReconstruction.ts (2), src/supports/PlacementLogic/supportClipboard.ts (2) |
| `kickstandSupport` | 4 | kickstand | src/supports/interaction/jointDragPreview.ts (4) |
| `latestTrunk` | 4 | trunk | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (4) |
| `leafBuilder` | 4 | leaf | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1), src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `leafIdMap` | 4 | leaf | src/supports/state.ts (4) |
| `leafParentKnotIds` | 4 | leaf | src/supports/state.ts (4) |
| `leafPathCrossesSupports` | 4 | leaf | src/supports/autoSupport/autoPlace.ts (4) |
| `leafPlacementActive` | 4 | leaf | src/supports/Renderers/BezierRenderer.tsx (2), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (2) |
| `maxBranchesPerTrunk` | 4 | branch, trunk | src/supports/Settings/types.ts (4) |
| `newKickstand` | 4 | kickstand | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (4) |
| `nextSticks` | 4 | stick | src/supports/state.ts (4) |
| `nextTwigs` | 4 | twig | src/supports/state.ts (4) |
| `normalizeLoadedKnotAndLeafGeometry` | 4 | leaf | src/supports/state.ts (4) |
| `oldTrunkBranch` | 4 | branch, trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (2) |
| `onAnchorModeChange` | 4 | anchor | src/components/controls/ArrangePanel.tsx (3), src/components/organisms/panels/PreparePanelStack.tsx (1) |
| `onAutoBrace` | 4 | brace | src/supports/autoBracing/AutoBracingSettingsCard.tsx (3), src/supports/Settings/SupportSidebar.tsx (1) |
| `place_trunk` | 4 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `previewBranchSegmentsByIdAtEnd` | 4 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (4) |
| `queuedBranchIds` | 4 | branch | src/supports/interaction/supportPreviewOverlay.ts (4) |
| `remainingBracesNeededByGroupId` | 4 | brace | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (4) |
| `renderBracesById` | 4 | brace | src/supports/SupportRenderer.tsx (4) |
| `sameLeaf` | 4 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (4) |
| `sameTierAnchor` | 4 | anchor | src/supports/autoBracing/autoBrace.ts (4) |
| `sceneBatchedBraceShaftGroups` | 4 | brace | src/supports/SupportRenderer.tsx (4) |
| `selectedBraceId` | 4 | brace | src/supports/autoBracing/autoBrace.ts (4) |
| `setFloatingTrunkPreviewHeldOpen` | 4 | trunk | src/supports/Settings/SupportSidebar.tsx (4) |
| `shouldShowFloatingTrunkPreview` | 4 | trunk | src/supports/Settings/SupportSidebar.tsx (4) |
| `shouldUseCompactTrunkLayout` | 4 | trunk | src/supports/Settings/SupportSidebar.tsx (4) |
| `stickCount` | 4 | stick | src/supports/autoSupport/autoPlace.ts (3), src/supports/autoSupport/types.ts (1) |
| `supportTrunks` | 4 | trunk | src/supports/SupportProxyMeshLayer.tsx (4) |
| `targetBranchId` | 4 | branch | src/supports/state.ts (4) |
| `targetTrunkId` | 4 | trunk | src/supports/state.ts (4) |
| `trunkDiameter` | 4 | trunk | src/features/scene/importDefaultsPreferences.ts (4) |
| `trunkIdByShaftId` | 4 | trunk | src/supports/autoSupport/autoPlace.ts (4) |
| `trunksByModel` | 4 | trunk | src/supports/autoBracing/autoBrace.ts (4) |
| `twigId` | 4 | twig | src/supports/state.ts (2), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/SupportRenderer.tsx (1) |
| `updateLeaf` | 4 | leaf | src/supports/SupportTypes/Twig/TwigRenderer.tsx (2), src/supports/state.ts (2) |
| `updateTrunk` | 4 | trunk | src/supports/state.ts (4) |
| `useKickstandStoreState` | 4 | kickstand | src/supports/SupportProxyMeshLayer.tsx (4) |
| `'anchors'` | 3 | anchor | src/supports/RaftProxyMeshLayer.tsx (1), src/supports/state.ts (1), src/supports/types.ts (1) |
| `'braceImported'` | 3 | brace | src/supports/types.ts (2), src/supports/state.ts (1) |
| `'branchFamily'` | 3 | branch | src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `'replace_trunk'` | 3 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `'trunk_build_error'` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (2), src/supports/autoSupport/types.ts (1) |
| `AnchorFields` | 3 | anchor | src/supports/types.ts (3) |
| `AnchorRenderer` | 3 | anchor | src/supports/SupportRenderer.tsx (3) |
| `BraceFields` | 3 | brace | src/supports/types.ts (3) |
| `BraceLinkPayload` | 3 | brace | src/supports/history/actionTypes.ts (3) |
| `BracePlacementController` | 3 | brace | src/supports/placementControllers.ts (3) |
| `BraceRenderer` | 3 | brace | src/supports/SupportRenderer.tsx (3) |
| `BranchFields` | 3 | branch | src/supports/types.ts (3) |
| `BranchPlacementController` | 3 | branch | src/supports/placementControllers.ts (3) |
| `BranchRenderer` | 3 | branch | src/supports/SupportRenderer.tsx (3) |
| `DEFAULT_GRID_MIN_BRANCH_ANGLE_DEG` | 3 | branch | src/supports/Settings/types.ts (2), src/supports/Settings/defaults.ts (1) |
| `DEFAULT_GRID_MIN_ROUTED_TRUNK_ANGLE_DEG` | 3 | trunk | src/supports/Settings/types.ts (2), src/supports/Settings/defaults.ts (1) |
| `EMPTY_HOME_KICKSTAND_COLLECTIONS_SNAPSHOT` | 3 | kickstand | src/app/page.tsx (2), src/features/supports/supportSnapshotHelpers.ts (1) |
| `KICKSTAND_PLACEMENT` | 3 | kickstand | src/hotkeys/hotkeyConfig.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `KickstandFields` | 3 | kickstand | src/supports/types.ts (3) |
| `KickstandPlacementController` | 3 | kickstand | src/supports/placementControllers.ts (3) |
| `KickstandRenderer` | 3 | kickstand | src/supports/SupportRenderer.tsx (3) |
| `KickstandSnapTargetMeta` | 3 | kickstand | src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (3) |
| `LEAF_PLACEMENT` | 3 | leaf | src/hotkeys/hotkeyConfig.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `LeafFields` | 3 | leaf | src/supports/types.ts (3) |
| `LeafHoverDetail` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `LeafPlacementController` | 3 | leaf | src/supports/placementControllers.ts (3) |
| `LeafRenderer` | 3 | leaf | src/supports/SupportRenderer.tsx (3) |
| `StickFields` | 3 | stick | src/supports/types.ts (3) |
| `StickRenderer` | 3 | stick | src/supports/SupportRenderer.tsx (3) |
| `SupportLeafPayload` | 3 | leaf | src/supports/history/actionTypes.ts (3) |
| `SupportTrunkPayload` | 3 | trunk | src/supports/history/actionTypes.ts (3) |
| `TRUNK_HOME_FOCUS_STATE` | 3 | trunk | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (1) |
| `TrunkCoverageProbe` | 3 | trunk | src/supports/autoBracing/heightCoverageAnalysis.ts (3) |
| `TrunkFields` | 3 | trunk | src/supports/types.ts (3) |
| `TrunkRenderer` | 3 | trunk | src/supports/SupportRenderer.tsx (3) |
| `TrunkReplacement` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (2), src/features/supports/useSupportInteractionManager.ts (1) |
| `TwigFields` | 3 | twig | src/supports/types.ts (3) |
| `TwigRenderer` | 3 | twig | src/supports/SupportRenderer.tsx (3) |
| `_leafRaycaster` | 3 | leaf | src/supports/autoSupport/autoPlace.ts (3) |
| `addAnchor` | 3 | anchor | src/supports/SupportTypes/Trunk/useTrunkPlacement.ts (2), src/supports/state.ts (1) |
| `anchorList` | 3 | anchor | src/supports/SupportRenderer.tsx (3) |
| `anchorRegions` | 3 | anchor | src/supports/autoSupport/types.ts (2), src/supports/autoSupport/autoPlace.ts (1) |
| `anchorRule` | 3 | anchor | src/components/layout/FloatingPanelStack.tsx (3) |
| `anchorSize` | 3 | anchor | src/components/layout/FloatingPanelStack.tsx (3) |
| `applyTrunkReplacement` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (3) |
| `beforeTrunk` | 3 | trunk | src/features/supports/useSupportInteractionManager.ts (3) |
| `braceAwaitingEnd` | 3 | brace | src/features/supports/useSupportInteractionManager.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `braceDia` | 3 | brace | src/supports/supportPlacementPreviewMath.ts (3) |
| `braceImported` | 3 | brace | src/supports/types.ts (2), src/supports/state.ts (1) |
| `braceSnapKind` | 3 | brace | src/components/organisms/panels/SharedPanelStack.tsx (2), src/app/page.tsx (1) |
| `braceSnapSegmentId` | 3 | brace | src/components/organisms/panels/SharedPanelStack.tsx (2), src/app/page.tsx (1) |
| `braceStage` | 3 | brace | src/components/organisms/panels/SharedPanelStack.tsx (2), src/app/page.tsx (1) |
| `braceStartKind` | 3 | brace | src/components/organisms/panels/SharedPanelStack.tsx (2), src/app/page.tsx (1) |
| `braceStartSegmentId` | 3 | brace | src/components/organisms/panels/SharedPanelStack.tsx (2), src/app/page.tsx (1) |
| `bracesById` | 3 | brace | src/supports/interaction/supportPreviewOverlay.ts (3) |
| `branchAwaitingBase` | 3 | branch | src/features/supports/useSupportInteractionManager.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `branchHostKnotIdsWithChildren` | 3 | branch | src/supports/state.ts (3) |
| `branchListWithKnotDragPreview` | 3 | branch | src/supports/SupportRenderer.tsx (3) |
| `branchObj` | 3 | branch | src/supports/autoSupport/autoPlace.ts (3) |
| `branchPlacementState` | 3 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1), src/supports/SupportTypes/Brace/BraceRenderer.tsx (1), src/supports/SupportTypes/Leaf/LeafRenderer.tsx (1) |
| `branchPreviewCandidateKnots` | 3 | branch | src/supports/interaction/supportPreviewOverlay.ts (3) |
| `branchQueueIndex` | 3 | branch | src/supports/interaction/supportPreviewOverlay.ts (3) |
| `branchesToRehost` | 3 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (2), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `buildBraceIdsByKnotId` | 3 | brace | src/supports/SupportRenderer.tsx (2), src/supports/interaction/supportPreviewOverlay.ts (1) |
| `buildBracePlacementPreviewBatch` | 3 | brace | src/supports/SupportRenderer.tsx (2), src/supports/supportPlacementPreviewMath.ts (1) |
| `buildBraceProfile` | 3 | brace | src/supports/autoBracing/autoBrace.ts (2), src/supports/autoBracing/braceDiameter.ts (1) |
| `buildBranchCandidateKnotIdsByBranchId` | 3 | branch | src/supports/SupportRenderer.tsx (2), src/supports/interaction/supportPreviewOverlay.ts (1) |
| `buildBranchesByParentKnotId` | 3 | branch | src/supports/SupportRenderer.tsx (2), src/supports/interaction/supportPreviewOverlay.ts (1) |
| `buildLeafConePathSnapTargets` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `buildLeafConeSnapMeta` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (2), src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `buildLeafIdsByParentKnotId` | 3 | leaf | src/supports/SupportRenderer.tsx (2), src/supports/interaction/supportPreviewOverlay.ts (1) |
| `buildTwigDiskTipCenter` | 3 | twig | src/features/export/logic/supportExportReconstruction.ts (3) |
| `cachedHomeKickstandCollectionsSnapshot` | 3 | kickstand | src/features/supports/supportSnapshotHelpers.ts (3) |
| `changedByBrace` | 3 | brace | src/supports/state.ts (3) |
| `changedByBrace1` | 3 | brace | src/supports/state.ts (3) |
| `clearTwigDragPreview` | 3 | twig | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3) |
| `committedTrunk` | 3 | trunk | src/supports/SupportPrimitives/Joint/JointGizmo.tsx (3) |
| `countAttachmentsOnTrunk` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (3) |
| `currentTrunk` | 3 | trunk | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (3) |
| `effectiveAnchorTarget` | 3 | anchor | src/components/layout/FloatingPanelStack.tsx (3) |
| `effectiveMinRoutedTrunkAngleDeg` | 3 | trunk | src/supports/PlacementLogic/SmartPlacement.ts (3) |
| `enableBraceLivePreview` | 3 | brace | src/supports/SupportRenderer.tsx (3) |
| `enableTwigSceneBatching` | 3 | twig | src/supports/SupportRenderer.tsx (3) |
| `enqueueBranchesForKnot` | 3 | branch | src/supports/interaction/supportPreviewOverlay.ts (3) |
| `excludeLeafIds` | 3 | leaf | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (3) |
| `existingTrunkEdges` | 3 | trunk | src/supports/autoBracing/autoBrace.ts (3) |
| `floatingTrunkPreviewFadingOut` | 3 | trunk | src/supports/Settings/SupportSidebar.tsx (3) |
| `formatAutoBraceStatus` | 3 | brace | src/supports/Settings/SupportSidebar.tsx (2), src/supports/autoBracing/autoBraceMessages.ts (1) |
| `getBraceTargetFocusState` | 3 | brace | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/camera.ts (1) |
| `getBranchContactZ` | 3 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (3) |
| `getBranchTargetFocusState` | 3 | branch | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (1) |
| `getEmptyKickstandSnapshot` | 3 | kickstand | src/app/page.tsx (3) |
| `getLeafDiameter` | 3 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (3) |
| `getLeafTargetFocusState` | 3 | leaf | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (1) |
| `getSupportBottomAnchor` | 3 | anchor | src/supports/autoBracing/autoBrace.ts (3) |
| `getTrunkSegmentEndpointsWithSettings` | 3 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (3) |
| `getTwigTargetFocusState` | 3 | twig | src/supports/Settings/AnatomyPreview/AnatomyPreviewCameraLogic.ts (2), src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (1) |
| `gridInfillTrunks` | 3 | trunk | src/components/controls/AutoSupportPanel.tsx (1), src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `groupIdByTrunkId` | 3 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `handleLeafClick` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `handleLeafHover` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `handleLeafLeave` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `hasFloatingTrunkPreviewTrigger` | 3 | trunk | src/supports/Settings/SupportSidebar.tsx (3) |
| `hasTwigKnots` | 3 | twig | src/supports/SupportRenderer.tsx (3) |
| `hostBranchRef` | 3 | branch | src/supports/state.ts (3) |
| `hostTwig` | 3 | twig | src/supports/supportPlacementPreviewMath.ts (3) |
| `hoveredLeafSnapEnd` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `hoveredTwig` | 3 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (3) |
| `isBraceSelected` | 3 | brace | src/app/page.tsx (3) |
| `isBraceVisible` | 3 | brace | src/supports/interaction/supportPreviewOverlay.ts (3) |
| `isLeafPreview` | 3 | leaf | src/supports/supportPlacementPreviewMath.ts (3) |
| `isStickLikeKind` | 3 | stick | src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (3) |
| `kickstandEntries` | 3 | kickstand | src/supports/state.ts (3) |
| `kickstandHostKnot` | 3 | kickstand | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (3) |
| `kickstandKickstands` | 3 | kickstand | src/supports/SupportProxyMeshLayer.tsx (3) |
| `kickstandList` | 3 | kickstand | src/supports/SupportRenderer.tsx (3) |
| `kickstandPlacementState` | 3 | kickstand | src/supports/Renderers/BezierRenderer.tsx (1), src/supports/SupportPrimitives/Shaft/ShaftRenderer.tsx (1), src/supports/SupportRenderer.tsx (1) |
| `kickstandStateSnapshot` | 3 | kickstand | src/app/page.tsx (3) |
| `knotDragPreviewBranchIds` | 3 | branch | src/supports/SupportRenderer.tsx (3) |
| `latestBranch` | 3 | branch | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (3) |
| `leafAwaitingBase` | 3 | leaf | src/features/supports/useSupportInteractionManager.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyTypes.ts (1), src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (1) |
| `leafClamp` | 3 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (3) |
| `leafCone1` | 3 | leaf | src/supports/state.ts (3) |
| `leafConeCollides` | 3 | leaf | src/supports/autoSupport/autoPlace.ts (3) |
| `leafList` | 3 | leaf | src/supports/SupportRenderer.tsx (3) |
| `liveTwig` | 3 | twig | src/supports/SupportRenderer.tsx (3) |
| `matchesInteriorBrace` | 3 | brace | src/supports/SupportRenderer.tsx (3) |
| `maxBracesToGenerate` | 3 | brace | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `maxHorizontalRunFromBraceLen` | 3 | brace | src/supports/autoBracing/autoBrace.ts (3) |
| `registerMeshForAutoBrace` | 3 | brace | src/features/scene/useSceneCollectionManager.ts (2), src/supports/autoBracing/meshGeometryStore.ts (1) |
| `removeBrace` | 3 | brace | src/features/supports/useSupportInteractionManager.ts (2), src/supports/state.ts (1) |
| `removedRootBranch` | 3 | branch | src/features/supports/useSupportInteractionManager.ts (3) |
| `renderBranchList` | 3 | branch | src/supports/SupportRenderer.tsx (3) |
| `renderKickstandKnotList` | 3 | kickstand | src/supports/SupportRenderer.tsx (3) |
| `renderKickstandList` | 3 | kickstand | src/supports/SupportRenderer.tsx (3) |
| `renderStickList` | 3 | stick | src/supports/SupportRenderer.tsx (3) |
| `replace_trunk` | 3 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `resolveHoveredLeafSnap` | 3 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (3) |
| `selectHighestContactBranch` | 3 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (3) |
| `selectedBraceIds` | 3 | brace | src/supports/SupportRenderer.tsx (3) |
| `selectedBranchIds` | 3 | branch | src/supports/SupportRenderer.tsx (3) |
| `selectedKickstandIds` | 3 | kickstand | src/supports/SupportRenderer.tsx (3) |
| `selectedStickIds` | 3 | stick | src/supports/SupportRenderer.tsx (3) |
| `setFloatingTrunkPreviewPlacement` | 3 | trunk | src/supports/Settings/SupportSidebar.tsx (3) |
| `setTrunkCompactByOverflow` | 3 | trunk | src/supports/Settings/SupportSidebar.tsx (3) |
| `shouldLockDragAnchor` | 3 | anchor | src/components/gizmo/ScreenSpaceGizmo.tsx (3) |
| `shouldPreferAnchor` | 3 | anchor | src/components/layout/FloatingPanelStack.tsx (3) |
| `snappedTwig` | 3 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (3) |
| `standaloneTrunks` | 3 | trunk | src/components/controls/AutoSupportPanel.tsx (1), src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `supportAnchorsRef` | 3 | anchor | src/supports/RaftProxyMeshLayer.tsx (3) |
| `supportBraces` | 3 | brace | src/supports/SupportProxyMeshLayer.tsx (3) |
| `targetStickId` | 3 | stick | src/supports/state.ts (3) |
| `targetTwigId` | 3 | twig | src/supports/state.ts (3) |
| `trunkBlocked` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (2), src/supports/autoSupport/types.ts (1) |
| `trunkEdgeCount` | 3 | trunk | src/supports/autoBracing/autoBrace.ts (3) |
| `trunkH` | 3 | trunk | src/features/scene/useSceneCollectionManager.ts (3) |
| `trunkIdByRootIdForSelection` | 3 | trunk | src/supports/SupportRenderer.tsx (3) |
| `trunkList` | 3 | trunk | src/supports/SupportRenderer.tsx (3) |
| `trunkOriginById` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (3) |
| `trunkSegmentMap` | 3 | trunk | src/supports/state.ts (3) |
| `trunkWithMovedJoint` | 3 | trunk | src/supports/SupportPrimitives/Joint/jointUtils.ts (3) |
| `trunk_build_error` | 3 | trunk | src/supports/autoSupport/autoPlace.ts (2), src/supports/autoSupport/types.ts (1) |
| `tryBuildAutoLeafDecision` | 3 | leaf | src/supports/PlacementLogic/Grid/gridPlacement.ts (3) |
| `twigDiskA` | 3 | twig | src/supports/supportPlacementPreviewMath.ts (3) |
| `twigDiskB` | 3 | twig | src/supports/supportPlacementPreviewMath.ts (3) |
| `twigKnotDiameter` | 3 | twig | src/supports/state.ts (3) |
| `twigList` | 3 | twig | src/supports/SupportRenderer.tsx (3) |
| `unregisterMeshForAutoBrace` | 3 | brace | src/features/scene/useSceneCollectionManager.ts (2), src/supports/autoBracing/meshGeometryStore.ts (1) |
| `unresolvedBraceHostWarned` | 3 | brace | src/supports/state.ts (3) |
| `updateBrace` | 3 | brace | src/supports/state.ts (3) |
| `updateStick` | 3 | stick | src/supports/state.ts (3) |
| `updateTwig` | 3 | twig | src/supports/state.ts (3) |
| `useBracePlacement` | 3 | brace | src/features/supports/useSupportInteractionManager.ts (3) |
| `useBranchPlacement` | 3 | branch | src/features/supports/useSupportInteractionManager.ts (3) |
| `useKickstandPlacement` | 3 | kickstand | src/features/supports/useSupportInteractionManager.ts (3) |
| `useLeafPlacement` | 3 | leaf | src/features/supports/useSupportInteractionManager.ts (3) |
| `'KICKSTAND_PLACEMENT'` | 2 | kickstand | src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `'LEAF_PLACEMENT'` | 2 | leaf | src/supports/interaction/shared/placement/hotkeys/supportPlacementHotkeyResolver.ts (1), src/supports/interaction/shared/selection/selectionController.ts (1) |
| `'Trunk'` | 2 | trunk | src/supports/Settings/SupportSidebar.tsx (1), src/supports/Settings/components/SupportKindTabs.tsx (1) |
| `'braceDiameterMm'` | 2 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1), src/supports/autoBracing/settings.ts (1) |
| `'branch:build'` | 2 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'grid:branch-build'` | 2 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `'grid:trunk-collision'` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `'sticks'` | 2 | stick | src/supports/state.ts (1), src/supports/types.ts (1) |
| `'trunk:astar'` | 2 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (1), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:astar:wide'` | 2 | trunk | src/supports/PlacementLogic/Pathfinding/SmartPlacementV2.ts (1), src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunkBlocked'` | 2 | trunk | src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `'twigs'` | 2 | twig | src/supports/state.ts (1), src/supports/types.ts (1) |
| `ANCHOR_SAFETY_MARGIN_MM` | 2 | anchor | src/supports/autoBracing/heightCoverageAnalysis.ts (2) |
| `AnchorLike` | 2 | anchor | src/supports/Rafts/Crenelated/raftFootprintCircles.ts (2) |
| `AnchorSide` | 2 | anchor | src/components/layout/FloatingPanelStack.tsx (2) |
| `AutoBraceStatus` | 2 | brace | src/supports/autoBracing/autoBrace.ts (2) |
| `BRANCH_CAMERA_FOCUS_MAP` | 2 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `BRANCH_SHAFT_FOCUS_STATE` | 2 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `BRANCH_TIP_FOCUS_STATE` | 2 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `BracePreviewProps` | 2 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `Branches` | 2 | branch | src/components/controls/AutoSupportPanel.tsx (1), src/components/modals/ModelSupportsModal.tsx (1) |
| `BuildKickstandPathSnapTargetsOptions` | 2 | kickstand | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `BuildLeafConePathSnapTargetsOptions` | 2 | leaf | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `CONSOLIDATION_BRANCH_MIN_HEIGHT_MM` | 2 | branch | src/supports/autoSupport/autoPlace.ts (2) |
| `CandidateAnchor` | 2 | anchor | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2) |
| `CollectGhostedBraceIdsOptions` | 2 | brace | src/supports/interaction/supportPreviewOverlay.ts (2) |
| `EMPTY_KNOT_DRAG_BRANCH_SEGMENTS_BY_ID` | 2 | branch | src/supports/SupportRenderer.tsx (2) |
| `FanLeafResult` | 2 | leaf | src/supports/autoSupport/autoPlace.ts (2) |
| `HomeKickstandSnapshot` | 2 | kickstand | src/features/supports/supportSnapshotHelpers.ts (2) |
| `KICKSTAND_MAX_EDGES_PER_KICKSTAND` | 2 | kickstand | src/supports/autoBracing/autoBrace.ts (2) |
| `KickstandHostKind` | 2 | kickstand | src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (2) |
| `LEAF_CAMERA_FOCUS_MAP` | 2 | leaf | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `LEAF_TIP_FOCUS_STATE` | 2 | leaf | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `LayoutAnchorRule` | 2 | anchor | src/components/layout/FloatingPanelStack.tsx (2) |
| `LeafClickDetail` | 2 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (2) |
| `MIN_TRUNK_CLEARANCE_MM` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `STICK_HOME_FOCUS_STATE` | 2 | stick | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `SUPPORT_ADD_BRACE` | 2 | brace | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_KICKSTAND` | 2 | kickstand | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_STICK` | 2 | stick | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_TRUNK` | 2 | trunk | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_ADD_TWIG` | 2 | twig | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_ANCHOR` | 2 | anchor | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_KICKSTAND` | 2 | kickstand | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_STICK` | 2 | stick | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_TRUNK` | 2 | trunk | src/supports/history/actionTypes.ts (2) |
| `SUPPORT_REMOVE_TWIG` | 2 | twig | src/supports/history/actionTypes.ts (2) |
| `SupportAnchorPayload` | 2 | anchor | src/supports/history/actionTypes.ts (2) |
| `SupportAnchorRemovePayload` | 2 | anchor | src/supports/history/actionTypes.ts (2) |
| `SupportBranchPayload` | 2 | branch | src/supports/history/actionTypes.ts (2) |
| `SupportBranchUpdatePayload` | 2 | branch | src/supports/history/actionTypes.ts (2) |
| `SupportKickstandPayload` | 2 | kickstand | src/supports/history/actionTypes.ts (2) |
| `SupportKickstandRemovePayload` | 2 | kickstand | src/supports/history/actionTypes.ts (2) |
| `SupportReplaceTrunkPayload` | 2 | trunk | src/supports/history/actionTypes.ts (2) |
| `SupportStickPayload` | 2 | stick | src/supports/history/actionTypes.ts (2) |
| `SupportStickRemovePayload` | 2 | stick | src/supports/history/actionTypes.ts (2) |
| `SupportTrunkUpdatePayload` | 2 | trunk | src/supports/history/actionTypes.ts (2) |
| `SupportTwigPayload` | 2 | twig | src/supports/history/actionTypes.ts (2) |
| `SupportTwigRemovePayload` | 2 | twig | src/supports/history/actionTypes.ts (2) |
| `TRUNK_FOCUS_STATE` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `TWIG_HOME_FOCUS_STATE` | 2 | twig | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (2) |
| `TrunkPreviewProps` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2) |
| `Trunks` | 2 | trunk | src/components/modals/ModelSupportsModal.tsx (1), src/supports/autoSupport/autoPlace.ts (1) |
| `aAnchor` | 2 | anchor | src/supports/autoBracing/autoBrace.ts (2) |
| `adjustBranchForNewParentKnot` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `afterKickstand` | 2 | kickstand | src/supports/Settings/SupportSidebar.tsx (2) |
| `allKickstandRoots` | 2 | kickstand | src/features/export/logic/ExportManager.ts (2) |
| `allowLeafHoverForPlacementPreview` | 2 | leaf | src/supports/SupportRenderer.tsx (2) |
| `anchorClusters` | 2 | anchor | src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `anchorCount` | 2 | anchor | src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `anchorPenalty` | 2 | anchor | src/supports/PlacementLogic/smartPlacementCandidateSearch.ts (2) |
| `anchorProgress` | 2 | anchor | src/components/scene/SceneCanvas/SceneCanvas.tsx (2) |
| `anchorTargetOverride` | 2 | anchor | src/components/layout/FloatingPanelStack.tsx (2) |
| `applyDiameterToBranch` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `applySocketAndMidJointPositionsForBranch` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/applyTrunkReplacement.ts (2) |
| `autoBraceStatus` | 2 | brace | src/supports/Settings/SupportSidebar.tsx (2) |
| `bAnchor` | 2 | anchor | src/supports/autoBracing/autoBrace.ts (2) |
| `baseKickstand` | 2 | kickstand | src/supports/autoSupport/autoPlace.ts (2) |
| `beforeKickstand` | 2 | kickstand | src/supports/Settings/SupportSidebar.tsx (2) |
| `bracePairs` | 2 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `braceProfile` | 2 | brace | src/supports/autoBracing/autoBrace.ts (2) |
| `bracesKey` | 2 | brace | src/supports/autoBracing/autoBrace.ts (2) |
| `branchCollidesWithMesh` | 2 | branch | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `branchDemandDiameterMm` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2) |
| `branchFamilyActive` | 2 | branch | src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (2) |
| `branchHoverDotVisible` | 2 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (2) |
| `branchSupport` | 2 | branch | src/supports/interaction/jointDragPreview.ts (2) |
| `branchTipPos` | 2 | branch | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2) |
| `buildAnchorData` | 2 | anchor | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `buildAnchorGroup` | 2 | anchor | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildBraceGroup` | 2 | brace | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildBranchGroup` | 2 | branch | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildConsolidationBranch` | 2 | branch | src/supports/autoSupport/autoPlace.ts (2) |
| `buildKickstandGroup` | 2 | kickstand | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildKickstandResult` | 2 | kickstand | src/supports/state.ts (2) |
| `buildLeafGroup` | 2 | leaf | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildStick` | 2 | stick | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2) |
| `buildStickGroup` | 2 | stick | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildTrunkGroup` | 2 | trunk | src/features/export/logic/supportExportReconstruction.ts (2) |
| `buildTwig` | 2 | twig | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2) |
| `buildTwigGroup` | 2 | twig | src/features/export/logic/supportExportReconstruction.ts (2) |
| `candidateBraceRadius` | 2 | brace | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2) |
| `childBranches` | 2 | branch | src/features/supports/useSupportInteractionManager.ts (2) |
| `clampTToLeafAngleConstraints` | 2 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2) |
| `cloneTrunk` | 2 | trunk | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (2) |
| `clonedKickstandKnots` | 2 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (2) |
| `clonedKickstandRoots` | 2 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (2) |
| `clonedKickstands` | 2 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (2) |
| `computeAndApplyTrunkDiameterProfile` | 2 | trunk | src/features/supports/useSupportInteractionManager.ts (2) |
| `computeTwigDragAttachmentUpdates` | 2 | twig | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (2) |
| `connectedBraces` | 2 | brace | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `connectedBranches` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/planTrunkReplacement.ts (1), src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `createBraceId` | 2 | brace | src/supports/autoBracing/autoBrace.ts (2) |
| `elasticBranchIds` | 2 | branch | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2) |
| `emitTwigDragPreview` | 2 | twig | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (2) |
| `findNearestTrunkId` | 2 | trunk | src/supports/autoBracing/autoBrace.ts (2) |
| `getKickstandSegmentEndpoints` | 2 | kickstand | src/supports/interaction/jointDragPreviewMath.ts (2) |
| `hasHoveredLeafFastPath` | 2 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (2) |
| `hasProfileAnchor` | 2 | anchor | src/components/layout/FloatingPanelStack.tsx (2) |
| `hasRemainingKickstands` | 2 | kickstand | src/features/scene/useSceneCollectionManager.ts (2) |
| `hostTrunkContactZ` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `ignoredBranchIds` | 2 | branch | src/supports/PlacementLogic/JointConstraintSolver.ts (2) |
| `inAnchor` | 2 | anchor | src/features/slicing/components/SlicingPanel.tsx (2) |
| `includeBraces` | 2 | brace | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `includeBranches` | 2 | branch | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `includeTrunks` | 2 | trunk | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `inferSettingsFromTrunk` | 2 | trunk | src/supports/state.ts (2) |
| `initialBranchRef` | 2 | branch | src/supports/SupportPrimitives/Joint/JointGizmo.tsx (2) |
| `isOwnershipLeaf` | 2 | leaf | src/volumeAnalysis/IslandVolumes/components/IslandVolumesHierarchyCard.tsx (2) |
| `isTaperedBrace` | 2 | brace | src/supports/SupportRenderer.tsx (2) |
| `isTwigPreview` | 2 | twig | src/supports/supportPlacementPreviewMath.ts (2) |
| `kickstandActive` | 2 | kickstand | src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (2) |
| `kickstandChanged` | 2 | kickstand | src/supports/state.ts (2) |
| `kickstandCount` | 2 | kickstand | src/features/scene/useSceneCollectionManager.ts (2) |
| `kickstandHostKnotIds` | 2 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (2) |
| `kickstandIdMap` | 2 | kickstand | src/supports/PlacementLogic/supportClipboard.ts (2) |
| `kickstandModelId` | 2 | kickstand | src/components/scene/SceneCanvas/SceneCanvas.tsx (2) |
| `kickstandSnap` | 2 | kickstand | src/components/controls/AutoSupportPanel.tsx (2) |
| `kickstandSnapshotBefore` | 2 | kickstand | src/features/scene/useSceneCollectionManager.ts (2) |
| `kickstandStateAfter` | 2 | kickstand | src/features/scene/useSceneCollectionManager.ts (2) |
| `labelAnchor` | 2 | anchor | src/features/slicing/components/LutCurveEditor.tsx (2) |
| `leafActive` | 2 | leaf | src/supports/interaction/shared/placement/hotkeys/supportPlacementRouting.ts (2) |
| `leafCone2` | 2 | leaf | src/supports/state.ts (2) |
| `leafConeKey` | 2 | leaf | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2) |
| `leafModelIdById` | 2 | leaf | src/supports/SupportProxyMeshLayer.tsx (2) |
| `leafObj` | 2 | leaf | src/supports/autoSupport/autoPlace.ts (2) |
| `leafRadiusMm` | 2 | leaf | src/supports/autoSupport/autoPlace.ts (2) |
| `leafSupportIdById` | 2 | leaf | src/supports/SupportProxyMeshLayer.tsx (2) |
| `leafTipPos` | 2 | leaf | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (2) |
| `maxBraceLenMm` | 2 | brace | src/supports/autoBracing/autoBrace.ts (2) |
| `maxLeafStretchFactor` | 2 | leaf | src/supports/Settings/types.ts (2) |
| `minHorizontalLeafAngleDeg` | 2 | leaf | src/supports/Settings/types.ts (2) |
| `nextAnchors` | 2 | anchor | src/supports/state.ts (2) |
| `nextBranchPreviewKnots` | 2 | branch | src/supports/interaction/supportPreviewOverlay.ts (2) |
| `nextKickstandSegments` | 2 | kickstand | src/supports/state.ts (2) |
| `nextTrunk` | 2 | trunk | src/supports/state.ts (2) |
| `oldTrunkKnot` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1), src/supports/PlacementLogic/Grid/types.ts (1) |
| `planTrunkReplacement` | 2 | trunk | src/supports/autoSupport/autoPlace.ts (2) |
| `preserveAuthoredBracePos` | 2 | brace | src/supports/state.ts (2) |
| `preserveAuthoredTerminalBranchHostPos` | 2 | branch | src/supports/state.ts (2) |
| `preserveAuthoredTerminalLeafHostPos` | 2 | leaf | src/supports/state.ts (2) |
| `preserveImportedBraceUniformDiameter` | 2 | brace | src/supports/state.ts (2) |
| `previewBranchSegmentsById` | 2 | branch | src/supports/SupportPrimitives/Knot/KnotGizmo.tsx (2) |
| `previewKnotIsOnTwig` | 2 | twig | src/supports/SupportTypes/Leaf/LeafPlacementController.tsx (2) |
| `previewLeaf` | 2 | leaf | src/supports/SupportRenderer.tsx (2) |
| `reassignAllKickstandModelIdsInState` | 2 | kickstand | src/supports/state.ts (2) |
| `recomputeLeafContactConeAxisAndLength` | 2 | leaf | src/supports/state.ts (2) |
| `removeBranchJoint` | 2 | branch | src/supports/state.ts (2) |
| `removedBraceIds` | 2 | brace | src/components/controls/AutoSupportPanel.tsx (2) |
| `resolveBraceEndDiameters` | 2 | brace | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (2) |
| `resolveKickstandDiameterMm` | 2 | kickstand | src/features/scene/importDefaultsPreferences.ts (2) |
| `resolveTrunkDiameterMm` | 2 | trunk | src/features/scene/importDefaultsPreferences.ts (2) |
| `sameAnchor` | 2 | anchor | src/features/organicCut/useOrganicCutSession.ts (2) |
| `sceneBatchedKickstandRootGroups` | 2 | kickstand | src/supports/SupportRenderer.tsx (2) |
| `sceneBatchedTrunkRootGroups` | 2 | trunk | src/supports/SupportRenderer.tsx (2) |
| `shouldPinEdgeAnchor` | 2 | anchor | src/components/layout/FloatingPanelStack.tsx (2) |
| `showLeafClampWarning` | 2 | leaf | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (2) |
| `socketAnchor` | 2 | anchor | src/supports/SupportTypes/Leaf/LeafRenderer.tsx (2) |
| `stickId` | 2 | stick | src/supports/state.ts (2) |
| `supportGeometryFieldsCompactTrunk` | 2 | trunk | src/supports/Settings/SupportSidebar.tsx (2) |
| `tempTrunk` | 2 | trunk | src/supports/Curves/curveUtils.ts (2) |
| `toAnchor` | 2 | anchor | src/features/scene/arrange/highPrecisionArrange.ts (2) |
| `transformAllKickstandsInState` | 2 | kickstand | src/supports/state.ts (2) |
| `transformKickstandsForModelInState` | 2 | kickstand | src/supports/state.ts (2) |
| `trunkById` | 2 | trunk | src/supports/autoBracing/autoBrace.ts (2) |
| `trunkCollidesWithMesh` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `trunkDx` | 2 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2) |
| `trunkDy` | 2 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2) |
| `trunkExists` | 2 | trunk | src/supports/autoSupport/autoPlace.ts (2) |
| `trunkGroupIds` | 2 | trunk | src/supports/autoBracing/autoBrace.ts (2) |
| `trunkHeight` | 2 | trunk | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (2) |
| `trunkKey` | 2 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (2) |
| `trunkKnotsWithBranches` | 2 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/maxConnectedDiameter.ts (2) |
| `trunkOverrides` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `trunkPositions` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `trunkSupport` | 2 | trunk | src/supports/interaction/jointDragPreview.ts (2) |
| `trunkSupports` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `trunkTopZ` | 2 | trunk | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (2) |
| `twigCount` | 2 | twig | src/supports/autoSupport/autoPlace.ts (1), src/supports/autoSupport/types.ts (1) |
| `twigDragPreview` | 2 | twig | src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (1), src/supports/SupportRenderer.tsx (1) |
| `updateAnchor` | 2 | anchor | src/supports/state.ts (2) |
| `useActiveTwigDragPreview` | 2 | twig | src/supports/SupportRenderer.tsx (2) |
| `useTrunkPlacement` | 2 | trunk | src/features/supports/useSupportInteractionManager.ts (1), src/supports/autoSupport/autoPlace.ts (1) |
| `useTrunkPlacementV2` | 2 | trunk | src/features/supports/useSupportInteractionManager.ts (2) |
| `xLabelAnchor` | 2 | anchor | src/features/slicing/components/LutCurveEditor.tsx (2) |
| `'Braces'` | 1 | brace | src/components/modals/ModelSupportsModal.tsx (1) |
| `'Branch'` | 1 | branch | src/supports/Settings/SupportSidebar.tsx (1) |
| `'Branches'` | 1 | branch | src/components/modals/ModelSupportsModal.tsx (1) |
| `'Kickstands'` | 1 | kickstand | src/components/modals/ModelSupportsModal.tsx (1) |
| `'Leaf'` | 1 | leaf | src/supports/Settings/SupportSidebar.tsx (1) |
| `'Sticks'` | 1 | stick | src/components/modals/ModelSupportsModal.tsx (1) |
| `'Trunks'` | 1 | trunk | src/components/modals/ModelSupportsModal.tsx (1) |
| `'Twig'` | 1 | twig | src/supports/Settings/SupportSidebar.tsx (1) |
| `'Twigs'` | 1 | twig | src/components/modals/ModelSupportsModal.tsx (1) |
| `'auto-brace'` | 1 | brace | src/supports/autoBracing/autoBrace.ts (1) |
| `'auto-brace-knot'` | 1 | brace | src/supports/autoBracing/autoBrace.ts (1) |
| `'bareTrunks'` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `'brace:hovered-leaf-snap'` | 1 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1) |
| `'brace:leaf-snap'` | 1 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1) |
| `'brace:leaf-snap-invalid'` | 1 | leaf | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1) |
| `'branch:collision'` | 1 | branch | src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'branch:cone-search'` | 1 | branch | src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'grid_promote_candidate_to_trunk'` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `'idle:branch-awaiting-base'` | 1 | branch | src/supports/SupportTypes/Brace/BracePlacementController.tsx (1) |
| `'maxBraceLengthMm'` | 1 | brace | src/supports/autoBracing/settings.ts (1) |
| `'support:add-anchor'` | 1 | anchor | src/supports/history/actionTypes.ts (1) |
| `'support:add-brace'` | 1 | brace | src/supports/history/actionTypes.ts (1) |
| `'support:add-branch'` | 1 | branch | src/supports/history/actionTypes.ts (1) |
| `'support:add-kickstand'` | 1 | kickstand | src/supports/history/actionTypes.ts (1) |
| `'support:add-leaf'` | 1 | leaf | src/supports/history/actionTypes.ts (1) |
| `'support:add-stick'` | 1 | stick | src/supports/history/actionTypes.ts (1) |
| `'support:add-trunk'` | 1 | trunk | src/supports/history/actionTypes.ts (1) |
| `'support:add-twig'` | 1 | twig | src/supports/history/actionTypes.ts (1) |
| `'support:auto-brace-replace'` | 1 | brace | src/supports/history/actionTypes.ts (1) |
| `'support:remove-anchor'` | 1 | anchor | src/supports/history/actionTypes.ts (1) |
| `'support:remove-brace'` | 1 | brace | src/supports/history/actionTypes.ts (1) |
| `'support:remove-branch'` | 1 | branch | src/supports/history/actionTypes.ts (1) |
| `'support:remove-kickstand'` | 1 | kickstand | src/supports/history/actionTypes.ts (1) |
| `'support:remove-leaf'` | 1 | leaf | src/supports/history/actionTypes.ts (1) |
| `'support:remove-stick'` | 1 | stick | src/supports/history/actionTypes.ts (1) |
| `'support:remove-trunk'` | 1 | trunk | src/supports/history/actionTypes.ts (1) |
| `'support:remove-twig'` | 1 | twig | src/supports/history/actionTypes.ts (1) |
| `'support:replace-trunk'` | 1 | trunk | src/supports/history/actionTypes.ts (1) |
| `'support:update-branch'` | 1 | branch | src/supports/history/actionTypes.ts (1) |
| `'support:update-trunk'` | 1 | trunk | src/supports/history/actionTypes.ts (1) |
| `'trunk.'` | 1 | trunk | src/supports/Settings/AnatomyPreview/SupportAnatomyPreviewCanvas.tsx (1) |
| `'trunk:build'` | 1 | trunk | src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:build-from-placement'` | 1 | trunk | src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunk:v2-placement'` | 1 | trunk | src/supports/PlacementLogic/Pathfinding/pathfindingPerf.ts (1) |
| `'trunkUpdate'` | 1 | trunk | src/features/supports/useSupportInteractionManager.ts (1) |
| `ANCHOR_HEIGHT_THRESHOLD_MM` | 1 | anchor | src/supports/autoSupport/constants.ts (1) |
| `ANCHOR_MIN_AREA_MM2` | 1 | anchor | src/supports/autoSupport/constants.ts (1) |
| `ANCHOR_MIN_SPACING_MM` | 1 | anchor | src/supports/autoSupport/constants.ts (1) |
| `ANCHOR_MIN_XY_MM` | 1 | anchor | src/supports/autoSupport/constants.ts (1) |
| `ANCHOR_SHAFT_MULTIPLIER` | 1 | anchor | src/supports/autoSupport/parameterSizing.ts (1) |
| `Anchor_$` | 1 | anchor | src/features/export/logic/supportExportReconstruction.ts (1) |
| `AutoBrace` | 1 | brace | src/supports/autoBracing/meshClearance.ts (1) |
| `Brace_$` | 1 | brace | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Braces` | 1 | brace | src/components/modals/ModelSupportsModal.tsx (1) |
| `Branch_$` | 1 | branch | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Kickstand_$` | 1 | kickstand | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Kickstands` | 1 | kickstand | src/components/modals/ModelSupportsModal.tsx (1) |
| `Leaf_$` | 1 | leaf | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Stick_$` | 1 | stick | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Sticks` | 1 | stick | src/components/modals/ModelSupportsModal.tsx (1) |
| `TRUNKS` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `Trunk_$` | 1 | trunk | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Twig_$` | 1 | twig | src/features/export/logic/supportExportReconstruction.ts (1) |
| `Twigs` | 1 | twig | src/components/modals/ModelSupportsModal.tsx (1) |
| `_brace` | 1 | brace | src/supports/SupportRenderer.tsx (1) |
| `addBrace` | 1 | brace | src/supports/state.ts (1) |
| `addStick` | 1 | stick | src/supports/state.ts (1) |
| `addTrunk` | 1 | trunk | src/supports/state.ts (1) |
| `addTwig` | 1 | twig | src/supports/state.ts (1) |
| `analyzeTrunkHeightCoverage` | 1 | trunk | src/supports/autoBracing/heightCoverageAnalysis.ts (1) |
| `anchorBuilder` | 1 | anchor | src/supports/PlacementLogic/Grid/gridPlacement.ts (1) |
| `autoBraceMessages` | 1 | brace | src/supports/Settings/SupportSidebar.tsx (1) |
| `braceAngleDeg` | 1 | brace | src/supports/autoBracing/settings.ts (1) |
| `bracesToAdd` | 1 | brace | src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `branchRegistration` | 1 | branch | src/supports/state.ts (1) |
| `branchesToAdd` | 1 | branch | src/supports/SupportTypes/Trunk/TrunkReplacement/types.ts (1) |
| `buildKickstandSnapTargetMetaIndex` | 1 | kickstand | src/supports/interaction/shared/placement/snapping/kickstandSnapTargets.ts (1) |
| `collectGhostedBraceIds` | 1 | brace | src/supports/interaction/supportPreviewOverlay.ts (1) |
| `getMeshEntryForAutoBrace` | 1 | brace | src/supports/autoBracing/meshGeometryStore.ts (1) |
| `getStickTargetFocusState` | 1 | stick | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/camera.ts (1) |
| `grid_promote_candidate_to_trunk` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `isAutoBraceable` | 1 | brace | src/supports/autoBracing/autoBrace.ts (1) |
| `kickstandKickstandsRef` | 1 | kickstand | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `kickstandMeshClearanceMm` | 1 | kickstand | src/supports/autoBracing/settings.ts (1) |
| `kickstandRegistration` | 1 | kickstand | src/supports/state.ts (1) |
| `leafPlacementStore` | 1 | leaf | src/supports/SupportTypes/Kickstand/KickstandPlacementController.tsx (1) |
| `leafRegistration` | 1 | leaf | src/supports/state.ts (1) |
| `leafRod` | 1 | leaf | src/supports/SupportProxyMeshLayer.tsx (1) |
| `maxBraceLength` | 1 | brace | src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (1) |
| `removeAnchor` | 1 | anchor | src/supports/state.ts (1) |
| `removeKickstandFromState` | 1 | kickstand | src/supports/state.ts (1) |
| `removeStick` | 1 | stick | src/supports/state.ts (1) |
| `removeTrunk` | 1 | trunk | src/supports/state.ts (1) |
| `removeTwig` | 1 | twig | src/supports/state.ts (1) |
| `resetKickstandsInState` | 1 | kickstand | src/supports/state.ts (1) |
| `resolveBraceModelId` | 1 | brace | src/features/export/logic/supportExportReconstruction.ts (1) |
| `resolveBracePathDiameterAtT` | 1 | brace | src/supports/interaction/shared/placement/snapping/supportPathTargets.ts (1) |
| `resolveBranchModelId` | 1 | branch | src/features/export/logic/supportExportReconstruction.ts (1) |
| `resolveKickstandModelId` | 1 | kickstand | src/features/export/logic/supportExportReconstruction.ts (1) |
| `resolveLeafModelId` | 1 | leaf | src/features/export/logic/supportExportReconstruction.ts (1) |
| `splitBranchShaft` | 1 | branch | src/supports/SupportPrimitives/Joint/jointUtils.ts (1) |
| `splitStickShaft` | 1 | stick | src/supports/SupportPrimitives/Joint/jointUtils.ts (1) |
| `splitTwigShaft` | 1 | twig | src/supports/SupportPrimitives/Joint/jointUtils.ts (1) |
| `stickBuilder` | 1 | stick | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1) |
| `stickList` | 1 | stick | src/supports/SupportRenderer.tsx (1) |
| `stickRegistration` | 1 | stick | src/supports/state.ts (1) |
| `supportBracesRef` | 1 | brace | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `supportBranchesRef` | 1 | branch | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `supportSticksRef` | 1 | stick | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `supportTrunksRef` | 1 | trunk | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `supportTwigsRef` | 1 | twig | src/components/scene/SceneCanvas/SceneCanvas.tsx (1) |
| `trunkIdToRemove` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `trunkRouteResolution` | 1 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1) |
| `trunkRouteTypes` | 1 | trunk | src/supports/PlacementLogic/Grid/gridPlacement.ts (1) |
| `trunkToAdd` | 1 | trunk | src/supports/autoSupport/autoPlace.ts (1) |
| `twigBuilder` | 1 | twig | src/supports/Settings/AnatomyPreview/PreviewTypes/Trunk/TrunkPreview.tsx (1) |
| `twigRegistration` | 1 | twig | src/supports/state.ts (1) |

## False positives (excluded from the counts above)

| token | n | files |
| --- | ---: | --- |
| `arrangeAnchorMode` | 42 | src/features/scene/arrange/useArrangeManager.ts (28), src/features/scene/arrange/highPrecisionArrange.ts (6), src/components/organisms/panels/PreparePanelStack.tsx (2), src/features/scene/arrange/highPrecisionArrange.worker.ts (2), src/features/scene/arrange/highPrecisionArrangeWorkerClient.ts (2), src/app/page.tsx (1), src/features/scene/arrange/highPrecisionArrange.worker.shared.ts (1) |
| `tenonAnchor` | 38 | src/features/organicCut/useOrganicCutSession.ts (14), src/app/page.tsx (5), src/features/organicCut/OrganicCutTenonGizmo.tsx (5), src/features/organicCut/OrganicCutTool.tsx (5), src/features/organicCut/meshOrganicCut.ts (4), src/features/organicCut/OrganicCutPanel.tsx (3), src/features/organicCut/types.ts (2) |
| `packingAnchor` | 19 | src/features/scene/arrange/highPrecisionArrange.ts (19) |
| `lowAnchor` | 16 | src/supports/autoBracing/autoBrace.ts (16) |
| `highAnchor` | 15 | src/supports/autoBracing/autoBrace.ts (15) |
| `sortAnchor` | 14 | src/supports/autoBracing/autoBrace.ts (14) |
| `anchorZ` | 13 | src/supports/autoBracing/autoBrace.ts (7), src/supports/Settings/AnatomyPreview/PreviewTypes/Brace/BracePreview.tsx (6) |
| `anchorPos` | 10 | src/components/layout/FloatingPanelStack.tsx (10) |
| `anchored` | 10 | src/components/layout/FloatingPanelStack.tsx (10) |
| `ArrangeAnchorMode` | 9 | src/components/controls/ArrangePanel.tsx (4), src/features/scene/arrange/highPrecisionArrange.ts (2), src/features/scene/arrange/useArrangeManager.ts (2), src/app/page.tsx (1) |
| `anchorIndex` | 9 | src/supports/PlacementLogic/smartPlacementCandidateSearch.ts (5), src/components/controls/ModelManagerPanel.tsx (4) |
| `onTenonAnchorChange` | 9 | src/features/organicCut/OrganicCutTenonGizmo.tsx (8), src/app/page.tsx (1) |
| `anchorW` | 8 | src/features/organicCut/OrganicCutTenonGizmo.tsx (6), src/features/organicCut/OrganicCutTool.tsx (2) |
| `bestReachableAnchorZ` | 8 | src/supports/autoBracing/heightCoverageAnalysis.ts (8) |
| `resolveShaftAnchor` | 8 | src/supports/SupportPrimitives/Joint/useJointInteraction.ts (3), src/supports/Curves/BezierGizmo/BezierGizmoManager.tsx (2), src/supports/SupportPrimitives/Joint/JointGizmo.tsx (2), src/supports/SupportPrimitives/Knot/segmentEndpoints.ts (1) |
| `resolveAnchorAtZ` | 7 | src/supports/autoBracing/autoBrace.ts (7) |
| `setMultiGizmoAnchorPosition` | 7 | src/components/scene/SceneCanvas/SceneCanvas.tsx (7) |
| `textAnchor` | 6 | src/features/slicing/components/LutCurveEditor.tsx (6) |
| `setArrangeAnchorMode` | 5 | src/components/organisms/panels/PreparePanelStack.tsx (2), src/features/scene/arrange/useArrangeManager.ts (2), src/app/page.tsx (1) |
| `anchorPoints` | 4 | src/supports/PlacementLogic/smartPlacementCandidateSearch.ts (4) |
| `multiGizmoAnchorRef` | 4 | src/components/scene/SceneCanvas/SceneCanvas.tsx (4) |
| `requiredAnchorZ` | 4 | src/supports/autoBracing/heightCoverageAnalysis.ts (4) |
| `sliceIntentAnchorRef` | 4 | src/features/slicing/components/SlicingPanel.tsx (4) |
| `AnchorPoint` | 3 | src/supports/autoBracing/autoBrace.ts (3) |
| `CURRENT_SEGMENT_STICKINESS` | 3 | src/supports/SupportPrimitives/Knot/useKnotInteraction.ts (3) |
| `anchorPoint` | 3 | src/supports/SupportPrimitives/Knot/segmentEndpoints.ts (3) |
| `getAnchoredDesiredPosition` | 3 | src/components/layout/FloatingPanelStack.tsx (3) |
| `isEdgeAnchored` | 3 | src/components/layout/FloatingPanelStack.tsx (3) |
| `maxAnchorZFromNeighbor` | 3 | src/supports/autoBracing/heightCoverageAnalysis.ts (3) |
| `socketAnchorRef` | 3 | src/supports/SupportTypes/Trunk/TrunkRenderer.tsx (3) |
| `supportSidebarAnchorRef` | 3 | src/supports/Settings/SupportSidebar.tsx (3) |
| `topAnchorPos` | 3 | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `topAnchorX` | 3 | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `topAnchorY` | 3 | src/supports/SupportTypes/Kickstand/kickstandStabiliser.ts (3) |
| `AnchorCandidate` | 2 | src/supports/autoBracing/autoBrace.ts (2) |
| `GitBranch` | 2 | src/components/settings/PluginStudioModal.tsx (2) |
| `forceAnchoredPanelIds` | 2 | src/components/layout/FloatingPanelStack.tsx (2) |
| `stickiness` | 2 | src/supports/SupportPrimitives/Knot/knotUtils.ts (2) |
| `sticky` | 2 | src/components/settings/ProfileSettingsModal.tsx (1), src/features/slicing/components/SliceMetricsDebugModal.tsx (1) |
| `toAnchorX` | 2 | src/features/scene/arrange/highPrecisionArrange.ts (2) |
| `toAnchorY` | 2 | src/features/scene/arrange/highPrecisionArrange.ts (2) |
| `'tenonAnchor'` | 1 | src/features/organicCut/useOrganicCutSession.ts (1) |
| `joystick` | 1 | src/components/scene/camera/SpaceMouseController.tsx (1) |
