//! Mesh-normal overhang classification — auto-supports redesign, Step 1.
//!
//! Classifies down-facing mesh triangles whose surface is flatter than a
//! configurable self-support angle into connected overhang REGIONS.
//!
//! Why this exists: the slice-growth detector (`current − dilate(prev, buffer)`)
//! only flags surfaces whose per-layer cross-section expansion exceeds the
//! support buffer — with 0.05 mm layers and a 0.25 mm buffer that is
//! `arctan(0.05/0.25) ≈ 11.3°` from horizontal. The entire 11°–45° zone that
//! resin printing wants supported (shallow slopes, rotated-cube undersides)
//! is invisible to growth detection, and shallow slopes accumulate unsupported
//! material without ever triggering the per-layer rule.
//!
//! A surface at angle θ from horizontal (0° = flat ceiling, 90° = vertical wall)
//! is overhang when `θ < self_support_angle_deg`, i.e.
//! `normal.z < -cos(self_support_angle_deg)`. Only genuinely down-facing
//! triangles are eligible (the formula implies normal.z < 0).

use dragonfruit_mesh_repair::{core::mesh::Vec3, IndexedMesh};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Binary raster of a region's XY-projected footprint — the containment test
/// the density grid stage uses to place supports only inside the region.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FootprintMask {
    pub width: u32,
    pub height: u32,
    /// World XY of the mask's top-left pixel center (mm).
    pub origin_x: f32,
    pub origin_y: f32,
    pub px_mm: f32,
    /// Row-major pixels (1 = inside the projected region), width×height.
    pub data: Vec<u8>,
    /// Row-major surface Z (mm) on the region's own triangles, parallel to
    /// `data` — the exact face height at each pixel. The placement pipeline
    /// uses this so tips land on the region surface (not whatever other face
    /// happens to be below it on sloped geometry) and the regular
    /// normal-resolution/pathfinding then works unchanged.
    pub surface_z: Vec<f32>,
}

/// A connected patch of overhang triangles — the atomic unit the density
/// placement stage consumes (grid for large flats, one tip for small ones).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverhangRegion {
    /// Triangle indices into `IndexedMesh::triangles`.
    pub triangle_ids: Vec<u32>,
    /// Sum of the 3D triangle areas (mm²).
    pub area_mm2: f32,
    /// Sum of the XY-projected triangle areas (mm²) — the supportable footprint
    /// a density grid must cover (peel force scales with projected area).
    pub projected_area_mm2: f32,
    /// Area-weighted mean surface angle from horizontal (degrees).
    pub angle_deg: f32,
    /// Area-weighted mean face normal (world space, points away from the model
    /// interior — downward for undersides). Grid points use this instead of a
    /// whole-mesh raycast, which hits the wrong face on sloped geometry.
    pub normal: [f32; 3],
    /// XY bounding box of the region's vertices (mm).
    pub xy_min: [f32; 2],
    pub xy_max: [f32; 2],
    /// Lowest / highest vertex Z of the region (mm) — the leading edge of the
    /// overhang is at `min_z` (where peel starts).
    pub min_z: f32,
    pub max_z: f32,
    /// Projected-footprint mask at the requested resolution.
    pub footprint: FootprintMask,
}

/// Weld a world-space triangle soup (9 floats per triangle) and classify
/// overhang regions. Mirrors `scan_mesh_minima`'s stateless IPC shape.
pub fn classify_overhangs_from_soup(
    positions: &[f32],
    self_support_angle_deg: f32,
    px_mm: f32,
) -> Vec<OverhangRegion> {
    let mesh = IndexedMesh::from_triangle_soup(positions, 1e-5);
    classify_overhangs(&mesh, self_support_angle_deg, px_mm)
}

/// Classify overhang regions on an already-welded mesh.
pub fn classify_overhangs(
    mesh: &IndexedMesh,
    self_support_angle_deg: f32,
    px_mm: f32,
) -> Vec<OverhangRegion> {
    let tri_count = mesh.triangle_count();
    if tri_count == 0 {
        return Vec::new();
    }

    // A down-facing surface at angle θ from horizontal has normal.z = -cos(θ).
    // Overhang iff θ < threshold ⟺ normal.z < -cos(threshold).
    let threshold = -self_support_angle_deg.to_radians().cos();

    let mut is_overhang = vec![false; tri_count];
    let mut normal = vec![Vec3::ZERO; tri_count];
    for fi in 0..tri_count {
        let n = mesh.tri_normal(fi as u32);
        normal[fi] = n;
        is_overhang[fi] = n.z < threshold;
    }

    // Triangle adjacency through undirected edges (min, max vertex id).
    let mut edge_tris: HashMap<(u32, u32), Vec<u32>> = HashMap::new();
    for (fi, tri) in mesh.triangles.iter().enumerate() {
        for pair in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
            let key = if pair.0 < pair.1 { pair } else { (pair.1, pair.0) };
            edge_tris.entry(key).or_default().push(fi as u32);
        }
    }

    // Union-find over overhang triangles sharing an edge.
    let mut parent: Vec<u32> = (0..tri_count as u32).collect();
    fn find(parent: &mut [u32], x: u32) -> u32 {
        let mut root = x;
        while parent[root as usize] != root {
            root = parent[root as usize];
        }
        let mut cur = x;
        while parent[cur as usize] != root {
            let next = parent[cur as usize];
            parent[cur as usize] = root;
            cur = next;
        }
        root
    }
    fn union(parent: &mut [u32], a: u32, b: u32) {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra != rb {
            // Deterministic: smaller id wins as root.
            let (keep, drop) = if ra < rb { (ra, rb) } else { (rb, ra) };
            parent[drop as usize] = keep;
        }
    }

    for tris in edge_tris.values() {
        if tris.len() < 2 {
            continue;
        }
        for w in tris.windows(2) {
            union(&mut parent, w[0], w[1]);
        }
    }

    // Group by root (sorted for determinism).
    let mut by_root: HashMap<u32, Vec<u32>> = HashMap::new();
    for fi in 0..tri_count as u32 {
        if !is_overhang[fi as usize] {
            continue;
        }
        let root = find(&mut parent, fi);
        by_root.entry(root).or_default().push(fi);
    }
    let mut groups: Vec<(u32, Vec<u32>)> = by_root.into_iter().collect();
    groups.sort_by_key(|(root, _)| *root);

    groups
        .into_iter()
        .map(|(_, triangle_ids)| build_region(mesh, &normal, triangle_ids, px_mm))
        .collect()
}

fn build_region(
    mesh: &IndexedMesh,
    normal: &[Vec3],
    triangle_ids: Vec<u32>,
    px_mm: f32,
) -> OverhangRegion {
    let mut area_mm2 = 0.0f32;
    let mut projected_area_mm2 = 0.0f32;
    let mut angle_weighted = 0.0f32;
    let mut min_z = f32::INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    let mut xy_min = [f32::INFINITY; 2];
    let mut xy_max = [f32::NEG_INFINITY; 2];

    let mut normal_acc = [0f32; 3];
    for &fi in &triangle_ids {
        let [a, b, c] = mesh.tri_positions(fi);
        let area = mesh.tri_area(fi);
        area_mm2 += area;

        let n = normal[fi as usize];
        normal_acc[0] += n.x * area;
        normal_acc[1] += n.y * area;
        normal_acc[2] += n.z * area;

        // XY-projected area of the triangle.
        let cross2d = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        projected_area_mm2 += cross2d.abs() * 0.5;

        let nz = normal[fi as usize].z.clamp(-1.0, 0.0);
        // Surface angle from horizontal: normal.z = -cos(θ) → θ = acos(-nz).
        let angle = (-nz).acos().to_degrees();
        angle_weighted += area * angle;

        for v in [a, b, c] {
            min_z = min_z.min(v.z);
            max_z = max_z.max(v.z);
            xy_min[0] = xy_min[0].min(v.x);
            xy_min[1] = xy_min[1].min(v.y);
            xy_max[0] = xy_max[0].max(v.x);
            xy_max[1] = xy_max[1].max(v.y);
        }
    }

    let footprint = build_footprint_mask(mesh, &triangle_ids, xy_min, xy_max, px_mm);

    // Area-weighted mean normal, normalized.
    let normal_len = (normal_acc[0] * normal_acc[0]
        + normal_acc[1] * normal_acc[1]
        + normal_acc[2] * normal_acc[2])
        .sqrt();
    let normal = if normal_len > 1e-9 {
        [
            normal_acc[0] / normal_len,
            normal_acc[1] / normal_len,
            normal_acc[2] / normal_len,
        ]
    } else {
        [0.0, 0.0, -1.0]
    };

    OverhangRegion {
        triangle_ids,
        area_mm2,
        projected_area_mm2,
        angle_deg: if area_mm2 > 1e-9 {
            angle_weighted / area_mm2
        } else {
            0.0
        },
        normal,
        xy_min,
        xy_max,
        min_z,
        max_z,
        footprint,
    }
}

/// Rasterize the region's XY-projected triangles into a containment mask.
/// The mask is expanded by half a pixel on each side so edge pixels sample
/// the region interior rather than falling just outside it.
fn build_footprint_mask(
    mesh: &IndexedMesh,
    triangle_ids: &[u32],
    xy_min: [f32; 2],
    xy_max: [f32; 2],
    px_mm: f32,
) -> FootprintMask {
    let px = px_mm.max(1e-4);
    let width = (((xy_max[0] - xy_min[0]) / px).ceil() as u32).max(1);
    let height = (((xy_max[1] - xy_min[1]) / px).ceil() as u32).max(1);

    let mut data = vec![0u8; (width * height) as usize];
    let mut surface_z = vec![0f32; (width * height) as usize];
    // Pixel centers, expanded by half a pixel outward from the bbox.
    let origin_x = xy_min[0] - px * 0.5;
    let origin_y = xy_min[1] - px * 0.5;

    // Rasterize PER TRIANGLE: each triangle fills the pixels inside its own
    // XY bbox. The naive loop tested every region triangle against every
    // pixel — O(W*H*N) — which dominated the scan on large flat undersides
    // (a 364 mm² face at 0.25 mm px ≈ 5.8k pixels × 10–50k triangles).
    // Per-triangle work is O(sum of triangle bboxes) ≈ O(W*H) for a tiled
    // region. First triangle in list order wins, as before — deterministic.
    for &fi in triangle_ids {
        let [a, b, c] = mesh.tri_positions(fi);
        let tmin_x = a.x.min(b.x).min(c.x);
        let tmax_x = a.x.max(b.x).max(c.x);
        let tmin_y = a.y.min(b.y).min(c.y);
        let tmax_y = a.y.max(b.y).max(c.y);

        let px0 = (((tmin_x - origin_x) / px).floor() as i64).max(0) as u32;
        let px1 = (((tmax_x - origin_x) / px).floor() as i64).min(width as i64 - 1) as u32;
        let py0 = (((tmin_y - origin_y) / px).floor() as i64).max(0) as u32;
        let py1 = (((tmax_y - origin_y) / px).floor() as i64).min(height as i64 - 1) as u32;

        for py in py0..=py1 {
            let y = origin_y + (py as f32 + 0.5) * px;
            for px_idx in px0..=px1 {
                let idx = (py * width + px_idx) as usize;
                if data[idx] == 1 {
                    continue;
                }
                let x = origin_x + (px_idx as f32 + 0.5) * px;
                if point_in_triangle_2d(x, y, (a.x, a.y), (b.x, b.y), (c.x, c.y)) {
                    data[idx] = 1;
                    surface_z[idx] = barycentric_z(x, y, a, b, c);
                }
            }
        }
    }

    FootprintMask {
        width,
        height,
        origin_x,
        origin_y,
        px_mm: px,
        data,
        surface_z,
    }
}

/// Surface Z of a triangle at a projected XY via barycentric interpolation.
fn barycentric_z(px: f32, py: f32, a: Vec3, b: Vec3, c: Vec3) -> f32 {
    let denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if denom.abs() < 1e-9 {
        return (a.z + b.z + c.z) / 3.0;
    }
    let w_a = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / denom;
    let w_b = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / denom;
    let w_c = 1.0 - w_a - w_b;
    w_a * a.z + w_b * b.z + w_c * c.z
}

/// Point-in-triangle test (2D, half-plane method).
fn point_in_triangle_2d(
    px: f32,
    py: f32,
    a: (f32, f32),
    b: (f32, f32),
    c: (f32, f32),
) -> bool {
    let sign = |x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32| {
        (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
    };
    let d1 = sign(px, py, a.0, a.1, b.0, b.1);
    let d2 = sign(px, py, b.0, b.1, c.0, c.1);
    let d3 = sign(px, py, c.0, c.1, a.0, a.1);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
}

/// Tauri IPC command: weld a world-space triangle soup (9 floats per triangle)
/// and classify overhang regions with projected-footprint masks. Stateless —
/// no model cache. Mirrors `scan_mesh_minima`'s shape.
#[tauri::command]
pub async fn scan_overhangs(
    positions: Vec<f32>,
    self_support_angle_deg: f32,
    px_mm: f32,
) -> Result<Vec<OverhangRegion>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let regions = classify_overhangs_from_soup(&positions, self_support_angle_deg, px_mm);
        log::info!(
            "[overhang] scan complete: {} regions from {} triangles",
            regions.len(),
            positions.len() / 9,
        );
        Ok(regions)
    })
    .await
    .map_err(|e| format!("Overhang scan task panicked: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rotate a triangle soup about the X axis by `angle_deg`.
    fn rotate_x(positions: &[f32], angle_deg: f32) -> Vec<f32> {
        let (s, c) = angle_deg.to_radians().sin_cos();
        positions
            .chunks_exact(3)
            .flat_map(|v| {
                let (x, y, z) = (v[0], v[1], v[2]);
                [x, c * y - s * z, s * y + c * z]
            })
            .collect()
    }

    /// 10×10×10 cube, faces wound so normals point outward.
    fn unit_cube_soup() -> Vec<f32> {
        let mut out = Vec::new();
        // v0(0,0,0) v1(10,0,0) v2(10,10,0) v3(0,10,0) v4(0,0,10) v5(10,0,10) v6(10,10,10) v7(0,10,10)
        let v: [[f32; 3]; 8] = [
            [0.0, 0.0, 0.0],
            [10.0, 0.0, 0.0],
            [10.0, 10.0, 0.0],
            [0.0, 10.0, 0.0],
            [0.0, 0.0, 10.0],
            [10.0, 0.0, 10.0],
            [10.0, 10.0, 10.0],
            [0.0, 10.0, 10.0],
        ];
        // bottom (-Z): (v0,v3,v2),(v0,v2,v1)
        // top (+Z):    (v4,v5,v6),(v4,v6,v7)
        // front (-Y):  (v0,v5,v4),(v0,v1,v5)
        // back (+Y):   (v3,v7,v6),(v3,v6,v2)
        // left (-X):   (v0,v4,v7),(v0,v7,v3)
        // right (+X):  (v1,v6,v5),(v1,v2,v6)
        let tris: [[usize; 3]; 12] = [
            [0, 3, 2],
            [0, 2, 1],
            [4, 5, 6],
            [4, 6, 7],
            [0, 5, 4],
            [0, 1, 5],
            [3, 7, 6],
            [3, 6, 2],
            [0, 4, 7],
            [0, 7, 3],
            [1, 6, 5],
            [1, 2, 6],
        ];
        for t in tris {
            for &i in &t {
                out.extend_from_slice(&v[i]);
            }
        }
        out
    }

    fn assert_region(
        regions: &[OverhangRegion],
        expected_angle_deg: f32,
        expected_area_mm2: f32,
    ) {
        assert_eq!(regions.len(), 1, "expected exactly one region: {regions:?}");
        let r = &regions[0];
        assert!(
            (r.angle_deg - expected_angle_deg).abs() < 1.5,
            "angle {} vs expected {}",
            r.angle_deg,
            expected_angle_deg
        );
        assert!(
            (r.area_mm2 - expected_area_mm2).abs() < 1.0,
            "area {} vs expected {}",
            r.area_mm2,
            expected_area_mm2
        );
    }

    /// Horizontal quad (10×10, normal −Z) rotated `angle_deg` about X — a
    /// downward-facing surface at that angle from horizontal.
    fn quad_at(angle_deg: f32) -> Vec<f32> {
        let soup: Vec<f32> = vec![
            0.0, 0.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0, // tri 0 (normal -Z)
            0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, // tri 1 (normal -Z)
        ];
        rotate_x(&soup, angle_deg)
    }

    #[test]
    fn flat_ceiling_is_overhang() {
        let soup = unit_cube_soup();
        let regions = classify_overhangs_from_soup(&soup, 45.0, 0.25);
        // Only the bottom face (2 triangles, 100 mm², angle 0°) is flagged.
        assert_region(&regions, 0.0, 100.0);
        assert_eq!(regions[0].triangle_ids.len(), 2);
        assert!((regions[0].projected_area_mm2 - 100.0).abs() < 1.0);
        assert!((regions[0].min_z - 0.0).abs() < 1e-3);
    }

    #[test]
    fn rotated_cube_underside_facet_is_single_region() {
        // The user's canonical case: a cube rotated 30° about X. The former
        // bottom face becomes a 30°-from-horizontal facet — invisible to the
        // slice-growth detector (per-layer expansion < buffer) — and must be
        // one overhang region covering the WHOLE face, not just the lowest
        // vertex (which is all the minima detector would catch).
        let soup = rotate_x(&unit_cube_soup(), 30.0);
        let regions = classify_overhangs_from_soup(&soup, 45.0, 0.25);
        assert_region(&regions, 30.0, 100.0);
        assert_eq!(regions[0].triangle_ids.len(), 2, "whole face, not an edge");
        // Projected footprint of a 30° face: 100 × cos(30°) ≈ 86.6 mm².
        assert!(
            (regions[0].projected_area_mm2 - 86.6025).abs() < 1.0,
            "projected {}",
            regions[0].projected_area_mm2
        );
        // The lowest corner of the rotated cube (z = 0) belongs to this region.
        assert!((regions[0].min_z - 0.0).abs() < 1e-3);

        // Footprint mask: the 30°-rotated face projects to a 10 × 8.66 mm
        // rectangle (rotation about X compresses Y), fully covering its bbox.
        let f = &regions[0].footprint;
        assert!((f.width as f32 - 40.0).abs() <= 1.0, "width {}", f.width);
        assert!((f.height as f32 - 35.0).abs() <= 1.0, "height {}", f.height);
        assert!(f.data.iter().all(|&v| v == 1), "projection is a solid rectangle");
        let mask_area = f.data.len() as f32 * 0.25 * 0.25;
        assert!(
            (mask_area - 86.6).abs() < 10.0,
            "mask area {mask_area} ≈ projected 86.6"
        );

        // Surface Z follows the slope: low edge ≈ 0, high edge ≈ 5 (the 10×10
        // face at 30° spans z 0..5 across its y-extent).
        let z_at = |x: f32, y: f32| -> f32 {
            let col = (((x + 0.125) / 0.25) - 0.5).round() as usize;
            let row = (((y + 0.125) / 0.25) - 0.5).round() as usize;
            f.surface_z[row * f.width as usize + col]
        };
        assert!((z_at(5.0, 0.5) - 0.0).abs() < 0.6, "low edge z {}", z_at(5.0, 0.5));
        assert!((z_at(5.0, 8.0) - 4.6).abs() < 0.6, "high edge z {}", z_at(5.0, 8.0));

        // Region normal: the 30°-rotated bottom face has normal (0, 0.5, -0.866).
        let n = regions[0].normal;
        assert!((n[0]).abs() < 0.01, "nx {}", n[0]);
        assert!((n[1] - 0.5).abs() < 0.01, "ny {}", n[1]);
        assert!((n[2] + 0.8660).abs() < 0.01, "nz {}", n[2]);
    }

    #[test]
    fn triangular_facet_mask_respects_containment() {
        // A single right triangle (half of the 10×10 quad): pixels on the
        // y > x side of the diagonal must be outside the mask.
        let soup: Vec<f32> = vec![
            0.0, 0.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0, // normal -Z
        ];
        let regions = classify_overhangs_from_soup(&soup, 45.0, 0.25);
        assert_eq!(regions.len(), 1);
        assert!((regions[0].projected_area_mm2 - 50.0).abs() < 1.0);

        let f = &regions[0].footprint;
        // Pixel centers: x = origin_x + (col + 0.5)*px, origin_x = -0.125.
        let idx = |x: f32, y: f32| -> usize {
            let col = (((x + 0.125) / 0.25) - 0.5).round() as usize;
            let row = (((y + 0.125) / 0.25) - 0.5).round() as usize;
            row * f.width as usize + col
        };
        assert_eq!(f.data[idx(2.0, 1.0)], 1, "(2,1) is inside the triangle (y ≤ x)");
        assert_eq!(f.data[idx(1.0, 2.0)], 0, "(1,2) is outside the triangle (y > x)");
    }

    #[test]
    fn vertical_wall_is_not_overhang() {
        let regions = classify_overhangs_from_soup(&quad_at(90.0), 45.0, 0.25);
        assert!(regions.is_empty(), "no overhang on a vertical wall: {regions:?}");
    }

    #[test]
    fn slope_steeper_than_threshold_is_self_supporting() {
        // 60° slope: self-supporting at the 45° threshold, flagged at 70°.
        let soup60 = quad_at(60.0);
        let regions = classify_overhangs_from_soup(&soup60, 45.0, 0.25);
        assert!(regions.is_empty(), "60° slope must be self-supporting at 45°: {regions:?}");
        let regions70 = classify_overhangs_from_soup(&soup60, 70.0, 0.25);
        assert_eq!(regions70.len(), 1, "60° slope flagged at 70° threshold");
        assert!((regions70[0].angle_deg - 60.0).abs() < 1.5);
    }

    #[test]
    fn two_disjoint_slopes_are_two_regions() {
        // Two separate rotated cubes far apart → two distinct regions.
        let mut soup = rotate_x(&unit_cube_soup(), 20.0);
        let second = rotate_x(&unit_cube_soup(), 20.0);
        for v in second.chunks_exact(3) {
            soup.extend_from_slice(&[v[0] + 100.0, v[1], v[2]]);
        }
        let regions = classify_overhangs_from_soup(&soup, 45.0, 0.25);
        assert_eq!(regions.len(), 2, "two disjoint slopes: {regions:?}");
        assert!((regions[0].angle_deg - 20.0).abs() < 1.5);
        assert!((regions[1].angle_deg - 20.0).abs() < 1.5);
        // Deterministic ordering: the two regions are ordered by root triangle id.
        assert!(regions[0].xy_min[0] < regions[1].xy_min[0]);
    }
}
