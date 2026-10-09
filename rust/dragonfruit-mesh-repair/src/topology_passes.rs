use std::collections::{BTreeMap, VecDeque};

use ahash::{AHashMap, AHashSet};

use crate::core::halfedge::{edge_key, Topology};
use crate::core::mesh::{IndexedMesh, Vec3};

const MIN_AREA_DP_MAX_LOOP: usize = 384;

#[inline]
fn d3(v: Vec3) -> [f64; 3] {
    [v.x as f64, v.y as f64, v.z as f64]
}

#[inline]
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn cross_len(a: [f64; 3], b: [f64; 3]) -> f64 {
    let c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    dot(c, c).sqrt()
}

/// 0.01 in a space where the largest extent is clamped to [5, 400].
pub fn stitch_tolerance(mesh: &IndexedMesh) -> f32 {
    let b = mesh.bbox();
    let d = b.max.sub(b.min);
    let extent = d.x.max(d.y).max(d.z);
    if !extent.is_finite() || extent <= 0.0 {
        return 0.0;
    }
    0.01 * extent / extent.clamp(5.0, 400.0)
}

/// Boundary loops ordered opposite to their bordering face edges, split at repeated vertices.
pub fn directed_hole_loops(topo: &Topology) -> Vec<Vec<u32>> {
    let mut out: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for info in topo.edges.values() {
        if info.faces.len() == 1 {
            let (u, v, _) = info.directed[0];
            out.entry(v).or_default().push(u);
        }
    }
    for next in out.values_mut() {
        next.sort_unstable_by(|a, b| b.cmp(a));
    }
    let starts: Vec<u32> = out.keys().copied().collect();
    let mut loops = Vec::new();
    for start in starts {
        while let Some(first) = out.get_mut(&start).and_then(|l| l.pop()) {
            let mut path = vec![start];
            let mut cur = first;
            let mut closed = false;
            loop {
                if cur == start {
                    closed = true;
                    break;
                }
                path.push(cur);
                match out.get_mut(&cur).and_then(|l| l.pop()) {
                    Some(n) => cur = n,
                    None => break,
                }
            }
            // A path that dead-ends can still pass through closed loops on the
            // way, so those are kept and only the unclosed remainder is dropped.
            let mut stack: Vec<u32> = Vec::with_capacity(path.len());
            let mut pos: AHashMap<u32, usize> = AHashMap::with_capacity(path.len());
            for v in path {
                if let Some(&i) = pos.get(&v) {
                    let sub_loop = stack.split_off(i);
                    for w in &sub_loop {
                        pos.remove(w);
                    }
                    if sub_loop.len() >= 3 {
                        loops.push(sub_loop);
                    }
                }
                pos.insert(v, stack.len());
                stack.push(v);
            }
            if closed && stack.len() >= 3 {
                loops.push(stack);
            }
        }
    }
    loops
}

/// Propagates winding across two-face edges; per patch the smaller-area side is flipped.
pub fn unify_winding(mesh: &mut IndexedMesh) -> usize {
    let n = mesh.triangles.len();
    if n == 0 {
        return 0;
    }
    let topo = Topology::build(mesh);
    let mut adj: Vec<smallvec::SmallVec<[(u32, bool); 3]>> = vec![smallvec::SmallVec::new(); n];
    for info in topo.edges.values() {
        if info.directed.len() != 2 {
            continue;
        }
        let (a0, _, f0) = info.directed[0];
        let (a1, _, f1) = info.directed[1];
        if f0 == f1 {
            continue;
        }
        let agree = a0 != a1;
        adj[f0 as usize].push((f1, agree));
        adj[f1 as usize].push((f0, agree));
    }

    let area: Vec<f64> = (0..n).map(|f| mesh.tri_area(f as u32) as f64).collect();
    let mut side = vec![0u8; n];
    let mut queue = VecDeque::new();
    let mut group = Vec::new();
    let mut flipped = 0usize;
    for seed in 0..n {
        if side[seed] != 0 {
            continue;
        }
        group.clear();
        side[seed] = 1;
        queue.push_back(seed);
        let (mut keep_area, mut flip_area) = (0.0f64, 0.0f64);
        while let Some(x) = queue.pop_front() {
            group.push(x);
            if side[x] == 1 {
                keep_area += area[x];
            } else {
                flip_area += area[x];
            }
            for &(y, agree) in &adj[x] {
                let y = y as usize;
                if side[y] == 0 {
                    side[y] = if agree { side[x] } else { 3 - side[x] };
                    queue.push_back(y);
                }
            }
        }
        let minority = if flip_area > keep_area { 1 } else { 2 };
        for &x in &group {
            if side[x] == minority {
                mesh.triangles[x].swap(1, 2);
                flipped += 1;
            }
        }
    }
    flipped
}

struct PointGrid {
    cell: f64,
    cells: AHashMap<(i64, i64, i64), Vec<u32>>,
}

impl PointGrid {
    fn new(cell: f64) -> Self {
        Self { cell, cells: AHashMap::new() }
    }

    fn key(&self, p: [f64; 3]) -> (i64, i64, i64) {
        (
            (p[0] / self.cell).floor() as i64,
            (p[1] / self.cell).floor() as i64,
            (p[2] / self.cell).floor() as i64,
        )
    }

    fn insert(&mut self, p: [f64; 3], id: u32) {
        let k = self.key(p);
        self.cells.entry(k).or_default().push(id);
    }

    fn in_box(&self, lo: [f64; 3], hi: [f64; 3], out: &mut Vec<u32>) {
        out.clear();
        let (a, b) = (self.key(lo), self.key(hi));
        let span = (b.0 - a.0 + 1) * (b.1 - a.1 + 1) * (b.2 - a.2 + 1);
        if span > 4096 {
            return;
        }
        for x in a.0..=b.0 {
            for y in a.1..=b.1 {
                for z in a.2..=b.2 {
                    if let Some(ids) = self.cells.get(&(x, y, z)) {
                        out.extend_from_slice(ids);
                    }
                }
            }
        }
        out.sort_unstable();
    }
}

fn closed_edge(topo: &Topology, e: (u32, u32)) -> bool {
    topo.edges.get(&e).is_some_and(|i| i.faces.len() >= 2)
}

fn boundary_halfedges(topo: &Topology) -> Vec<(u32, u32, u32)> {
    let mut v: Vec<(u32, u32, u32)> = topo
        .edges
        .values()
        .filter(|i| i.faces.len() == 1)
        .map(|i| i.directed[0])
        .collect();
    v.sort_unstable();
    v
}

fn find(parent: &mut [u32], i: u32) -> u32 {
    let mut r = i;
    while parent[r as usize] != r {
        r = parent[r as usize];
    }
    let mut c = i;
    while parent[c as usize] != r {
        let n = parent[c as usize];
        parent[c as usize] = r;
        c = n;
    }
    r
}

/// Closes gaps narrower than `tol` between open borders; interior vertices never move.
pub fn stitch_borders(mesh: &mut IndexedMesh, tol: f32, max_rounds: usize) -> usize {
    if tol <= 0.0 {
        return 0;
    }
    let tol = tol as f64;
    let mut changed = 0usize;
    for _ in 0..max_rounds {
        let topo = Topology::build(mesh);
        let border = boundary_halfedges(&topo);
        if border.is_empty() {
            break;
        }
        let mut bverts: Vec<u32> = border.iter().flat_map(|&(a, b, _)| [a, b]).collect();
        bverts.sort_unstable();
        bverts.dedup();

        let mut lens: Vec<f64> = border
            .iter()
            .map(|&(a, b, _)| {
                let d = sub(d3(mesh.positions[b as usize]), d3(mesh.positions[a as usize]));
                dot(d, d).sqrt()
            })
            .collect();
        lens.sort_unstable_by(|a, b| a.total_cmp(b));
        let cell = lens[lens.len() / 2].max(tol);
        let mut grid = PointGrid::new(cell);
        for &v in &bverts {
            grid.insert(d3(mesh.positions[v as usize]), v);
        }

        let mut split_face: AHashMap<u32, (u32, u32, u32)> = AHashMap::new();
        let mut cand = Vec::new();
        for &(a, b, f) in &border {
            if split_face.contains_key(&f) {
                continue;
            }
            let (pa, pb) = (d3(mesh.positions[a as usize]), d3(mesh.positions[b as usize]));
            let d = sub(pb, pa);
            let dd = dot(d, d);
            if dd <= tol * tol {
                continue;
            }
            let lo = [pa[0].min(pb[0]) - tol, pa[1].min(pb[1]) - tol, pa[2].min(pb[2]) - tol];
            let hi = [pa[0].max(pb[0]) + tol, pa[1].max(pb[1]) + tol, pa[2].max(pb[2]) + tol];
            grid.in_box(lo, hi, &mut cand);
            for &p in &cand {
                if p == a || p == b {
                    continue;
                }
                let pp = d3(mesh.positions[p as usize]);
                let t = dot(sub(pp, pa), d) / dd;
                if t <= 0.0 || t >= 1.0 {
                    continue;
                }
                let q = [pa[0] + t * d[0], pa[1] + t * d[1], pa[2] + t * d[2]];
                let dq = sub(pp, q);
                let (da, db) = (sub(pp, pa), sub(pp, pb));
                if dot(dq, dq) < tol * tol && dot(da, da) > tol * tol && dot(db, db) > tol * tol {
                    split_face.insert(f, (a, b, p));
                    break;
                }
            }
        }
        let mut round_changed = 0usize;
        if !split_face.is_empty() {
            let mut faces: Vec<(u32, (u32, u32, u32))> = split_face.into_iter().collect();
            faces.sort_unstable();
            let mut added: AHashSet<(u32, u32)> = AHashSet::new();
            for (f, (a, b, p)) in faces {
                let tri = mesh.triangles[f as usize];
                let Some(&w) = tri.iter().find(|&&x| x != a && x != b) else { continue };
                let new_edges = [edge_key(a, p), edge_key(p, b), edge_key(p, w)];
                if p == w || new_edges.iter().any(|e| closed_edge(&topo, *e) || added.contains(e)) {
                    continue;
                }
                added.extend(new_edges);
                mesh.triangles[f as usize] = [a, p, w];
                mesh.triangles.push([p, b, w]);
                round_changed += 1;
            }
        }

        // Zip opposite border edge pairs only, so a merge never puts a third face on an edge.
        if round_changed > 0 {
            changed += round_changed;
            continue;
        }
        let mut ending_at: AHashMap<u32, smallvec::SmallVec<[u32; 2]>> = AHashMap::new();
        for &(a, b, _) in &border {
            ending_at.entry(b).or_default().push(a);
        }
        let near = |p: u32, q: u32| {
            let d = sub(d3(mesh.positions[p as usize]), d3(mesh.positions[q as usize]));
            dot(d, d) < tol * tol
        };
        let mut parent: Vec<u32> = (0..mesh.positions.len() as u32).collect();
        let mut merged = 0usize;
        for &(a, b, _) in &border {
            let pa = d3(mesh.positions[a as usize]);
            grid.in_box(
                [pa[0] - tol, pa[1] - tol, pa[2] - tol],
                [pa[0] + tol, pa[1] + tol, pa[2] + tol],
                &mut cand,
            );
            for &d in &cand {
                let Some(froms) = ending_at.get(&d) else { continue };
                for &c in froms {
                    if (c, d) == (b, a) || (c == a && d == b) || !near(a, d) || !near(b, c) {
                        continue;
                    }
                    for (x, y) in [(a, d), (b, c)] {
                        let (rx, ry) = (find(&mut parent, x), find(&mut parent, y));
                        if rx != ry {
                            parent[rx.max(ry) as usize] = rx.min(ry);
                            merged += 1;
                        }
                    }
                }
            }
        }
        if merged > 0 {
            for tri in mesh.triangles.iter_mut() {
                for v in tri.iter_mut() {
                    *v = find(&mut parent, *v);
                }
            }
            round_changed += merged;
        }
        if round_changed == 0 {
            break;
        }
        changed += round_changed;
    }
    changed
}

/// `chord_taken[i * n + j]` marks loop chords that already exist as mesh edges.
fn min_area_triangulation(pts: &[[f64; 3]], chord_taken: &[bool], sliver: f64, penalty: f64) -> Option<Vec<[usize; 3]>> {
    let n = pts.len();
    let mut w = vec![0.0f64; n * n];
    let mut k_of = vec![usize::MAX; n * n];
    let idx = |i: usize, j: usize| i * n + j;
    let usable = |i: usize, j: usize| j == i + 1 || !chord_taken[i * n + j];
    for gap in 2..n {
        for i in 0..n - gap {
            let j = i + gap;
            let mut best = f64::INFINITY;
            let mut best_k = i + 1;
            for k in i + 1..j {
                if !usable(i, k) || !usable(k, j) {
                    continue;
                }
                let c = cross_len(sub(pts[k], pts[i]), sub(pts[j], pts[i]));
                let tri = if c < sliver { penalty } else { 0.5 * c };
                let cost = w[idx(i, k)] + w[idx(k, j)] + tri;
                if cost < best {
                    best = cost;
                    best_k = k;
                }
            }
            w[idx(i, j)] = best;
            k_of[idx(i, j)] = best_k;
        }
    }
    if !w[idx(0, n - 1)].is_finite() {
        return None;
    }
    let mut tris = Vec::with_capacity(n - 2);
    let mut stack = vec![(0usize, n - 1)];
    while let Some((i, j)) = stack.pop() {
        if j < i + 2 {
            continue;
        }
        let k = k_of[idx(i, j)];
        tris.push([i, k, j]);
        stack.push((i, k));
        stack.push((k, j));
    }
    Some(tris)
}

/// Keeps the loop's vertex order; a clockwise projection mirrors the 2D frame instead.
fn ear_clip_preserving_order(pts: &[[f64; 3]]) -> Vec<[usize; 3]> {
    let n = pts.len();
    let mut nrm = [0.0f64; 3];
    for i in 0..n {
        let (a, b) = (pts[i], pts[(i + 1) % n]);
        nrm[0] += (a[1] - b[1]) * (a[2] + b[2]);
        nrm[1] += (a[2] - b[2]) * (a[0] + b[0]);
        nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let up = if nrm[2].abs() < 0.9 * dot(nrm, nrm).sqrt() { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
    let u = {
        let c = [nrm[1] * up[2] - nrm[2] * up[1], nrm[2] * up[0] - nrm[0] * up[2], nrm[0] * up[1] - nrm[1] * up[0]];
        let l = dot(c, c).sqrt().max(1e-30);
        [c[0] / l, c[1] / l, c[2] / l]
    };
    let v = {
        let c = [nrm[1] * u[2] - nrm[2] * u[1], nrm[2] * u[0] - nrm[0] * u[2], nrm[0] * u[1] - nrm[1] * u[0]];
        let l = dot(c, c).sqrt().max(1e-30);
        [c[0] / l, c[1] / l, c[2] / l]
    };
    let mut p2: Vec<(f64, f64)> = pts.iter().map(|p| (dot(*p, u), dot(*p, v))).collect();
    let area: f64 = (0..n).map(|i| p2[i].0 * p2[(i + 1) % n].1 - p2[(i + 1) % n].0 * p2[i].1).sum();
    if area < 0.0 {
        for p in p2.iter_mut() {
            p.0 = -p.0;
        }
    }
    let convex = |a: (f64, f64), b: (f64, f64), c: (f64, f64)| (b.0 - a.0) * (c.1 - b.1) - (b.1 - a.1) * (c.0 - b.0) > 0.0;
    let inside = |p: (f64, f64), a: (f64, f64), b: (f64, f64), c: (f64, f64)| {
        let s = |p: (f64, f64), a: (f64, f64), b: (f64, f64)| (p.0 - b.0) * (a.1 - b.1) - (a.0 - b.0) * (p.1 - b.1);
        let (d1, d2, d3) = (s(p, a, b), s(p, b, c), s(p, c, a));
        !((d1 < 0.0 || d2 < 0.0 || d3 < 0.0) && (d1 > 0.0 || d2 > 0.0 || d3 > 0.0))
    };
    let mut rem: Vec<usize> = (0..n).collect();
    let mut tris = Vec::with_capacity(n - 2);
    while rem.len() > 3 {
        let m = rem.len();
        let mut found = false;
        for i in 0..m {
            let (ia, ib, ic) = (rem[(i + m - 1) % m], rem[i], rem[(i + 1) % m]);
            if !convex(p2[ia], p2[ib], p2[ic]) {
                continue;
            }
            if rem.iter().any(|&j| j != ia && j != ib && j != ic && inside(p2[j], p2[ia], p2[ib], p2[ic])) {
                continue;
            }
            tris.push([ia, ib, ic]);
            rem.remove(i);
            found = true;
            break;
        }
        if !found {
            break;
        }
    }
    for i in 1..rem.len().saturating_sub(1) {
        tris.push([rem[0], rem[i], rem[i + 1]]);
    }
    tris
}

/// Patches are wound from the hole's half-edge order, not from surface normals.
pub fn fill_holes_oriented(mesh: &mut IndexedMesh, max_edges: usize) -> usize {
    let topo = Topology::build(mesh);
    let loops = directed_hole_loops(&topo);
    let diag = mesh.bbox().diag().max(1e-6) as f64;
    let sliver = 1e-12 * diag * diag;
    let penalty = 1e6 * diag * diag;
    let mut added = 0usize;
    for lp in loops.into_iter().filter(|l| l.len() >= 3 && l.len() <= max_edges) {
        let pts: Vec<[f64; 3]> = lp.iter().map(|&v| d3(mesh.positions[v as usize])).collect();
        let tris = if lp.len() <= MIN_AREA_DP_MAX_LOOP {
            let n = lp.len();
            let mut taken = vec![false; n * n];
            for i in 0..n {
                for j in i + 2..n {
                    taken[i * n + j] = !(i == 0 && j == n - 1) && closed_edge(&topo, edge_key(lp[i], lp[j]));
                }
            }
            match min_area_triangulation(&pts, &taken, sliver, penalty) {
                Some(t) => t,
                None => {
                    // Every triangulation reuses an edge the mesh already has;
                    // a fan from a new centre vertex reuses none.
                    let n = lp.len();
                    let c = pts.iter().fold([0.0; 3], |s, p| [s[0] + p[0], s[1] + p[1], s[2] + p[2]]);
                    mesh.positions.push(Vec3::new(
                        (c[0] / n as f64) as f32,
                        (c[1] / n as f64) as f32,
                        (c[2] / n as f64) as f32,
                    ));
                    let centre = (mesh.positions.len() - 1) as u32;
                    for i in 0..n {
                        mesh.triangles.push([lp[i], lp[(i + 1) % n], centre]);
                        added += 1;
                    }
                    continue;
                }
            }
        } else {
            ear_clip_preserving_order(&pts)
        };
        for [i, j, k] in tris {
            mesh.triangles.push([lp[i], lp[j], lp[k]]);
            added += 1;
        }
    }
    added
}

#[cfg(feature = "manifold")]
pub fn union_closed_components(mesh: &mut IndexedMesh, components: &[u32]) -> Option<(usize, usize)> {
    use manifold_csg::Manifold;

    let n_comps = components.iter().copied().max().map_or(0, |m| m as usize + 1);
    let mut by_comp: Vec<Vec<[u32; 3]>> = vec![Vec::new(); n_comps];
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        by_comp[components[fi] as usize].push(*tri);
    }
    let mut solids = Vec::new();
    let mut kept: Vec<[u32; 3]> = Vec::new();
    for tris in by_comp {
        let mut remap: AHashMap<u32, u32> = AHashMap::new();
        let mut vp: Vec<f32> = Vec::new();
        let mut idx: Vec<u32> = Vec::with_capacity(tris.len() * 3);
        for tri in &tris {
            for &v in tri {
                let next = remap.len() as u32;
                let id = *remap.entry(v).or_insert_with(|| {
                    let p = mesh.positions[v as usize];
                    vp.extend_from_slice(&[p.x, p.y, p.z]);
                    next
                });
                idx.push(id);
            }
        }
        match Manifold::from_mesh_f32(&vp, 3, &idx) {
            Ok(m) if !m.is_empty() && m.num_tri() > 0 => solids.push(m),
            _ => kept.extend_from_slice(&tris),
        }
    }
    if solids.len() < 2 {
        return None;
    }
    let unioned = solids.len();
    let m = Manifold::batch_union(&solids);
    if m.is_empty() || m.num_tri() < 4 {
        return None;
    }
    let (vp, np, ti) = m.to_mesh_f32();
    let base = mesh.positions.len() as u32;
    let mut positions = mesh.positions.clone();
    positions.extend(vp.chunks_exact(np).map(|c| Vec3::new(c[0], c[1], c[2])));
    let mut triangles = kept;
    let kept_tris = triangles.len();
    triangles.extend(ti.chunks_exact(3).map(|c| [c[0] + base, c[1] + base, c[2] + base]));
    mesh.positions = positions;
    mesh.triangles = triangles;
    Some((unioned, kept_tris))
}

fn cross3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn unit(a: [f64; 3]) -> Option<[f64; 3]> {
    let l = dot(a, a).sqrt();
    (l > 1e-300).then(|| [a[0] / l, a[1] / l, a[2] / l])
}

/// Pairs the faces around an edge used by more than two, sorted by angle about
/// it: two neighbours are paired when the wedge between them is solid, i.e.
/// both normals point away from it and they cross the edge in opposite
/// directions. Faces left unpaired are sheets ending on the edge.
fn pair_around_edge(mesh: &IndexedMesh, p: u32, q: u32, faces: &[u32]) -> Vec<(u32, u32)> {
    let a = d3(mesh.positions[p as usize]);
    let Some(d) = unit(sub(d3(mesh.positions[q as usize]), a)) else { return Vec::new() };
    let seed = if d[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    let Some(u) = unit(cross3(d, seed)) else { return Vec::new() };
    let w = cross3(d, u);
    let mut around: Vec<(f64, u32, bool, bool)> = Vec::with_capacity(faces.len());
    for &fi in faces {
        let t = mesh.triangles[fi as usize];
        let Some(&c) = t.iter().find(|&&x| x != p && x != q) else { continue };
        let r = sub(d3(mesh.positions[c as usize]), a);
        let s = dot(r, d);
        let r = [r[0] - d[0] * s, r[1] - d[1] * s, r[2] - d[2] * s];
        let [x, y, z] = t.map(|v| d3(mesh.positions[v as usize]));
        let normal = cross3(sub(y, x), sub(z, x));
        let ccw = dot(normal, cross3(d, r)) > 0.0;
        let forward = (0..3).any(|i| t[i] == p && t[(i + 1) % 3] == q);
        around.push((dot(r, w).atan2(dot(r, u)), fi, ccw, forward));
    }
    around.sort_by(|x, y| x.0.total_cmp(&y.0).then(x.1.cmp(&y.1)));
    let k = around.len();
    let mut used = vec![false; k];
    let mut pairs = Vec::new();
    for i in 0..k {
        let j = (i + 1) % k;
        if i == j || used[i] || used[j] {
            continue;
        }
        let (_, fi, ccw_i, fwd_i) = around[i];
        let (_, fj, ccw_j, fwd_j) = around[j];
        if !ccw_i && ccw_j && fwd_i != fwd_j {
            used[i] = true;
            used[j] = true;
            pairs.push((fi, fj));
        }
    }
    pairs
}

/// Gives every surface meeting at a non-manifold edge its own copy of the
/// edge's vertices, then moves each copy `offset` into its own solid so a weld
/// by position cannot merge them back. Returns the number of vertices added.
pub fn split_non_manifold_edges(mesh: &mut IndexedMesh, offset: f32) -> usize {
    let mut edge_faces: AHashMap<(u32, u32), Vec<u32>> =
        AHashMap::with_capacity(mesh.triangles.len() * 3 / 2);
    for (fi, t) in mesh.triangles.iter().enumerate() {
        for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            edge_faces.entry(edge_key(a, b)).or_default().push(fi as u32);
        }
    }
    let mut links: AHashMap<(u32, u32), Vec<(u32, u32)>> = AHashMap::new();
    let mut verts: Vec<u32> = Vec::new();
    for (&(p, q), faces) in &edge_faces {
        if faces.len() > 2 {
            links.insert((p, q), pair_around_edge(mesh, p, q, faces));
            verts.push(p);
            verts.push(q);
        }
    }
    if verts.is_empty() {
        return 0;
    }
    verts.sort_unstable();
    verts.dedup();
    let index: AHashMap<u32, usize> = verts.iter().enumerate().map(|(i, &v)| (v, i)).collect();
    let mut incident: Vec<Vec<u32>> = vec![Vec::new(); verts.len()];
    for (fi, t) in mesh.triangles.iter().enumerate() {
        for &v in t {
            if let Some(&i) = index.get(&v) {
                incident[i].push(fi as u32);
            }
        }
    }

    let normal_of = |mesh: &IndexedMesh, fi: u32| {
        let [x, y, z] = mesh.triangles[fi as usize].map(|v| d3(mesh.positions[v as usize]));
        cross3(sub(y, x), sub(z, x))
    };
    let mut moves: Vec<(u32, [f64; 3])> = Vec::new();
    let mut added = 0usize;
    for (i, &v) in verts.iter().enumerate() {
        let fs = &incident[i];
        let local: AHashMap<u32, u32> = fs.iter().enumerate().map(|(k, &f)| (f, k as u32)).collect();
        let mut parent: Vec<u32> = (0..fs.len() as u32).collect();
        for &f in fs {
            let t = mesh.triangles[f as usize];
            for &o in t.iter().filter(|&&o| o != v) {
                let e = edge_key(v, o);
                let joined: Vec<(u32, u32)> = match edge_faces.get(&e) {
                    Some(ef) if ef.len() == 2 => vec![(ef[0], ef[1])],
                    Some(ef) if ef.len() > 2 => links.get(&e).cloned().unwrap_or_default(),
                    _ => Vec::new(),
                };
                for (x, y) in joined {
                    if let (Some(&lx), Some(&ly)) = (local.get(&x), local.get(&y)) {
                        let (rx, ry) = (find(&mut parent, lx), find(&mut parent, ly));
                        if rx != ry {
                            parent[rx.max(ry) as usize] = rx.min(ry);
                        }
                    }
                }
            }
        }
        let mut groups: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
        for (k, &f) in fs.iter().enumerate() {
            groups.entry(find(&mut parent, k as u32)).or_default().push(f);
        }
        if groups.len() < 2 {
            continue;
        }
        for (g, members) in groups.values().enumerate() {
            let mut n = [0.0f64; 3];
            for &f in members {
                let fnrm = normal_of(mesh, f);
                n = [n[0] + fnrm[0], n[1] + fnrm[1], n[2] + fnrm[2]];
            }
            let target = if g == 0 {
                v
            } else {
                mesh.positions.push(mesh.positions[v as usize]);
                added += 1;
                let nv = (mesh.positions.len() - 1) as u32;
                for &f in members {
                    for x in mesh.triangles[f as usize].iter_mut() {
                        if *x == v {
                            *x = nv;
                        }
                    }
                }
                nv
            };
            if let Some(n) = unit(n) {
                moves.push((target, n));
            }
        }
    }
    let off = offset as f64;
    for (v, n) in moves {
        let p = &mut mesh.positions[v as usize];
        *p = Vec3::new(
            (p.x as f64 - n[0] * off) as f32,
            (p.y as f64 - n[1] * off) as f32,
            (p.z as f64 - n[2] * off) as f32,
        );
    }
    added
}

/// Removes open shells of fewer than `max_faces` faces. Splitting leaves stray
/// faces like these, and their borders tangle with the rims the fill must close.
pub fn remove_open_fragments(mesh: &mut IndexedMesh, max_faces: usize) -> usize {
    let n = mesh.triangles.len();
    let mut edge_faces: AHashMap<(u32, u32), Vec<u32>> = AHashMap::with_capacity(n * 3 / 2);
    for (fi, t) in mesh.triangles.iter().enumerate() {
        for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            edge_faces.entry(edge_key(a, b)).or_default().push(fi as u32);
        }
    }
    let mut parent: Vec<u32> = (0..n as u32).collect();
    for fs in edge_faces.values() {
        if fs.len() == 2 {
            let (a, b) = (find(&mut parent, fs[0]), find(&mut parent, fs[1]));
            if a != b {
                parent[a.max(b) as usize] = a.min(b);
            }
        }
    }
    let roots: Vec<u32> = (0..n as u32).map(|f| find(&mut parent, f)).collect();
    let mut size: AHashMap<u32, usize> = AHashMap::new();
    for &r in &roots {
        *size.entry(r).or_insert(0) += 1;
    }
    let mut open: AHashSet<u32> = AHashSet::new();
    for fs in edge_faces.values() {
        if fs.len() == 1 {
            open.insert(roots[fs[0] as usize]);
        }
    }
    let before = mesh.triangles.len();
    let mut i = 0;
    mesh.triangles.retain(|_| {
        let r = roots[i];
        i += 1;
        !(open.contains(&r) && size[&r] < max_faces)
    });
    before - mesh.triangles.len()
}

/// Removes every face touching a spot no local rule can untangle, measured by
/// position: an edge with more than two faces, an edge whose two faces run the
/// same way, or a border vertex where borders do not enter and leave in equal
/// numbers, which no hole loop can pass through. Returns the faces removed.
pub fn excise_tangles(mesh: &mut IndexedMesh) -> usize {
    let ids = mesh.position_weld_ids();
    // (faces, faces running low id -> high id)
    let mut uses: AHashMap<(u32, u32), (u32, u32)> = AHashMap::with_capacity(mesh.triangles.len() * 3 / 2);
    for t in &mesh.triangles {
        let w = t.map(|v| ids[v as usize]);
        for (a, b) in [(w[0], w[1]), (w[1], w[2]), (w[2], w[0])] {
            if a != b {
                let e = uses.entry(edge_key(a, b)).or_insert((0, 0));
                e.0 += 1;
                e.1 += (a < b) as u32;
            }
        }
    }
    let mut hit: AHashSet<u32> = AHashSet::new();
    let mut balance: AHashMap<u32, i32> = AHashMap::new();
    for (&(a, b), &(n, low_to_high)) in &uses {
        if n > 2 || (n == 2 && low_to_high != 1) {
            hit.insert(a);
            hit.insert(b);
        } else if n == 1 {
            let (from, to) = if low_to_high == 1 { (a, b) } else { (b, a) };
            *balance.entry(from).or_insert(0) += 1;
            *balance.entry(to).or_insert(0) -= 1;
        }
    }
    hit.extend(balance.iter().filter(|(_, &d)| d != 0).map(|(&v, _)| v));
    if hit.is_empty() {
        return 0;
    }
    let before = mesh.triangles.len();
    mesh.triangles.retain(|t| !t.iter().any(|&v| hit.contains(&ids[v as usize])));
    mesh.weld_by_position();
    before - mesh.triangles.len()
}

/// Removes faces lying on the same three positions as another: pairs wound in
/// opposite directions are a wall of zero thickness and both go, and of faces
/// wound the same way one is kept.
pub fn remove_coincident_faces(mesh: &mut IndexedMesh) -> usize {
    let ids = mesh.position_weld_ids();
    let mut groups: AHashMap<[u32; 3], (Vec<usize>, Vec<usize>)> = AHashMap::new();
    for (fi, t) in mesh.triangles.iter().enumerate() {
        let w = t.map(|v| ids[v as usize]);
        if w[0] == w[1] || w[1] == w[2] || w[0] == w[2] {
            continue;
        }
        let r = (0..3).min_by_key(|&i| w[i]).unwrap();
        let rot = [w[r], w[(r + 1) % 3], w[(r + 2) % 3]];
        let (key, forward) = if rot[1] < rot[2] { (rot, true) } else { ([rot[0], rot[2], rot[1]], false) };
        let g = groups.entry(key).or_default();
        if forward { g.0.push(fi) } else { g.1.push(fi) }
    }
    let mut drop = vec![false; mesh.triangles.len()];
    let mut removed = 0usize;
    for (fwd, bwd) in groups.values() {
        let pairs = fwd.len().min(bwd.len());
        for (&a, &b) in fwd.iter().zip(bwd.iter()) {
            drop[a] = true;
            drop[b] = true;
            removed += 2;
        }
        for &f in fwd.iter().skip(pairs + 1).chain(bwd.iter().skip(pairs + 1)) {
            drop[f] = true;
            removed += 1;
        }
    }
    if removed > 0 {
        let mut i = 0;
        mesh.triangles.retain(|_| {
            i += 1;
            !drop[i - 1]
        });
    }
    removed
}

/// Removes collinear caps by flipping their longest edge, which keeps the surface closed.
pub fn flip_degenerate_caps(mesh: &mut IndexedMesh, area_eps: f32, max_rounds: usize) -> usize {
    let mut flips = 0usize;
    for _ in 0..max_rounds {
        let caps: Vec<u32> = (0..mesh.triangles.len() as u32)
            .filter(|&f| {
                let [a, b, c] = mesh.triangles[f as usize];
                a != b && b != c && a != c && mesh.tri_area(f) <= area_eps
            })
            .collect();
        if caps.is_empty() {
            break;
        }
        let topo = Topology::build(mesh);
        let mut touched: AHashSet<u32> = AHashSet::new();
        let mut round = 0usize;
        for f in caps {
            if touched.contains(&f) {
                continue;
            }
            let tri = mesh.triangles[f as usize];
            let p = [d3(mesh.positions[tri[0] as usize]), d3(mesh.positions[tri[1] as usize]), d3(mesh.positions[tri[2] as usize])];
            let len2 = |i: usize| {
                let d = sub(p[(i + 1) % 3], p[i]);
                dot(d, d)
            };
            let k = (0..3).max_by(|&x, &y| len2(x).total_cmp(&len2(y))).unwrap();
            let (u, v, c) = (tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]);
            let Some(info) = topo.edges.get(&edge_key(u, v)) else { continue };
            if info.faces.len() != 2 {
                continue;
            }
            let nb = if info.faces[0] == f { info.faces[1] } else { info.faces[0] };
            if touched.contains(&nb) {
                continue;
            }
            let ntri = mesh.triangles[nb as usize];
            let Some(&d) = ntri.iter().find(|&&x| x != u && x != v) else { continue };
            let consistent = (0..3).any(|i| ntri[i] == v && ntri[(i + 1) % 3] == u);
            if !consistent || c == d || topo.edges.contains_key(&edge_key(c, d)) {
                continue;
            }
            mesh.triangles[f as usize] = [c, u, d];
            mesh.triangles[nb as usize] = [v, c, d];
            touched.insert(f);
            touched.insert(nb);
            round += 1;
        }
        if round == 0 {
            break;
        }
        flips += round;
    }
    flips
}
