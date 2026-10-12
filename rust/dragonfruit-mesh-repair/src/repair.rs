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

use crate::analysis::{analyze, minimal_analysis};
use crate::core::bvh::Bvh;
use crate::core::halfedge::{edge_key, Topology};
use crate::core::mesh::{IndexedMesh, Vec3};
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
    /// Split the self-crossings and remove the faces they bury.
    ///
    /// Off by default: the split can be expensive on a large mesh, and a mesh that
    /// crosses itself still prints.
    pub resolve_self_intersections: bool,
    /// When set to `Some(true)`, forces the repair pipeline to treat the input
    /// mesh as support geometry (`likely_support_geometry = true`) and bypasses
    /// component shape heuristic re-derivation.
    pub assume_support_geometry: Option<bool>,
}

impl Default for RepairOptions {
    fn default() -> Self {
        Self {
            weld_epsilon: 1e-5,
            fill_holes_max_edges: 64,
            keep_largest_n_components: None,
            repair_orientation: true,
            resolve_self_intersections: false,
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

/// Runs the pass set with no progress reporting.
pub fn repair(mesh: IndexedMesh, options: &RepairOptions) -> RepairOutcome {
    repair_with_progress(mesh, options, None)
}

/// Runs the pass set, telling `sink` about each stage as it starts.
///
/// `sink` is called with the stage's name and its 1-based position, and its return
/// value says whether to carry on. Returning `false` stops the run at that stage
/// boundary: a stage is never interrupted halfway, because half a pass leaves a mesh
/// nobody designed, so the outcome is what the finished stages produced and the
/// report says it was cancelled.
///
/// A repair runs for seconds and a large mesh for minutes, so a caller with a UI
/// wants to know which stage it is in rather than watching a spinner.
pub fn repair_with_progress(
    mut mesh: IndexedMesh,
    options: &RepairOptions,
    mut sink: Option<&mut dyn FnMut(&str, usize) -> bool>,
) -> RepairOutcome {
    let t_start = std::time::Instant::now();

    let pre = analyze(&mesh);
    let mut report = MeshHealthReport::new(pre);
    if options.assume_support_geometry == Some(true) {
        report.likely_support_geometry = true;
    }

    // The pipeline is a fixed order, and the repetition in it is the design: each
    // stage disturbs what the one before it settled, so orientation, stitch, holes
    // and double faces each come round more than once.
    //
    // Records a stage and its cost, so the report reads as the pipeline ran rather
    // than as a list of things that were considered.
    // Announced before the stage's work, so a caller sees the stage it is waiting in
    // rather than the one that just finished.
    macro_rules! begin {
        ($name:expr) => {{
            let index = report.steps.len() + 1;
            if let Some(sink) = sink.as_mut() {
                if !sink($name, index) {
                    report.cancelled = true;
                    report.post = analyze(&mesh);
                    report.total_ms = t_start.elapsed().as_secs_f64() * 1000.0;
                    return RepairOutcome { mesh, report };
                }
            }
        }};
    }

    macro_rules! stage {
        ($name:expr, $changed:expr, $notes:expr, $started:expr) => {
            report.steps.push(RepairStepReport {
                name: $name.into(),
                changed: $changed as u32,
                notes: $notes,
                elapsed_ms: $started.elapsed().as_secs_f64() * 1000.0,
            });
        };
    }

    // 1. Orientation.
    begin!("orient_components");
    let t = std::time::Instant::now();
    let flipped = repair_orientation(&mut mesh);
    stage!("orient_components", flipped, None, t);

    // 2. Stitch: a vertex weld, then collapse whatever the weld created.
    begin!("stitch");
    let t = std::time::Instant::now();
    let welded = weld_vertices(&mut mesh, options.weld_epsilon);
    let collapsed = cull_degenerate_and_duplicate(&mut mesh);
    stage!(
        "stitch",
        welded,
        Some(format!(
            "{welded} vertex/vertices welded, {collapsed} degenerate or duplicate face(s) collapsed"
        )),
        t
    );

    // 3. Trivial holes, before anything else touches the mesh. Six edges is a hole
    //    nobody designed, and leaving one means the mesh reads as open for the rest
    //    of the pipeline.
    begin!("holes_trivial");
    begin!("double_faces");
    let t = std::time::Instant::now();
    let trivial = crate::holes::holes_trivial(&mut mesh);
    stage!("holes_trivial", trivial, None, t);

    // 4. Double faces.
    let t = std::time::Instant::now();
    let doubles = cull_degenerate_and_duplicate(&mut mesh);
    stage!("double_faces", doubles, None, t);

    // 5. Orientation, trivial holes, stitch: each of the three disturbed what the
    //    others settled, so they come round again.
    begin!("orient_holes_stitch");
    let t = std::time::Instant::now();
    let flipped = repair_orientation(&mut mesh);
    let trivial = crate::holes::holes_trivial(&mut mesh);
    let welded = weld_vertices(&mut mesh, options.weld_epsilon);
    let collapsed = cull_degenerate_and_duplicate(&mut mesh);
    stage!(
        "orient_holes_stitch",
        flipped + trivial + welded + collapsed,
        Some(format!(
            "{flipped} face(s) flipped, {trivial} trivial hole face(s), {welded} vertex/vertices welded, {collapsed} face(s) collapsed"
        )),
        t
    );

    // 6. Orientation, every hole the caller's cap allows, stitch.
    begin!("orient_holes_all_stitch");
    begin!("split_self_intersections");
    let t = std::time::Instant::now();
    let flipped = repair_orientation(&mut mesh);
    let filled = crate::holes::holes_all(&mut mesh, options.fill_holes_max_edges);
    let welded = weld_vertices(&mut mesh, options.weld_epsilon);
    let collapsed = cull_degenerate_and_duplicate(&mut mesh);
    stage!(
        "orient_holes_all_stitch",
        flipped + filled + welded + collapsed,
        Some(format!(
            "{flipped} face(s) flipped, {filled} hole face(s), {welded} vertex/vertices welded, {collapsed} face(s) collapsed"
        )),
        t
    );

    // 7. Split the self-crossings, when the caller asked. This is the one stage
    //    that rewrites the surface, so it runs after the local passes have
    //    converged rather than among them.
    if options.resolve_self_intersections {
        begin!("double_faces_after_split");
    let t = std::time::Instant::now();
        let stats = crate::arrangement::corefine_self_intersections(&mut mesh);
        stage!(
            "split_self_intersections",
            stats.refined_faces,
            Some(format!(
                "pairs={} refined_faces={} skipped_faces={} new_vertices={} tris:{}->{}",
                stats.intersecting_pairs,
                stats.refined_faces,
                stats.skipped_faces,
                stats.new_vertices,
                stats.tri_count_before,
                stats.tri_count_after
            )),
            t
        );
    }

    // 8. Double faces again: the split produces them.
    begin!("remove_inner_faces");
    let t = std::time::Instant::now();
    let doubles = cull_degenerate_and_duplicate(&mut mesh);
    stage!("double_faces_after_split", doubles, None, t);

    // 9. Remove the faces that are inside. This is the stage that resolves
    //    self-intersections and non-manifoldness together: a face inside the solid
    //    is not carrying the surface, so removing it cannot open anything, and a
    //    non-manifold edge is usually a buried sheet crossing the outer one.
    begin!("noise_shells");
    let t = std::time::Instant::now();
    let (removed, _) = cull_interior_components(&mut mesh);
    stage!(
        "remove_inner_faces",
        removed,
        Some(format!("{removed} face(s) inside another component")),
        t
    );

    // 10. Noise shells.
    begin!("filter_components");
    let t = std::time::Instant::now();
    let noise = crate::shells::remove_noise_shells(&mut mesh);
    stage!("noise_shells", noise, None, t);

    // The caller's component filter, when they asked for one. Noise shells above
    // are pruned by ratio and need no parameter; this is the explicit request, kept
    // because a caller with a known-bad file may want a number they chose.
    if let Some(keep_n) = options.keep_largest_n_components {
        begin!("settle");
    let t = std::time::Instant::now();
        let dropped = keep_largest_components(&mut mesh, keep_n);
        stage!(
            "filter_components",
            dropped,
            Some(format!("kept the top {keep_n} component(s) by |volume|")),
            t
        );
    }

    // 11. Stitch, noise shells, holes, orientation: the removal above leaves
    //     borders and loose scraps behind it, and this is the round that settles
    //     them.
    let t = std::time::Instant::now();
    let welded = weld_vertices(&mut mesh, options.weld_epsilon);
    let collapsed = cull_degenerate_and_duplicate(&mut mesh);
    let noise = crate::shells::remove_noise_shells(&mut mesh);
    let filled = crate::holes::holes_all(&mut mesh, options.fill_holes_max_edges);
    let flipped = repair_orientation(&mut mesh);
    stage!(
        "settle",
        welded + collapsed + noise + filled + flipped,
        Some(format!(
            "{welded} vertex/vertices welded, {collapsed} face(s) collapsed, {noise} noise face(s), {filled} hole face(s), {flipped} face(s) flipped"
        )),
        t
    );

    // 12. Drop unused vertices, and classify the model/support split the renderer
    //     needs. Not repair, but the report describes this mesh.
    begin!("prune_and_classify");
    let t = std::time::Instant::now();
    let pruned = prune_unused_vertices(&mut mesh);
    let class_res = classify_and_reorder_model_support_triangles(&mut mesh, options.assume_support_geometry);
    if let Some((model_tri_count, likely_support_geometry)) = class_res.split {
        report.model_triangle_count = Some(model_tri_count);
        if !report.likely_support_geometry {
            report.likely_support_geometry = likely_support_geometry;
        }
    }
    stage!("prune_and_classify", pruned, None, t);

    // Post-analysis.
    report.post = analyze(&mesh);

    // The verdict is the five classes, and self-intersections are not one of them.
    //
    // A mesh that carries crossings and is otherwise sound is a mesh that prints.
    // Calling it broken is how a good file ends up with minutes of work spent on it
    // and a report that says it failed.
    let defects = crate::evaluate::evaluate(&mesh);
    let mut notes: Vec<String> = Vec::new();
    if defects.non_manifold_edges > 0 {
        notes.push(format!(
            "{} non-manifold edge(s) remain",
            defects.non_manifold_edges
        ));
    }
    if defects.non_manifold_vertices > 0 {
        notes.push(format!(
            "{} pinched vertex(es) remain",
            defects.non_manifold_vertices
        ));
    }
    if defects.holes > 0 {
        notes.push(format!(
            "{} boundary loop(s) remain across {} edge(s)",
            defects.holes, report.post.boundary_edges
        ));
    }
    if defects.inconsistent_edges > 0 {
        notes.push(format!(
            "{} inconsistently wound edge(s) remain",
            defects.inconsistent_edges
        ));
    }
    if defects.noise_shells > 0 {
        notes.push(format!("{} noise shell(s) remain", defects.noise_shells));
    }
    // Crossings are a number to report, not a defect to declare: a slicer does not
    // care about them, and the surface is only rewritten when the caller asks.
    if report.post.self_intersection_triangles > 0 {
        notes.push(format!(
            "{} self-intersecting triangle(s) detected; they do not stop a mesh printing, and the surface is only rewritten when the caller asks for it",
            report.post.self_intersection_triangles
        ));
    }
    report.fully_repaired = !defects.is_broken();
    report.residual_issues = notes;

    // The model section's own topology decides whether the frontend renders the
    // model red, which is a question about the model rather than about the repair.
    // A non-manifold model is already one of the five classes above.
    #[cfg(feature = "manifold")]
    {
        record_model_manifold_status(&mesh, &mut report);
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
    // post-analysis from it. Classification only reorders triangles, so every field
    // but the component count is identical by construction, and recomputing it
    // walked the whole mesh a second time for nothing (a bbox pass and a signed
    // volume pass, once per classify, per model).
    report.pre.connected_components = component_count;
    report.post = report.pre.clone();
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

/// Ear-clipping hole filler. For each boundary loop of size <= `max_edges`,
/// project loop vertices onto a best-fit plane (via normal averaging) and
/// triangulate 2D. Convex-first greedy — does not handle self-intersecting
/// polygons but handles the common case of small planar/near-planar holes.
pub(crate) fn fill_small_holes(mesh: &mut IndexedMesh, max_edges: usize) -> usize {
    let topo = Topology::build(mesh);
    let loops = topo.boundary_loops();
    let mut added = 0usize;

    for loop_verts in loops
        .into_iter()
        .filter(|l| l.len() <= max_edges && l.len() >= 3)
    {
        // Compute average normal of one-ring faces along the loop to orient
        // the fill (so ear clipping produces outward-facing triangles).
        let avg_normal = {
            let mut sum = Vec3::ZERO;
            for &v in &loop_verts {
                for &face in &topo.vertex_faces[v as usize] {
                    sum = sum.add(mesh.tri_normal(face));
                }
            }
            let len = sum.length();
            if len > 1e-8 {
                sum.scale(1.0 / len)
            } else {
                Vec3::new(0.0, 0.0, 1.0)
            }
        };

        // Build a local 2D frame perpendicular to `avg_normal`.
        let up = if avg_normal.z.abs() < 0.9 {
            Vec3::new(0.0, 0.0, 1.0)
        } else {
            Vec3::new(1.0, 0.0, 0.0)
        };
        let u_axis = {
            let n = avg_normal.cross(up);
            let len = n.length();
            if len > 1e-8 {
                n.scale(1.0 / len)
            } else {
                Vec3::new(1.0, 0.0, 0.0)
            }
        };
        let v_axis = avg_normal.cross(u_axis);

        let pts2d: Vec<(f32, f32)> = loop_verts
            .iter()
            .map(|&v| {
                let p = mesh.positions[v as usize];
                (p.dot(u_axis), p.dot(v_axis))
            })
            .collect();

        // Orient loop counter-clockwise in the 2D frame for consistent winding.
        let mut verts_ordered: Vec<u32> = loop_verts.clone();
        let mut pts_ordered = pts2d.clone();
        if polygon_signed_area(&pts_ordered) < 0.0 {
            verts_ordered.reverse();
            pts_ordered.reverse();
        }

        // Ear clipping.
        let tris = ear_clip(&pts_ordered);
        for [i, j, k] in tris {
            mesh.triangles
                .push([verts_ordered[i], verts_ordered[j], verts_ordered[k]]);
            added += 1;
        }
    }
    added
}

fn polygon_signed_area(pts: &[(f32, f32)]) -> f32 {
    let mut s = 0.0f32;
    let n = pts.len();
    for i in 0..n {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % n];
        s += x0 * y1 - x1 * y0;
    }
    s * 0.5
}

fn ear_clip(pts: &[(f32, f32)]) -> Vec<[usize; 3]> {
    let n = pts.len();
    if n < 3 {
        return Vec::new();
    }
    let mut remaining: Vec<usize> = (0..n).collect();
    let mut tris: Vec<[usize; 3]> = Vec::with_capacity(n - 2);
    let mut guard = 0usize;
    while remaining.len() > 3 && guard < n * n {
        guard += 1;
        let m = remaining.len();
        let mut ear_found = false;
        for i in 0..m {
            let ia = remaining[(i + m - 1) % m];
            let ib = remaining[i];
            let ic = remaining[(i + 1) % m];
            if !is_convex(pts[ia], pts[ib], pts[ic]) {
                continue;
            }
            let mut contains_other = false;
            for (j, &idx) in remaining.iter().enumerate() {
                if j == (i + m - 1) % m || j == i || j == (i + 1) % m {
                    continue;
                }
                if point_in_tri(pts[idx], pts[ia], pts[ib], pts[ic]) {
                    contains_other = true;
                    break;
                }
            }
            if !contains_other {
                tris.push([ia, ib, ic]);
                remaining.remove(i);
                ear_found = true;
                break;
            }
        }
        if !ear_found {
            // Fallback: centroid fan (robust but may produce skinny tris).
            break;
        }
    }
    if remaining.len() == 3 {
        tris.push([remaining[0], remaining[1], remaining[2]]);
    } else if remaining.len() > 3 {
        // Fan-fallback when ear clipping cannot progress.
        let anchor = remaining[0];
        for i in 1..remaining.len() - 1 {
            tris.push([anchor, remaining[i], remaining[i + 1]]);
        }
    }
    tris
}

fn is_convex(a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
    let ux = b.0 - a.0;
    let uy = b.1 - a.1;
    let vx = c.0 - b.0;
    let vy = c.1 - b.1;
    (ux * vy - uy * vx) > 0.0
}

fn point_in_tri(p: (f32, f32), a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
    fn sign(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
        (p.0 - b.0) * (a.1 - b.1) - (a.0 - b.0) * (p.1 - b.1)
    }
    let d1 = sign(p, a, b);
    let d2 = sign(p, b, c);
    let d3 = sign(p, c, a);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
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

/// Assign a component id to each triangle via union-find over shared edges;
/// for each component, cast a ray from a point well outside the bbox along a
/// random direction and count hits. If the count is even when the component
/// is supposed to contain the origin, or if the signed volume disagrees with
/// the majority-normal direction, flip every triangle's winding.
fn repair_orientation(mesh: &mut IndexedMesh) -> usize {
    if mesh.triangles.is_empty() {
        return 0;
    }
    let components = triangle_components(mesh);
    let n_components = components.iter().max().copied().unwrap_or(0) + 1;
    let mut flipped_faces = 0usize;

    // Per-component signed volume gives us the simplest orientation check —
    // if a component is watertight and signed volume is negative, flip it.
    // For non-watertight components we fall back to a ray-cast vote using the
    // overall BVH.
    let bvh = Bvh::build(mesh);

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

        let flip_by_volume = vol < -1e-6;

        let should_flip = if flip_by_volume {
            true
        } else if vol.abs() < 1e-6 {
            // Likely not watertight — ray-cast vote using triangle centroids.
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
            false
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

/// Assign each triangle to a connected-component id (edge-shared).
pub(crate) fn triangle_components(mesh: &IndexedMesh) -> Vec<u32> {
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
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
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
        let outcome = repair(mesh, &options);
        assert!(outcome.report.likely_support_geometry);
    }

    /// A file can carry non-finite positions, and every float comparison on the
    /// way through must still be a total order. `partial_cmp(..).unwrap_or(Equal)`
    /// is not one, and Rust's sort panics on it ("user-provided comparison function
    /// does not correctly implement a total order") rather than returning a wrong
    /// order. That shipped as a crash on a 960k model with 12% non-finite values.
    #[test]
    fn classify_tolerates_non_finite_positions() {
        let positions: Vec<Vec3> = (0..768)
            .map(|i| {
                let value = i as f32;
                Vec3::new(
                    if i % 7 == 0 { f32::NAN } else { (value * 0.37).sin() * value },
                    if i % 11 == 0 { f32::INFINITY } else { (value * 0.53).cos() * value },
                    if i % 13 == 0 { f32::NEG_INFINITY } else { value },
                )
            })
            .collect();
        let triangles: Vec<[u32; 3]> = (0..positions.len() as u32 - 3)
            .map(|i| [i, i + 1, i + 2])
            .collect();
        let mesh = IndexedMesh { positions, triangles };

        let outcome = classify_support_split(mesh, &RepairOptions::default());

        // The contract is that it returns at all, on garbage input.
        assert_eq!(outcome.mesh.triangles.len(), 765);
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
        let v = vec![
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
