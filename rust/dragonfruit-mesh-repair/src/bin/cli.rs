//! `dragonfruit-mesh-repair` CLI. Useful for benchmarking, batch repair,
//! and CI golden-file checks.

use std::path::PathBuf;

use clap::{Parser, Subcommand};

use dragonfruit_mesh_repair::{
    analyze, io::write_positions_file, repair_path, repair_with_progress, IndexedMesh,
    MeshRepairError, RepairOptions,
};

#[derive(Debug, Parser)]
#[command(
    name = "dragonfruit-mesh-repair",
    about = "DragonFruit mesh repair engine"
)]
struct Cli {
    /// Read the file as it is written on disk, instead of the loader's refined mesh.
    ///
    /// The loader subdivides faces longer than 2% of the model diagonal, because the renderer needs
    /// the density and every triangle id has to agree with the geometry the app holds. That
    /// refinement is invisible in the counts: a 26,488-triangle pulley reads as 276,488. Pass this
    /// to measure or rewrite the file itself. It applies to every command that reads a mesh.
    #[arg(long, global = true)]
    raw: bool,
    #[command(subcommand)]
    command: Command,
}

/// The loader every command goes through, so `--raw` cannot be honoured in one place and forgotten
/// in another. Refining on the way in says so on stderr, because a run that silently changes the
/// mesh under it is how a count gets attributed to the wrong object.
fn load_mesh(path: &std::path::Path, raw: bool) -> Result<IndexedMesh, MeshRepairError> {
    let mut mesh = dragonfruit_mesh_repair::io::load_mesh_unrefined_from_path(path)?;
    if raw {
        return Ok(mesh);
    }
    let before = mesh.triangles.len();
    mesh = dragonfruit_mesh_repair::io::refine_coarse_faces(mesh);
    if mesh.triangles.len() != before {
        eprintln!(
            "note: the loader refined {before} -> {} triangles; --raw reads the file as written",
            mesh.triangles.len()
        );
    }
    Ok(mesh)
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Analyze a mesh and print a JSON diagnostic report.
    Analyze {
        input: PathBuf,
        #[arg(long)]
        pretty: bool,
    },
    /// Delete the model's cavities and write what is left, making a hollow or broken model solid.
    ///
    /// Removes surface, not material: a cavity encloses nothing, so deleting it leaves the outer
    /// shell. Where the cavity broke through that shell the result is open, and closing it is the
    /// resampler's job. This is offered as a choice rather than folded into repair because a hollow
    /// model is sometimes the model.
    Solidify {
        input: PathBuf,
        /// Also delete cavities whose shell is broken, which is what a cavity breaking through the
        /// outer wall leaves behind. Off by default: it removes more than a modelled hollow.
        #[arg(long)]
        include_broken: bool,
        /// Output binary STL path. If omitted, only the JSON report is produced.
        #[arg(long)]
        out_stl: Option<PathBuf>,
        #[arg(long)]
        pretty: bool,
    },
    /// Rebuild a mesh's surface by resolving it into a solid, rather than by resampling it.
    ///
    /// This is the mode the reference implementation's shrinkwrap uses: close what is open, then let
    /// a boolean of the mesh with itself resolve it into a solid, then drop scrap shells. It moves
    /// the surface, where `tetwrap` conforms to it and gives it back unchanged.
    SolidRemesh {
        input: PathBuf,
        /// Output binary STL path. If omitted, only the JSON report is produced.
        #[arg(long)]
        out_stl: Option<PathBuf>,
        /// Simplify before resolving, on `simplify_to_error`'s scale. 0.001 removes about a quarter
        /// of a dense model; zero leaves it alone.
        #[arg(long, default_value_t = 0.001)]
        tolerance: f32,
        #[arg(long)]
        pretty: bool,
    },
    /// Report the closed components sitting inside others: the model's cavities.
    ///
    /// A hollowed model has these on purpose and a damaged one can have them by accident, so this
    /// only reports them. Whether to fill one by deleting it is the caller's decision, and it is
    /// the only thing that decision costs: a cavity encloses no material, so removing it makes the
    /// model solid without changing the material the model already had.
    Cavities {
        input: PathBuf,
        #[arg(long)]
        pretty: bool,
    },
    /// Run the full repair pipeline and emit repaired mesh + report.
    Repair {
        input: PathBuf,
        /// Output binary STL path. If omitted, only the JSON report is produced.
        #[arg(long)]
        out_stl: Option<PathBuf>,
        /// Output raw staged positions (LE f32, 9 per tri). Optional.
        #[arg(long)]
        out_positions: Option<PathBuf>,
        /// Output JSON report path. If omitted, the report is printed to stdout.
        #[arg(long)]
        out_report: Option<PathBuf>,
        #[arg(long)]
        pretty: bool,
        /// Weld tolerance, relative to the bbox diagonal. Omitted, the engine derives it from the
        /// mesh's own shortest edge.
        #[arg(long)]
        weld_epsilon: Option<f32>,
        /// Longest boundary loop that will be auto-filled, in vertices. Omitted, the engine
        /// derives it from the model's size and its own edge lengths.
        #[arg(long)]
        fill_holes_max_edges: Option<usize>,
        #[arg(long)]
        keep_largest_n: Option<usize>,
        #[arg(long, default_value_t = true)]
        repair_orientation: bool,
        #[arg(long, default_value_t = false)]
        resolve_self_intersections: bool,
        /// Print each stage to stderr as it begins. A run that does not finish then says where
        /// it stopped, which the final report cannot.
        #[arg(long, default_value_t = false)]
        progress: bool,
    },
    /// Resample a mesh into a closed one.
    ///
    /// Deliberately separate from `repair`, and never called by it: this one resamples, so the
    /// result has no relation to the input's geometry beyond its shape. It exists for meshes whose
    /// topology cannot be repaired, where every pass in `repair` has to refuse rather than damage
    /// the object.
    Shrinkwrap {
        input: PathBuf,
        /// Output binary STL path. If omitted, only the JSON report is produced.
        #[arg(long)]
        out_stl: Option<PathBuf>,
        /// Voxel size in mesh units. Detail finer than this does not survive.
        #[arg(long, default_value_t = 0.5)]
        voxel_mm: f32,
        /// Push the surface out by this much before extracting it, which closes gaps up to twice
        /// this wide. Costs that much inflation.
        #[arg(long, default_value_t = 0.1)]
        gap_fill_mm: f32,
        /// Push it out by this much more. Additive with --gap-fill-mm.
        #[arg(long, default_value_t = 0.0)]
        thickness_mm: f32,
        /// Simplify the isosurface to at most this many triangles. Zero keeps all of it, which at
        /// a fine voxel is tens of millions.
        #[arg(long, default_value_t = 0)]
        max_triangles: usize,
        #[arg(long, default_value_t = false)]
        pretty: bool,
    },
    /// Resample by tetrahedralising the model's points, keeping the inside/outside boundary.
    ///
    /// The second surfacing mode beside `shrinkwrap`, and like it, never called by `repair`. Its
    /// decomposition follows where the model's own points are rather than a uniform lattice, so it
    /// keeps detail a voxel size would destroy, and the boundary between two labels is closed by
    /// construction, so it emits no debris where the band isosurface does.
    Tetwrap {
        input: PathBuf,
        /// Output binary STL path. If omitted, only the JSON report is produced.
        #[arg(long)]
        out_stl: Option<PathBuf>,
        /// TetGen's own switches. The default reads the input as a piecewise linear complex and
        /// has TetGen split facets that intersect each other, which is what makes a damaged soup
        /// admissible to a constrained decomposition.
        #[arg(long, default_value = "pQ")]
        switches: String,
        /// Simplify the input by this fraction of the model before decomposing it. 0.05 is five
        /// percent; zero leaves the input alone.
        #[arg(long, default_value_t = 0.05)]
        tolerance: f32,
        /// Simplify the extracted surface to at most this many triangles. Zero keeps all of it.
        #[arg(long, default_value_t = 0)]
        max_triangles: usize,
        #[arg(long, default_value_t = false)]
        pretty: bool,
    },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let Cli { raw, command } = Cli::parse();
    match command {
        Command::Solidify {
            input,
            include_broken,
            out_stl,
            pretty,
        } => {
            let mut mesh = load_mesh(&input, raw)?;
            // Sheets first: a cavity plugged with zero-depth geometry is joined to the shell it broke
            // through, so they count as one component and the cavity cannot be seen until it is cut
            // free. The sheets are zero-depth, so dropping them moves no material either.
            let mut sheets = mesh.triangles.clone();
            let sheet_count = dragonfruit_mesh_repair::repair::drop_zero_depth_sheets(&mut sheets);
            if sheet_count > 0 {
                let keep: std::collections::HashSet<(u32, u32, u32)> = sheets
                    .iter()
                    .map(|t| {
                        let mut k = *t;
                        k.sort_unstable();
                        (k[0], k[1], k[2])
                    })
                    .collect();
                let mut i = 0usize;
                mesh.triangles.retain(|t| {
                    let mut k = *t;
                    k.sort_unstable();
                    let keep_it = keep.contains(&(k[0], k[1], k[2]));
                    i += 1;
                    keep_it
                });
            }
            let scan = dragonfruit_mesh_repair::repair::scan_cavities(&mesh);
            let removed = dragonfruit_mesh_repair::repair::remove_cavities(&mut mesh, include_broken);
            if let Some(p) = &out_stl {
                dragonfruit_mesh_repair::io::stl::write_binary(&mesh, p)?;
            }
            let value = serde_json::json!({
                "input_triangles": scan.triangles + (mesh.triangles.len() - (mesh.triangles.len() - removed)),
                "cavity_components": scan.components,
                "broken_cavity_components": scan.broken_components,
                "cavity_volume": scan.volume,
                "removed_triangles": removed,
                "remaining_triangles": mesh.triangles.len(),
            });
            let s = if pretty {
                serde_json::to_string_pretty(&value)?
            } else {
                serde_json::to_string(&value)?
            };
            println!("{s}");
        }
        Command::SolidRemesh { input, out_stl, tolerance, pretty } => {
            let mesh = load_mesh(&input, raw)?;
            let options = dragonfruit_mesh_repair::solid_remesh::SolidRemeshOptions {
                tolerance,
                ..dragonfruit_mesh_repair::solid_remesh::SolidRemeshOptions::default()
            };
            let outcome = dragonfruit_mesh_repair::solid_remesh::solid_remesh(&mesh, &options);
            if let Some(p) = &out_stl {
                dragonfruit_mesh_repair::io::stl::write_binary(&outcome.mesh, p)?;
            }
            let s = if pretty {
                serde_json::to_string_pretty(&outcome.report)?
            } else {
                serde_json::to_string(&outcome.report)?
            };
            println!("{s}");
        }
        Command::Cavities { input, pretty } => {
            let mesh = load_mesh(&input, raw)?;
            let scan = dragonfruit_mesh_repair::repair::scan_cavities(&mesh);
            let value = serde_json::json!({
                "input_triangles": mesh.triangles.len(),
                "cavity_components": scan.components,
                "broken_cavity_components": scan.broken_components,
                "cavity_triangles": scan.triangles,
                "cavity_volume": scan.volume,
            });
            let s = if pretty {
                serde_json::to_string_pretty(&value)?
            } else {
                serde_json::to_string(&value)?
            };
            println!("{s}");
        }
        Command::Analyze { input, pretty } => {
            let report = analyze(&load_mesh(&input, raw)?);
            let s = if pretty {
                serde_json::to_string_pretty(&report)?
            } else {
                serde_json::to_string(&report)?
            };
            println!("{s}");
        }
        Command::Repair {
            input,
            out_stl,
            out_positions,
            out_report,
            pretty,
            weld_epsilon,
            fill_holes_max_edges,
            keep_largest_n,
            repair_orientation,
            resolve_self_intersections,
            progress,
        } => {
            let options = RepairOptions {
                weld_epsilon,
                fill_holes_max_edges,
                keep_largest_n_components: keep_largest_n,
                repair_orientation,
                resolve_self_intersections,
                assume_support_geometry: None,
            };
            let outcome = if progress {
                let mesh = load_mesh(&input, raw)?;
                repair_with_progress(
                    mesh,
                    &options,
                    Some(&mut |name: &str, _stage: usize| {
                        eprintln!("[stage] {name}");
                        true
                    }),
                )
            } else {
                repair_path(&input, &options)?
            };
            if let Some(p) = &out_stl {
                dragonfruit_mesh_repair::io::stl::write_binary(&outcome.mesh, p)?;
            }
            if let Some(p) = &out_positions {
                write_positions_file(&outcome.mesh, p)?;
            }
            let s = if pretty {
                serde_json::to_string_pretty(&outcome.report)?
            } else {
                serde_json::to_string(&outcome.report)?
            };
            match out_report {
                Some(p) => std::fs::write(p, s)?,
                None => println!("{s}"),
            }
        }
        Command::Shrinkwrap {
            input,
            out_stl,
            voxel_mm,
            gap_fill_mm,
            thickness_mm,
            max_triangles,
            pretty,
        } => {
            let mesh = load_mesh(&input, raw)?;
            let outcome = dragonfruit_mesh_repair::shrink_wrap(
                &mesh,
                &dragonfruit_mesh_repair::ShrinkWrapOptions {
                    voxel_mm,
                    gap_fill_mm,
                    thickness_mm,
                    max_triangles,
                },
            );
            if let Some(p) = &out_stl {
                dragonfruit_mesh_repair::io::stl::write_binary(&outcome.mesh, p)?;
            }
            let s = if pretty {
                serde_json::to_string_pretty(&outcome.report)?
            } else {
                serde_json::to_string(&outcome.report)?
            };
            println!("{s}");
        }
        Command::Tetwrap {
            input,
            out_stl,
            switches,
            tolerance,
            max_triangles,
            pretty,
        } => {
            let mesh = load_mesh(&input, raw)?;
            let outcome = dragonfruit_mesh_repair::tet_surface(
                &mesh,
                &dragonfruit_mesh_repair::TetWrapOptions {
                    switches,
                    max_triangles,
                    tolerance,
                },
            );
            // A run that could not build a decomposition returns the input unchanged. Writing that
            // to the output path would leave a file that looks like a successful resample of the
            // original, so it is not written and the failure is said out loud.
            if outcome.report.tetrahedra == 0 {
                let s = if pretty {
                    serde_json::to_string_pretty(&outcome.report)?
                } else {
                    serde_json::to_string(&outcome.report)?
                };
                println!("{s}");
                return Err(format!(
                    "no decomposition was built, so nothing was written to {}. The report above has \
                     the counts; check the switches.",
                    out_stl
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|| "the output path".to_string())
                )
                .into());
            }
            if let Some(p) = &out_stl {
                dragonfruit_mesh_repair::io::stl::write_binary(&outcome.mesh, p)?;
            }
            let s = if pretty {
                serde_json::to_string_pretty(&outcome.report)?
            } else {
                serde_json::to_string(&outcome.report)?
            };
            println!("{s}");
        }
    }
    Ok(())
}
