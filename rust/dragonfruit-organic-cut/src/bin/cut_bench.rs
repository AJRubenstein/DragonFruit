//! EXPERIMENT bench: cut strategies measured against captured dumps.
//!
//! Runs each strategy on the same inputs and prints one line per loop, so a new
//! idea is judged on the cuts that already work as much as on the ones that fail.
//! Multi-loop dumps are measured loop by loop: what matters first is whether a
//! single seam separates at all.
//!
//!     cargo run --release --features manifold --bin cut_bench -- <dir with cut-*.bin/json>

use std::path::Path;
use std::time::Instant;

use dragonfruit_mesh_core::mesh::{IndexedMesh, Vec3};
use dragonfruit_organic_cut::surface_cut::{seams_enclose_a_piece, SeamVerdict};
use dragonfruit_organic_cut::membrane::{contour_split, DEFAULT_CUTTER_THICKNESS_MM};
use dragonfruit_organic_cut::OrganicCutOptions;

/// Matches the app's staged loader (`dragonfruit_mesh_repair::io::DEFAULT_MERGE_EPSILON`).
const MERGE_EPSILON: f32 = 1e-5;

fn load_mesh(path: &Path) -> Result<IndexedMesh, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let floats: &[f32] = bytemuck::try_cast_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(IndexedMesh::from_triangle_soup(floats, MERGE_EPSILON))
}

/// Distance from `p` to the nearest point of `mesh`, for deciding which captured
/// mesh a seam belongs to.
fn distance_to_surface(bvh: &dragonfruit_mesh_core::bvh::Bvh, mesh: &IndexedMesh, p: Vec3) -> f32 {
    use dragonfruit_mesh_core::mesh::Aabb;
    for r in [0.5f32, 4.0, 32.0, 256.0] {
        let query = Aabb {
            min: Vec3::new(p.x - r, p.y - r, p.z - r),
            max: Vec3::new(p.x + r, p.y + r, p.z + r),
        };
        let mut best = f32::INFINITY;
        bvh.query_aabb(&query, |ti| {
            let t = &mesh.triangles[ti as usize];
            let (_, d2) = dragonfruit_organic_cut::membrane::closest_on_tri(
                p,
                mesh.positions[t[0] as usize],
                mesh.positions[t[1] as usize],
                mesh.positions[t[2] as usize],
            );
            best = best.min(d2);
        });
        if best.is_finite() {
            return best.sqrt();
        }
    }
    f32::INFINITY
}

fn main() -> Result<(), String> {
    let dir = std::env::args().nth(1).ok_or("usage: crown_bench <dump dir>")?;
    let dir = Path::new(&dir);

    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".json"))
        .collect();
    names.sort_by_key(|n| n.trim_start_matches("cut-").trim_end_matches(".json").parse::<u32>().unwrap_or(0));

    println!(
        "{:<10} {:<5} {:>6}  {:<24}  {:>5}  {:<34}",
        "dump", "loop", "pts", "wafer piece + rest", "", "surface verdict / seam off-skin"
    );
    let (mut wafer_ok, mut surface_ok, mut total) = (0, 0, 0);

    for name in names {
        let json = dir.join(&name);
        let stem = name.trim_end_matches(".json").to_string();
        // Dumps share meshes, and the same model appears in more than one
        // orientation across a session, so the seam decides which mesh it belongs
        // to: the one it actually lies on.
        let bin = dir.join(format!("{stem}.bin"));

        let options: OrganicCutOptions = serde_json::from_str(&std::fs::read_to_string(&json).map_err(|e| e.to_string())?)
            .map_err(|e| format!("{}: {e}", json.display()))?;
        let spec = &options.cut;
        let thickness = if spec.cutter_thickness_mm > 0.0 { spec.cutter_thickness_mm } else { DEFAULT_CUTTER_THICKNESS_MM };

        let mut loops: Vec<Vec<Vec3>> = Vec::new();
        let to_v = |pts: &[dragonfruit_organic_cut::OrganicCutLoopPoint]| -> Vec<Vec3> {
            pts.iter().map(|p| Vec3::new(p.position[0], p.position[1], p.position[2])).collect()
        };
        loops.push(to_v(&spec.loop_points));
        for extra in &spec.extra_loops {
            loops.push(to_v(extra));
        }

        let candidates: Vec<std::path::PathBuf> = if bin.exists() {
            vec![bin]
        } else {
            let mut v: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|x| x == "bin").unwrap_or(false))
                .collect();
            v.sort();
            v
        };
        let probe_pts: Vec<Vec3> = loops.first().map(|l| l.iter().step_by((l.len() / 12).max(1)).copied().collect()).unwrap_or_default();
        let mut best: Option<(f32, IndexedMesh)> = None;
        for cand in &candidates {
            let m = load_mesh(cand)?;
            let bvh = dragonfruit_mesh_core::bvh::Bvh::build(&m);
            let mut sum = 0.0f32;
            for &p in &probe_pts {
                sum += distance_to_surface(&bvh, &m, p);
            }
            let score = sum / probe_pts.len().max(1) as f32;
            if best.as_ref().is_none_or(|(b, _)| score < *b) {
                best = Some((score, m));
            }
        }
        let Some((fit, mesh)) = best else { continue };
        if fit > 1.0 {
            eprintln!("{stem}: no mesh in the directory carries this seam (nearest {fit:.2} mm) — skipped");
            continue;
        }

        for (i, lp) in loops.iter().enumerate() {
            if lp.len() < 3 {
                continue;
            }
            total += 1;
            let t0 = Instant::now();
            let wafer = contour_split(&mesh, lp, thickness, spec.membrane_smoothing, spec.density);
            let wafer_ms = t0.elapsed().as_millis();
            // How well does the seam lie ON the skin? Both strategies assume it
            // does: the wafer pins its rim there, the walk uses it as a barrier.
            let bvh = dragonfruit_mesh_core::bvh::Bvh::build(&mesh);
            let mut off_max = 0.0f32;
            for w in lp.windows(2) {
                for k in 0..4 {
                    let p = w[0].add(w[1].sub(w[0]).scale(k as f32 / 4.0));
                    off_max = off_max.max(distance_to_surface(&bvh, &mesh, p));
                }
            }
            let t1 = Instant::now();
            let verdict = seams_enclose_a_piece(&mesh, std::slice::from_ref(lp));
            let surface_ms = t1.elapsed().as_millis();

            let wafer_txt = match &wafer {
                Ok(s) => {
                    wafer_ok += 1;
                    format!("{} + {} ({wafer_ms}ms)", s.part_a.triangle_count(), s.part_b.triangle_count())
                }
                Err(_) => format!("— ({wafer_ms}ms)"),
            };
            let sizes = match &verdict {
                SeamVerdict::Enclosed { piece_faces } => {
                    surface_ok += 1;
                    format!("encloses {piece_faces} faces")
                }
                SeamVerdict::NotSeparating => "separates nothing".to_string(),
                SeamVerdict::TooCoarse => "mesh too coarse to tell".to_string(),
            };
            println!(
                "{:<10} {:<5} {:>6}  {:<24}  {:>5}  {:<34}",
                stem,
                i,
                lp.len(),
                wafer_txt,
                "",
                format!("{sizes} / off {off_max:.2}mm ({surface_ms}ms)")
            );
        }
        if loops.len() > 1 {
            let sizes = match seams_enclose_a_piece(&mesh, &loops) {
                SeamVerdict::Enclosed { piece_faces } => format!("encloses {piece_faces} faces"),
                SeamVerdict::NotSeparating => "separates nothing".to_string(),
                SeamVerdict::TooCoarse => "mesh too coarse to tell".to_string(),
            };
            println!(
                "{:<10} {:<5} {:>6}  {:<24}  {:>5}  {:<34}",
                stem,
                "all",
                loops.iter().map(|l| l.len()).sum::<usize>(),
                "",
                "",
                sizes
            );
        }
    }
    println!("\nseparated: wafer {wafer_ok}/{total}, surface walk {surface_ok}/{total}");
    Ok(())
}
