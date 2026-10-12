//! Smoke tests for the repair pipeline on synthetic fixtures.

use dragonfruit_mesh_repair::core::mesh::{IndexedMesh, Vec3};
use dragonfruit_mesh_repair::{analyze, repair, repair_with_progress, RepairOptions};

/// Build a unit cube with outward-facing winding.
fn unit_cube() -> IndexedMesh {
    let positions = vec![
        Vec3::new(0.0, 0.0, 0.0), // 0
        Vec3::new(1.0, 0.0, 0.0), // 1
        Vec3::new(1.0, 1.0, 0.0), // 2
        Vec3::new(0.0, 1.0, 0.0), // 3
        Vec3::new(0.0, 0.0, 1.0), // 4
        Vec3::new(1.0, 0.0, 1.0), // 5
        Vec3::new(1.0, 1.0, 1.0), // 6
        Vec3::new(0.0, 1.0, 1.0), // 7
    ];
    let triangles = vec![
        // -Z face (normal = -Z, outward for min-z face)
        [0, 2, 1],
        [0, 3, 2],
        // +Z face
        [4, 5, 6],
        [4, 6, 7],
        // -Y face
        [0, 1, 5],
        [0, 5, 4],
        // +Y face
        [3, 7, 6],
        [3, 6, 2],
        // -X face
        [0, 4, 7],
        [0, 7, 3],
        // +X face
        [1, 2, 6],
        [1, 6, 5],
    ];
    IndexedMesh {
        positions,
        triangles,
    }
}

#[test]
fn watertight_cube_is_clean() {
    let mesh = unit_cube();
    let report = analyze(&mesh);
    assert_eq!(report.triangle_count, 12);
    assert_eq!(report.vertex_count, 8);
    assert_eq!(report.boundary_edges, 0, "cube has no boundary");
    assert_eq!(report.non_manifold_edges, 0, "cube is manifold");
    assert_eq!(report.connected_components, 1);
    assert!(report.is_watertight);
    assert!(
        report.signed_volume > 0.0,
        "cube should have positive volume"
    );
}

#[test]
fn duplicated_vertices_are_welded() {
    let mut mesh = unit_cube();
    // Duplicate every vertex so tris reference distinct-but-coincident slots.
    let original_len = mesh.positions.len();
    let dup_positions: Vec<Vec3> = mesh.positions.clone();
    mesh.positions.extend(dup_positions);
    // Rewrite tris to use the duplicates for index 0, originals for 1,2.
    for tri in mesh.triangles.iter_mut() {
        tri[0] += original_len as u32;
    }
    let outcome = repair(mesh, &RepairOptions::default());
    assert_eq!(
        outcome.mesh.vertex_count(),
        8,
        "welding should reduce to 8 unique corners"
    );
    assert!(outcome
        .report
        .steps
        .iter()
        .any(|s| s.name == "stitch" && s.changed > 0));
}

#[test]
fn inverted_cube_gets_flipped() {
    let mut mesh = unit_cube();
    for tri in mesh.triangles.iter_mut() {
        tri.swap(1, 2);
    }
    assert!(mesh.signed_volume() < 0.0);
    let outcome = repair(mesh, &RepairOptions::default());
    assert!(
        outcome.mesh.signed_volume() > 0.0,
        "orientation repair should flip inverted cube to positive volume"
    );
    assert!(outcome.report.post.is_watertight);
}

#[test]
fn hole_is_filled() {
    let mut mesh = unit_cube();
    // Remove the -Z face (2 triangles).
    mesh.triangles.remove(0);
    mesh.triangles.remove(0);
    let pre = analyze(&mesh);
    assert!(
        pre.boundary_edges > 0,
        "cube missing a face should have a boundary"
    );
    let outcome = repair(mesh, &RepairOptions::default());
    assert_eq!(
        outcome.report.post.boundary_edges, 0,
        "small hole should be filled"
    );
    assert!(outcome.report.post.is_watertight);
}

#[test]
fn duplicate_triangles_are_culled() {
    let mut mesh = unit_cube();
    mesh.triangles.push(mesh.triangles[0]);
    mesh.triangles.push(mesh.triangles[1]);
    let outcome = repair(mesh, &RepairOptions::default());
    assert_eq!(outcome.mesh.triangles.len(), 12);
}

#[test]
fn degenerate_triangles_are_culled() {
    let mut mesh = unit_cube();
    // Add a zero-area degenerate (repeated index).
    mesh.triangles.push([0, 0, 1]);
    let outcome = repair(mesh, &RepairOptions::default());
    assert_eq!(outcome.mesh.triangles.len(), 12);
}


/// The stage order is the design, not an accident.
///
/// Orientation, stitch, holes and double faces each disturb what the one before it
/// settled, so they come round more than once. A refactor that "simplifies" this list
/// has changed what the repair does, and this is where that shows up.
#[test]
fn the_pipeline_runs_the_stage_order_it_says_it_does() {
    let outcome = repair(unit_cube(), &RepairOptions::default());
    let names: Vec<&str> = outcome
        .report
        .steps
        .iter()
        .map(|step| step.name.as_str())
        .collect();
    assert_eq!(
        names,
        [
            "orient_components",
            "stitch",
            "holes_trivial",
            "double_faces",
            "orient_holes_stitch",
            "orient_holes_all_stitch",
            "double_faces_after_split",
            "remove_inner_faces",
            "noise_shells",
            "settle",
            "prune_and_classify",
        ]
    );
}

/// The sink hears about each stage before it runs, and stopping it stops the run.
#[test]
fn the_progress_sink_sees_each_stage_and_can_stop_the_run() {
    let mut seen: Vec<String> = Vec::new();
    let outcome = repair_with_progress(
        unit_cube(),
        &RepairOptions::default(),
        Some(&mut |name, index| {
            seen.push(format!("{index}:{name}"));
            true
        }),
    );
    assert_eq!(seen.len(), outcome.report.steps.len());
    assert_eq!(seen[0], "1:orient_components");
    assert!(!outcome.report.cancelled);

    // Say no to the third stage and the run stops at the boundary before it.
    let mut asked = 0;
    let stopped = repair_with_progress(
        unit_cube(),
        &RepairOptions::default(),
        Some(&mut |_, _| {
            asked += 1;
            asked < 3
        }),
    );
    assert!(stopped.report.cancelled);
    assert_eq!(stopped.report.steps.len(), 2, "the third stage never ran");
    assert!(
        !stopped.report.fully_repaired || stopped.report.post.is_watertight,
        "a cancelled run still reports the mesh it has"
    );
}
