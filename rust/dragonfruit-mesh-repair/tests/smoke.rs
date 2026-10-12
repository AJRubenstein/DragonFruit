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
    let named: Vec<&str> = seen
        .iter()
        .map(|entry| entry.split(':').nth(1).unwrap())
        .collect();
    let recorded: Vec<&str> = outcome
        .report
        .steps
        .iter()
        .map(|step| step.name.as_str())
        .collect();
    assert_eq!(
        named, recorded,
        "the sink has to name the stage it is announcing, in the order the report records them"
    );
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

/// A solid with a cavity keeps its cavity.
///
/// The wall of a cavity faces inward, which is what a cavity wall is. A per-component
/// outward vote turns it outward, and that makes the cavity a solid and moves the model's
/// volume: on a real multi-component model it flipped 83,745 faces and the volume moved 17%.
/// The orientation pass propagates winding per patch and guards its component vote with a
/// nesting test, so a component sitting inside another keeps the orientation it has.
#[test]
fn a_cavity_keeps_its_orientation() {
    let mut mesh = unit_cube();
    let outer_faces = mesh.triangles.len();

    // A smaller cube inside it, wound the other way, which is what a cavity looks like.
    let base = mesh.positions.len() as u32;
    for corner in [
        Vec3::new(0.3, 0.3, 0.3),
        Vec3::new(0.7, 0.3, 0.3),
        Vec3::new(0.7, 0.7, 0.3),
        Vec3::new(0.3, 0.7, 0.3),
        Vec3::new(0.3, 0.3, 0.7),
        Vec3::new(0.7, 0.3, 0.7),
        Vec3::new(0.7, 0.7, 0.7),
        Vec3::new(0.3, 0.7, 0.7),
    ] {
        mesh.positions.push(corner);
    }
    let inner = [
        [0u32, 2, 1], [0, 3, 2],
        [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4],
        [3, 7, 6], [3, 6, 2],
        [0, 4, 7], [0, 7, 3],
        [1, 2, 6], [1, 6, 5],
    ];
    for face in inner {
        mesh.triangles.push([face[0] + base, face[1] + base, face[2] + base]);
    }
    assert_eq!(mesh.triangles.len(), outer_faces * 2);

    let before = mesh.signed_volume();
    assert!(before > 0.9, "the cavity should subtract: {before}");
    assert_eq!(analyze(&mesh).inconsistent_winding_edges, 0);

    let outcome = repair(mesh, &RepairOptions::default());
    let after = outcome.mesh.signed_volume();
    assert!(
        (after - before).abs() / before.abs() < 1e-3,
        "the cavity was turned inside out: {before} -> {after}"
    );
    assert_eq!(
        outcome.report.post.inconsistent_winding_edges, 0,
        "and the winding is still consistent"
    );
}

/// Two surfaces sharing an edge are separated, and the mesh comes out manifold.
///
/// A cube with a third triangle hung off one of its edges. That edge carries three faces,
/// two forward and one backward, which no pairing resolves. The split gives each surface its
/// own copy of the edge's vertices, moved into its own solid, so a re-read of the exported
/// file cannot merge them back. This is the watertight repair of overlapping parts, and it is
/// the one case the pipeline could previously only report.
#[test]
fn a_shared_edge_is_separated() {
    let mut mesh = unit_cube();
    let apex = mesh.positions.len() as u32;
    mesh.positions.push(Vec3::new(0.5, -0.4, 0.6));
    mesh.triangles.push([0, 1, apex]);

    let before = analyze(&mesh);
    assert!(
        before.non_manifold_edges > 0,
        "the fixture has to start with a shared edge: {before:?}"
    );

    let outcome = repair(mesh, &RepairOptions::default());
    let after = &outcome.report.post;
    assert_eq!(
        after.non_manifold_edges, 0,
        "the shared edge should be separated: {:?}",
        outcome.report.residual_issues
    );
    assert!(
        after.boundary_edges <= before.boundary_edges,
        "and it must not open anything: {} -> {}",
        before.boundary_edges,
        after.boundary_edges
    );

    // And the order they run in. The union merges parts that overlap and skips any component that
    // is not already manifold; the split offsets the surfaces it separates, so nothing can merge
    // them afterwards. Running the split first separates surfaces and then leaves the union unable
    // to merge anything, which measured as 240 parts where the other order gives 43.
    let names: Vec<&str> = outcome
        .report
        .steps
        .iter()
        .map(|step| step.name.as_str())
        .collect();
    let union_at = names
        .iter()
        .position(|name| *name == "union_overlapping_parts")
        .expect("the fixture has bad edges, so the union runs");
    let split_at = names
        .iter()
        .position(|name| *name == "split_non_manifold_edges")
        .expect("and a shared edge, so the split runs");
    assert!(
        union_at < split_at,
        "the union has to run before the split or it has nothing it can merge: {names:?}"
    );
}

/// Small shells that are not scraps are kept.
///
/// A model with supports is a model with hundreds of small closed shells. The reference's
/// noise-shell rule also deletes a shell whose area is under a hundredth of the mesh's and whose
/// triangle count is under a twentieth, and every support pillar is one: on `COOKIE_b4.stl` it
/// took 88,912 faces and the repair reported success while the supports were gone.
///
/// The mistakes are not symmetric. Keeping a stray shell costs a shell the user can see and
/// delete; deleting a support costs a print.
#[test]
fn small_shells_that_are_not_scraps_are_kept() {
    let mut mesh = unit_cube();
    for pillar in 0..12 {
        let base = mesh.positions.len() as u32;
        let x = 2.0 + pillar as f32 * 0.5;
        for corner in [
            Vec3::new(x, 0.0, 0.0),
            Vec3::new(x + 0.2, 0.0, 0.0),
            Vec3::new(x + 0.2, 0.2, 0.0),
            Vec3::new(x, 0.2, 0.0),
            Vec3::new(x, 0.0, 0.2),
            Vec3::new(x + 0.2, 0.0, 0.2),
            Vec3::new(x + 0.2, 0.2, 0.2),
            Vec3::new(x, 0.2, 0.2),
        ] {
            mesh.positions.push(corner);
        }
        for face in [
            [0u32, 2, 1], [0, 3, 2],
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [3, 7, 6], [3, 6, 2],
            [0, 4, 7], [0, 7, 3],
            [1, 2, 6], [1, 6, 5],
        ] {
            mesh.triangles.push([face[0] + base, face[1] + base, face[2] + base]);
        }
    }

    let before = analyze(&mesh);
    assert_eq!(before.connected_components, 13, "the fixture is a model and 12 pillars");

    let outcome = repair(mesh, &RepairOptions::default());
    let after = &outcome.report.post;
    assert_eq!(
        after.connected_components, before.connected_components,
        "no pillar is a scrap: {:?}",
        outcome.report.residual_issues
    );
    assert_eq!(
        after.triangle_count, before.triangle_count,
        "and no pillar lost a face"
    );
}
