//! What makes a mesh broken, in the terms the reference engine uses.
//!
//! the reference engine's evaluators are `the orientation evaluator`, `the bad-edge evaluator`, `the hole evaluator`,
//! `the non-manifold evaluator` and `the shell evaluator`. There is no sixth, and in particular
//! **there is no self-intersection evaluator**: the reference engine's repair acts on
//! self-intersections and its verdict does not count them.
//!
//! That distinction is the one this engine kept getting wrong. A mesh was called
//! broken for carrying self-intersections a slicer does not care about, and then
//! minutes were spent trying to remove them, on files that print perfectly. The
//! verdict here is the reference engine's five classes and nothing else; self-intersections are a
//! number to report, not a defect to declare.

use crate::core::halfedge::Topology;
use crate::core::mesh::IndexedMesh;
use crate::shells::noise_shells;

/// The five defect classes, as counts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct MeshDefects {
    /// `the orientation evaluator`: edges whose two faces traverse them the same way.
    pub inconsistent_edges: usize,
    /// `the bad-edge evaluator`: edges not shared by exactly two faces.
    ///
    /// The union of the two classes below it, which is how the reference engine counts it: an edge
    /// with one face is a hole's edge, an edge with three is non-manifold, and both
    /// are bad edges.
    pub bad_edges: usize,
    /// `the hole evaluator`: boundary loops.
    pub holes: usize,
    /// `the non-manifold evaluator`: edges carrying more than two faces.
    pub non_manifold_edges: usize,
    /// The vertices a non-manifold edge passes through, which no winding can fix.
    pub non_manifold_vertices: usize,
    /// `the shell evaluator`: shells small enough to be noise.
    pub noise_shells: usize,
}

impl MeshDefects {
    /// Is there anything here for a repair to do?
    pub fn is_broken(&self) -> bool {
        self.inconsistent_edges > 0
            || self.bad_edges > 0
            || self.holes > 0
            || self.non_manifold_edges > 0
            || self.non_manifold_vertices > 0
            || self.noise_shells > 0
    }

    /// Every defect, added up, for comparing a mesh with itself across a pass.
    pub fn total(&self) -> usize {
        self.inconsistent_edges
            + self.bad_edges
            + self.holes
            + self.non_manifold_edges
            + self.non_manifold_vertices
            + self.noise_shells
    }
}

/// Evaluates the five classes on a mesh.
pub fn evaluate(mesh: &IndexedMesh) -> MeshDefects {
    if mesh.triangles.is_empty() {
        return MeshDefects::default();
    }
    let topology = Topology::build(mesh);
    let boundary_edges = topology.boundary_edges().len();
    let non_manifold_edges = topology.non_manifold_edges().len();
    let holes = topology.boundary_loops().len();
    MeshDefects {
        inconsistent_edges: topology.inconsistent_edges(),
        bad_edges: boundary_edges + non_manifold_edges,
        holes,
        non_manifold_edges,
        non_manifold_vertices: count_non_manifold_vertices(mesh),
        noise_shells: noise_shells(mesh).len(),
    }
}

/// Vertices whose faces form more than one umbrella, which is a pinch.
///
/// The same rule the vertex split uses, so the count that reports whether it worked
/// cannot drift from the count that drives it.
fn count_non_manifold_vertices(mesh: &IndexedMesh) -> usize {
    let topology = Topology::build(mesh);
    let mut faces_at: Vec<Vec<u32>> = vec![Vec::new(); mesh.positions.len()];
    for (index, triangle) in mesh.triangles.iter().enumerate() {
        for &vertex in triangle {
            faces_at[vertex as usize].push(index as u32);
        }
    }
    let mut pinched = 0usize;
    for (vertex, faces) in faces_at.iter().enumerate() {
        if faces.len() < 2 {
            continue;
        }
        // Walk the faces around the vertex through shared edges and count how many
        // separate rings they make.
        let mut unvisited: Vec<u32> = faces.clone();
        let mut rings = 0usize;
        while let Some(seed) = unvisited.pop() {
            rings += 1;
            let mut stack = vec![seed];
            while let Some(face) = stack.pop() {
                let triangle = mesh.triangles[face as usize];
                for corner in 0..3 {
                    let a = triangle[corner];
                    let b = triangle[(corner + 1) % 3];
                    if a != vertex as u32 && b != vertex as u32 {
                        continue;
                    }
                    let other = if a == vertex as u32 { b } else { a };
                    let edge = crate::core::halfedge::edge_key(vertex as u32, other);
                    let Some(info) = topology.edges.get(&edge) else {
                        continue;
                    };
                    for &neighbour in &info.faces {
                        if let Some(position) = unvisited.iter().position(|f| *f == neighbour) {
                            unvisited.remove(position);
                            stack.push(neighbour);
                        }
                    }
                }
            }
        }
        if rings > 1 {
            pinched += 1;
        }
    }
    pinched
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::mesh::Vec3;
    use crate::test_fixtures::unit_cube;

    /// A closed cube is not broken, and its self-intersections are not consulted.
    #[test]
    fn a_closed_cube_has_no_defects() {
        let defects = evaluate(&unit_cube());
        assert!(!defects.is_broken(), "{defects:?}");
        assert_eq!(defects.total(), 0);
    }

    /// A hole is a hole, and an open surface is broken for the reference engine.
    #[test]
    fn a_missing_face_is_a_hole() {
        let mut cube = unit_cube();
        cube.triangles.pop();
        let defects = evaluate(&cube);
        assert!(defects.is_broken());
        assert_eq!(defects.holes, 1, "{defects:?}");
        assert_eq!(defects.bad_edges, 3, "the hole's three edges");
        assert_eq!(defects.non_manifold_edges, 0);
    }

    /// An edge carrying three faces is non-manifold, and it is also a bad edge.
    #[test]
    fn a_shared_edge_is_non_manifold() {
        let mut mesh = unit_cube();
        let centre = mesh.positions.len() as u32;
        mesh.positions.push(Vec3::new(0.5, 0.5, 0.5));
        mesh.triangles.push([4, 5, centre]);

        let defects = evaluate(&mesh);
        assert!(defects.is_broken());
        assert_eq!(defects.non_manifold_edges, 1, "{defects:?}");
        assert!(defects.bad_edges >= 1);
    }

    /// A pinched vertex is counted, because no winding fixes it.
    #[test]
    fn a_pinched_vertex_is_counted() {
        // Two triangles meeting at one vertex and nowhere else.
        let mesh = IndexedMesh {
            positions: vec![
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(1.0, 1.0, 0.0),
                Vec3::new(-1.0, 0.0, 0.0),
                Vec3::new(-1.0, -1.0, 0.0),
            ],
            triangles: vec![[0, 1, 2], [0, 3, 4]],
        };
        let defects = evaluate(&mesh);
        assert_eq!(defects.non_manifold_vertices, 1, "{defects:?}");
        assert!(defects.is_broken());
    }
}
