//! Repair pipeline. Fixed-order passes over an [`IndexedMesh`].
//!
//! Each pass mutates the mesh in-place and appends a [`RepairStepReport`].
//! The passes are:
//!
//!   1. Dedup / weld vertices (epsilon quantization).
//!   2. Strip degenerate + duplicate triangles.
//!   3. Fill small boundary loops via ear-clipping triangulation on a best-fit plane.
//!   4. Resolve per-component winding by majority outward-normal vote (BVH ray cast).
//!   5. Optionally drop small disconnected components (keep top-N by signed volume).
//!   6. Recompute analysis for the post-report.
//!
//! Co-refinement-based self-intersection retriangulation is available as an
//! opt-in path; full arrangement classification/extraction is still WIP.
//! Residual counts flow into [`MeshHealthReport::residual_issues`].

use ahash::{AHashMap, AHashSet};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::analysis::{analyze, minimal_analysis, MeshAnalysis};
use crate::arrangement::corefine_self_intersections;
use crate::core::bvh::Bvh;
use crate::core::halfedge::{edge_key, Topology};
use crate::core::mesh::{IndexedMesh, Vec3};
use crate::topology_passes;
use crate::report::{MeshHealthReport, RepairStepReport};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairOptions {
    /// Relative to bbox diagonal. Vertices within this distance are welded.
    pub weld_epsilon: f32,
    /// Maximum boundary loop length (in vertices) that will be auto-filled.
    /// Loops larger than this are left alone — they usually indicate intentional
    /// open shells rather than holes.
    pub fill_holes_max_edges: usize,
    /// Keep the top-N components ranked by |signed volume|. `None` = keep all.
    pub keep_largest_n_components: Option<usize>,
    /// Attempt orientation repair (per-component outward vote).
    pub repair_orientation: bool,
    /// Attempt self-intersection resolution.
    ///
    /// Current sequence when enabled:
    /// 1) Co-refine intersecting triangles (split along intersection segments),
    /// 2) Extract union boundary faces via parity classification on both sides
    ///    of each refined triangle (no voxel remesh).
    ///
    /// This is a stepping stone toward full arrangement+classification repair.
    pub resolve_self_intersections: bool,
    /// If true, automatically enable the self-intersection solidify path for
    /// heavily fragmented meshes (typical of broken support STLs), even when
    /// `resolve_self_intersections` is false.
    pub solidify_fragmented_components: bool,
    /// Minimum connected-component count in the *pre* analysis required for
    /// `solidify_fragmented_components` to auto-trigger.
    pub solidify_component_threshold: usize,
    /// Minimum self-intersection-triangle count in the *pre* analysis required
    /// for `solidify_fragmented_components` to auto-trigger.
    pub solidify_self_intersection_threshold: usize,
    /// When set to `Some(true)`, forces the repair pipeline to treat the input
    /// mesh as support geometry (`likely_support_geometry = true`) and bypasses
    /// component shape heuristic re-derivation.
    pub assume_support_geometry: Option<bool>,
}

impl Default for RepairOptions {
    fn default() -> Self {
        Self {
            weld_epsilon: 1e-5,
            fill_holes_max_edges: 1024,
            keep_largest_n_components: None,
            repair_orientation: true,
            // Off by default because this path can be expensive on huge meshes;
            // callers can opt in explicitly or rely on fragmented auto mode.
            resolve_self_intersections: false,
            // On by default for highly fragmented support-style meshes; guarded
            // by high pre-analysis thresholds to avoid impacting normal models.
            solidify_fragmented_components: true,
            solidify_component_threshold: 256,
            solidify_self_intersection_threshold: 128,
            assume_support_geometry: None,
        }
    }
}

#[derive(Debug)]
pub struct RepairOutcome {
    pub mesh: IndexedMesh,
    pub report: MeshHealthReport,
}

pub type ClassificationOutcome = RepairOutcome;

pub fn repair(mut mesh: IndexedMesh, options: &RepairOptions) -> RepairOutcome {
    let t_start = std::time::Instant::now();

    let pre = analyze(&mesh);
    let auto_fragmented_solidify = options.solidify_fragmented_components
        && pre.connected_components >= options.solidify_component_threshold
        && pre.self_intersection_triangles >= options.solidify_self_intersection_threshold;
    let run_self_intersection_path = options.resolve_self_intersections || auto_fragmented_solidify;
    let mut applied_self_intersection_path = false;
    let mut skip_final_orientation = false;
    let mut solidify_rollback_reason: Option<String> = None;
    let mut report = MeshHealthReport::new(pre);
    if options.assume_support_geometry == Some(true) {
        report.likely_support_geometry = true;
    }

    if auto_fragmented_solidify {
        report.steps.push(RepairStepReport {
            name: "auto_enable_solidify".into(),
            changed: 0,
            notes: Some(format!(
                "auto-triggered: components={} (>= {}), self_intersections={} (>= {})",
                report.pre.connected_components,
                options.solidify_component_threshold,
                report.pre.self_intersection_triangles,
                options.solidify_self_intersection_threshold,
            )),
            elapsed_ms: 0.0,
        });
    }

    // 1. Weld.
    let t = std::time::Instant::now();
    let welded = weld_vertices(&mut mesh, options.weld_epsilon);
    report.steps.push(RepairStepReport {
        name: "weld".into(),
        changed: welded as u32,
        notes: None,
        elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
    });

    // 2. Cull degenerate + duplicate triangles.
    let t = std::time::Instant::now();
    let culled = cull_degenerate_and_duplicate(&mut mesh);
    report.steps.push(RepairStepReport {
        name: "cull_degenerate_duplicate".into(),
        changed: culled as u32,
        notes: None,
        elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
    });

    // 2b. Stitch before any hole is capped.
    let t = std::time::Instant::now();
    let stitch_tol = topology_passes::stitch_tolerance(&mesh);
    let stitched = topology_passes::stitch_borders(&mut mesh, stitch_tol, 4);
    if stitched > 0 {
        cull_degenerate_and_duplicate(&mut mesh);
    }
    report.steps.push(RepairStepReport {
        name: "stitch_borders".into(),
        changed: stitched as u32,
        notes: Some(format!("tolerance {stitch_tol:.6}")),
        elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
    });

    // 2c. Hole patches take their winding from the border, so it must be coherent first.
    if options.repair_orientation {
        let t = std::time::Instant::now();
        let flipped = topology_passes::unify_winding(&mut mesh);
        report.steps.push(RepairStepReport {
            name: "unify_winding".into(),
            changed: flipped as u32,
            notes: None,
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
    }

    // 3. Fill small holes.
    //
    // Perf fast-path: in highly fragmented solidify workloads with no
    // pre-existing open boundaries, this pass is usually wasted work because
    // manifold solidify handles closure downstream. Skipping here saves a
    // few hundred ms on very large support-heavy meshes.
    let skip_fill_holes_fast = run_self_intersection_path
        && report.pre.boundary_edges == 0
        && report.pre.boundary_loops == 0
        && report.pre.connected_components >= options.solidify_component_threshold;
    if skip_fill_holes_fast {
        report.steps.push(RepairStepReport {
            name: "fill_holes".into(),
            changed: 0,
            notes: Some(
                "skipped: fragmented solidify fast-path (no pre-existing boundary loops)".into(),
            ),
            elapsed_ms: 0.0,
        });
    } else {
        let t = std::time::Instant::now();
        let filled = fill_small_holes(&mut mesh, options.fill_holes_max_edges);
        report.steps.push(RepairStepReport {
            name: "fill_holes".into(),
            changed: filled as u32,
            notes: None,
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
    }

    // 4. Optional solidify (self-intersection path).
    //
    // Two phases:
    //   Phase A – Component-level interior culling: removes entire connected
    //             components whose majority of faces are interior-facing.
    //             Fast (single BVH + parallel ray cast), never creates new
    //             boundary edges, ideal for highly fragmented meshes.
    //   Phase B – Co-refinement + parity union-boundary extraction: split
    //             intersections, then keep only faces that separate inside and
    //             outside volume states. No voxel remeshing.
    if run_self_intersection_path {
        // Fast-path: try manifold batch union before expensive orientation and
        // component-culling passes. On highly fragmented meshes this typically
        // succeeds directly and saves several seconds.
        #[cfg(feature = "manifold")]
        {
            let analysis_before_fast = analyze(&mesh);
            let t = std::time::Instant::now();
            match try_solidify_via_manifold_union(&mesh, options) {
                Some((
                    unioned,
                    manifold_accepted,
                    fallback_rescued,
                    fallback_kept,
                    fallback_dropped,
                    likely_support_geometry,
                    model_tri_count,
                )) => {
                    let analysis_after = analyze(&unioned);
                    let elapsed_ms = t.elapsed().as_secs_f64() * 1000.0;

                    let tri_before = analysis_before_fast.triangle_count;
                    let tri_after = analysis_after.triangle_count;
                    let manifold_regression = if tri_after < 4 {
                        Some(format!("manifold result has only {tri_after} triangles"))
                    } else if tri_before > 0 && tri_after * 200 < tri_before {
                        Some(format!(
                            "manifold result collapsed {tri_before} -> {tri_after} triangles"
                        ))
                    } else {
                        None
                    };

                    if let Some(reason) = manifold_regression {
                        report.steps.push(RepairStepReport {
                            name: "rollback_manifold_batch_union".into(),
                            changed: 0,
                            notes: Some(format!("manifold batch_union output rejected: {reason}")),
                            elapsed_ms,
                        });
                    } else {
                        let n_comps_before = analysis_before_fast.connected_components;
                        let n_comps_after = analysis_after.connected_components;
                        report.steps.push(RepairStepReport {
                            name: "manifold_batch_union".into(),
                            changed: (analysis_before_fast.triangle_count as i64
                                - analysis_after.triangle_count as i64)
                                .unsigned_abs() as u32,
                            notes: Some(format!(
                                "components:{}->{} tris:{}->{} si:{}->{} watertight:{} \
                                 unioned={} rescued={} fallback_kept={} fallback_dropped={}",
                                n_comps_before,
                                n_comps_after,
                                analysis_before_fast.triangle_count,
                                analysis_after.triangle_count,
                                analysis_before_fast.self_intersection_triangles,
                                analysis_after.self_intersection_triangles,
                                analysis_after.is_watertight,
                                manifold_accepted,
                                fallback_rescued,
                                fallback_kept,
                                fallback_dropped,
                            )),
                            elapsed_ms,
                        });
                        mesh = unioned;
                        applied_self_intersection_path = true;
                        report.likely_support_geometry = likely_support_geometry;
                        if model_tri_count < mesh.triangles.len() {
                            report.model_triangle_count = Some(model_tri_count);
                        }
                        skip_final_orientation = analysis_after.inconsistent_winding_edges == 0;
                    }
                }
                None => {
                    // Keep the report clean in this common miss case; we just
                    // continue with the existing orientation + Phase-A/B path.
                }
            }
        }

        if !applied_self_intersection_path {
            // Orient first so face normals are reliable for the winding test.
            if options.repair_orientation {
                let t = std::time::Instant::now();
                let flipped = repair_orientation(&mut mesh);
                report.steps.push(RepairStepReport {
                    name: "orient_pre_solidify".into(),
                    changed: flipped as u32,
                    notes: None,
                    elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                });
            }

            let mesh_before_solidify = mesh.clone();
            let analysis_before_solidify = analyze(&mesh);

            // Phase A: Component-level interior culling.
            let t = std::time::Instant::now();
            let (comp_removed_tris, comp_removed_count) = cull_interior_components(&mut mesh);
            let elapsed_comp = t.elapsed().as_secs_f64() * 1000.0;

            if comp_removed_count > 0 {
                let analysis_after_comp = analyze(&mesh);
                if let Some(reason) =
                    solidify_regression_reason(&analysis_before_solidify, &analysis_after_comp)
                {
                    // Regression — roll back Phase A and let Phase B try.
                    mesh = mesh_before_solidify.clone();
                    report.steps.push(RepairStepReport {
                        name: "rollback_component_solidify".into(),
                        changed: 0,
                        notes: Some(format!("rolled back component solidify: {reason}")),
                        elapsed_ms: elapsed_comp,
                    });
                } else {
                    applied_self_intersection_path = true;
                    report.steps.push(RepairStepReport {
                        name: "cull_interior_components".into(),
                        changed: comp_removed_tris as u32,
                        notes: Some(format!(
                            "{comp_removed_count} interior components removed \
                             ({comp_removed_tris} triangles), {} -> {} components",
                            analysis_before_solidify.connected_components,
                            analysis_after_comp.connected_components,
                        )),
                        elapsed_ms: elapsed_comp,
                    });
                }
            }
        }

        // Baseline for Phase B (manifold fallback / corefine). Captured after
        // any Phase-A edits so rollbacks restore to the immediate pre-Phase-B
        // state rather than the initial fast-path input.
        let mesh_before_solidify = mesh.clone();
        let analysis_before_solidify = analyze(&mesh);

        // Phase B: Co-refinement + component-exclusion boundary extraction.
        //
        // The parity test on the post-corefine mesh is unreliable because ~47%
        // of intersecting face pairs are left unresolved (CDT failures), making
        // ray parity votes essentially noise.
        //
        // Instead we classify faces on the *pre-corefine* mesh (where each
        // component is topologically intact) using component-exclusion interior
        // detection, then carry those flags through refinement via face_origin.
        // A face is on the union outer boundary iff its outward sample is NOT
        // inside any other component — the same criterion `cull_interior_components`
        // uses, but applied at face-level instead of component-level.
        if !applied_self_intersection_path {
            // ── Phase B-0: manifold batch-union (feature-gated) ──────────────
            //
            // For meshes with hundreds or thousands of interpenetrating shells
            // (e.g. multi-component support structures), the corefine +
            // boundary-extraction path below is unreliable because there is no
            // stable inside/outside signal when every face is inside at least one
            // other component. Instead, convert each connected component into a
            // manifold3d solid and call batch_union, which uses a robust
            // generalized winding number classification internally.
            #[cfg(feature = "manifold")]
            {
                let t = std::time::Instant::now();
                match try_solidify_via_manifold_union(&mesh, options) {
                    Some((
                        unioned,
                        manifold_accepted,
                        fallback_rescued,
                        fallback_kept,
                        fallback_dropped,
                        likely_support_geometry,
                        model_tri_count,
                    )) => {
                        let analysis_after = analyze(&unioned);
                        let elapsed_ms = t.elapsed().as_secs_f64() * 1000.0;

                        // Manifold batch_union computes the TRUE geometric union,
                        // so the output volume will legitimately be smaller than
                        // analysis_before_solidify.signed_volume — which is the SUM
                        // of overlapping component volumes (double-counting all
                        // intersecting regions). Never apply the volume-collapse guard
                        // here; only reject a near-empty mesh (catastrophic failure).
                        let tri_before = analysis_before_solidify.triangle_count;
                        let tri_after = analysis_after.triangle_count;
                        let manifold_regression = if tri_after < 4 {
                            Some(format!("manifold result has only {tri_after} triangles"))
                        } else if tri_before > 0 && tri_after * 200 < tri_before {
                            // Reject if < 0.5% of input triangles remain — truly
                            // pathological (should never happen with correct winding).
                            Some(format!(
                                "manifold result collapsed {tri_before} -> {tri_after} triangles"
                            ))
                        } else {
                            None
                        };

                        if let Some(reason) = manifold_regression {
                            report.steps.push(RepairStepReport {
                                name: "rollback_manifold_batch_union".into(),
                                changed: 0,
                                notes: Some(format!(
                                    "manifold batch_union output rejected: {reason}"
                                )),
                                elapsed_ms,
                            });
                        } else {
                            let n_comps_before = analysis_before_solidify.connected_components;
                            let n_comps_after = analysis_after.connected_components;
                            report.steps.push(RepairStepReport {
                                name: "manifold_batch_union".into(),
                                changed: (analysis_before_solidify.triangle_count as i64
                                    - analysis_after.triangle_count as i64)
                                    .unsigned_abs() as u32,
                                notes: Some(format!(
                                    "components:{}->{} tris:{}->{} si:{}->{} watertight:{} \
                                     unioned={} rescued={} fallback_kept={} fallback_dropped={}",
                                    n_comps_before,
                                    n_comps_after,
                                    analysis_before_solidify.triangle_count,
                                    analysis_after.triangle_count,
                                    analysis_before_solidify.self_intersection_triangles,
                                    analysis_after.self_intersection_triangles,
                                    analysis_after.is_watertight,
                                    manifold_accepted,
                                    fallback_rescued,
                                    fallback_kept,
                                    fallback_dropped,
                                )),
                                elapsed_ms,
                            });
                            mesh = unioned;
                            applied_self_intersection_path = true;
                            report.likely_support_geometry = likely_support_geometry;
                            if model_tri_count < mesh.triangles.len() {
                                report.model_triangle_count = Some(model_tri_count);
                            }
                            skip_final_orientation = analysis_after.inconsistent_winding_edges == 0;
                        }
                    }
                    None => {
                        report.steps.push(RepairStepReport {
                            name: "skip_manifold_batch_union".into(),
                            changed: 0,
                            notes: Some(
                                "no valid manifold components found; \
                                 falling back to corefine path"
                                    .into(),
                            ),
                            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                        });
                    }
                }
            }
        }

        // ── Phase B-1: Co-refinement + component-exclusion boundary extraction ──
        if !applied_self_intersection_path {
            // Classify each face in the pre-corefine mesh: interior (inside some
            // other component from the outward side) vs exterior (outer boundary).
            let pre_comps = triangle_components(&mesh);
            let pre_interior =
                compute_interior_face_flags_against_other_components(&mesh, &pre_comps);

            let t = std::time::Instant::now();
            let stats = corefine_self_intersections(&mut mesh);
            report.steps.push(RepairStepReport {
                name: "corefine_self_intersections".into(),
                changed: stats.refined_faces as u32,
                notes: Some(format!(
                    "pairs={} refined_faces={} skipped_faces={} new_vertices={} tris:{}->{}",
                    stats.intersecting_pairs,
                    stats.refined_faces,
                    stats.skipped_faces,
                    stats.new_vertices,
                    stats.tri_count_before,
                    stats.tri_count_after
                )),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });

            // Apply boundary extraction: keep faces whose pre-corefine origin
            // was classified as exterior (not interior to any other component).
            // Refined sub-faces inherit the interior flag of the original face
            // they were split from via face_origin.
            let t = std::time::Instant::now();
            let before_extract = mesh.triangles.len();
            {
                let mut kept = Vec::with_capacity(before_extract);
                for (fi, tri) in mesh.triangles.iter().enumerate() {
                    let orig = stats.face_origin.get(fi).copied().unwrap_or(fi as u32) as usize;
                    // Keep if origin was exterior (not interior to another component).
                    if orig >= pre_interior.len() || !pre_interior[orig] {
                        kept.push(*tri);
                    }
                }
                mesh.triangles = kept;
            }
            // Remove open seam shards left by CDT failures.
            prune_open_fragments(&mut mesh);
            let culled = before_extract - mesh.triangles.len();
            report.steps.push(RepairStepReport {
                name: "extract_union_boundary_faces".into(),
                changed: culled as u32,
                notes: Some(format!(
                    "{culled} triangles removed (pre-corefine component-exclusion + open-fragment pruning)"
                )),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });

            let t = std::time::Instant::now();
            let analysis_after_solidify = analyze(&mesh);
            if let Some(reason) =
                solidify_regression_reason(&analysis_before_solidify, &analysis_after_solidify)
            {
                mesh = mesh_before_solidify;
                solidify_rollback_reason = Some(reason.clone());
                report.steps.push(RepairStepReport {
                    name: "rollback_solidify".into(),
                    changed: 0,
                    notes: Some(format!(
                        "rolled back co-refinement/union-extraction output: {reason}"
                    )),
                    elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                });
            } else {
                applied_self_intersection_path = true;
            }
        }
    }

    // 5. Orient components.
    if options.repair_orientation {
        if skip_final_orientation {
            report.steps.push(RepairStepReport {
                name: "orient_components".into(),
                changed: 0,
                notes: Some("skipped: winding already coherent after manifold solidify".into()),
                elapsed_ms: 0.0,
            });
        } else {
            let t = std::time::Instant::now();
            let flipped = repair_orientation(&mut mesh);
            report.steps.push(RepairStepReport {
                name: "orient_components".into(),
                changed: flipped as u32,
                notes: None,
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });
        }
    }

    // 6. Component filter.
    if let Some(keep_n) = options.keep_largest_n_components {
        let t = std::time::Instant::now();
        let dropped_tris = keep_largest_components(&mut mesh, keep_n);
        report.steps.push(RepairStepReport {
            name: "filter_components".into(),
            changed: dropped_tris as u32,
            notes: Some(format!("kept top {keep_n} components by |volume|")),
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
    }

    // 7-8. Iterative topology repair loop.
    //
    // Non-manifold face cleanup and micro-topology heal are alternated in a
    // convergence loop. A single pass often leaves 1-2 residual NMEs because
    // the hole-fill after face removal can itself introduce a new NME; the
    // second pass catches those artifacts. The loop stops when the mesh is
    // watertight, no pass made progress, or `MAX_TOPOLOGY_ITERS` is reached.
    //
    // When manifold batch_union succeeded the output is already a valid (or
    // near-valid) manifold mesh. Skip the topology-repair loop when the mesh
    // is clean or close-to-clean — i.e. very few residual NME / boundary edges.
    //
    // Why "close-to-clean" counts: after batch_union + verbatim fallback-body
    // append, the 2-10 residual NME/boundary edges live at support-to-body
    // attachment seams. These are inherent to the supported-print geometry and
    // no non-manifold face cleanup / micro-heal pass can resolve them — they
    // always roll back, wasting 8+ seconds per iteration. Skipping here is
    // correct: the slicing engine handles ≤ 10 NME edges fine, and attempting
    // to "fix" them only risks making the mesh worse.
    let post_solidify_clean = applied_self_intersection_path && {
        let s = analyze(&mesh);
        s.is_watertight || (s.non_manifold_edges <= 10 && s.boundary_edges <= 20)
    };
    const MAX_TOPOLOGY_ITERS: usize = 5;
    'topology_loop: for _iter in 0..MAX_TOPOLOGY_ITERS {
        if post_solidify_clean {
            break 'topology_loop;
        }
        let iter_state = analyze(&mesh);
        if iter_state.is_watertight {
            break 'topology_loop;
        }
        if iter_state.non_manifold_edges == 0 && iter_state.boundary_edges == 0 {
            break 'topology_loop;
        }

        if !run_topology_repair_pass(&mut mesh, options, &mut report) {
            // Neither pass made progress; further iterations won't help.
            break 'topology_loop;
        }
    }

    // 8b. Union overlapping parts once the topology passes have closed them.
    #[cfg(feature = "manifold")]
    if !applied_self_intersection_path
        && report.pre.connected_components > 1
        && report.pre.self_intersection_triangles > 0
    {
        let t = std::time::Instant::now();
        let components = triangle_components(&mesh);
        let before = mesh.clone();
        match topology_passes::union_closed_components(&mut mesh, &components) {
            Some((unioned, kept_tris)) => {
                prune_unused_vertices(&mut mesh);
                report.steps.push(RepairStepReport {
                    name: "union_overlapping_parts".into(),
                    changed: unioned as u32,
                    notes: Some(format!(
                        "{unioned} closed components unioned, {kept_tris} triangles kept verbatim, tris {} -> {}",
                        before.triangles.len(),
                        mesh.triangles.len()
                    )),
                    elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                });
                applied_self_intersection_path = true;
            }
            None => mesh = before,
        }
    }

    // 8c. Parts that touch keep one vertex record each through the union, while
    // a re-read of the exported STL welds them by position and can see seams
    // this mesh has not. Weld here and give the topology passes one more pass
    // at whatever that exposes.
    let t = std::time::Instant::now();
    let welded = mesh.weld_by_position();
    report.steps.push(RepairStepReport {
        name: "weld_position_duplicates".into(),
        changed: welded as u32,
        notes: None,
        elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
    });
    if welded > 0 {
        run_topology_repair_pass(&mut mesh, options, &mut report);
    }

    // 8d. Surfaces that still share an edge are separated rather than trimmed,
    // and the rims that exposes are filled. The offset is a few cells of the
    // import weld grid, so loading the exported file does not merge them again.
    // Faces the split leaves on a shared edge are sheets that merge back into
    // the surface; the face cleanup takes those, and the fill closes behind it.
    const MAX_SPLIT_ROUNDS: usize = 6;
    let offset = 4.0 * (options.weld_epsilon * mesh.bbox().diag()).max(1e-7);
    let mut before = analyze(&mesh);
    for _ in 0..MAX_SPLIT_ROUNDS {
        if before.non_manifold_edges == 0 {
            break;
        }
        let t = std::time::Instant::now();
        let mut candidate = mesh.clone();
        let walls = topology_passes::remove_coincident_faces(&mut candidate);
        let split = walls + topology_passes::split_non_manifold_edges(&mut candidate, offset);
        topology_passes::remove_open_fragments(&mut candidate, 16);
        let mut filled = fill_small_holes(&mut candidate, options.fill_holes_max_edges);
        let mut inner = report.clone();
        inner.steps.clear();
        run_topology_repair_pass(&mut candidate, options, &mut inner);
        filled += fill_small_holes(&mut candidate, options.fill_holes_max_edges);
        let mut after = analyze(&candidate);
        // Whatever no pairing can resolve is cut out and filled over.
        for _ in 0..3 {
            if after.non_manifold_edges + after.boundary_edges == 0 || after.non_manifold_edges > 64 {
                break;
            }
            let mut excised = candidate.clone();
            if topology_passes::excise_tangles(&mut excised) == 0 {
                break;
            }
            let refilled = fill_small_holes(&mut excised, options.fill_holes_max_edges);
            let check = analyze(&excised);
            if check.non_manifold_edges + check.boundary_edges
                >= after.non_manifold_edges + after.boundary_edges
            {
                break;
            }
            candidate = excised;
            filled += refilled;
            after = check;
        }
        let accepted = after.non_manifold_edges < before.non_manifold_edges
            && after.boundary_edges <= before.boundary_edges;
        report.steps.push(RepairStepReport {
            name: if accepted { "split_non_manifold_edges" } else { "rollback_split_non_manifold_edges" }.into(),
            changed: if accepted { (split + filled) as u32 } else { 0 },
            notes: Some(format!(
                "vertices split {split}, holes filled {filled}, nme {} -> {}, boundary {} -> {}",
                before.non_manifold_edges, after.non_manifold_edges, before.boundary_edges, after.boundary_edges
            )),
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
        if !accepted {
            break;
        }
        report.steps.extend(inner.steps);
        mesh = candidate;
        before = after;
    }

    // 9. Drop unused vertices (post-cull cleanup).
    let t = std::time::Instant::now();
    let pruned = prune_unused_vertices(&mut mesh);
    report.steps.push(RepairStepReport {
        name: "prune_unused_vertices".into(),
        changed: pruned as u32,
        notes: None,
        elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
    });

    // 10. Fallback model/support section split classification.
    //
    // Manifold batch-union already emits `model_triangle_count` for mixed
    // model+support imports. For non-manifold paths (or when manifold does
    // not run), attempt a conservative component-level split so frontend
    // per-section tinting can still work.
    if report.model_triangle_count.is_none() {
        let t = std::time::Instant::now();
        let class_res = classify_and_reorder_model_support_triangles(&mut mesh, options.assume_support_geometry);
        if let Some((model_tri_count, likely_support_geometry)) = class_res.split {
            report.model_triangle_count = Some(model_tri_count);
            if !report.likely_support_geometry {
                report.likely_support_geometry = likely_support_geometry;
            }
            report.steps.push(RepairStepReport {
                name: "classify_support_geometry_split".into(),
                changed: 0,
                notes: Some(format!(
                    "fallback split: first {} triangles tagged as model section",
                    model_tri_count
                )),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });
        }
    }

    // Post-analysis.
    report.post = analyze(&mesh);

    // Surface residual issues.
    let mut residuals: Vec<String> = Vec::new();
    if report.post.non_manifold_edges > 0 {
        residuals.push(format!(
            "{} non-manifold edges remain",
            report.post.non_manifold_edges
        ));
    }
    if report.post.boundary_edges > 0 {
        residuals.push(format!(
            "{} boundary edges remain across {} loop(s)",
            report.post.boundary_edges, report.post.boundary_loops
        ));
    }
    if report.post.self_intersection_triangles > 0 && !applied_self_intersection_path {
        if let Some(reason) = &solidify_rollback_reason {
            residuals.push(format!(
                "{} self-intersecting triangles detected (solidify attempt was rolled back: {reason})",
                report.post.self_intersection_triangles
            ));
        } else {
            residuals.push(format!(
                "{} self-intersecting triangles detected (pass resolve_self_intersections=true or enable solidify_fragmented_components=true to attempt repair)",
                report.post.self_intersection_triangles
            ));
        }
    }
    if applied_self_intersection_path && report.post.self_intersection_triangles > 0 {
        residuals.push(format!(
            "{} self-intersecting triangles remain after solidify pass",
            report.post.self_intersection_triangles
        ));
    }
    if report.post.inconsistent_winding_edges > 0 {
        residuals.push(format!(
            "{} inconsistently wound edges remain",
            report.post.inconsistent_winding_edges
        ));
    }
    if report.post.degenerate_triangles > 0 {
        residuals.push(format!(
            "{} degenerate (zero-area) triangles remain",
            report.post.degenerate_triangles
        ));
    }

    report.fully_repaired = residuals.is_empty();
    report.residual_issues = residuals;

    // Final validity gate: feed the model section (everything before the
    // support split, or the whole mesh when there is no split) through the
    // manifold_csg backend and inspect its status — the same check hollowing
    // and hole-punching rely on. Any non-manifold status (not just a
    // non-closed mesh) flags the model, and the frontend renders it red instead
    // of the usual model color. If the model is still not a valid manifold after
    // repair, the repair is reported as unsuccessful in the summary.
    #[cfg(feature = "manifold")]
    {
        record_model_manifold_status(&mesh, &mut report);
        if report.model_is_manifold == Some(false) {
            let detail = report
                .model_manifold_status
                .clone()
                .unwrap_or_else(|| "non-manifold model".into());
            report
                .residual_issues
                .push(format!("model is still not a valid manifold after repair ({detail})"));
            report.fully_repaired = false;
        }
    }

    report.total_ms = t_start.elapsed().as_secs_f64() * 1000.0;

    RepairOutcome { mesh, report }
}

/// Extract the model section — the first `model_tri_count` triangles, or every
/// triangle when there is no split — into a standalone [`IndexedMesh`] with
/// compacted (zero-based) vertex indices so it can be fed to `manifold_csg`.
#[cfg(feature = "manifold")]
fn extract_model_section_submesh(mesh: &IndexedMesh, model_tri_count: Option<usize>) -> IndexedMesh {
    let tri_end = model_tri_count
        .map(|n| n.min(mesh.triangles.len()))
        .unwrap_or(mesh.triangles.len());

    let mut vert_map: AHashMap<u32, u32> = AHashMap::new();
    let mut new_verts: Vec<Vec3> = Vec::new();
    let new_tris: Vec<[u32; 3]> = mesh.triangles[..tri_end]
        .iter()
        .map(|tri| {
            tri.map(|gi| {
                let next = new_verts.len() as u32;
                *vert_map.entry(gi).or_insert_with(|| {
                    new_verts.push(mesh.positions[gi as usize]);
                    next
                })
            })
        })
        .collect();

    IndexedMesh {
        positions: new_verts,
        triangles: new_tris,
    }
}

/// Runs the model section through the manifold_csg backend and returns its
/// status. `manifold_csg::Manifold::from_mesh_f32` rejects *any* mesh the CSG
/// backend flags — not only open/non-closed geometry but also `NotManifold`,
/// `NonFiniteVertex`, `VertexOutOfBounds`, etc. — returning
/// `Err(CsgError::ManifoldStatus(..))`, which is exactly the gate the hollowing
/// and hole-punching paths rely on. `Ok(())` means a valid, non-empty manifold;
/// `Err(reason)` carries the specific CSG status string.
#[cfg(feature = "manifold")]
fn model_section_manifold_status(
    mesh: &IndexedMesh,
    model_tri_count: Option<usize>,
) -> Result<(), String> {
    use manifold_csg::Manifold;

    let model = extract_model_section_submesh(mesh, model_tri_count);
    if model.triangles.is_empty() || model.positions.is_empty() {
        return Err("empty model section".into());
    }

    let positions: Vec<f32> = model.positions.iter().flat_map(|v| [v.x, v.y, v.z]).collect();
    let indices: Vec<u32> = model.triangles.iter().flat_map(|t| *t).collect();

    // Any non-`NoError` CSG status surfaces here as `Err` and is treated as a
    // failed manifold check, regardless of which non-manifold condition it is.
    let model = Manifold::from_mesh_f32(&positions, 3, &indices).map_err(|e| e.to_string())?;
    if model.is_empty() || model.num_tri() == 0 {
        return Err("manifold became empty".into());
    }
    Ok(())
}

/// Records the model section's manifold status onto `report`
/// (`model_is_manifold` + `model_manifold_status`). Shared by the full repair
/// routine and the lightweight classify pass.
#[cfg(feature = "manifold")]
fn record_model_manifold_status(mesh: &IndexedMesh, report: &mut MeshHealthReport) {
    match model_section_manifold_status(mesh, report.model_triangle_count) {
        Ok(()) => {
            report.model_is_manifold = Some(true);
            report.model_manifold_status = None;
        }
        Err(reason) => {
            report.model_is_manifold = Some(false);
            report.model_manifold_status = Some(reason);
        }
    }
}

/// Lightweight model/support section classification pass.
///
/// This does **not** run the repair pipeline. It only attempts to classify and
/// reorder triangles into model-first / support-second sections so the frontend
/// can apply section-specific tinting while honoring "Load As-Is" behavior.
pub fn classify_support_split(
    mut mesh: IndexedMesh,
    options: &RepairOptions,
) -> ClassificationOutcome {
    let t_start = std::time::Instant::now();

    // Pre-analysis with placeholder component count — the classifier
    // computes union-find internally and returns the real count, which
    // we use for both pre and post (classification only reorders
    // triangles; topology — and therefore component count — is unchanged).
    let pre = minimal_analysis(&mesh, 0);
    let mut report = MeshHealthReport::new(pre);

    if options.assume_support_geometry == Some(true) {
        report.likely_support_geometry = true;
    }

    let t = std::time::Instant::now();
    let class_res = classify_and_reorder_model_support_triangles(&mut mesh, options.assume_support_geometry);
    let component_count = if let Some((model_tri_count, likely_support_geometry)) = class_res.split {
        report.model_triangle_count = Some(model_tri_count);
        report.likely_support_geometry = likely_support_geometry;
        if options.assume_support_geometry == Some(true) {
            report.likely_support_geometry = true;
        }
        report.steps.push(RepairStepReport {
            name: "classify_support_geometry_split".into(),
            changed: 0,
            notes: Some(format!(
                "classify-only split: first {} triangles tagged as model section",
                model_tri_count
            )),
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
        class_res.component_count
    } else {
        report.steps.push(RepairStepReport {
            name: "classify_support_geometry_split".into(),
            changed: 0,
            notes: Some("classify-only split: no reliable model/support partition found".into()),
            elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
        });
        class_res.component_count
    };

    // Patch the pre-analysis with the real component count and build the
    // post-analysis (identical since only triangle order changed).
    report.pre.connected_components = component_count;
    report.post = minimal_analysis(&mesh, component_count);
    report.fully_repaired = true;
    report.residual_issues = Vec::new();

    // Same final manifold-status gate as the full repair routine: feed the
    // model section through manifold_csg and flag any non-manifold status so
    // the frontend can render a non-manifold model red.
    #[cfg(feature = "manifold")]
    record_model_manifold_status(&mesh, &mut report);

    report.total_ms = t_start.elapsed().as_secs_f64() * 1000.0;

    RepairOutcome { mesh, report }
}

/// Extract a single connected component into its own [`IndexedMesh`] with
/// compacted (zero-based) vertex indices.
///
/// `components` must be the output of [`triangle_components`] for `mesh`.
/// Only triangles where `components[fi] == comp_id` are included.
fn extract_component_submesh(mesh: &IndexedMesh, components: &[u32], comp_id: u32) -> IndexedMesh {
    // Collect face indices for this component.
    let face_iter = mesh
        .triangles
        .iter()
        .enumerate()
        .filter(|(fi, _)| components[*fi] == comp_id);

    // Build a compact vertex map: global index → local index.
    let mut vert_map: AHashMap<u32, u32> = AHashMap::new();
    let mut new_verts: Vec<Vec3> = Vec::new();

    let new_tris: Vec<[u32; 3]> = face_iter
        .map(|(_, tri)| {
            tri.map(|gi| {
                let next = new_verts.len() as u32;
                *vert_map.entry(gi).or_insert_with(|| {
                    new_verts.push(mesh.positions[gi as usize]);
                    next
                })
            })
        })
        .collect();

    IndexedMesh {
        positions: new_verts,
        triangles: new_tris,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GeometryGroup {
    Model,
    Support,
}

const RAFT_Z_CUTOFF_MM: f32 = 2.0;
const TOP_MODEL_BAND_MM: f32 = 1.0;
const MODEL_MIN_TRIS_FLOOR: usize = 200;

fn classify_model_support_group(
    cid: usize,
    raft_z_cut: f32,
    model_seed: Option<usize>,
    model_min_tris: usize,
    comp_max_z: &[f32],
    comp_tri_count: &[usize],
) -> GeometryGroup {
    // Anything in the raft floor band is support by definition.
    if comp_max_z[cid] <= raft_z_cut {
        return GeometryGroup::Support;
    }

    // High-poly components above raft are typically true model shells, even
    // if the highest-Z seed was a support tip.
    if comp_tri_count[cid] >= model_min_tris {
        return GeometryGroup::Model;
    }

    // Fall back to top-band assignment around the seed component.
    if let Some(seed) = model_seed {
        let top_z = comp_max_z[seed];
        if cid == seed || comp_max_z[cid] >= top_z - TOP_MODEL_BAND_MM {
            GeometryGroup::Model
        } else {
            GeometryGroup::Support
        }
    } else {
        GeometryGroup::Support
    }
}

/// Determines if an imported file should be treated as a 100% standalone support structure.
///
/// Prior to PLAN-3, an inequality heuristic flagged files where support triangles outnumber
/// model triangles (`support_triangles_out >= model_triangles_out`) as `likely_support_geometry = true`.
/// This caused files containing both a model body and heavy support scaffolds to import as ALL GOLD
/// even though a valid 2-section boundary (`model_triangle_count > 0`) was present for "Split Supports".
///
/// Under PLAN-3, `likely_support_geometry` evaluates to `true` ONLY when `model_triangles_out == 0`
/// (i.e. the file is 100% pure support geometry with no model body). When `model_triangles_out > 0`,
/// `likely_support_geometry` is `false`, allowing the mesh to render with a PINK model body and GOLD
/// support overlay, while keeping the "Split Supports" feature enabled.
fn compute_likely_support_geometry(
    model_triangles_out: usize,
    support_triangles_out: usize,
    _model_comp_count: usize,
    _support_comp_count: usize,
    _model_input_triangles: usize,
    _support_input_triangles: usize,
) -> bool {
    support_triangles_out > 0 && model_triangles_out == 0
}

/// Attempt to solidify a fragmented mesh by converting each connected
/// component into a `Manifold` solid.
///
/// Components are first classified into two geometric groups:
///
/// * **Model group**: top-down candidate body/bodies (highest-Z component,
///   plus near-top peers within a small Z band)
/// * **Support group**: all other geometry, including any component whose
///   highest point is at or below `global_min_z + 2 mm` (raft region)
///
/// Each group is batch-unioned internally, but the two groups are **not**
/// unioned with each other. This preserves a model body separate from the
/// support body instead of collapsing everything into one component.
///
/// As with the previous path, each component is attempted with preferred
/// winding then reversed winding. Rejected components run through rescue tiers
/// and are merged only into their own group.
///
/// Returns `None` if no manifold-capable component exists, which causes the
/// caller to fall back to the corefine path.
///
/// On success returns `(mesh, manifold_accepted, fallback_rescued,
/// fallback_kept, fallback_dropped, likely_support_geometry)` where the counts
/// describe how each input component was handled.
///
/// Requires the `manifold` Cargo feature.
#[cfg(feature = "manifold")]
fn try_solidify_via_manifold_union(
    mesh: &IndexedMesh,
    options: &RepairOptions,
) -> Option<(IndexedMesh, usize, usize, usize, usize, bool, usize)> {
    use manifold_csg::Manifold;

    let components = triangle_components(mesh);
    let n_comps = components.iter().copied().max().unwrap_or(0) as usize + 1;

    let global_min_z = mesh
        .positions
        .iter()
        .map(|p| p.z)
        .fold(f32::INFINITY, f32::min);
    let raft_z_cut = global_min_z + RAFT_Z_CUTOFF_MM;

    let mut comp_max_z = vec![f32::NEG_INFINITY; n_comps];
    let mut comp_tri_count = vec![0usize; n_comps];
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let cid = components[fi] as usize;
        comp_tri_count[cid] += 1;
        let z0 = mesh.positions[tri[0] as usize].z;
        let z1 = mesh.positions[tri[1] as usize].z;
        let z2 = mesh.positions[tri[2] as usize].z;
        comp_max_z[cid] = comp_max_z[cid].max(z0.max(z1).max(z2));
    }

    let model_seed = (0..n_comps)
        .filter(|&cid| comp_tri_count[cid] >= 4 && comp_max_z[cid] > raft_z_cut)
        .max_by(|&a, &b| {
            comp_max_z[a]
                .partial_cmp(&comp_max_z[b])
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    let model_min_tris = model_seed
        .map(|seed| (comp_tri_count[seed] / 8).max(MODEL_MIN_TRIS_FLOOR))
        .unwrap_or(MODEL_MIN_TRIS_FLOOR);

    let classify_group = |cid: usize| {
        if options.assume_support_geometry == Some(true) {
            GeometryGroup::Support
        } else {
            classify_model_support_group(
                cid,
                raft_z_cut,
                model_seed,
                model_min_tris,
                &comp_max_z,
                &comp_tri_count,
            )
        }
    };

    let mut model_manifolds: Vec<Manifold> = Vec::with_capacity(n_comps.min(4096));
    let mut support_manifolds: Vec<Manifold> = Vec::with_capacity(n_comps.min(4096));
    let mut manifold_accepted: usize = 0;
    let mut model_input_components = 0usize;
    let mut support_input_components = 0usize;
    let mut model_input_triangles = 0usize;
    let mut support_input_triangles = 0usize;
    // Components that could not be converted even with reversed winding.
    // These are rescued/kept in their original geometry group.
    let mut fallback_meshes: Vec<(IndexedMesh, GeometryGroup)> = Vec::new();

    for comp_id in 0..n_comps as u32 {
        let group = classify_group(comp_id as usize);
        let sub = extract_component_submesh(mesh, &components, comp_id);
        if sub.triangles.len() < 4 {
            // Truly degenerate micro-fragment — safe to drop.
            continue;
        }

        match group {
            GeometryGroup::Model => {
                model_input_components += 1;
                model_input_triangles += sub.triangles.len();
            }
            GeometryGroup::Support => {
                support_input_components += 1;
                support_input_triangles += sub.triangles.len();
            }
        }

        let vert_props: Vec<f32> = sub.positions.iter().flat_map(|v| [v.x, v.y, v.z]).collect();

        // Pre-check the mesh's own signed volume BEFORE sending to manifold.
        // If the component is inside-out (signed_volume < 0), manifold3d
        // accepts it but records it as a negative-volume solid. When
        // batch_union runs, a negative-volume manifold acts as a CSG void
        // and SUBTRACTS from the positive-volume union instead of uniting —
        // producing the "cut away" / "hole punched" artefact we see with
        // defective bottom primitives. Reversing the winding up-front ensures
        // manifold always receives a positive-volume solid.
        let vol = sub.signed_volume();
        let is_inside_out = vol < 0.0;

        let (forward, reversed): (Vec<u32>, Vec<u32>) = {
            let fwd: Vec<u32> = sub.triangles.iter().flat_map(|t| *t).collect();
            let rev: Vec<u32> = sub
                .triangles
                .iter()
                .flat_map(|[a, b, c]| [*a, *c, *b])
                .collect();
            if is_inside_out {
                (rev, fwd) // try the corrected winding first
            } else {
                (fwd, rev)
            }
        };

        // Attempt 1: geometrically correct winding (or the original if volume
        // was already positive).
        match Manifold::from_mesh_f32(&vert_props, 3, &forward) {
            Ok(m) if !m.is_empty() && m.num_tri() > 0 => {
                manifold_accepted += 1;
                match group {
                    GeometryGroup::Model => model_manifolds.push(m),
                    GeometryGroup::Support => support_manifolds.push(m),
                }
                continue;
            }
            _ => {}
        }

        // Attempt 2: opposite winding — catches the remaining cases where the
        // mesh is open/NME with mixed winding; may still produce a closeable
        // manifold with the other orientation.
        match Manifold::from_mesh_f32(&vert_props, 3, &reversed) {
            Ok(m) if !m.is_empty() && m.num_tri() > 0 => {
                manifold_accepted += 1;
                match group {
                    GeometryGroup::Model => model_manifolds.push(m),
                    GeometryGroup::Support => support_manifolds.push(m),
                }
            }
            _ => {
                fallback_meshes.push((sub, group));
            }
        }
    }

    if model_manifolds.is_empty() && support_manifolds.is_empty() {
        return None;
    }

    let mut model_out_positions: Vec<Vec3> = Vec::new();
    let mut model_out_triangles: Vec<[u32; 3]> = Vec::new();
    let mut support_out_positions: Vec<Vec3> = Vec::new();
    let mut support_out_triangles: Vec<[u32; 3]> = Vec::new();

    if !model_manifolds.is_empty() {
        let m = Manifold::batch_union(&model_manifolds);
        if !m.is_empty() && m.num_tri() > 0 {
            let (vp, np, ti) = m.to_mesh_f32();
            debug_assert_eq!(np, 3);
            model_out_positions = vp
                .chunks_exact(np)
                .map(|c| Vec3::new(c[0], c[1], c[2]))
                .collect();
            model_out_triangles = ti.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
        }
    }

    if !support_manifolds.is_empty() {
        let m = Manifold::batch_union(&support_manifolds);
        if !m.is_empty() && m.num_tri() > 0 {
            let (vp, np, ti) = m.to_mesh_f32();
            debug_assert_eq!(np, 3);
            support_out_positions = vp
                .chunks_exact(np)
                .map(|c| Vec3::new(c[0], c[1], c[2]))
                .collect();
            support_out_triangles = ti.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
        }
    }

    if model_out_triangles.is_empty() && support_out_triangles.is_empty() {
        return None;
    }

    let union_into_group =
        |out_positions: &mut Vec<Vec3>, out_triangles: &mut Vec<[u32; 3]>, m: &Manifold| {
            if out_triangles.is_empty() {
                let (vp, np, ti) = m.to_mesh_f32();
                if ti.is_empty() {
                    return false;
                }
                *out_positions = vp
                    .chunks_exact(np)
                    .map(|c| Vec3::new(c[0], c[1], c[2]))
                    .collect();
                *out_triangles = ti.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
                return true;
            }

            let cur_props = Manifold::from_mesh_f32(
                &out_positions
                    .iter()
                    .flat_map(|v| [v.x, v.y, v.z])
                    .collect::<Vec<_>>(),
                3,
                &out_triangles.iter().flat_map(|t| *t).collect::<Vec<_>>(),
            )
            .ok()
            .map(|cur_m| cur_m.union(m).to_mesh_f32());

            if let Some((vp, np, ti)) = cur_props {
                *out_positions = vp
                    .chunks_exact(np)
                    .map(|c| Vec3::new(c[0], c[1], c[2]))
                    .collect();
                *out_triangles = ti.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
                true
            } else {
                false
            }
        };

    // Sort fallbacks largest-first so the model body (largest) is processed
    // first and tagged correctly for future workflows.
    //
    // FUTURE: fallback_meshes[0] (largest kept fallback) is the "model body"
    // candidate for a DragonFruit remove-pre-supports workflow.
    fallback_meshes.sort_unstable_by(|(a, _), (b, _)| b.triangles.len().cmp(&a.triangles.len()));
    let mut fallback_kept = 0usize;
    let mut fallback_rescued = 0usize;
    let mut fallback_dropped = 0usize;

    for (mut fb, group) in fallback_meshes {
        // Truly degenerate micro-shard — nothing to save.
        if fb.triangles.len() < 4 {
            fallback_dropped += 1;
            continue;
        }

        let (out_positions, out_triangles) = match group {
            GeometryGroup::Model => (&mut model_out_positions, &mut model_out_triangles),
            GeometryGroup::Support => (&mut support_out_positions, &mut support_out_triangles),
        };

        // Model body is geometry-critical. If manifold rejected it after both
        // winding attempts, do not run aggressive reconstruction (large-hole
        // fill / convex hull), as that can collapse detail into a blob.
        // Preserve it verbatim and let support geometry absorb the aggressive
        // rescue strategy instead.
        if matches!(group, GeometryGroup::Model) {
            fallback_kept += 1;
            let offset = out_positions.len() as u32;
            out_positions.extend_from_slice(&fb.positions);
            out_triangles.extend(
                fb.triangles
                    .iter()
                    .map(|[a, b, c]| [a + offset, b + offset, c + offset]),
            );
            continue;
        }

        // ── Rescue pass: orient + fill holes, then retry manifold ────────────
        //
        // Many components that manifold rejected are small closed primitives
        // (Lego-like support bases, contact spheres, etc.) with a handful of
        // open boundary edges or inconsistent winding. A single orient +
        // fill_small_holes pass is often enough to close them so they can be
        // properly boolean-unioned rather than just appended verbatim.
        repair_orientation(&mut fb);
        fill_small_holes(&mut fb, 64); // generous limit for small primitives

        let vert_props: Vec<f32> = fb.positions.iter().flat_map(|v| [v.x, v.y, v.z]).collect();
        let vol = fb.signed_volume();
        let (forward_r, reversed_r): (Vec<u32>, Vec<u32>) = {
            let fwd: Vec<u32> = fb.triangles.iter().flat_map(|t| *t).collect();
            let rev: Vec<u32> = fb
                .triangles
                .iter()
                .flat_map(|[a, b, c]| [*a, *c, *b])
                .collect();
            if vol < 0.0 {
                (rev, fwd)
            } else {
                (fwd, rev)
            }
        };

        let mut rescued = false;
        'rescue: for attempt in [&forward_r, &reversed_r] {
            if let Ok(m) = Manifold::from_mesh_f32(&vert_props, 3, attempt) {
                if !m.is_empty() && m.num_tri() > 0 {
                    // Successfully closed — union it with this group's output.
                    if union_into_group(out_positions, out_triangles, &m) {
                        fallback_rescued += 1;
                        rescued = true;
                        break 'rescue;
                    }
                }
            }
        }

        if !rescued {
            // ── Tier-2 rescue: aggressive weld + large-hole fill ─────────────
            //
            // fill_small_holes(64) only closes holes with ≤ 64 boundary edges.
            // Some primitives have larger open areas.  Weld near-duplicate
            // vertices first (tiny epsilon to avoid geometry distortion), then
            // fill with no effective limit, then retry manifold.
            weld_vertices(&mut fb, 1e-4);
            repair_orientation(&mut fb);
            fill_small_holes(&mut fb, 65536);

            let vert_props2: Vec<f32> = fb.positions.iter().flat_map(|v| [v.x, v.y, v.z]).collect();
            let vol2 = fb.signed_volume();
            let (fwd2, rev2): (Vec<u32>, Vec<u32>) = {
                let fwd: Vec<u32> = fb.triangles.iter().flat_map(|t| *t).collect();
                let rev: Vec<u32> = fb
                    .triangles
                    .iter()
                    .flat_map(|[a, b, c]| [*a, *c, *b])
                    .collect();
                if vol2 < 0.0 {
                    (rev, fwd)
                } else {
                    (fwd, rev)
                }
            };
            'rescue2: for attempt in [&fwd2, &rev2] {
                if let Ok(m) = Manifold::from_mesh_f32(&vert_props2, 3, attempt) {
                    if !m.is_empty() && m.num_tri() > 0 {
                        if union_into_group(out_positions, out_triangles, &m) {
                            fallback_rescued += 1;
                            rescued = true;
                            break 'rescue2;
                        }
                    }
                }
            }
        }

        if !rescued {
            // ── Tier-3 rescue: convex hull approximation ──────────────────────
            //
            // If the component is still not manifold-able after aggressive
            // repair, fall back to its convex hull.  The hull is always a
            // valid closed manifold; for small support primitives it is a
            // reasonable geometric approximation that covers the same spatial
            // region without introducing intersecting open-surface bodies into
            // the output that would cause the slicer to glitch.
            let pts: Vec<[f64; 3]> = fb
                .positions
                .iter()
                .map(|v| [v.x as f64, v.y as f64, v.z as f64])
                .collect();
            if !pts.is_empty() {
                let hull = Manifold::hull_pts(&pts);
                if !hull.is_empty() && hull.num_tri() > 0 {
                    if union_into_group(out_positions, out_triangles, &hull) {
                        fallback_rescued += 1;
                        rescued = true;
                    }
                }
            }
        }

        if !rescued {
            // All three rescue tiers failed.  Append verbatim as last resort
            // rather than silently dropping real geometry.
            fallback_kept += 1;
            let offset = out_positions.len() as u32;
            out_positions.extend_from_slice(&fb.positions);
            out_triangles.extend(
                fb.triangles
                    .iter()
                    .map(|[a, b, c]| [a + offset, b + offset, c + offset]),
            );
        }
    }

    // Preserve logical separation: model body first, then support body.
    let mut out_positions = model_out_positions;
    let mut out_triangles = model_out_triangles;
    let model_triangles_out = out_triangles.len();
    let support_offset = out_positions.len() as u32;
    out_positions.extend_from_slice(&support_out_positions);
    out_triangles.extend(
        support_out_triangles
            .into_iter()
            .map(|[a, b, c]| [a + support_offset, b + support_offset, c + support_offset]),
    );

    let support_triangles_out = (out_triangles.len()).saturating_sub(model_triangles_out);
    let likely_support_geometry = if options.assume_support_geometry == Some(true) {
        true
    } else {
        compute_likely_support_geometry(
            model_triangles_out,
            support_triangles_out,
            model_input_components,
            support_input_components,
            model_input_triangles,
            support_input_triangles,
        )
    };

    Some((
        IndexedMesh {
            positions: out_positions,
            triangles: out_triangles,
        },
        manifold_accepted,
        fallback_rescued,
        fallback_kept,
        fallback_dropped,
        likely_support_geometry,
        model_triangles_out,
    ))
}

fn solidify_regression_reason(before: &MeshAnalysis, after: &MeshAnalysis) -> Option<String> {
    fn is_explosive_increase(
        before: usize,
        after: usize,
        min_delta: usize,
        min_ratio: usize,
    ) -> bool {
        if after <= before {
            return false;
        }
        let delta = after - before;
        if delta < min_delta {
            return false;
        }
        if before == 0 {
            return after >= min_delta;
        }
        after >= before.saturating_mul(min_ratio)
    }

    if is_explosive_increase(before.boundary_edges, after.boundary_edges, 2048, 8) {
        return Some(format!(
            "boundary edges exploded {} -> {}",
            before.boundary_edges, after.boundary_edges
        ));
    }

    if is_explosive_increase(before.non_manifold_edges, after.non_manifold_edges, 512, 4) {
        return Some(format!(
            "non-manifold edges regressed {} -> {}",
            before.non_manifold_edges, after.non_manifold_edges
        ));
    }

    if is_explosive_increase(
        before.connected_components,
        after.connected_components,
        512,
        2,
    ) {
        return Some(format!(
            "component count exploded {} -> {}",
            before.connected_components, after.connected_components
        ));
    }

    // Catastrophic geometry collapse guard: union extraction should not erase
    // almost the entire model while claiming success.
    if before.triangle_count > 0 {
        // Require at least 10% of triangles to remain unless the input was
        // already tiny. This catches pathological over-pruning where we keep
        // only a handful of shards.
        if before.triangle_count >= 10_000
            && after.triangle_count.saturating_mul(10) < before.triangle_count
        {
            return Some(format!(
                "triangle count collapsed {} -> {}",
                before.triangle_count, after.triangle_count
            ));
        }
    }

    // Volume should remain broadly consistent for a union-style extraction.
    // A huge drop indicates we kept only residual fragments.
    let before_abs_vol = before.signed_volume.abs();
    let after_abs_vol = after.signed_volume.abs();
    if before_abs_vol > 1e-3 && after_abs_vol < before_abs_vol * 0.20 {
        return Some(format!(
            "signed volume collapsed {:.3} -> {:.3}",
            before.signed_volume, after.signed_volume
        ));
    }

    if after.triangle_count > 0 {
        // Post-solidify output with a large duplicate fraction is unstable and
        // typically indicates degeneracy in extracted fragments.
        if after.duplicate_triangles.saturating_mul(8) > after.triangle_count {
            return Some(format!(
                "duplicate triangle ratio too high {}/{}",
                after.duplicate_triangles, after.triangle_count
            ));
        }
    }

    if after.self_intersection_triangles >= before.self_intersection_triangles
        && (after.boundary_edges > before.boundary_edges.saturating_add(256)
            || after.non_manifold_edges > before.non_manifold_edges.saturating_add(128))
    {
        return Some(format!(
            "self-intersections did not improve ({} -> {}) while topology worsened",
            before.self_intersection_triangles, after.self_intersection_triangles
        ));
    }

    None
}

#[derive(Debug)]
enum MicroHealOutcome {
    Skipped,
    Applied { changed: usize, notes: String },
    RolledBack { notes: String },
}

#[derive(Debug)]
enum NonManifoldFaceCleanupOutcome {
    Skipped,
    Applied { changed: usize, notes: String },
    RolledBack { notes: String },
}

/// One ordered pass of the two topology-repair passes: targeted non-manifold
/// face cleanup, then the last-mile micro topology heal. Both are internally
/// gated and rollback-protected; returns whether either made progress.
fn run_topology_repair_pass(
    mesh: &mut IndexedMesh,
    options: &RepairOptions,
    report: &mut MeshHealthReport,
) -> bool {
    let mut progress = false;

    // 7. Targeted non-manifold face cleanup (VCGlib-inspired), rollback-safe.
    let t = std::time::Instant::now();
    match attempt_non_manifold_face_cleanup(mesh, options.fill_holes_max_edges) {
        NonManifoldFaceCleanupOutcome::Skipped => {}
        NonManifoldFaceCleanupOutcome::Applied { changed, notes } => {
            progress = true;
            report.steps.push(RepairStepReport {
                name: "remove_non_manifold_faces".into(),
                changed: changed as u32,
                notes: Some(notes),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });

            // Re-orient after topology edits so winding coherence has a chance
            // to recover before the micro-heal pass.
            if options.repair_orientation {
                let t = std::time::Instant::now();
                let flipped = repair_orientation(mesh);
                report.steps.push(RepairStepReport {
                    name: "orient_components_post_non_manifold_cleanup".into(),
                    changed: flipped as u32,
                    notes: None,
                    elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                });
            }
        }
        NonManifoldFaceCleanupOutcome::RolledBack { notes } => {
            report.steps.push(RepairStepReport {
                name: "rollback_non_manifold_cleanup".into(),
                changed: 0,
                notes: Some(notes),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });
        }
    }

    // 8. Last-mile micro topology heal for tiny residual defects.
    //
    // This targets cases like support-heavy imported meshes where we end up
    // with a handful of non-manifold/boundary edges after the main passes.
    let t = std::time::Instant::now();
    match attempt_micro_topology_heal(mesh, options.fill_holes_max_edges) {
        MicroHealOutcome::Skipped => {}
        MicroHealOutcome::Applied { changed, notes } => {
            progress = true;
            report.steps.push(RepairStepReport {
                name: "micro_topology_heal".into(),
                changed: changed as u32,
                notes: Some(notes),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });

            // Re-run orientation after local topology surgery.
            if options.repair_orientation {
                let t = std::time::Instant::now();
                let flipped = repair_orientation(mesh);
                report.steps.push(RepairStepReport {
                    name: "orient_components_post_micro_heal".into(),
                    changed: flipped as u32,
                    notes: None,
                    elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
                });
            }
        }
        MicroHealOutcome::RolledBack { notes } => {
            report.steps.push(RepairStepReport {
                name: "rollback_micro_topology_heal".into(),
                changed: 0,
                notes: Some(notes),
                elapsed_ms: t.elapsed().as_secs_f64() * 1000.0,
            });
        }
    }

    progress
}

fn attempt_non_manifold_face_cleanup(
    mesh: &mut IndexedMesh,
    fill_holes_max_edges: usize,
) -> NonManifoldFaceCleanupOutcome {
    if mesh.triangles.is_empty() {
        return NonManifoldFaceCleanupOutcome::Skipped;
    }

    let topo = Topology::build(mesh);
    let non_manifold_edges = topo.non_manifold_edges();
    if non_manifold_edges.is_empty() {
        return NonManifoldFaceCleanupOutcome::Skipped;
    }

    // Keep this pass bounded. We use it as a targeted cleanup step, not a full
    // remeshing strategy.
    const MAX_NON_MANIFOLD_EDGES: usize = 4096;
    if non_manifold_edges.len() > MAX_NON_MANIFOLD_EDGES {
        return NonManifoldFaceCleanupOutcome::Skipped;
    }

    let before = analyze(mesh);
    let mesh_before = mesh.clone();

    let mut faces_to_remove: AHashSet<u32> = AHashSet::new();

    for edge in &non_manifold_edges {
        let Some(info) = topo.edges.get(edge) else {
            continue;
        };

        // Keep at most one face for each direction across this edge (if
        // possible), preferring larger-area faces. This approximates manifold
        // pairing and avoids random sliver retention.
        let mut best_forward: Option<(u32, f32)> = None;
        let mut best_backward: Option<(u32, f32)> = None;
        let mut ranked_all: Vec<(u32, f32)> = Vec::new();

        for &(from, to, fi) in &info.directed {
            let area = mesh.tri_area(fi);
            ranked_all.push((fi, area));

            if from == edge.0 && to == edge.1 {
                match best_forward {
                    Some((_, best_area)) if best_area >= area => {}
                    _ => best_forward = Some((fi, area)),
                }
            } else {
                match best_backward {
                    Some((_, best_area)) if best_area >= area => {}
                    _ => best_backward = Some((fi, area)),
                }
            }
        }

        let mut keep: AHashSet<u32> = AHashSet::new();
        if let Some((fi, _)) = best_forward {
            keep.insert(fi);
        }
        if let Some((fi, _)) = best_backward {
            keep.insert(fi);
        }

        // If all faces happen to share one direction, keep the two largest.
        if keep.len() < 2 {
            ranked_all.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            for (fi, _) in ranked_all.into_iter().take(2) {
                keep.insert(fi);
            }
        }

        for &fi in &info.faces {
            if !keep.contains(&fi) {
                faces_to_remove.insert(fi);
            }
        }
    }

    if faces_to_remove.is_empty() {
        return NonManifoldFaceCleanupOutcome::Skipped;
    }

    let tri_before = mesh.triangles.len();
    mesh.triangles = mesh
        .triangles
        .iter()
        .enumerate()
        .filter_map(|(fi, tri)| {
            if faces_to_remove.contains(&(fi as u32)) {
                None
            } else {
                Some(*tri)
            }
        })
        .collect();

    let removed = tri_before - mesh.triangles.len();
    let culled_pre = cull_degenerate_and_duplicate(mesh);
    let filled = fill_small_holes(mesh, fill_holes_max_edges.clamp(8, 96));
    let culled_post = cull_degenerate_and_duplicate(mesh);

    let mut adaptive_fill = 0usize;
    let mut adaptive_cull = 0usize;
    let mut adaptive_limit_used: Option<usize> = None;

    let mut after = analyze(mesh);

    // When cleanup opens a previously closed mesh, retry hole filling with a
    // larger boundary budget. This salvages common ring-like openings without
    // needing to accept a boundary-heavy intermediate result.
    if before.boundary_edges == 0
        && before.boundary_loops == 0
        && after.boundary_edges > 0
        && after.boundary_loops > 0
    {
        let adaptive_limit = fill_holes_max_edges.max(256).min(2048);
        let mesh_before_adaptive_retry = mesh.clone();
        let adaptive_filled_candidate = fill_small_holes(mesh, adaptive_limit);

        if adaptive_filled_candidate > 0 {
            let adaptive_culled_candidate = cull_degenerate_and_duplicate(mesh);
            let retry_after = analyze(mesh);

            let helped_boundary = retry_after.boundary_edges < after.boundary_edges
                || retry_after.boundary_loops < after.boundary_loops;
            let did_not_worsen_nme = retry_after.non_manifold_edges <= after.non_manifold_edges;
            let did_not_worsen_si =
                retry_after.self_intersection_triangles <= after.self_intersection_triangles;

            if helped_boundary && did_not_worsen_nme && did_not_worsen_si {
                adaptive_fill = adaptive_filled_candidate;
                adaptive_cull = adaptive_culled_candidate;
                adaptive_limit_used = Some(adaptive_limit);
                after = retry_after;
            } else {
                *mesh = mesh_before_adaptive_retry;
            }
        }
    }
    let improved = non_manifold_cleanup_is_improvement(&before, &after);
    let hard_regression = non_manifold_cleanup_is_hard_regression(&before, &after);

    if !improved || hard_regression {
        *mesh = mesh_before;
        return NonManifoldFaceCleanupOutcome::RolledBack {
            notes: format!(
                "rolled back non-manifold cleanup: nme {} -> {}, boundary {} -> {}, inconsistent {} -> {}, self_int {} -> {}, degenerate {} -> {}, duplicate {} -> {}",
                before.non_manifold_edges,
                after.non_manifold_edges,
                before.boundary_edges,
                after.boundary_edges,
                before.inconsistent_winding_edges,
                after.inconsistent_winding_edges,
                before.self_intersection_triangles,
                after.self_intersection_triangles,
                before.degenerate_triangles,
                after.degenerate_triangles,
                before.duplicate_triangles,
                after.duplicate_triangles,
            ),
        };
    }

    NonManifoldFaceCleanupOutcome::Applied {
        changed: removed + culled_pre + filled + culled_post + adaptive_fill + adaptive_cull,
        notes: format!(
            "nme {} -> {}, boundary {} -> {}, inconsistent {} -> {}, self_int {} -> {} (removed={}, culled_pre={}, filled={}, culled_post={}{})",
            before.non_manifold_edges,
            after.non_manifold_edges,
            before.boundary_edges,
            after.boundary_edges,
            before.inconsistent_winding_edges,
            after.inconsistent_winding_edges,
            before.self_intersection_triangles,
            after.self_intersection_triangles,
            removed,
            culled_pre,
            filled,
            culled_post,
            match adaptive_limit_used {
                Some(limit) => format!(
                    ", adaptive_fill(limit={})={}, adaptive_cull={}",
                    limit, adaptive_fill, adaptive_cull
                ),
                None => String::new(),
            },
        ),
    }
}

fn non_manifold_cleanup_is_improvement(before: &MeshAnalysis, after: &MeshAnalysis) -> bool {
    if after.is_watertight {
        return true;
    }

    // Primary target is reducing non-manifold edges without damaging other
    // critical quality indicators.
    after.non_manifold_edges < before.non_manifold_edges
        && after.self_intersection_triangles <= before.self_intersection_triangles.saturating_add(64)
        && after.degenerate_triangles <= before.degenerate_triangles
        && after.duplicate_triangles <= before.duplicate_triangles
}

fn has_self_intersection_reduction_at_least(
    before_self_intersections: usize,
    after_self_intersections: usize,
    min_percent: usize,
) -> bool {
    if before_self_intersections == 0 {
        return false;
    }

    let reduced = before_self_intersections.saturating_sub(after_self_intersections);
    reduced.saturating_mul(100) >= before_self_intersections.saturating_mul(min_percent)
}

fn non_manifold_cleanup_is_hard_regression(before: &MeshAnalysis, after: &MeshAnalysis) -> bool {
    // Guard: avoid destructive "fixes" that open large seams on previously
    // closed meshes without materially reducing self-intersections.
    let introduced_large_boundary_from_closed_mesh = before.boundary_edges == 0
        && before.boundary_loops == 0
        && after.boundary_edges >= 64
        && after.boundary_loops > 0
        && (before.self_intersection_triangles == 0
            || !has_self_intersection_reduction_at_least(
                before.self_intersection_triangles,
                after.self_intersection_triangles,
                35,
            ));

    // Guard: reject explosive boundary growth unless self-intersection relief is
    // meaningfully large.
    let boundary_growth_is_explosive = after.boundary_edges
        > before.boundary_edges.saturating_add(256)
        && after.boundary_edges >= std::cmp::max(128, before.boundary_edges.saturating_mul(4));
    let explosive_growth_without_relief = boundary_growth_is_explosive
        && (before.self_intersection_triangles == 0
            || !has_self_intersection_reduction_at_least(
                before.self_intersection_triangles,
                after.self_intersection_triangles,
                20,
            ));

    introduced_large_boundary_from_closed_mesh
        || explosive_growth_without_relief
        || after.inconsistent_winding_edges > before.inconsistent_winding_edges.saturating_add(64)
        || after.self_intersection_triangles > before.self_intersection_triangles.saturating_add(64)
        || after.connected_components > before.connected_components.saturating_add(512)
}

fn attempt_micro_topology_heal(
    mesh: &mut IndexedMesh,
    fill_holes_max_edges: usize,
) -> MicroHealOutcome {
    if mesh.triangles.is_empty() {
        return MicroHealOutcome::Skipped;
    }

    let topo = Topology::build(mesh);
    let non_manifold_edges = topo.non_manifold_edges();
    let boundary_edges = topo.boundary_edges();

    if non_manifold_edges.is_empty() && boundary_edges.is_empty() {
        return MicroHealOutcome::Skipped;
    }

    // Keep this as a targeted "last mile" fixer only.
    const MAX_NON_MANIFOLD_EDGES: usize = 32;
    const MAX_BOUNDARY_EDGES: usize = 16;
    if non_manifold_edges.len() > MAX_NON_MANIFOLD_EDGES
        || boundary_edges.len() > MAX_BOUNDARY_EDGES
    {
        return MicroHealOutcome::Skipped;
    }

    let before = analyze(mesh);
    let mesh_before = mesh.clone();

    let mut faces_to_remove: ahash::AHashSet<u32> = ahash::AHashSet::new();

    // Always remove faces touching non-manifold edges.
    for edge in &non_manifold_edges {
        if let Some(info) = topo.edges.get(edge) {
            for &fi in &info.faces {
                faces_to_remove.insert(fi);
            }
        }
    }

    // For tiny residual boundary slits, remove incident faces as well, then
    // close the resulting micro-hole deterministically.
    if boundary_edges.len() <= 8 {
        for edge in &boundary_edges {
            if let Some(info) = topo.edges.get(edge) {
                for &fi in &info.faces {
                    faces_to_remove.insert(fi);
                }
            }
        }
    }

    if faces_to_remove.is_empty() {
        return MicroHealOutcome::Skipped;
    }

    let tri_before = mesh.triangles.len();
    mesh.triangles = mesh
        .triangles
        .iter()
        .enumerate()
        .filter_map(|(fi, tri)| {
            if faces_to_remove.contains(&(fi as u32)) {
                None
            } else {
                Some(*tri)
            }
        })
        .collect();
    let removed = tri_before - mesh.triangles.len();

    let culled_before_fill = cull_degenerate_and_duplicate(mesh);
    let filled = fill_small_holes(mesh, fill_holes_max_edges.clamp(8, 128));
    let culled_after_fill = cull_degenerate_and_duplicate(mesh);

    let after = analyze(mesh);
    let before_score =
        before.non_manifold_edges + before.boundary_edges + before.inconsistent_winding_edges;
    let after_score =
        after.non_manifold_edges + after.boundary_edges + after.inconsistent_winding_edges;

    let improved = micro_heal_is_improvement(&before, &after, before_score, after_score);
    let hard_regression = micro_heal_is_hard_regression(&before, &after);

    if !improved || hard_regression {
        *mesh = mesh_before;
        return MicroHealOutcome::RolledBack {
            notes: format!(
                "rolled back micro topology heal: score {} -> {}, nme {} -> {}, boundary {} -> {}, inconsistent {} -> {}, self_int {} -> {}, degenerate {} -> {}, duplicate {} -> {}",
                before_score,
                after_score,
                before.non_manifold_edges,
                after.non_manifold_edges,
                before.boundary_edges,
                after.boundary_edges,
                before.inconsistent_winding_edges,
                after.inconsistent_winding_edges,
                before.self_intersection_triangles,
                after.self_intersection_triangles,
                before.degenerate_triangles,
                after.degenerate_triangles,
                before.duplicate_triangles,
                after.duplicate_triangles,
            ),
        };
    }

    MicroHealOutcome::Applied {
        changed: removed + culled_before_fill + culled_after_fill + filled,
        notes: format!(
            "nme {} -> {}, boundary {} -> {}, inconsistent {} -> {}, self_int {} -> {}, degenerate {} -> {}, duplicate {} -> {} (removed={}, culled_pre={}, filled={}, culled_post={})",
            before.non_manifold_edges,
            after.non_manifold_edges,
            before.boundary_edges,
            after.boundary_edges,
            before.inconsistent_winding_edges,
            after.inconsistent_winding_edges,
            before.self_intersection_triangles,
            after.self_intersection_triangles,
            before.degenerate_triangles,
            after.degenerate_triangles,
            before.duplicate_triangles,
            after.duplicate_triangles,
            removed,
            culled_before_fill,
            filled,
            culled_after_fill,
        ),
    }
}

fn micro_heal_is_improvement(
    before: &MeshAnalysis,
    after: &MeshAnalysis,
    before_score: usize,
    after_score: usize,
) -> bool {
    if after.is_watertight {
        return true;
    }

    // Strict acceptance: only keep if the primary edge-defect score improves
    // and we don't regress other critical defect classes.
    after_score < before_score
        && after.self_intersection_triangles <= before.self_intersection_triangles
        && after.degenerate_triangles <= before.degenerate_triangles
        && after.duplicate_triangles <= before.duplicate_triangles
}

fn micro_heal_is_hard_regression(before: &MeshAnalysis, after: &MeshAnalysis) -> bool {
    after.boundary_edges > before.boundary_edges.saturating_add(64)
        || after.non_manifold_edges > before.non_manifold_edges.saturating_add(32)
        || after.inconsistent_winding_edges > before.inconsistent_winding_edges.saturating_add(8)
        || after.self_intersection_triangles > before.self_intersection_triangles.saturating_add(16)
        || after.degenerate_triangles > before.degenerate_triangles
        || after.duplicate_triangles > before.duplicate_triangles
        || after.connected_components > before.connected_components.saturating_add(128)
}

// --- individual passes ---------------------------------------------------

fn weld_vertices(mesh: &mut IndexedMesh, epsilon: f32) -> usize {
    let bbox = mesh.bbox();
    let diag = bbox.diag().max(1e-6);
    let step = (epsilon * diag).max(1e-7);
    let inv_step = 1.0 / step;

    let mut map: AHashMap<(i32, i32, i32), u32> = AHashMap::with_capacity(mesh.positions.len());
    let mut new_positions: Vec<Vec3> = Vec::with_capacity(mesh.positions.len());
    let mut remap: Vec<u32> = Vec::with_capacity(mesh.positions.len());

    for p in &mesh.positions {
        let key = (
            (p.x * inv_step).round() as i32,
            (p.y * inv_step).round() as i32,
            (p.z * inv_step).round() as i32,
        );
        let new_idx = *map.entry(key).or_insert_with(|| {
            let i = new_positions.len() as u32;
            new_positions.push(*p);
            i
        });
        remap.push(new_idx);
    }
    let merged = mesh.positions.len() - new_positions.len();
    if merged == 0 {
        return 0;
    }
    for tri in mesh.triangles.iter_mut() {
        for v in tri.iter_mut() {
            *v = remap[*v as usize];
        }
    }
    mesh.positions = new_positions;
    merged
}

fn cull_degenerate_and_duplicate(mesh: &mut IndexedMesh) -> usize {
    let before = mesh.triangles.len();
    let mut seen: ahash::AHashSet<(u32, u32, u32)> = ahash::AHashSet::with_capacity(before);
    mesh.triangles.retain(|tri| {
        if tri[0] == tri[1] || tri[1] == tri[2] || tri[0] == tri[2] {
            return false;
        }
        let mut s = *tri;
        s.sort();
        let key = (s[0], s[1], s[2]);
        if !seen.insert(key) {
            return false;
        }
        true
    });
    topology_passes::flip_degenerate_caps(mesh, 1e-16, 4);
    // Zero-area filter (positional).
    let positions = &mesh.positions;
    mesh.triangles.retain(|tri| {
        let a = positions[tri[0] as usize];
        let b = positions[tri[1] as usize];
        let c = positions[tri[2] as usize];
        let area = b.sub(a).cross(c.sub(a)).length() * 0.5;
        area > 1e-16
    });
    before - mesh.triangles.len()
}

fn prune_unused_vertices(mesh: &mut IndexedMesh) -> usize {
    let before = mesh.positions.len();
    if before == 0 {
        return 0;
    }
    let mut used = vec![false; before];
    for tri in &mesh.triangles {
        used[tri[0] as usize] = true;
        used[tri[1] as usize] = true;
        used[tri[2] as usize] = true;
    }
    let mut remap = vec![u32::MAX; before];
    let mut new_positions: Vec<Vec3> = Vec::with_capacity(before);
    for i in 0..before {
        if used[i] {
            remap[i] = new_positions.len() as u32;
            new_positions.push(mesh.positions[i]);
        }
    }
    if new_positions.len() == before {
        return 0;
    }
    for tri in mesh.triangles.iter_mut() {
        for v in tri.iter_mut() {
            *v = remap[*v as usize];
        }
    }
    mesh.positions = new_positions;
    before - mesh.positions.len()
}

fn fill_small_holes(mesh: &mut IndexedMesh, max_edges: usize) -> usize {
    topology_passes::fill_holes_oriented(mesh, max_edges)
}

/// Drop topologically open components that commonly appear as seam shards
/// after union boundary extraction.  Only components that are closed (zero
/// boundary edges) or near-closed (small boundary relative to their size)
/// and have at least 128 triangles are kept.  This runs in-place.
fn prune_open_fragments(mesh: &mut IndexedMesh) {
    if mesh.triangles.is_empty() {
        return;
    }
    let comps = triangle_components(mesh);
    let n_comps = comps.iter().copied().max().unwrap_or(0) as usize + 1;

    let mut comp_tri_count = vec![0usize; n_comps];
    for &c in &comps {
        comp_tri_count[c as usize] += 1;
    }

    let topo = Topology::build(mesh);
    let mut comp_boundary_edges = vec![0usize; n_comps];
    for info in topo.edges.values() {
        if info.faces.len() == 1 {
            let fi = info.faces[0] as usize;
            let c = comps[fi] as usize;
            comp_boundary_edges[c] += 1;
        }
    }

    let mut keep_comp = vec![false; n_comps];
    for c in 0..n_comps {
        let tris = comp_tri_count[c];
        if tris == 0 {
            continue;
        }
        let boundary = comp_boundary_edges[c];
        let closed = boundary == 0;
        // Near-closed: modest absolute boundary and small relative leak.
        let near_closed = boundary <= 64 && boundary.saturating_mul(8) <= tris;
        if closed || (near_closed && tris >= 128) {
            keep_comp[c] = true;
        }
    }

    if keep_comp.iter().any(|&k| k) {
        mesh.triangles = mesh
            .triangles
            .iter()
            .enumerate()
            .filter_map(|(fi, tri)| {
                if keep_comp[comps[fi] as usize] {
                    Some(*tri)
                } else {
                    None
                }
            })
            .collect();
    }
}

/// Component-culling variant of interior classification.
///
/// For each face we test parity against *other* components only, excluding all
/// triangles that belong to the face's own component. This prevents a face
/// from being mislabeled as interior due to self-shell hits when component
/// winding is noisy or partially inconsistent.
fn compute_interior_face_flags_against_other_components(
    mesh: &IndexedMesh,
    components: &[u32],
) -> Vec<bool> {
    if mesh.triangles.is_empty() {
        return Vec::new();
    }
    let bvh = Bvh::build(mesh);
    const OFFSET: f32 = 1e-4;
    let n = mesh.triangles.len();
    let mesh_ref: &IndexedMesh = mesh;
    (0..n)
        .into_par_iter()
        .map(|fi| {
            let [a, b, c] = mesh_ref.tri_positions(fi as u32);
            let e1 = b.sub(a);
            let e2 = c.sub(a);
            let raw_n = e1.cross(e2);
            let len = raw_n.length();
            if len < 1e-8 {
                return false;
            }
            let normal = raw_n.scale(1.0 / len);
            let centroid = a.add(b).add(c).scale(1.0 / 3.0);
            let origin = centroid.add(normal.scale(OFFSET));
            let face_comp = components[fi];
            let hits = bvh.ray_hit_count_with_filter(mesh_ref, origin, normal, &|hit_face| {
                components[hit_face as usize] != face_comp
            });
            hits % 2 == 1
        })
        .collect()
}

/// Remove entire connected components whose majority of faces are classified
/// as interior-facing (via [`compute_interior_face_flags`]).
///
/// This is the stable alternative to the corefine+winding path: removing a
/// whole connected component never creates new boundary edges or non-manifold
/// edges in the remaining mesh, so it is safe even on highly fragmented inputs
/// (thousands of overlapping shells from 3D scanning, etc.).
///
/// Returns `(removed_triangles, removed_component_count)`.
fn cull_interior_components(mesh: &mut IndexedMesh) -> (usize, usize) {
    if mesh.triangles.len() < 4 {
        return (0, 0);
    }

    let comps = triangle_components(mesh);
    let interior = compute_interior_face_flags_against_other_components(mesh, &comps);
    let n_comps = comps.iter().copied().max().unwrap_or(0) as usize + 1;

    let mut comp_total = vec![0usize; n_comps];
    let mut comp_interior = vec![0usize; n_comps];
    for (fi, &is_interior) in interior.iter().enumerate() {
        let c = comps[fi] as usize;
        comp_total[c] += 1;
        if is_interior {
            comp_interior[c] += 1;
        }
    }

    // Remove only high-confidence interior components.
    //
    // 95% threshold avoids deleting valid exterior pieces when parity votes are
    // noisy near tangential overlaps or in locally messy scan geometry.
    const INTERIOR_RATIO_NUM: usize = 19;
    const INTERIOR_RATIO_DEN: usize = 20;
    let remove_set: AHashSet<u32> = (0..n_comps as u32)
        .filter(|&c| {
            let tot = comp_total[c as usize];
            let int = comp_interior[c as usize];
            tot > 0 && int * INTERIOR_RATIO_DEN >= tot * INTERIOR_RATIO_NUM
        })
        .collect();

    let removed_comps = remove_set.len();
    if removed_comps == 0 {
        return (0, 0);
    }

    let before = mesh.triangles.len();
    let kept: Vec<[u32; 3]> = mesh
        .triangles
        .iter()
        .enumerate()
        .filter_map(|(fi, tri)| {
            if remove_set.contains(&comps[fi]) {
                None
            } else {
                Some(*tri)
            }
        })
        .collect();
    let removed_tris = before - kept.len();
    mesh.triangles = kept;
    (removed_tris, removed_comps)
}

struct ClassificationResult {
    split: Option<(usize, bool)>,
    component_count: usize,
}

/// Conservative fallback classifier that partitions triangles into model and
/// support sections by connected component height bands, then reorders the
/// mesh triangles so model section comes first and support section follows.
///
/// Returns a ClassificationResult struct. The component count is the total number
/// of connected components before reordering, which the caller can reuse.
#[allow(unused_assignments)]
fn classify_and_reorder_model_support_triangles(
    mesh: &mut IndexedMesh,
    assume_support_geometry: Option<bool>,
) -> ClassificationResult {
    if assume_support_geometry == Some(true) {
        return ClassificationResult {
            split: Some((0, true)),
            component_count: 1,
        };
    }
    if assume_support_geometry == Some(false) {
        return ClassificationResult {
            split: Some((mesh.triangles.len(), false)),
            component_count: 1,
        };
    }
    if mesh.triangles.len() < 8 || mesh.positions.is_empty() {
        return ClassificationResult {
            split: None,
            component_count: 0,
        };
    }

    let components = triangle_components(mesh);
    let n_comps = components.iter().copied().max().unwrap_or(0) as usize + 1;
    if n_comps < 2 {
        return ClassificationResult {
            split: None,
            component_count: n_comps,
        };
    }

    const BASE_TOUCH_EPS_MM: f32 = 0.25;

    let global_min_z = mesh
        .positions
        .iter()
        .map(|p| p.z)
        .fold(f32::INFINITY, f32::min);
    let raft_z_cut = global_min_z + RAFT_Z_CUTOFF_MM;

    let mut comp_max_z = vec![f32::NEG_INFINITY; n_comps];
    let mut comp_min_z = vec![f32::INFINITY; n_comps];
    let mut comp_tri_count = vec![0usize; n_comps];
    let mut comp_vol = vec![0.0f64; n_comps];

    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let cid = components[fi] as usize;
        comp_tri_count[cid] += 1;
        let z0 = mesh.positions[tri[0] as usize].z;
        let z1 = mesh.positions[tri[1] as usize].z;
        let z2 = mesh.positions[tri[2] as usize].z;
        comp_max_z[cid] = comp_max_z[cid].max(z0.max(z1).max(z2));
        comp_min_z[cid] = comp_min_z[cid].min(z0.min(z1).min(z2));

        let a = mesh.positions[tri[0] as usize];
        let b = mesh.positions[tri[1] as usize];
        let c = mesh.positions[tri[2] as usize];
        let v = (a.x as f64) * ((b.y as f64) * (c.z as f64) - (b.z as f64) * (c.y as f64))
            - (a.y as f64) * ((b.x as f64) * (c.z as f64) - (b.z as f64) * (c.x as f64))
            + (a.z as f64) * ((b.x as f64) * (c.y as f64) - (b.y as f64) * (c.x as f64));
        comp_vol[cid] += v;
    }

    for cid in 0..n_comps {
        comp_vol[cid] /= 6.0;
    }

    let model_seed = match (0..n_comps)
        .filter(|&cid| comp_tri_count[cid] >= 4 && comp_max_z[cid] > raft_z_cut)
        .max_by(|&a, &b| {
            comp_max_z[a]
                .partial_cmp(&comp_max_z[b])
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    {
        Some(seed) => seed,
        None => {
            return ClassificationResult {
                split: None,
                component_count: n_comps,
            };
        }
    };

    // Components with at least 1/8 of the seed's triangle count are "high-poly"
    // and treated as model shells even if they don't reach the top Z band.
    // This handles multi-shell models where parts sit at different heights while
    // still separating them from the low-poly support scaffold. Support posts,
    // cylinders, and contact tips are far below this threshold.
    let model_min_tris = (comp_tri_count[model_seed] / 8).max(MODEL_MIN_TRIS_FLOOR);

    let classify_group = |cid: usize| {
        if comp_vol[cid] < -1e-2 {
            return GeometryGroup::Model;
        }
        classify_model_support_group(
            cid,
            raft_z_cut,
            Some(model_seed),
            model_min_tris,
            &comp_max_z,
            &comp_tri_count,
        )
    };

    let mut model_comp_count = 0usize;
    let mut support_comp_count = 0usize;
    let mut model_input_triangles = 0usize;
    let mut support_input_triangles = 0usize;
    // PRESERVED (PLAN-2 Support Heuristics):
    // Tracks base contact counts and triangle volumes for support connected components.
    // Kept in-place for future UI configuration knobs and advanced support detection rules.
    #[allow(unused_variables, unused_assignments)]
    let mut support_base_touch_components = 0usize;
    #[allow(unused_variables, unused_assignments)]
    let mut support_base_touch_triangles = 0usize;
    let base_touch_cut = global_min_z + BASE_TOUCH_EPS_MM;

    for cid in 0..n_comps {
        let tri_count = comp_tri_count[cid];
        if tri_count == 0 {
            continue;
        }
        match classify_group(cid) {
            GeometryGroup::Model => {
                model_comp_count += 1;
                model_input_triangles += tri_count;
            }
            GeometryGroup::Support => {
                support_comp_count += 1;
                support_input_triangles += tri_count;
                if comp_min_z[cid] <= base_touch_cut {
                    support_base_touch_components += 1;
                    support_base_touch_triangles += tri_count;
                }
            }
        }
    }

    let model_avg_tris = if model_comp_count > 0 {
        model_input_triangles / model_comp_count
    } else {
        0
    };
    let support_avg_tris = if support_comp_count > 0 {
        support_input_triangles / support_comp_count
    } else {
        0
    };

    // Primary discriminator: support scaffolds (posts, cylinders, contact tips) are
    // inherently low-poly compared to model geometry. If the two groups have similar
    // average triangle density per component this is almost certainly a multi-shell
    // model, not a model+support file. Require support comps to average at least 3×
    // fewer triangles than model comps before considering anything else.
    let density_ok = model_comp_count > 0
        && model_avg_tris > 0
        && support_avg_tris.saturating_mul(3) < model_avg_tris;

    // Remaining guards: keep density_ok and support_input_triangles as-is.
    // Comment out overly aggressive component floor & bed-touch bounds.
    if !density_ok
        || support_input_triangles < 2_000
        /*
        || support_comp_count < model_comp_count.saturating_mul(2).max(4)
        || n_comps < 12
        || support_base_touch_components < support_comp_count.saturating_div(4).max(3)
        || support_base_touch_triangles < 500
        */
    {
        return ClassificationResult {
            split: None,
            component_count: n_comps,
        };
    }

    let mut model_tris: Vec<[u32; 3]> = Vec::with_capacity(mesh.triangles.len());
    let mut support_tris: Vec<[u32; 3]> = Vec::with_capacity(mesh.triangles.len());

    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let cid = components[fi] as usize;
        match classify_group(cid) {
            GeometryGroup::Model => model_tris.push(*tri),
            GeometryGroup::Support => support_tris.push(*tri),
        }
    }

    if model_tris.is_empty() || support_tris.is_empty() {
        return ClassificationResult {
            split: None,
            component_count: n_comps,
        };
    }

    let model_triangles_out = model_tris.len();
    let support_triangles_out = support_tris.len();

    mesh.triangles.clear();
    mesh.triangles.extend(model_tris);
    mesh.triangles.extend(support_tris);

    let likely_support_geometry = compute_likely_support_geometry(
        model_triangles_out,
        support_triangles_out,
        model_comp_count,
        support_comp_count,
        model_input_triangles,
        support_input_triangles,
    );

    ClassificationResult {
        split: Some((model_triangles_out, likely_support_geometry)),
        component_count: n_comps,
    }
}

/// Ray directions for the nesting-depth vote; fixed so results stay deterministic.
const DEPTH_RAY_DIRS: [Vec3; 5] = [
    Vec3::new(0.5773503, 0.5773503, 0.5773503),
    Vec3::new(-0.4361, 0.7253, 0.5327),
    Vec3::new(0.2672, -0.8019, 0.5346),
    Vec3::new(-0.6247, -0.3122, -0.7158),
    Vec3::new(0.8017, 0.2671, -0.5347),
];

/// Up to `max` sample points inside the component's solid: the centroids of its
/// largest faces moved off their planes against their normals.
fn interior_sample_points(mesh: &IndexedMesh, faces: &[u32], eps: f32, max: usize) -> Vec<Vec3> {
    let mut ranked: Vec<(f32, u32)> = faces.iter().map(|&f| (mesh.tri_area(f), f)).collect();
    ranked.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.1.cmp(&b.1))
    });
    ranked
        .into_iter()
        .take(max)
        .filter_map(|(_, fi)| {
            let n = mesh.tri_normal(fi);
            if n.length() < 1e-8 {
                return None;
            }
            let [a, b, c] = mesh.tri_positions(fi);
            Some(a.add(b).add(c).scale(1.0 / 3.0).sub(n.scale(eps)))
        })
        .collect()
}

/// Whether a component is a cavity boundary. One sample can land in a
/// neighbouring part, so several of the component's largest faces vote.
fn nesting_depth_is_odd(
    bvh: &Bvh,
    mesh: &IndexedMesh,
    components: &[u32],
    comp_id: u32,
    samples: &[Vec3],
) -> bool {
    let mut odd = 0usize;
    for sample in samples {
        let mut votes = 0usize;
        for dir in DEPTH_RAY_DIRS {
            let hits = bvh.ray_hit_count_with_filter(mesh, *sample, dir, &|f| {
                components[f as usize] != comp_id
            });
            votes += (hits & 1) as usize;
        }
        odd += (votes * 2 > DEPTH_RAY_DIRS.len()) as usize;
    }
    odd * 2 > samples.len()
}

/// Orient each component: a negative signed volume means an inward winding,
/// which is what a cavity boundary should have, so a component nested inside
/// another keeps it. Everything else with a negative volume is flipped.
fn repair_orientation(mesh: &mut IndexedMesh) -> usize {
    if mesh.triangles.is_empty() {
        return 0;
    }
    let mut flipped_faces = topology_passes::unify_winding(mesh);
    let components = triangle_components(mesh);
    let n_components = components.iter().max().copied().unwrap_or(0) + 1;
    let sample_eps = (mesh.bbox().diag() * 1e-4).max(1e-6);

    // Open components have no usable depth, so they keep the ray-cast vote.
    let bvh = Bvh::build(mesh);
    let mut edge_uses: AHashMap<(u32, u32), u32> = AHashMap::with_capacity(mesh.triangles.len() * 3 / 2);
    for t in &mesh.triangles {
        for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            *edge_uses.entry(edge_key(a, b)).or_insert(0) += 1;
        }
    }

    for comp_id in 0..n_components {
        let face_indices: Vec<u32> = components
            .iter()
            .enumerate()
            .filter_map(|(i, &c)| if c == comp_id { Some(i as u32) } else { None })
            .collect();
        if face_indices.is_empty() {
            continue;
        }

        // Component signed volume.
        let mut vol = 0.0f64;
        for &fi in &face_indices {
            let t = mesh.triangles[fi as usize];
            let a = mesh.positions[t[0] as usize];
            let b = mesh.positions[t[1] as usize];
            let c = mesh.positions[t[2] as usize];
            vol += (a.x as f64) * ((b.y as f64) * (c.z as f64) - (b.z as f64) * (c.y as f64))
                - (a.y as f64) * ((b.x as f64) * (c.z as f64) - (b.z as f64) * (c.x as f64))
                + (a.z as f64) * ((b.x as f64) * (c.y as f64) - (b.y as f64) * (c.x as f64));
        }
        vol /= 6.0;

        // An open component's signed volume depends on where the origin is, so
        // its sign says nothing about which way the faces point.
        let is_open = face_indices.iter().any(|&fi| {
            let t = mesh.triangles[fi as usize];
            [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])]
                .iter()
                .any(|&(a, b)| edge_uses.get(&edge_key(a, b)).copied().unwrap_or(0) == 1)
        });

        let should_flip = if is_open {
            open_component_is_inverted(mesh, &face_indices)
                && !(n_components > 1
                    && nesting_depth_is_odd(
                        &bvh,
                        mesh,
                        &components,
                        comp_id,
                        &interior_sample_points(mesh, &face_indices, sample_eps, 5),
                    ))
        } else if vol.abs() < 1e-6 {
            // Not watertight, so depth carries no information — ray-cast vote
            // using triangle centroids.
            let votes: usize = face_indices
                .par_iter()
                .map(|&fi| {
                    let [a, b, c] = mesh.tri_positions(fi);
                    let n = mesh.tri_normal(fi);
                    if n.length() < 1e-8 {
                        return 0;
                    }
                    let centroid = a.add(b).add(c).scale(1.0 / 3.0);
                    let offset = centroid.add(n.scale(1e-3));
                    let hits = bvh.ray_hit_count(mesh, offset, n);
                    // Subtract our own forward face if detected.
                    if hits % 2 == 0 {
                        0
                    } else {
                        1
                    }
                })
                .sum();
            votes * 2 > face_indices.len()
        } else {
            // A cavity boundary is wound inward on purpose, so a negative
            // volume only means inversion when the component is not nested
            // inside another. Depth can hold a flip back, never add one.
            let is_cavity = n_components > 1
                && nesting_depth_is_odd(
                    &bvh,
                    mesh,
                    &components,
                    comp_id,
                    &interior_sample_points(mesh, &face_indices, sample_eps, 5),
                );
            vol < -1e-6 && !is_cavity
        };

        if should_flip {
            for fi in face_indices {
                let t = &mut mesh.triangles[fi as usize];
                t.swap(1, 2);
                flipped_faces += 1;
            }
        }
    }
    flipped_faces
}

/// Generalised winding number at `p` from `faces`, leaving out `skip`.
fn winding_number_at(mesh: &IndexedMesh, faces: &[u32], skip: u32, p: Vec3) -> f64 {
    let mut omega = 0.0f64;
    for &fi in faces {
        if fi == skip {
            continue;
        }
        let [a, b, c] = mesh.tri_positions(fi);
        let d = |v: Vec3| [(v.x - p.x) as f64, (v.y - p.y) as f64, (v.z - p.z) as f64];
        let (a, b, c) = (d(a), d(b), d(c));
        let dot = |u: [f64; 3], v: [f64; 3]| u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        let len = |u: [f64; 3]| dot(u, u).sqrt();
        let bxc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
        let (la, lb, lc) = (len(a), len(b), len(c));
        let den = la * lb * lc + dot(a, b) * lc + dot(a, c) * lb + dot(b, c) * la;
        omega += 2.0 * dot(a, bxc).atan2(den);
    }
    omega / (4.0 * std::f64::consts::PI)
}

/// At a face's own centroid the winding number from the rest of its component
/// sits halfway between the values on its two sides: about +0.5 when the solid
/// is behind the face, -0.5 when the face points into it. Holes shrink the
/// magnitude but not the sign, so a clear majority of negative samples means
/// the component is inside out.
fn open_component_is_inverted(mesh: &IndexedMesh, faces: &[u32]) -> bool {
    const SAMPLES: usize = 64;
    let usable: Vec<u32> = faces
        .iter()
        .copied()
        .filter(|&fi| mesh.tri_normal(fi).length() > 1e-12)
        .collect();
    if usable.len() < 4 {
        return false;
    }
    let step = (usable.len() / SAMPLES).max(1);
    let (pos, neg) = usable
        .iter()
        .step_by(step)
        .take(SAMPLES)
        .collect::<Vec<_>>()
        .par_iter()
        .map(|&&fi| {
            let [a, b, c] = mesh.tri_positions(fi);
            let w = winding_number_at(mesh, faces, fi, a.add(b).add(c).scale(1.0 / 3.0));
            ((w > 0.1) as usize, (w < -0.1) as usize)
        })
        .reduce(|| (0, 0), |x, y| (x.0 + y.0, x.1 + y.1));
    neg >= 3 && neg > 2 * pos
}

/// Assign each triangle to a connected-component id (edge-shared).
fn triangle_components(mesh: &IndexedMesh) -> Vec<u32> {
    let n = mesh.triangles.len();
    let mut edge_to_face: AHashMap<(u32, u32), u32> = AHashMap::with_capacity(n * 3);
    let mut parent: Vec<u32> = (0..n as u32).collect();
    fn find(p: &mut [u32], i: u32) -> u32 {
        let mut r = i;
        while p[r as usize] != r {
            r = p[r as usize];
        }
        let mut cur = i;
        while p[cur as usize] != r {
            let next = p[cur as usize];
            p[cur as usize] = r;
            cur = next;
        }
        r
    }
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let fi = fi as u32;
        let edges = [
            edge_key(tri[0], tri[1]),
            edge_key(tri[1], tri[2]),
            edge_key(tri[2], tri[0]),
        ];
        for e in edges {
            if let Some(&other) = edge_to_face.get(&e) {
                let ri = find(&mut parent, fi);
                let rj = find(&mut parent, other);
                if ri != rj {
                    parent[ri as usize] = rj;
                }
            } else {
                edge_to_face.insert(e, fi);
            }
        }
    }
    let mut comp_id_map: AHashMap<u32, u32> = AHashMap::new();
    let mut next_id: u32 = 0;
    let mut result = vec![0u32; n];
    for i in 0..n {
        let r = find(&mut parent, i as u32);
        let id = *comp_id_map.entry(r).or_insert_with(|| {
            let id = next_id;
            next_id += 1;
            id
        });
        result[i] = id;
    }
    result
}

fn keep_largest_components(mesh: &mut IndexedMesh, keep_n: usize) -> usize {
    if keep_n == 0 {
        let before = mesh.triangles.len();
        mesh.triangles.clear();
        return before;
    }
    let components = triangle_components(mesh);
    let n_components = components.iter().max().copied().unwrap_or(0) + 1;
    if (n_components as usize) <= keep_n {
        return 0;
    }

    // Rank components by |signed volume|.
    let mut vols = vec![0.0f64; n_components as usize];
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let a = mesh.positions[tri[0] as usize];
        let b = mesh.positions[tri[1] as usize];
        let c = mesh.positions[tri[2] as usize];
        let v = (a.x as f64) * ((b.y as f64) * (c.z as f64) - (b.z as f64) * (c.y as f64))
            - (a.y as f64) * ((b.x as f64) * (c.z as f64) - (b.z as f64) * (c.x as f64))
            + (a.z as f64) * ((b.x as f64) * (c.y as f64) - (b.y as f64) * (c.x as f64));
        vols[components[fi] as usize] += v / 6.0;
    }
    let mut ranked: Vec<(u32, f64)> = vols
        .iter()
        .enumerate()
        .map(|(i, v)| (i as u32, v.abs()))
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let keep: ahash::AHashSet<u32> = ranked.into_iter().take(keep_n).map(|(i, _)| i).collect();

    let before = mesh.triangles.len();
    let mut kept: Vec<[u32; 3]> = Vec::with_capacity(before);
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        if keep.contains(&components[fi]) {
            kept.push(*tri);
        }
    }
    mesh.triangles = kept;
    before - mesh.triangles.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn analysis(
        boundary_edges: usize,
        non_manifold_edges: usize,
        components: usize,
        self_intersections: usize,
    ) -> MeshAnalysis {
        MeshAnalysis {
            vertex_count: 0,
            triangle_count: 0,
            bbox_min: [0.0, 0.0, 0.0],
            bbox_max: [0.0, 0.0, 0.0],
            signed_volume: 0.0,
            duplicate_vertices: 0,
            degenerate_triangles: 0,
            duplicate_triangles: 0,
            non_manifold_edges,
            non_manifold_vertices: 0,
            boundary_edges,
            boundary_loops: 0,
            largest_boundary_loop: 0,
            inconsistent_winding_edges: 0,
            self_intersection_triangles: self_intersections,
            connected_components: components,
            is_watertight: false,
            is_oriented: false,
            timings_ms: crate::analysis::AnalysisTimings::default(),
        }
    }

    #[test]
    fn solidify_guard_flags_boundary_explosion() {
        let before = analysis(0, 20, 2173, 99_060);
        let after = analysis(455_630, 4_295, 4_052, 99_307);
        let reason = solidify_regression_reason(&before, &after);
        assert!(reason.is_some(), "expected regression guard to trip");
        assert!(
            reason.unwrap().contains("boundary edges exploded"),
            "expected boundary explosion reason"
        );
    }

    #[test]
    fn solidify_guard_accepts_non_explosive_progress() {
        let before = analysis(512, 300, 64, 5_000);
        let after = analysis(480, 240, 64, 4_100);
        assert!(solidify_regression_reason(&before, &after).is_none());
    }

    #[test]
    fn solidify_guard_flags_triangle_and_volume_collapse() {
        let mut before = analysis(0, 20, 2173, 99_060);
        before.triangle_count = 1_200_173;
        before.signed_volume = 75_998.39;

        let mut after = analysis(0, 28, 177, 0);
        after.triangle_count = 422;
        after.signed_volume = 243.29;

        let reason = solidify_regression_reason(&before, &after);
        assert!(reason.is_some(), "expected catastrophic collapse guard");
        let reason = reason.unwrap();
        assert!(
            reason.contains("triangle count collapsed")
                || reason.contains("signed volume collapsed"),
            "expected collapse reason, got: {reason}"
        );
    }

    #[test]
    fn solidify_guard_flags_high_duplicate_ratio() {
        let mut before = analysis(0, 20, 2173, 99_060);
        before.triangle_count = 300_000;
        before.signed_volume = 10_000.0;

        let mut after = analysis(0, 10, 64, 50_000);
        after.triangle_count = 120_000;
        after.duplicate_triangles = 20_000;
        after.signed_volume = 8_500.0;

        let reason = solidify_regression_reason(&before, &after);
        assert!(reason.is_some(), "expected duplicate-ratio guard");
        assert!(
            reason
                .unwrap()
                .contains("duplicate triangle ratio too high"),
            "expected duplicate ratio reason"
        );
    }

    #[test]
    fn micro_heal_accepts_defect_score_improvement() {
        let before = analysis(2, 20, 2173, 99_059);
        let mut after = analysis(0, 0, 2173, 99_059);
        after.inconsistent_winding_edges = 0;
        let before_score =
            before.non_manifold_edges + before.boundary_edges + before.inconsistent_winding_edges;
        let after_score =
            after.non_manifold_edges + after.boundary_edges + after.inconsistent_winding_edges;
        assert!(micro_heal_is_improvement(
            &before,
            &after,
            before_score,
            after_score
        ));
        assert!(!micro_heal_is_hard_regression(&before, &after));
    }

    #[test]
    fn micro_heal_rejects_hard_boundary_regression() {
        let before = analysis(2, 20, 2173, 99_059);
        let mut after = analysis(500, 22, 2350, 99_059);
        after.inconsistent_winding_edges = 30;
        let before_score =
            before.non_manifold_edges + before.boundary_edges + before.inconsistent_winding_edges;
        let after_score =
            after.non_manifold_edges + after.boundary_edges + after.inconsistent_winding_edges;
        assert!(!micro_heal_is_improvement(
            &before,
            &after,
            before_score,
            after_score
        ));
        assert!(micro_heal_is_hard_regression(&before, &after));
    }

    #[test]
    fn micro_heal_rejects_boundary_fix_that_worsens_winding_and_self_intersections() {
        let mut before = analysis(1, 20, 2173, 99_059);
        before.inconsistent_winding_edges = 22;

        let mut after = analysis(0, 21, 2173, 99_085);
        after.inconsistent_winding_edges = 57;
        after.degenerate_triangles = 6;
        after.duplicate_triangles = 4;

        let before_score =
            before.non_manifold_edges + before.boundary_edges + before.inconsistent_winding_edges;
        let after_score =
            after.non_manifold_edges + after.boundary_edges + after.inconsistent_winding_edges;

        assert!(!micro_heal_is_improvement(
            &before,
            &after,
            before_score,
            after_score
        ));
        assert!(micro_heal_is_hard_regression(&before, &after));
    }

    #[test]
    fn non_manifold_cleanup_accepts_non_manifold_reduction_without_regression() {
        let mut before = analysis(1, 20, 2173, 99_059);
        before.inconsistent_winding_edges = 22;

        let mut after = analysis(1, 10, 2173, 99_050);
        after.inconsistent_winding_edges = 18;

        assert!(non_manifold_cleanup_is_improvement(&before, &after));
        assert!(!non_manifold_cleanup_is_hard_regression(&before, &after));
    }

    #[test]
    fn non_manifold_cleanup_rejects_if_self_intersections_get_worse() {
        let mut before = analysis(1, 20, 2173, 99_059);
        before.inconsistent_winding_edges = 22;

        let mut after = analysis(1, 10, 2173, 99_300);
        after.inconsistent_winding_edges = 18;

        assert!(!non_manifold_cleanup_is_improvement(&before, &after));
        assert!(non_manifold_cleanup_is_hard_regression(&before, &after));
    }

    #[test]
    fn non_manifold_cleanup_rejects_large_boundary_introduction_with_weak_si_relief() {
        let mut before = analysis(0, 126, 15, 7_501);
        before.boundary_loops = 0;
        before.inconsistent_winding_edges = 0;

        let mut after = analysis(178, 0, 15, 7_460);
        after.boundary_loops = 1;
        after.inconsistent_winding_edges = 0;

        // Non-manifold edges improved, but this is still a destructive outcome.
        assert!(non_manifold_cleanup_is_improvement(&before, &after));
        assert!(non_manifold_cleanup_is_hard_regression(&before, &after));
    }

    #[test]
    fn non_manifold_cleanup_allows_boundary_growth_when_si_relief_is_strong() {
        let mut before = analysis(0, 126, 15, 1_000);
        before.boundary_loops = 0;

        let mut after = analysis(120, 0, 15, 300);
        after.boundary_loops = 1;

        // Strong self-intersection reduction should keep this path eligible.
        assert!(!non_manifold_cleanup_is_hard_regression(&before, &after));
    }

    #[test]
    fn non_manifold_cleanup_allows_explosive_boundary_growth_if_si_relief_is_very_strong() {
        let mut before = analysis(40, 126, 15, 2_000);
        before.boundary_loops = 1;

        let mut after = analysis(600, 0, 15, 200);
        after.boundary_loops = 6;

        // Boundary growth is large, but self-intersections improved by 90%.
        assert!(!non_manifold_cleanup_is_hard_regression(&before, &after));
    }

    #[test]
    fn classify_group_promotes_high_poly_component_even_when_top_seed_is_small() {
        // Simulates a tall low-poly support tip becoming the Z-seed while the
        // real model body sits slightly lower but with far higher triangle density.
        let comp_max_z = vec![100.0, 96.5, 72.0, 1.2];
        let comp_tri_count = vec![96, 24_000, 180, 800];
        let model_seed = Some(0usize);
        let model_min_tris = (comp_tri_count[0] / 8).max(MODEL_MIN_TRIS_FLOOR);

        assert_eq!(
            classify_model_support_group(
                1,
                RAFT_Z_CUTOFF_MM,
                model_seed,
                model_min_tris,
                &comp_max_z,
                &comp_tri_count,
            ),
            GeometryGroup::Model
        );
        assert_eq!(
            classify_model_support_group(
                2,
                RAFT_Z_CUTOFF_MM,
                model_seed,
                model_min_tris,
                &comp_max_z,
                &comp_tri_count,
            ),
            GeometryGroup::Support
        );
        assert_eq!(
            classify_model_support_group(
                3,
                RAFT_Z_CUTOFF_MM,
                model_seed,
                model_min_tris,
                &comp_max_z,
                &comp_tri_count,
            ),
            GeometryGroup::Support
        );
    }

    #[test]
    fn likely_support_flag_stays_off_for_balanced_model_support_mix() {
        // Mixed files should keep model tinting semantics unless supports
        // clearly dominate both structure and output triangles.
        assert!(!compute_likely_support_geometry(
            180_000, 150_000, 3, 18, 240_000, 200_000,
        ));
    }

    #[test]
    fn likely_support_flag_turns_on_only_when_model_triangles_are_zero() {
        assert!(compute_likely_support_geometry(
            0, 180_000, 0, 32, 0, 220_000,
        ));
        assert!(!compute_likely_support_geometry(
            20_000, 180_000, 1, 32, 20_000, 220_000,
        ));
    }

    #[test]
    fn assume_support_geometry_enforces_likely_support_classification() {
        let mut mesh = IndexedMesh {
            positions: vec![
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(10.0, 0.0, 0.0),
                Vec3::new(0.0, 10.0, 0.0),
            ],
            triangles: vec![[0, 1, 2]],
        };
        let options = RepairOptions {
            assume_support_geometry: Some(true),
            ..RepairOptions::default()
        };
        let outcome = repair(mesh, &options);
        assert!(outcome.report.likely_support_geometry);
    }

    #[test]
    fn classify_support_split_respects_assume_support_geometry() {
        let mesh = IndexedMesh {
            positions: vec![
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(10.0, 0.0, 0.0),
                Vec3::new(0.0, 10.0, 0.0),
            ],
            triangles: vec![[0, 1, 2]],
        };
        let options = RepairOptions {
            assume_support_geometry: Some(true),
            ..RepairOptions::default()
        };
        let outcome = classify_support_split(mesh, &options);
        assert!(outcome.report.likely_support_geometry);
    }

    /// Icosphere of the subdivided-icosahedron topology, scaled to `radius` and
    /// wound outward.
    fn icosphere(radius: f32, subdiv: usize) -> IndexedMesh {
        let t = (1.0f32 + 5.0f32.sqrt()) / 2.0;
        let mut verts: Vec<[f32; 3]> = vec![
            [-1.0, t, 0.0],
            [1.0, t, 0.0],
            [-1.0, -t, 0.0],
            [1.0, -t, 0.0],
            [0.0, -1.0, t],
            [0.0, 1.0, t],
            [0.0, -1.0, -t],
            [0.0, 1.0, -t],
            [t, 0.0, -1.0],
            [t, 0.0, 1.0],
            [-t, 0.0, -1.0],
            [-t, 0.0, 1.0],
        ];
        let mut faces: Vec<[u32; 3]> = vec![
            [0, 11, 5],
            [0, 5, 1],
            [0, 1, 7],
            [0, 7, 10],
            [0, 10, 11],
            [1, 5, 9],
            [5, 11, 4],
            [11, 10, 2],
            [10, 7, 6],
            [7, 1, 8],
            [3, 9, 4],
            [3, 4, 2],
            [3, 2, 6],
            [3, 6, 8],
            [3, 8, 9],
            [4, 9, 5],
            [2, 4, 11],
            [6, 2, 10],
            [8, 6, 7],
            [9, 8, 1],
        ];
        for _ in 0..subdiv {
            let mut midpoints: AHashMap<(u32, u32), u32> = AHashMap::new();
            let mut refined = Vec::with_capacity(faces.len() * 4);
            for f in &faces {
                let mut mid = [0u32; 3];
                for k in 0..3 {
                    let (a, b) = (f[k], f[(k + 1) % 3]);
                    let key = (a.min(b), a.max(b));
                    mid[k] = *midpoints.entry(key).or_insert_with(|| {
                        let (pa, pb) = (verts[a as usize], verts[b as usize]);
                        verts.push([
                            (pa[0] + pb[0]) * 0.5,
                            (pa[1] + pb[1]) * 0.5,
                            (pa[2] + pb[2]) * 0.5,
                        ]);
                        (verts.len() - 1) as u32
                    });
                }
                refined.push([f[0], mid[0], mid[2]]);
                refined.push([mid[0], f[1], mid[1]]);
                refined.push([mid[2], mid[1], f[2]]);
                refined.push([mid[0], mid[1], mid[2]]);
            }
            faces = refined;
        }
        let positions: Vec<Vec3> = verts
            .iter()
            .map(|p| {
                let len = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
                Vec3::new(p[0] * radius / len, p[1] * radius / len, p[2] * radius / len)
            })
            .collect();
        let mut mesh = IndexedMesh {
            positions,
            triangles: faces,
        };
        if mesh.signed_volume() < 0.0 {
            for tri in &mut mesh.triangles {
                tri.swap(1, 2);
            }
        }
        mesh
    }

    /// Outer shell at r=10 and cavity shell at r=8, both wound correctly, plus
    /// the triangle range the cavity occupies.
    fn hollow_sphere() -> (IndexedMesh, std::ops::Range<usize>) {
        let outer = icosphere(10.0, 3);
        let mut inner = icosphere(8.0, 3);
        for tri in &mut inner.triangles {
            tri.swap(1, 2);
        }
        let base = outer.positions.len() as u32;
        let start = outer.triangles.len();
        let mut positions = outer.positions;
        positions.extend(inner.positions.iter().copied());
        let mut triangles = outer.triangles;
        triangles.extend(
            inner
                .triangles
                .iter()
                .map(|f| [f[0] + base, f[1] + base, f[2] + base]),
        );
        let end = triangles.len();
        (IndexedMesh { positions, triangles }, start..end)
    }

    #[test]
    fn hollow_sphere_orientation_is_preserved() {
        let (mut mesh, _) = hollow_sphere();
        let before = mesh.signed_volume();
        assert!(before > 0.0, "cavity must subtract from the outer volume");
        let flips = repair_orientation(&mut mesh);
        assert_eq!(flips, 0, "correctly wound cavity must not be flipped");
        assert!(
            (mesh.signed_volume() - before).abs() <= before * 1e-6,
            "orientation pass disturbed a correctly wound hollow sphere"
        );
    }

    /// A box with its +x face missing, far enough from the origin that its
    /// signed volume reads negative while every face points outward.
    fn open_box(flip: bool) -> IndexedMesh {
        let positions = [
            [0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0], [1.0, 0.0, 1.0], [1.0, 1.0, 1.0], [0.0, 1.0, 1.0],
        ]
        .iter()
        .map(|p| Vec3::new(p[0] + 10.0, p[1], p[2]))
        .collect();
        let mut triangles = vec![
            [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5],
            [0, 5, 4], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
        ];
        if flip {
            triangles.iter_mut().for_each(|t: &mut [u32; 3]| t.swap(1, 2));
        }
        IndexedMesh { positions, triangles }
    }

    #[test]
    fn open_body_with_negative_volume_is_not_flipped() {
        let mut mesh = open_box(false);
        assert!(mesh.signed_volume() < 0.0);
        assert_eq!(repair_orientation(&mut mesh), 0);
    }

    #[test]
    fn inverted_open_body_is_flipped() {
        let mut mesh = open_box(true);
        assert!(mesh.signed_volume() > 0.0);
        assert_eq!(repair_orientation(&mut mesh), 10);
    }

    #[test]
    fn hollow_sphere_outer_shell_is_restored_after_inversion() {
        let (mut mesh, cavity) = hollow_sphere();
        let expected = mesh.signed_volume();
        let outer = 0..cavity.start;
        for tri in &mut mesh.triangles[outer.clone()] {
            tri.swap(1, 2);
        }
        assert!(
            mesh.signed_volume() < 0.0,
            "inverting the outer shell must invert the whole mesh"
        );
        let flips = repair_orientation(&mut mesh);
        assert_eq!(
            flips,
            outer.len(),
            "the inverted outer shell must be flipped back and the cavity left alone"
        );
        assert!((mesh.signed_volume() - expected).abs() <= expected * 1e-6);
    }
}

use crate::stl_budget::TriangleBudget;

pub struct DecimationOutcome {
    pub mesh: IndexedMesh,
    pub achieved_error: f32,
}

pub fn decimate_indexed_to_budget(mesh: IndexedMesh, budget: &TriangleBudget) -> DecimationOutcome {
    if !budget.is_decimated || mesh.triangles.len() <= budget.budget_tris {
        return DecimationOutcome { mesh, achieved_error: 0.0 };
    }

    let indices: Vec<u32> = mesh
        .triangles
        .iter()
        .flat_map(|t| [t[0], t[1], t[2]])
        .collect();

    let locks = vec![false; mesh.positions.len()];
    let adapter = meshopt::VertexDataAdapter::new(
        bytemuck::cast_slice::<_, u8>(&mesh.positions),
        12,
        0,
    ).unwrap();

    let error_tiers = [
        (budget.target_error as f32).min(0.003),
        0.003,
        0.005,
        0.008,
        0.010,
        0.025,
    ];

    let mut final_indices = vec![];
    let mut final_error = 0.0;

    for &err in &error_tiers {
        let decimated_indices = meshopt::simplify_with_locks(
            &indices,
            &adapter,
            &locks,
            budget.budget_tris * 3,
            err,
            meshopt::SimplifyOptions::LockBorder | meshopt::SimplifyOptions::Regularize,
            None,
        );
        let out_tris = decimated_indices.len() / 3;
        final_indices = decimated_indices;
        final_error = err;
        if out_tris <= budget.soft_ceiling_tris {
            break;
        }
    }

    let triangles: Vec<[u32; 3]> = final_indices
        .chunks_exact(3)
        .map(|c| [c[0], c[1], c[2]])
        .collect();

    DecimationOutcome {
        mesh: IndexedMesh {
            positions: mesh.positions,
            triangles,
        },
        achieved_error: final_error,
    }
}

pub struct SectionDecimationOutcome {
    pub mesh: IndexedMesh,
    pub model_triangle_count: usize,
    pub achieved_error: f32,
}

pub fn decimate_sections_to_budget(mesh: IndexedMesh, model_tri_count: usize, budget: &TriangleBudget) -> SectionDecimationOutcome {
    if !budget.enable_per_section_decimation {
        let out = decimate_indexed_to_budget(mesh, budget);
        let out_tris = out.mesh.triangles.len();
        return SectionDecimationOutcome {
            mesh: out.mesh,
            model_triangle_count: model_tri_count.min(out_tris),
            achieved_error: out.achieved_error,
        };
    }

    if !budget.is_decimated || mesh.triangles.len() <= budget.budget_tris {
        return SectionDecimationOutcome { mesh, model_triangle_count: model_tri_count, achieved_error: 0.0 };
    }

    if model_tri_count == 0 || model_tri_count >= mesh.triangles.len() {
        let out = decimate_indexed_to_budget(mesh, budget);
        let out_tris = out.mesh.triangles.len();
        return SectionDecimationOutcome {
            mesh: out.mesh,
            model_triangle_count: model_tri_count.min(out_tris),
            achieved_error: out.achieved_error,
        };
    }

    let indices0: Vec<u32> = mesh.triangles[0..model_tri_count]
        .iter()
        .flat_map(|t| [t[0], t[1], t[2]])
        .collect();
    
    let indices1: Vec<u32> = mesh.triangles[model_tri_count..]
        .iter()
        .flat_map(|t| [t[0], t[1], t[2]])
        .collect();

    let adapter = meshopt::VertexDataAdapter::new(
        bytemuck::cast_slice::<_, u8>(&mesh.positions),
        12,
        0,
    ).unwrap();
    let locks = vec![false; mesh.positions.len()];

    let mut error_tiers = Vec::with_capacity(1 + crate::decimation_config::DECIMATION_ERROR_TIERS.len());
    error_tiers.push((budget.target_error as f32).min(crate::decimation_config::EPSILON_MIN_CLAMP as f32));
    error_tiers.extend(crate::decimation_config::DECIMATION_ERROR_TIERS.iter().map(|&e| e as f32));

    let mut final_indices0 = vec![];
    let mut final_indices1 = vec![];
    let mut final_error = 0.0;

    for &err in &error_tiers {
        let dec0 = meshopt::simplify_with_locks(
            &indices0,
            &adapter,
            &locks,
            (budget.budget_tris * 3).min(indices0.len()),
            err,
            meshopt::SimplifyOptions::LockBorder | meshopt::SimplifyOptions::Regularize,
            None,
        );
        let dec1 = meshopt::simplify_with_locks(
            &indices1,
            &adapter,
            &locks,
            (budget.budget_tris * 3).min(indices1.len()),
            err,
            meshopt::SimplifyOptions::LockBorder | meshopt::SimplifyOptions::Regularize,
            None,
        );

        let out_total = (dec0.len() + dec1.len()) / 3;
        final_indices0 = dec0;
        final_indices1 = dec1;
        final_error = err;

        if out_total <= budget.soft_ceiling_tris {
            break;
        }
    }

    let out0_len = final_indices0.len() / 3;
    let mut concat_tris = Vec::with_capacity((final_indices0.len() + final_indices1.len()) / 3);
    for c in final_indices0.chunks_exact(3) {
        concat_tris.push([c[0], c[1], c[2]]);
    }
    for c in final_indices1.chunks_exact(3) {
        concat_tris.push([c[0], c[1], c[2]]);
    }

    SectionDecimationOutcome {
        mesh: IndexedMesh {
            positions: mesh.positions,
            triangles: concat_tris,
        },
        model_triangle_count: out0_len,
        achieved_error: final_error,
    }
}

#[cfg(test)]
mod section_decimation_tests {
    use super::*;
    use crate::core::mesh::Vec3;

    #[test]
    fn test_decimate_sections() {
        let mut positions = vec![];
        let mut triangles = vec![];
        for i in 0..100 {
            positions.push(Vec3::new(i as f32, 0.0, 0.0));
            positions.push(Vec3::new(0.0, i as f32, 0.0));
            positions.push(Vec3::new(0.0, 0.0, i as f32));
            let base = i * 3;
            triangles.push([base, base + 1, base + 2]);
        }
        let mesh = IndexedMesh { positions, triangles };
        let mut budget = TriangleBudget {
            is_decimated: true,
            budget_tris: 50,
            soft_ceiling_tris: 50,
            target_error: 0.1,
            bbox_diagonal_mm: 100.0,
            enable_per_section_decimation: true,
        };
        
        // Test lockstep mode
        let out = decimate_sections_to_budget(mesh.clone(), 60, &budget);
        assert!(out.mesh.triangles.len() <= 100);

        // Test Phase 3.1 fallback mode
        budget.enable_per_section_decimation = false;
        let out2 = decimate_sections_to_budget(mesh, 60, &budget);
        assert!(out2.model_triangle_count <= 60);
        assert!(out2.mesh.triangles.len() <= 100);
    }
}

#[cfg(test)]
mod classify_hollowing_tests {
    use super::*;
    use crate::core::mesh::Vec3;

    fn make_cube(offset: Vec3, size: f32, flip: bool) -> (Vec<Vec3>, Vec<[u32; 3]>) {
        let mut v = vec![
            offset,
            offset.add(Vec3::new(size, 0.0, 0.0)),
            offset.add(Vec3::new(size, size, 0.0)),
            offset.add(Vec3::new(0.0, size, 0.0)),
            offset.add(Vec3::new(0.0, 0.0, size)),
            offset.add(Vec3::new(size, 0.0, size)),
            offset.add(Vec3::new(size, size, size)),
            offset.add(Vec3::new(0.0, size, size)),
        ];
        
        let mut t = vec![
            [0, 2, 1], [0, 3, 2], // bottom
            [4, 5, 6], [4, 6, 7], // top
            [0, 1, 5], [0, 5, 4], // front
            [1, 2, 6], [1, 6, 5], // right
            [2, 3, 7], [2, 7, 6], // back
            [3, 0, 4], [3, 4, 7], // left
        ];
        if flip {
            for tri in &mut t {
                tri.swap(1, 2);
            }
        }
        (v, t)
    }

    #[test]
    fn test_classify_hollowing_shell_as_model() {
        let (mut v1, mut t1) = make_cube(Vec3::new(0.0, 0.0, 0.0), 10.0, false); // outer, normal winding
        let (v2, t2) = make_cube(Vec3::new(2.0, 2.0, 2.0), 6.0, true); // inner, flipped winding (cavity)
        
        let base_idx = v1.len() as u32;
        v1.extend(v2);
        for tri in t2 {
            t1.push([tri[0] + base_idx, tri[1] + base_idx, tri[2] + base_idx]);
        }
        
        let mut mesh = IndexedMesh {
            positions: v1,
            triangles: t1,
        };
        
        let outcome = classify_and_reorder_model_support_triangles(&mut mesh, None);
        assert_eq!(outcome.split, None);
        assert_eq!(outcome.component_count, 2);
    }
}
