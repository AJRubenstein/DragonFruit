//! Surface to solid: rebuild a surface by making it a solid rather than by resampling it.
//!
//! This is the mechanism behind the reference implementation's shrinkwrap, and it is the hollowing
//! machinery run with the offset turned off: scan for the open edges, close them, take a boolean of
//! the mesh with itself, and drop the shells the boolean leaves behind.
//!
//! A boolean of a mesh with itself regularises it: the result is re-triangulated, coincident and
//! self-intersecting geometry is resolved, and what comes back is a solid. That is the whole
//! difference from [`crate::tet_wrap`], which conforms a decomposition to the input's own triangles
//! and therefore returns the input's surface back. Both are remeshes; only one of them moves the
//! surface.
//!
//! The boolean here is `manifold_csg`, whose construction is the same operation: building a
//! `Manifold` from a mesh resolves it into a valid solid and re-triangulates it, and reading it back
//! out is the rebuilt surface.
//!
//! # This is not repair
//!
//! Like the tetrahedral mode it is a mode a caller names, never a stage of [`crate::repair`]: repair
//! may not invent geometry, and a boolean does nothing else.

use crate::{IndexedMesh, Vec3};
use crate::tet_wrap::PhaseSink;

/// How the rebuild is done and what is done with the result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SolidRemeshOptions {
    /// Cap the number of edges a boundary loop may have for the hole pass to fill it. Every loop is
    /// the default, which is what a rebuild wants: the boundary is about to be resolved anyway, so a
    /// loop left open only gives the boolean something it cannot resolve. Note that the pass itself
    /// reads zero as "no loop qualifies", not as "no cap".
    pub fill_holes_max_edges: usize,
    /// Drop scrap shells after the rebuild, which is the reference's own last step.
    pub remove_noise_shells: bool,
    /// Simplify before resolving, on [`crate::repair::simplify_to_error`]'s scale: 0.001 removes
    /// about a quarter of a dense model, 0.005 removes most of it, and 0.05 leaves 190 triangles of
    /// 170,790. Zero leaves the surface alone.
    ///
    /// This is the step that makes a shrink-wrap look rebuilt rather than merely resolved: a boolean
    /// of a clean solid with itself is idempotent, so without it the surface comes back exactly as it
    /// went in. It belongs in this mode rather than the tetrahedral one because collapsing a surface
    /// folds it, and a boolean is what resolves a folded one.
    pub tolerance: f32,
}

impl Default for SolidRemeshOptions {
    fn default() -> Self {
        Self {
            fill_holes_max_edges: usize::MAX,
            remove_noise_shells: true,
            tolerance: 0.001,
        }
    }
}

/// What the rebuild did.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SolidRemeshReport {
    pub input_triangles: usize,
    pub output_triangles: usize,
    /// Shells before and after. The reference's shrinkwrap is recorded as taking 246 shells to 1, so
    /// this is a number worth reporting rather than a detail.
    pub shells_before: usize,
    pub shells_after: usize,
    /// Boundary loops closed before the boolean ran.
    pub holes_filled: usize,
    /// Set when the boolean refused the input. The mesh is then the input unchanged, and this is
    /// the reason: a mesh that is not a solid cannot be resolved into one.
    pub declined: Option<String>,
    pub ms: f64,
    pub cancelled: bool,
}

/// The rebuilt surface and its report.
pub struct SolidRemeshOutcome {
    pub mesh: IndexedMesh,
    pub report: SolidRemeshReport,
}

/// Rebuild `mesh` as a solid. Returns the input unchanged with a zeroed report when the boolean
/// cannot resolve it, rather than an empty mesh.
pub fn solid_remesh(mesh: &IndexedMesh, options: &SolidRemeshOptions) -> SolidRemeshOutcome {
    solid_remesh_with_progress(mesh, options, None)
}

/// Rebuild `mesh`, telling `sink` about each phase as it starts.
///
/// Cancelling stops the run at a phase boundary and returns the input unchanged, so a caller that
/// stops has made no change to the geometry it handed in.
pub fn solid_remesh_with_progress(
    mesh: &IndexedMesh,
    options: &SolidRemeshOptions,
    sink: Option<&mut dyn FnMut(&str, usize) -> bool>,
) -> SolidRemeshOutcome {
    let started = std::time::Instant::now();
    let mut phases = PhaseSink::new(sink);

    let unchanged = |declined: Option<String>, cancelled: bool| SolidRemeshOutcome {
        mesh: mesh.clone(),
        report: SolidRemeshReport {
            input_triangles: mesh.triangles.len(),
            output_triangles: mesh.triangles.len(),
            shells_before: 0,
            shells_after: 0,
            holes_filled: 0,
            declined,
            ms: started.elapsed().as_secs_f64() * 1000.0,
            cancelled,
        },
    };

    let shells_of = |m: &IndexedMesh| {
        crate::repair::triangle_components(m)
            .iter()
            .copied()
            .max()
            .map_or(0, |x| x as usize + 1)
    };
    let shells_before = shells_of(mesh);

    // 1. Prepare. The boolean needs consistent winding and one vertex per position, because its
    //    input is a solid and a soup is not one.
    if !phases.phase("prepare") {
        return unchanged(None, true);
    }
    let mut prepared = mesh.clone();
    prepared.weld_by_position();
    crate::tet_wrap::snap_weld(&mut prepared);
    crate::repair::repair_orientation(&mut prepared);
    crate::topology_passes::split_pinched_vertices(&mut prepared);

    // 2. Simplify, which is where this stops being a no-op on a clean solid: their pipeline does
    //    this before the boolean, and it is what makes the surface come back rebuilt.
    if !phases.phase("simplify") {
        return unchanged(None, true);
    }
    if options.tolerance > 0.0 {
        prepared = crate::repair::simplify_to_error(prepared, options.tolerance);
    }

    // 3. Close what is open, before the boolean sees it: their pipeline does this first too.
    if !phases.phase("fill") {
        return unchanged(None, true);
    }
    let holes_filled = crate::repair::fill_small_holes(&mut prepared, options.fill_holes_max_edges);

    // 4. Resolve it into a solid. Building the manifold is the boolean: it is where coincident,
    //    self-intersecting and non-manifold geometry is reconciled and the surface is retriangulated.
    if !phases.phase("solid") {
        return unchanged(None, true);
    }
    #[cfg(feature = "manifold")]
    {
        let outcome = manifold_round_trip(&prepared);
        match outcome {
            Ok(rebuilt) => prepared = rebuilt,
            Err(reason) => return unchanged(Some(reason), false),
        }
    }
    #[cfg(not(feature = "manifold"))]
    {
        return unchanged(
            Some("the manifold backend is not compiled in, so nothing can resolve a surface into a solid".to_string()),
            false,
        );
    }

    // 5. Drop what the rebuild left behind.
    if !phases.phase("shells") {
        return unchanged(None, true);
    }
    if options.remove_noise_shells {
        crate::shells::remove_noise_shells(&mut prepared);
    }

    let shells_after = shells_of(&prepared);
    let output_triangles = prepared.triangles.len();
    SolidRemeshOutcome {
        mesh: prepared,
        report: SolidRemeshReport {
            input_triangles: mesh.triangles.len(),
            output_triangles,
            shells_before,
            shells_after,
            holes_filled,
            declined: None,
            ms: started.elapsed().as_secs_f64() * 1000.0,
            cancelled: false,
        },
    }
}

/// Build a manifold from the mesh and read it back: the boolean, in one call.
#[cfg(feature = "manifold")]
fn manifold_round_trip(mesh: &IndexedMesh) -> Result<IndexedMesh, String> {
    use manifold_csg::Manifold;

    // Compact the vertices first. A manifold is built from positions and indices, and leaving
    // unreferenced vertices in gives it geometry with nothing attached to it.
    let mut remap: Vec<u32> = vec![u32::MAX; mesh.positions.len()];
    let mut positions: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::with_capacity(mesh.triangles.len() * 3);
    for tri in &mesh.triangles {
        for &v in tri {
            let slot = &mut remap[v as usize];
            if *slot == u32::MAX {
                *slot = (positions.len() / 3) as u32;
                let p = mesh.positions[v as usize];
                positions.extend_from_slice(&[p.x, p.y, p.z]);
            }
            indices.push(*slot);
        }
    }
    if positions.is_empty() || indices.len() < 12 {
        return Err("there is not enough geometry to make a solid of".to_string());
    }

    let solid = Manifold::from_mesh_f32(&positions, 3, &indices)
        .map_err(|err| format!("the surface is not a solid it can resolve: {err:?}"))?;
    if solid.is_empty() || solid.num_tri() == 0 {
        return Err("the surface resolved to nothing".to_string());
    }
    let (out_positions, stride, out_indices) = solid.to_mesh_f32();
    if out_positions.is_empty() || out_indices.len() < 12 {
        return Err("the rebuilt surface came back empty".to_string());
    }
    Ok(IndexedMesh {
        positions: out_positions
            .chunks_exact(stride)
            .map(|c| Vec3::new(c[0], c[1], c[2]))
            .collect(),
        triangles: out_indices
            .chunks_exact(3)
            .map(|c| [c[0], c[1], c[2]])
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A closed cube, twelve triangles, one shell.
    fn cube() -> IndexedMesh {
        let corners = [
            Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0), Vec3::new(1.0, 1.0, 0.0), Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(0.0, 1.0, 1.0), Vec3::new(1.0, 1.0, 1.0),
        ];
        let quads: [[u32; 4]; 6] = [
            [0, 2, 4, 1], [0, 1, 5, 3], [0, 3, 6, 2],
            [7, 5, 1, 4], [7, 4, 2, 6], [7, 6, 3, 5],
        ];
        let mut triangles = Vec::new();
        for q in quads {
            triangles.push([q[0], q[1], q[3]]);
            triangles.push([q[1], q[2], q[3]]);
        }
        IndexedMesh { positions: corners.to_vec(), triangles }
    }

    /// A closed solid is already a solid, so resolving it returns it. This is worth pinning: it is
    /// the reason a rebuild is not a resample, and the reason it is the wrong tool for a clean mesh
    /// and the right one for a mesh that is not one solid.
    #[test]
    fn a_closed_solid_comes_back_a_closed_solid() {
        let outcome = solid_remesh(&cube(), &SolidRemeshOptions::default());
        let report = &outcome.report;
        assert!(report.declined.is_none(), "a cube must resolve: {:?}", report.declined);
        assert_eq!(report.shells_before, 1);
        assert_eq!(report.shells_after, 1);
        assert!(report.output_triangles >= 12, "got {}", report.output_triangles);
        assert_eq!(outcome.mesh.triangles.len(), report.output_triangles);
    }

    /// An open surface is closed before the boolean sees it, which is the order the reference uses
    /// too - it fills every hole first for the same reason: a boolean cannot resolve a boundary.
    #[test]
    fn an_open_solid_is_closed_and_then_resolved() {
        let mut open = cube();
        // Remove a face so the surface has a boundary and encloses nothing.
        open.triangles.truncate(open.triangles.len() - 2);
        let outcome = solid_remesh(&open, &SolidRemeshOptions::default());
        let report = &outcome.report;
        assert!(report.holes_filled > 0, "the boundary should have been capped");
        assert!(report.declined.is_none(), "a capped solid must resolve: {:?}", report.declined);
        assert_eq!(report.shells_after, 1);
        assert!(report.output_triangles > open.triangles.len());
    }

    /// A model that cannot be resolved is handed back, not emptied. A caller that gets an empty mesh
    /// has lost the model it asked about.
    #[test]
    fn a_model_that_cannot_be_resolved_comes_back_unchanged() {
        let sliver = IndexedMesh {
            positions: vec![
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
            ],
            triangles: vec![[0, 1, 2]],
        };
        let outcome = solid_remesh(&sliver, &SolidRemeshOptions::default());
        assert!(outcome.report.declined.is_some(), "a single triangle is not a solid");
        assert_eq!(outcome.mesh.triangles.len(), sliver.triangles.len());
        assert!(!outcome.report.cancelled);
    }

    /// Stopping returns the input and says so, so a caller that stops has changed nothing.
    #[test]
    fn stopping_returns_the_input_unchanged() {
        let mesh = cube();
        let mut seen: Vec<String> = Vec::new();
        let outcome = solid_remesh_with_progress(&mesh, &SolidRemeshOptions::default(), Some(&mut |name, _| {
            seen.push(name.to_string());
            name != "fill"
        }));
        assert_eq!(seen, vec!["prepare", "simplify", "fill"]);
        assert!(outcome.report.cancelled);
        assert_eq!(outcome.mesh.triangles.len(), mesh.triangles.len());
    }
}
