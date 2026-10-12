//! `dragonfruit-mesh-repair` CLI. Useful for benchmarking, batch repair,
//! and CI golden-file checks.

use std::path::PathBuf;

use clap::{Parser, Subcommand};

use dragonfruit_mesh_repair::{
    analyze_path, io::write_positions_file, repair_path, repair_with_progress, RepairOptions,
};

#[derive(Debug, Parser)]
#[command(
    name = "dragonfruit-mesh-repair",
    about = "DragonFruit mesh repair engine"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Analyze a mesh and print a JSON diagnostic report.
    Analyze {
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
        #[arg(long, default_value_t = 1e-5)]
        weld_epsilon: f32,
        #[arg(long, default_value_t = 64)]
        fill_holes_max_edges: usize,
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
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.command {
        Command::Analyze { input, pretty } => {
            let report = analyze_path(input)?;
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
                let mesh = dragonfruit_mesh_repair::io::load_mesh_from_path(&input)?;
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
            let mesh = dragonfruit_mesh_repair::io::load_mesh_from_path(&input)?;
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
    }
    Ok(())
}
