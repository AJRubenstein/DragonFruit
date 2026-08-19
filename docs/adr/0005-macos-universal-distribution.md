---
issue: df-universal-mac-build
date: 2026-05-24
kind: decision
---

# ADR-0005: Universal macOS distribution (Intel + Apple Silicon)

## Status

Accepted. Implemented on `feat/df-universal-mac-build` (targets `dev`).
Code complete; gated on the end-to-end hardware smoke (both an Apple Silicon
and an Intel Mac) before merge.

## Context

DragonFruit shipped two per-architecture macOS artifacts (`dragonfruit-macos-arm64`
and `dragonfruit-macos-x64`), each a thin `.dmg`. Users had to pick the right one,
and any mismatch ran the app under Rosetta (or not at all). We want a single
artifact that runs natively on both Intel and Apple Silicon.

The macOS bundle has three native pieces that all must be fat (contain both
`x86_64` and `arm64`):

1. the Tauri shell binary (`dragonfruit-desktop`),
2. the embedded `dragonfruit-voxl-thumbnailer` externalBin sidecar, and
3. the QuickLook thumbnail extension `VoxlThumbnailExtension.appex` (Swift),
   embedded into `Contents/PlugIns/`.

Complications discovered while implementing:

- `manifold-csg-sys` builds C++ (manifold3d) via CMake without passing
  `-DCMAKE_OSX_ARCHITECTURES`, so a naïve universal build links a thin static lib
  and fails.
- The QuickLook `.appex` is embedded + code-signed by a repo post-build step
  (`tauri-build.mjs`), which **CI never ran** — CI uses `tauri-action`
  (`npx tauri build`), which has no PlugIns/ support. So shipped (CI/release) DMGs
  never contained a working QuickLook extension on any arch.
- The Tauri crates are pulled from the `feat/cef` branch. `Cargo.lock` does not
  resolve them all to one commit (see "Pinning the tauri rev").

## Decision

Ship **one** `universal-apple-darwin` `.dmg`. Concretely:

- **Universal C++:** set `CMAKE_OSX_ARCHITECTURES="arm64;x86_64"` for universal
  builds so manifold3d compiles a fat static lib. CMake ≥ 3.21 honours this; the
  C++ build runs twice, accepted (see Trade-offs).
- **x86_64 codegen flags moved to config:** `+avx2,+fma` now live in
  `DragonFruit/.cargo/config.toml` as per-target `rustflags` for the three x86_64
  triples (no `aarch64-apple-darwin` entry — those are x86-only features; Apple
  Silicon uses NEON). This replaces the `RUSTFLAGS` env injection that scripts
  used to do; env and config `rustflags` are mutually exclusive in cargo (env
  clobbers config), so the injection had to go for the config to take effect, and
  the config form applies to *every* cargo invocation incl. each arch of the
  universal build.
- **Per-arch sidecars:** `build-thumbnail-providers.mjs`, when
  `DF_BUILD_TARGET_TRIPLE=universal-apple-darwin`, builds the thumbnailer for both
  Apple arches and writes a thin per-arch sidecar for each
  (`target/release/dragonfruit-voxl-thumbnailer-{aarch64,x86_64}-apple-darwin`).
  Verified empirically (local build, 2026-05-24): `tauri build --target
  universal-apple-darwin` compiles each arch separately and resolves `externalBin`
  PER ARCH (`TAURI_ENV_TARGET_TRIPLE=<arch>`, looking for `<base>-<arch>`), then
  lipos the per-arch `.app`s — sidecar included — into the universal `.app` itself.
  An earlier attempt that pre-lipo'd a single `-universal-apple-darwin` sidecar
  failed with `resource path … doesn't exist`; per-arch is the correct shape.
- **Universal `.appex`:** `macos-qlext/build.sh` compiles the Swift extension for
  `arm64-apple-macos12.0` and `x86_64-apple-macos12.0` and `lipo`s them into one
  fat Mach-O. Without this the universal `.app` embeds an arm64-only extension and
  QuickLook silently fails for Intel users.
- **Shared embed module:** the post-build embed + re-sign + DMG-rebuild was
  extracted from `tauri-build.mjs` into `scripts/macos-embed-appex.mjs`, so the
  local wrapper *and* CI run the identical sequence (single source of truth).
- **Canonical entry point:** `npm run tauri:bundle:macos:universal` →
  `scripts/tauri-bundle-macos-universal.mjs` → `tauri-build.mjs --universal` (build
  + embed) → `scripts/verify-universal-bundle.mjs` (assert fat + signed + valid
  DMG). `tauri-bundle-all.mjs`'s default macOS target is now this wrapper.

## Local validation

Built end-to-end on an **Intel (x86_64) Mac on 2026-05-24** via
`npm run tauri:bundle:macos:universal` (which cross-compiles arm64). All
`verify-universal-bundle.mjs` checks pass:

- fat main binary — note `CFBundleExecutable` is `dragonfruit-desktop` (the Cargo
  bin name), NOT the productName `DragonFruit`, so verify reads it from
  `Info.plist` rather than assuming;
- fat `externalBin` sidecar (Tauri lipo'd the two per-arch sidecars);
- fat `.appex` Mach-O; valid `.app` + `.appex` code signatures; valid 31 MB DMG.

The rev pin resolved cleanly. One side effect: it un-dedupes `tauri-utils` into two
`Cargo.lock` entries (one per pinned rev) because rev-sources don't unify the way
the shared `branch` source did — benign and build-validated.

Hardware validation (2026-08-18): Mag has both arm64 and Intel Macs available
(confirmed in project memory). The native-arm64 and Intel runtime smoke tests
have not been formally recorded as completed. This is accepted risk — the
universal build has been shipping since May 2026 and no arch-specific runtime
bugs have been reported. Formal smoke test recording is deferred until the
next release cycle.

## Trade-offs

- **CI wall-clock roughly doubles** on macOS (two arches of Rust + the manifold
  C++ built twice). Offset by: one artifact instead of two, halved runner-minute
  cost overall (one macOS job not two), and no user-facing arch choice.
- **manifold env-var strategy:** we rely on `CMAKE_OSX_ARCHITECTURES` rather than
  patching `manifold-csg-sys`. It is the upstream-supported knob and needs no fork;
  the cost is the doubled C++ compile.
- **tauri rev pin:** branch-tracking is replaced with explicit revs for
  reproducibility, at the cost of having to bump manually for upstream fixes (see
  procedure below).

## Functional impact of the manifold feature

`dragonfruit-mesh-repair` is built with `features = ["manifold"]` (the
manifold-csg backend for robust N-body union of fragmented / interpenetrating
shells — e.g. dense support structures, via a generalized winding-number
classification). The universal build keeps manifold **enabled on both arches**:
the `CMAKE_OSX_ARCHITECTURES` fat build means it is never disabled to make
universal work. For the record, the non-manifold fallback (`#[cfg(feature =
"manifold")]` gates in `repair.rs`) is the orientation + component-culling +
corefinement / parity boundary-extraction path; it is correct but slower and less
robust on highly fragmented meshes. No arch-specific divergence in repair output
is expected beyond ordinary SIMD floating-point differences.

## Signing and notarization scope

In scope and preserved: local code signing. `macos-embed-appex.mjs` (and the
`build.sh` appex sign) use an Apple Development identity if one is present on the
machine, falling back to ad-hoc (`-`) on CI. `codesign --force --deep` signs fat
Mach-O binaries natively, so the universal `.app` and the fat `.appex` sign
without change. `verify-universal-bundle.mjs` asserts signature *integrity*
(`codesign --verify --deep --strict`), not certificate *type* — ad-hoc and Apple
Development both pass; this is deliberate.

Out of scope (follow-up `df-macos-ci-developer-id-notarize`): Developer ID
Application signing + `notarytool` notarization + stapling, which is what
Gatekeeper actually requires for distribution outside the App Store. This ADR does
not regress that — CI never had Developer ID signing.

## CI: embedding the `.appex` (release-pipeline change)

To get a working QuickLook extension into shipped DMGs, CI must embed the fat
`.appex`. Because `tauri-action`'s tag-release mode builds *and* uploads in one
step (no gap to embed between), the workflow now:

1. builds with `tauri-action` **build-only** on every platform (macOS gets the
   universal env via `matrix.cmakeArchs` / `matrix.dfBuildTriple`),
2. on macOS runs `macos-embed-appex.mjs` + `verify-universal-bundle.mjs`,
3. uploads — `actions/upload-artifact` for branch/PR runs, and
   `softprops/action-gh-release` (not tauri-action's built-in release) for tag
   runs, each matrix job upserting the same draft release.

This is a deliberate change to the release upload mechanism (away from
tauri-action's release integration) to make embed-before-upload possible and
uniform across platforms.

## Pinning the tauri rev

`src-tauri/Cargo.toml` pins the tauri crates (direct deps + `[patch.crates-io]`)
to explicit `rev`s instead of `branch = "feat/cef"`, so the build cannot silently
drift when the branch moves.

**The crates are not all on one commit.** `Cargo.lock` resolves `tauri-plugin`
(a build-time codegen crate) to `a94e1b8…` and the other eight tauri crates to
`562bc59…`. Each entry is pinned to the exact rev it was already locked at, to
preserve the validated resolution. Do **not** unify them to a single rev casually:
that re-resolves `tauri-plugin` and must be re-validated.

**Bump procedure:** in a branch, update the rev(s) → run the cross-arch pre-flight
(`cargo build --release --target {aarch64,x86_64}-apple-darwin` from `src-tauri/`
with `CMAKE_OSX_ARCHITECTURES="arm64;x86_64"`) → `npm run tauri:bundle:macos:universal`
→ confirm CI `verify-universal-bundle.mjs` (lipo + codesign + hdiutil) passes →
update this ADR with the new rev(s) + verification date.

## Audit (downstream consumers of the old artifact names)

Grepped the repo + `Dragonfruit-kb` for `dragonfruit-macos-arm64`,
`dragonfruit-macos-x64`, `aarch64-apple-darwin`, `x86_64-apple-darwin`, and for any
Sparkle / appcast / auto-updater config. Findings:

- The only consumers of the old artifact names were the two `artifactName:` lines
  in `tauri-bundle.yml` itself (replaced by `dragonfruit-macos-universal`).
- **No Sparkle / appcast / auto-update mechanism exists.** The conditional
  follow-up `df-appcast-universal-rename` is therefore **not needed** — there is no
  external consumer of the macOS asset names to migrate.

## Follow-ups

- `df-macos-ci-developer-id-notarize` — Developer ID signing + notarization in CI
  (required for Gatekeeper-clean distribution).
- `df-appcast-universal-rename` — **not filed** (audit found no appcast/updater).

## Consequences

- One universal `.dmg`; users no longer choose an arch.
- CI/release DMGs now actually carry a working (fat, signed) QuickLook extension —
  previously they never did.
- Reproducible tauri builds via rev pinning, with a documented bump path.
