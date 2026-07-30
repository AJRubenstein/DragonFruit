//! Cut the model's SURFACE along the seam, so the seam becomes mesh edges.
//!
//! This is the piece the contour cut is missing. Once the seam runs along edges
//! rather than across faces, "which side is this triangle on" is a walk over the
//! face graph — no cutter, no kerf, no epsilon, nothing to classify afterwards —
//! and the two sides can be capped with the membrane they already share a boundary
//! with. See `docs/adr/0002-contour-cut-post-mortem.md`.
//!
//! The shape of it:
//!
//! - Walk the seam face by face, recording where it CROSSES each mesh edge. Both
//!   faces either side of an edge get the very same crossing point, which is what
//!   keeps the result watertight.
//! - Inside a face, the seam is taken as the straight chord between where it came
//!   in and where it went out. The error is bounded by one face (sub-millimetre on
//!   any mesh worth cutting) and it removes a whole class of special cases.
//! - Retriangulate only the faces the seam crosses, with the chords as constraints,
//!   so every other triangle of the model is left exactly as it was.
//!
//! Known gap: on a real, dirty model a handful of seams (8 of the 32 captured)
//! leave one or two edges used by four triangles instead of two, always where the
//! seam grazes a pair of faces that sit on the same two edges. Measured and ruled
//! out: dropping needle triangles by relative area (makes it worse — a needle is
//! still part of the tiling), cutting a chord only once across faces, and dropping
//! repeated triangles (worse again). The faces involved come out of the walk in
//! pairs, so the next place to look is the walk stepping into a face it has already
//! left.
//!
//! Known gap: a seam that lies exactly ALONG existing edges — a ring at precisely a
//! mesh's own grid line, which a hand-drawn seam never is, but a machine-made one
//! could be — walks from vertex to vertex rather than crossing anything, and the
//! wall it leaves has gaps the side walk slips through. Cutting stays watertight
//! there; it just may not separate.

use ahash::{AHashMap, AHashSet};
use dragonfruit_mesh_core::bvh::Bvh;
use dragonfruit_mesh_core::mesh::{Aabb, IndexedMesh, Vec3};

use crate::membrane::closest_on_tri;

/// The model's surface, cut along the seam.
pub struct SplitSurface {
    /// The mesh, with the seam running along edges. Every face untouched by the
    /// seam is unchanged, and unchanged faces keep their vertices.
    pub mesh: IndexedMesh,
    /// Which piece of the cut surface each face belongs to. Pieces are numbered in
    /// the order they are met; two seams round a handle give two, a seam that
    /// separates nothing gives one, and a shell the model already carried is a
    /// piece of its own.
    pub piece_of_face: Vec<u32>,
    /// The seam as vertices of `mesh`, in order round the loop.
    pub seam_vertices: Vec<u32>,
    /// Which face of the INPUT mesh each face of `mesh` came from. A face the seam
    /// never touched maps to itself.
    pub source_face: Vec<u32>,
}

/// Cut `mesh`'s surface along one seam (a closed polyline lying on it).
pub fn split_along_seam(mesh: &IndexedMesh, seam: &[Vec3]) -> Result<SplitSurface, String> {
    split_along_seams(mesh, std::slice::from_ref(&seam.to_vec()))
}

/// Cut `mesh`'s surface along every seam, and say which side of them each face is
/// on.
///
/// The seams are cut one after another and the sides are decided once, at the end,
/// with all of them standing: a piece held by two seams — a tentacle that leaves
/// the body and fuses back — only comes away when both are walls at the same time.
/// Cutting only ever ADDS vertices, so a seam cut earlier keeps its edges valid
/// while the later ones are cut.
pub fn split_along_seams(mesh: &IndexedMesh, seams: &[Vec<Vec3>]) -> Result<SplitSurface, String> {
    if seams.iter().all(|s| s.len() < 3) {
        return Err("a seam needs at least 3 points".to_string());
    }
    let mut current = mesh.clone();
    let mut seam_edges: AHashSet<(u32, u32)> = AHashSet::new();
    let mut seam_vertices: Vec<u32> = Vec::new();
    let mut source_face: Vec<u32> = (0..mesh.triangles.len() as u32).collect();

    for seam in seams.iter().filter(|s| s.len() >= 3) {
        let dense = densify(seam, median_edge_length(&current) * 0.25);
        let bvh = Bvh::build(&current);
        let topo = Topology::build(&current);
        let crossings = walk(&current, &bvh, &topo, &dense)?;
        if crossings.is_empty() {
            return Err("the seam never crosses a triangle edge — it fits inside one face".to_string());
        }
        let cut = retriangulate(&current, crossings)?;
        current = cut.mesh;
        seam_edges.extend(cut.seam_edges);
        seam_vertices.extend(cut.seam_vertices);
        source_face = cut.source_face.iter().map(|&f| source_face[f as usize]).collect();
    }

    let piece_of_face = pieces(&current, &seam_edges);
    Ok(SplitSurface { mesh: current, piece_of_face, seam_vertices, source_face })
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/// One place the seam leaves a face for its neighbour, through their shared edge.
#[derive(Debug, Clone, Copy)]
struct Crossing {
    /// The mesh edge crossed, as its two vertex indices, low first.
    edge: (u32, u32),
    /// Where along that edge, 0..1 from the low vertex.
    t: f32,
    /// The face the seam was in before the crossing, and the one it moves into.
    from: u32,
    to: u32,
}

/// Follow the seam across the surface, recording every edge it crosses in order.
///
/// Each sample is located among the faces AROUND the one before it, not by nearest
/// face over the whole mesh and not by projecting into the current face's plane.
/// Both of those looked simpler and both are wrong: a point on an edge or a vertex
/// belongs to several faces equally, so a global nearest flips between faces that
/// are not neighbours; and a projection into the current plane puts a point that
/// really sits on the perpendicular face — a cube's corner, a shingle's lip —
/// comfortably INSIDE the current one, so the walk sticks there and sails past
/// every edge it should have crossed.
fn walk(mesh: &IndexedMesh, bvh: &Bvh, topo: &Topology, seam: &[Vec3]) -> Result<Vec<Crossing>, String> {
    /// How far the walk will look for the sample's face before giving up and
    /// asking the whole mesh. Dense sampling keeps this at 1 almost always.
    const NEARBY_HOPS: usize = 3;
    /// A step should cross a handful of faces at most; more means the sampling and
    /// the mesh disagree wildly and the caller is better off with the old cut.
    const MAX_HOPS_PER_STEP: usize = 8;

    let mut crossings: Vec<Crossing> = Vec::new();
    let mut face = nearest_face(bvh, mesh, seam[0])
        .ok_or_else(|| "the seam starts nowhere near the surface".to_string())?;

    for i in 0..seam.len() {
        let (a, b) = (seam[i], seam[(i + 1) % seam.len()]);
        let next = topo
            .nearest_around(mesh, face, b, NEARBY_HOPS)
            .or_else(|| nearest_face(bvh, mesh, b))
            .ok_or_else(|| "the seam leaves the surface".to_string())?;
        if next == face {
            continue;
        }
        let Some(path) = topo.path_between(face, next, MAX_HOPS_PER_STEP) else {
            return Err(format!(
                "the seam steps between faces {face} and {next}, which are not within \
                 {MAX_HOPS_PER_STEP} of each other — the mesh may be torn here"
            ));
        };
        for pair in path.windows(2) {
            let Some(edge) = topo.shared_edge(pair[0], pair[1]) else {
                return Err("two faces the walk stepped between share no edge".to_string());
            };
            let t = crossing_t(mesh, edge, a, b);
            crossings.push(Crossing { edge, t, from: pair[0], to: pair[1] });
        }
        face = next;
    }
    Ok(crossings)
}

/// Where on `edge` the step from `a` to `b` crosses it, as a fraction of the edge.
///
/// Snapping the crossing ONTO the edge is what makes the two faces either side of
/// it share the vertex exactly, and so what keeps the cut surface watertight.
/// Intersecting two lines in space instead has to cope with them not quite
/// meeting, and the leftovers are cracks.
fn crossing_t(mesh: &IndexedMesh, edge: (u32, u32), a: Vec3, b: Vec3) -> f32 {
    let (p, q) = (mesh.positions[edge.0 as usize], mesh.positions[edge.1 as usize]);
    let e = q.sub(p);
    let ee = e.dot(e);
    if ee < 1e-18 {
        return 0.5;
    }
    // Closest approach between the step [a,b] and the edge [p,q].
    let d = b.sub(a);
    // From the edge's start to the step's start: get this the wrong way round and
    // every crossing comes out negative and snaps to the end of its edge.
    let r = a.sub(p);
    let (dd, de, dr, er) = (d.dot(d), d.dot(e), d.dot(r), e.dot(r));
    let denom = dd * ee - de * de;
    let t = if denom.abs() > 1e-12 {
        (dd * er - de * dr) / denom
    } else {
        a.add(d.scale(0.5)).sub(p).dot(e) / ee
    };
    t.clamp(0.0, 1.0)
}

/// The face of `mesh` nearest `p`, searching a box that widens until it finds one.
fn nearest_face(bvh: &Bvh, mesh: &IndexedMesh, p: Vec3) -> Option<u32> {
    let mut r = 0.5f32;
    for _ in 0..6 {
        let query = Aabb {
            min: Vec3::new(p.x - r, p.y - r, p.z - r),
            max: Vec3::new(p.x + r, p.y + r, p.z + r),
        };
        let mut best = (f32::INFINITY, u32::MAX);
        bvh.query_aabb(&query, |ti| {
            let t = &mesh.triangles[ti as usize];
            let (_, d2) = closest_on_tri(
                p,
                mesh.positions[t[0] as usize],
                mesh.positions[t[1] as usize],
                mesh.positions[t[2] as usize],
            );
            if d2 < best.0 {
                best = (d2, ti);
            }
        });
        if best.1 != u32::MAX {
            return Some(best.1);
        }
        r *= 4.0;
    }
    None
}

/// Resample the seam so consecutive points are never further apart than `step`,
/// which keeps the walk stepping between neighbouring faces.
fn densify(seam: &[Vec3], step: f32) -> Vec<Vec3> {
    let step = step.max(1e-4);
    let mut out = Vec::with_capacity(seam.len() * 2);
    for i in 0..seam.len() {
        let (a, b) = (seam[i], seam[(i + 1) % seam.len()]);
        let n = ((b.sub(a).length() / step).ceil() as usize).max(1);
        for k in 0..n {
            out.push(a.add(b.sub(a).scale(k as f32 / n as f32)));
        }
    }
    out
}

fn median_edge_length(mesh: &IndexedMesh) -> f32 {
    let stride = (mesh.triangles.len() / 2000).max(1);
    let mut lengths: Vec<f32> = mesh
        .triangles
        .iter()
        .step_by(stride)
        .map(|t| mesh.positions[t[1] as usize].sub(mesh.positions[t[0] as usize]).length())
        .filter(|l| *l > 0.0)
        .collect();
    if lengths.is_empty() {
        return 1.0;
    }
    lengths.sort_by(|a, b| a.partial_cmp(b).unwrap());
    lengths[lengths.len() / 2]
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

/// The face graph: which faces meet along each edge, and which faces touch each
/// face.
struct Topology {
    edge_faces: AHashMap<(u32, u32), Vec<u32>>,
    neighbours: Vec<Vec<u32>>,
}

impl Topology {
    fn build(mesh: &IndexedMesh) -> Self {
        let mut edge_faces: AHashMap<(u32, u32), Vec<u32>> = AHashMap::new();
        for (fi, t) in mesh.triangles.iter().enumerate() {
            for k in 0..3 {
                edge_faces.entry(edge_key(t[k], t[(k + 1) % 3])).or_default().push(fi as u32);
            }
        }
        let mut neighbours: Vec<Vec<u32>> = vec![Vec::new(); mesh.triangles.len()];
        for faces in edge_faces.values() {
            for (i, &f) in faces.iter().enumerate() {
                for &g in faces.iter().skip(i + 1) {
                    neighbours[f as usize].push(g);
                    neighbours[g as usize].push(f);
                }
            }
        }
        Self { edge_faces, neighbours }
    }

    /// The edge two faces share, if they are neighbours.
    fn shared_edge(&self, a: u32, b: u32) -> Option<(u32, u32)> {
        let tri_edges = |f: u32| -> Vec<(u32, u32)> {
            self.edge_faces
                .iter()
                .filter(|(_, faces)| faces.contains(&f))
                .map(|(e, _)| *e)
                .collect()
        };
        tri_edges(a).into_iter().find(|e| self.edge_faces[e].contains(&b))
    }

    /// The face nearest `p` among those within `hops` of `from`.
    fn nearest_around(&self, mesh: &IndexedMesh, from: u32, p: Vec3, hops: usize) -> Option<u32> {
        let mut seen: AHashSet<u32> = AHashSet::from_iter([from]);
        let mut frontier = vec![from];
        let mut best = (f32::INFINITY, from);
        for _ in 0..=hops {
            let mut next = Vec::new();
            for &f in &frontier {
                let t = &mesh.triangles[f as usize];
                let (_, d2) = closest_on_tri(
                    p,
                    mesh.positions[t[0] as usize],
                    mesh.positions[t[1] as usize],
                    mesh.positions[t[2] as usize],
                );
                if d2 < best.0 {
                    best = (d2, f);
                }
                for &n in &self.neighbours[f as usize] {
                    if seen.insert(n) {
                        next.push(n);
                    }
                }
            }
            frontier = next;
        }
        Some(best.1)
    }

    /// The shortest chain of faces from `a` to `b`, each next to the one before.
    fn path_between(&self, a: u32, b: u32, max_hops: usize) -> Option<Vec<u32>> {
        if a == b {
            return Some(vec![a]);
        }
        let mut came_from: AHashMap<u32, u32> = AHashMap::new();
        let mut frontier = vec![a];
        came_from.insert(a, a);
        for _ in 0..max_hops {
            let mut next = Vec::new();
            for &f in &frontier {
                for &n in &self.neighbours[f as usize] {
                    if came_from.contains_key(&n) {
                        continue;
                    }
                    came_from.insert(n, f);
                    if n == b {
                        let mut path = vec![b];
                        let mut cur = b;
                        while cur != a {
                            cur = came_from[&cur];
                            path.push(cur);
                        }
                        path.reverse();
                        return Some(path);
                    }
                    next.push(n);
                }
            }
            frontier = next;
        }
        None
    }
}

fn edge_key(a: u32, b: u32) -> (u32, u32) {
    if a < b { (a, b) } else { (b, a) }
}

// ---------------------------------------------------------------------------
// Retriangulation
// ---------------------------------------------------------------------------

/// Rebuild the crossed faces so the seam runs along their edges.
struct CutFaces {
    mesh: IndexedMesh,
    seam_edges: AHashSet<(u32, u32)>,
    seam_vertices: Vec<u32>,
    source_face: Vec<u32>,
}

fn retriangulate(mesh: &IndexedMesh, crossings: Vec<Crossing>) -> Result<CutFaces, String> {
    // A vertex per crossing, shared by the two faces that meet at it — unless the
    // crossing lands on an end of the edge, which is what happens every time the
    // seam passes near a vertex of the mesh. Making a new vertex there would put
    // two of them in the same place and leave the face around it with slivers of no
    // area; the existing vertex is used instead, and the seam simply runs through
    // it. Crossings that land on top of each other on one edge are shared too.
    const SNAP: f32 = 0.02; // of an edge's length
    let mut positions = mesh.positions.clone();
    let mut vertex_of: Vec<u32> = Vec::with_capacity(crossings.len());
    let mut made_on_edge: AHashMap<(u32, u32), Vec<(f32, u32)>> = AHashMap::new();
    for c in &crossings {
        if c.t <= SNAP {
            vertex_of.push(c.edge.0);
            continue;
        }
        if c.t >= 1.0 - SNAP {
            vertex_of.push(c.edge.1);
            continue;
        }
        let made = made_on_edge.entry(c.edge).or_default();
        if let Some(&(_, vi)) = made.iter().find(|(t, _)| (t - c.t).abs() <= SNAP) {
            vertex_of.push(vi);
            continue;
        }
        let (p, q) = (positions[c.edge.0 as usize], positions[c.edge.1 as usize]);
        positions.push(p.add(q.sub(p).scale(c.t)));
        let vi = (positions.len() - 1) as u32;
        made.push((c.t, vi));
        vertex_of.push(vi);
    }

    // Each face collects the chords the seam draws across it: the seam comes in at
    // one crossing and leaves at the next, so consecutive crossings that share a
    // face are the two ends of one chord.
    let mut chords: AHashMap<u32, Vec<(u32, u32)>> = AHashMap::new();
    let mut seam_edges_on_edges: Vec<(u32, u32)> = Vec::new();
    for (i, c) in crossings.iter().enumerate() {
        let j = (i + 1) % crossings.len();
        if c.to != crossings[j].from || vertex_of[i] == vertex_of[j] {
            continue;
        }
        // In and out through the SAME edge: the seam only grazed this face, and a
        // "chord" between those two crossings runs ALONG the edge instead of across
        // the face. Cutting along it splits nothing and leaves a needle of no area
        // — one in each of the two faces that share the edge, which is what turns
        // that edge into one used four times. The wall the seam needs there is the
        // edge itself, and the crossings have already split it.
        if c.edge == crossings[j].edge {
            seam_edges_on_edges.push((vertex_of[i], vertex_of[j]));
            continue;
        }
        chords.entry(c.to).or_default().push((vertex_of[i], vertex_of[j]));
    }
    // Only the vertices we MADE split an edge; the ones snapped to a corner were
    // already there and must not be inserted into a face's boundary twice.
    let on_edge: AHashMap<(u32, u32), Vec<u32>> = made_on_edge
        .into_iter()
        .map(|(e, made)| (e, made.into_iter().map(|(_, vi)| vi).collect()))
        .collect();

    // Faces the seam crosses are rebuilt; every other face is kept as it is, so the
    // model away from the cut is untouched, vertex for vertex.
    let touched: AHashSet<u32> = chords.keys().copied().collect();
    let mut triangles: Vec<[u32; 3]> = Vec::with_capacity(mesh.triangles.len() + crossings.len() * 2);
    let mut source_face: Vec<u32> = Vec::with_capacity(triangles.capacity());
    let mut seam_edges: AHashSet<(u32, u32)> = AHashSet::new();
    // Where the seam grazed an edge, the wall is the stretch of that edge between
    // the two crossings — including any crossing that landed between them.
    for (x, y) in seam_edges_on_edges {
        seam_edges.insert(edge_key(x, y));
    }

    for (fi, tri) in mesh.triangles.iter().enumerate() {
        let fi = fi as u32;
        if !touched.contains(&fi) {
            // A face with crossings but no chord still needs its edges split, or the
            // neighbour that WAS rebuilt leaves a T-junction against it.
            if face_has_split_edge(tri, &on_edge) {
                let out = retriangulate_face(&positions, tri, &[], &on_edge)?;
                source_face.extend(std::iter::repeat_n(fi, out.len()));
                triangles.extend(out);
            } else {
                source_face.push(fi);
                triangles.push(*tri);
            }
            continue;
        }
        let face_chords = &chords[&fi];
        for &(a, b) in face_chords {
            seam_edges.insert(edge_key(a, b));
        }
        let out = retriangulate_face(&positions, tri, face_chords, &on_edge)?;
        source_face.extend(std::iter::repeat_n(fi, out.len()));
        triangles.extend(out);
    }

    Ok(CutFaces {
        mesh: IndexedMesh { positions, triangles },
        seam_edges,
        seam_vertices: vertex_of,
        source_face,
    })
}

/// Does this face have a crossing on any of its edges?
fn face_has_split_edge(tri: &[u32; 3], on_edge: &AHashMap<(u32, u32), Vec<u32>>) -> bool {
    (0..3).any(|k| on_edge.contains_key(&edge_key(tri[k], tri[(k + 1) % 3])))
}

/// Rebuild one face: its corners, the crossings sitting on its edges, and the
/// seam's chords across it.
///
/// A triangle is convex, and a chord between two points of its boundary cuts it
/// into two convex polygons — which stays true however many chords are added, so
/// each piece triangulates by a fan from any of its corners, exactly and without a
/// solver. (A constrained Delaunay pass looked like the obvious tool and is the
/// wrong one: given a chord it treats it as the boundary of a region and hands back
/// only the side it decides is inside, quietly dropping the rest of the face.)
fn retriangulate_face(
    positions: &[Vec3],
    tri: &[u32; 3],
    chords: &[(u32, u32)],
    on_edge: &AHashMap<(u32, u32), Vec<u32>>,
) -> Result<Vec<[u32; 3]>, String> {
    let (a, b, c) = (positions[tri[0] as usize], positions[tri[1] as usize], positions[tri[2] as usize]);
    let normal = b.sub(a).cross(c.sub(a));
    if normal.length() < 1e-18 {
        return Ok(vec![*tri]); // degenerate face: leave it be
    }


    // The face's boundary, walked corner to corner, with every crossing that sits
    // on each edge inserted in order along it. The neighbour across an edge walks
    // that same edge the other way and meets the same points, so the two agree.
    let mut cycle: Vec<u32> = Vec::with_capacity(3 + chords.len() * 2);
    for k in 0..3 {
        let (s, e) = (tri[k], tri[(k + 1) % 3]);
        cycle.push(s);
        let mut on_this: Vec<u32> = on_edge.get(&edge_key(s, e)).cloned().unwrap_or_default();
        on_this.sort_unstable();
        on_this.dedup();
        let sp = positions[s as usize];
        let dir = positions[e as usize].sub(sp);
        on_this.sort_by(|x, y| {
            let dx = positions[*x as usize].sub(sp).dot(dir);
            let dy = positions[*y as usize].sub(sp).dot(dir);
            dx.partial_cmp(&dy).unwrap_or(std::cmp::Ordering::Equal)
        });
        cycle.extend(on_this);
    }
    if cycle.len() == 3 && chords.is_empty() {
        return Ok(vec![*tri]);
    }

    // Cut the boundary polygon with each chord in turn.
    let mut polygons: Vec<Vec<u32>> = vec![cycle];
    for &(x, y) in chords {
        if x == y {
            continue;
        }
        // A chord whose ends are already next to each other round the boundary IS a
        // boundary edge — the seam is running along an edge the mesh already has,
        // which happens the moment a second seam meets the first one's work. There
        // is nothing to cut, and cutting anyway lays a second copy of the face's own
        // triangles on top of the first.
        if polygons.iter().any(|p| {
            let (ix, iy) = (p.iter().position(|v| *v == x), p.iter().position(|v| *v == y));
            match (ix, iy) {
                (Some(i), Some(j)) => (i + 1) % p.len() == j || (j + 1) % p.len() == i,
                _ => false,
            }
        }) {
            continue;
        }
        let Some(pi) = polygons.iter().position(|p| p.contains(&x) && p.contains(&y)) else {
            continue; // the chord's ends are not on one piece: nothing to cut
        };
        let poly = polygons.swap_remove(pi);
        let (ix, iy) = (
            poly.iter().position(|v| *v == x).expect("x on polygon"),
            poly.iter().position(|v| *v == y).expect("y on polygon"),
        );
        let (lo, hi) = if ix < iy { (ix, iy) } else { (iy, ix) };
        let first: Vec<u32> = poly[lo..=hi].to_vec();
        let second: Vec<u32> = poly[hi..].iter().chain(poly[..=lo].iter()).copied().collect();
        // A "piece" of two points is the chord lying along the boundary: no area.
        for piece in [first, second] {
            if piece.len() >= 3 {
                polygons.push(piece);
            }
        }
    }

    let mut out = Vec::with_capacity(polygons.len() * 2);
    for poly in polygons {
        for k in 1..poly.len() - 1 {
            let (x, y, z) = (poly[0], poly[k], poly[k + 1]);
            let (p, q, r) = (positions[x as usize], positions[y as usize], positions[z as usize]);
            let n = q.sub(p).cross(r.sub(p));
            if n.length() < 1e-20 {
                continue; // three points in a line: no triangle
            }
            // Wind it the way the face pointed.
            out.push(if n.dot(normal) >= 0.0 { [x, y, z] } else { [x, z, y] });
        }
    }
    if std::env::var_os("DF_SPLIT_DEBUG").is_some() {
        let area = |x: u32, y: u32, z: u32| {
            let (p, q, r) = (positions[x as usize], positions[y as usize], positions[z as usize]);
            q.sub(p).cross(r.sub(p)).length() * 0.5
        };
        let whole = area(tri[0], tri[1], tri[2]);
        let sum: f32 = out.iter().map(|t| area(t[0], t[1], t[2])).sum();
        if (sum - whole).abs() > whole * 0.01 {
            eprintln!(
                "[trozos] cara {tri:?} área {whole:.5} -> {sum:.5} con {} cuerdas {:?}",
                chords.len(), chords
            );
        }
    }
    Ok(out)
}

/// Which piece each face belongs to, by walking the face graph without ever
/// stepping over a seam edge.
fn pieces(mesh: &IndexedMesh, seam_edges: &AHashSet<(u32, u32)>) -> Vec<u32> {
    let mut edge_faces: AHashMap<(u32, u32), Vec<u32>> = AHashMap::new();
    for (fi, t) in mesh.triangles.iter().enumerate() {
        for k in 0..3 {
            edge_faces.entry(edge_key(t[k], t[(k + 1) % 3])).or_default().push(fi as u32);
        }
    }
    let mut neighbours: Vec<Vec<u32>> = vec![Vec::new(); mesh.triangles.len()];
    for (e, faces) in &edge_faces {
        if seam_edges.contains(e) {
            continue; // the seam is a wall
        }
        for (i, &f) in faces.iter().enumerate() {
            for &g in faces.iter().skip(i + 1) {
                neighbours[f as usize].push(g);
                neighbours[g as usize].push(f);
            }
        }
    }

    let mut piece: Vec<u32> = vec![u32::MAX; mesh.triangles.len()];
    let mut label = 0u32;
    for start in 0..mesh.triangles.len() {
        if piece[start] != u32::MAX {
            continue;
        }
        let mut queue = std::collections::VecDeque::from([start as u32]);
        piece[start] = label;
        while let Some(f) = queue.pop_front() {
            for &n in &neighbours[f as usize] {
                if piece[n as usize] == u32::MAX {
                    piece[n as usize] = label;
                    queue.push_back(n);
                }
            }
        }
        label += 1;
    }
    piece
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A cube, subdivided so its faces are smaller than the seam's steps.
    fn cube(size: f32, n: usize) -> IndexedMesh {
        let mut positions = Vec::new();
        let mut triangles = Vec::new();
        let s = size / n as f32;
        // Six faces, each an n×n grid; vertices are welded afterwards by position.
        let mut push_quad = |p0: Vec3, du: Vec3, dv: Vec3| {
            let base = positions.len() as u32;
            positions.push(p0);
            positions.push(p0.add(du));
            positions.push(p0.add(du).add(dv));
            positions.push(p0.add(dv));
            triangles.push([base, base + 1, base + 2]);
            triangles.push([base, base + 2, base + 3]);
        };
        for i in 0..n {
            for j in 0..n {
                let (x, y) = (i as f32 * s, j as f32 * s);
                let (dx, dy) = (Vec3::new(s, 0.0, 0.0), Vec3::new(0.0, s, 0.0));
                let dz = Vec3::new(0.0, 0.0, s);
                push_quad(Vec3::new(x, y, 0.0), dy, dx); // bottom
                push_quad(Vec3::new(x, y, size), dx, dy); // top
                push_quad(Vec3::new(x, 0.0, y), dx, dz); // front
                push_quad(Vec3::new(x, size, y), dz, dx); // back
                push_quad(Vec3::new(0.0, x, y), dz, dy); // left
                push_quad(Vec3::new(size, x, y), dy, dz); // right
            }
        }
        let soup: Vec<f32> = triangles
            .iter()
            .flat_map(|t| t.iter().flat_map(|&i| { let p = positions[i as usize]; [p.x, p.y, p.z] }).collect::<Vec<f32>>())
            .collect();
        IndexedMesh::from_triangle_soup(&soup, 1e-5)
    }

    fn open_edges(mesh: &IndexedMesh) -> usize {
        let mut counts: AHashMap<(u32, u32), usize> = AHashMap::new();
        for t in &mesh.triangles {
            for k in 0..3 {
                *counts.entry(edge_key(t[k], t[(k + 1) % 3])).or_default() += 1;
            }
        }
        counts.values().filter(|c| **c != 2).count()
    }

    /// A torus — a tentacle that leaves the body and fuses back to it.
    fn torus(major: f32, minor: f32, around: usize, tube: usize) -> IndexedMesh {
        let mut positions = Vec::new();
        for i in 0..around {
            let u = i as f32 / around as f32 * std::f32::consts::TAU;
            for j in 0..tube {
                let v = j as f32 / tube as f32 * std::f32::consts::TAU;
                let r = major + minor * v.cos();
                positions.push(Vec3::new(r * u.cos(), r * u.sin(), minor * v.sin()));
            }
        }
        let idx = |i: usize, j: usize| ((i % around) * tube + (j % tube)) as u32;
        let mut triangles = Vec::new();
        for i in 0..around {
            for j in 0..tube {
                triangles.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]);
                triangles.push([idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
            }
        }
        IndexedMesh { positions, triangles }
    }

    fn tube_ring(major: f32, minor: f32, angle: f32, steps: usize) -> Vec<Vec3> {
        (0..steps)
            .map(|j| {
                let v = j as f32 / steps as f32 * std::f32::consts::TAU;
                let r = major + minor * v.cos();
                Vec3::new(r * angle.cos(), r * angle.sin(), minor * v.sin())
            })
            .collect()
    }

    // The cut still has to be watertight where it cannot separate: one ring round
    // a tentacle encircles a handle, so the surface stays in ONE piece — but it is
    // cut all the same, and must not be left open.
    #[test]
    fn a_seam_round_a_handle_cuts_cleanly_without_separating() {
        let model = torus(10.0, 3.0, 64, 32);
        let one = tube_ring(10.0, 3.0, 0.3, 96);
        let split = split_along_seam(&model, &one).expect("the seam should cut the surface");
        assert_eq!(open_edges(&split.mesh), 0, "cutting the surface must not open it");
        let pieces: AHashSet<u32> = split.piece_of_face.iter().copied().collect();
        assert_eq!(pieces.len(), 1, "a ring round a handle leaves one piece: {pieces:?}");
    }

    #[test]
    fn two_seams_round_a_handle_cut_the_tentacle_free() {
        let model = torus(10.0, 3.0, 64, 32);
        let first = tube_ring(10.0, 3.0, 0.3, 96);
        // Off the mesh's own ring lines: a seam landing exactly ON existing edges is
        // its own problem (see the module docs), and no hand-drawn one does.
        let second = tube_ring(10.0, 3.0, std::f32::consts::PI + 0.05, 96);
        let split = split_along_seams(&model, &[first, second]).expect("both seams");
        assert_eq!(open_edges(&split.mesh), 0, "still watertight after two cuts");
        let pieces: AHashSet<u32> = split.piece_of_face.iter().copied().collect();
        assert_eq!(pieces.len(), 2, "two rings free the length of tube between them: {pieces:?}");
    }

    // A seam that wanders instead of running straight crosses some faces more than
    // once, which is where a face gets several chords and the rebuild has to keep
    // its pieces from overlapping.
    #[test]
    fn a_wandering_seam_still_leaves_the_surface_closed() {
        let model = torus(10.0, 3.0, 64, 32);
        let seam: Vec<Vec3> = (0..240)
            .map(|k| {
                let f = k as f32 / 240.0;
                let v = f * std::f32::consts::TAU;
                // Wobble round the torus as it goes round the tube.
                let u = 0.3 + 0.25 * (v * 5.0).sin();
                let r = 10.0 + 3.0 * v.cos();
                Vec3::new(r * u.cos(), r * u.sin(), 3.0 * v.sin())
            })
            .collect();
        let split = split_along_seam(&model, &seam).expect("a wandering seam still cuts");
        assert_eq!(open_edges(&split.mesh), 0, "cutting the surface must not open it");
    }

    #[test]
    fn a_seam_round_a_cube_cuts_its_surface_in_two() {
        let model = cube(10.0, 8);
        assert_eq!(open_edges(&model), 0, "the test cube starts closed");
        // A ring round the cube at z = 5.2, off the grid lines on purpose so the
        // seam crosses faces rather than following them.
        let z = 5.2;
        let ring: Vec<Vec3> = (0..80)
            .map(|k| {
                let t = (k % 20) as f32 * 0.5;
                match k / 20 {
                    0 => Vec3::new(t, 0.0, z),
                    1 => Vec3::new(10.0, t, z),
                    2 => Vec3::new(10.0 - t, 10.0, z),
                    _ => Vec3::new(0.0, 10.0 - t, z),
                }
            })
            .collect();

        let split = split_along_seam(&model, &ring).expect("the seam should cut the surface");
        assert_eq!(open_edges(&split.mesh), 0, "cutting the surface must not open it");

        let labels: AHashSet<u32> = split.piece_of_face.iter().copied().collect();
        assert_eq!(labels.len(), 2, "the surface falls in exactly two: {labels:?}");
        let above = split.piece_of_face.iter().filter(|p| **p == 0).count();
        assert!(above > 0 && above < split.mesh.triangles.len(), "both sides carry faces");
    }
}
