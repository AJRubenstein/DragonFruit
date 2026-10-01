# Release process

How DragonFruit versions, branches, and ships builds. This is the
source-of-truth for anyone cutting a release or touching
[`.github/workflows/release.yml`](https://github.com/Open-Resin-Alliance/DragonFruit/blob/main/.github/workflows/release.yml)
or [`src-tauri/src/updater_channel.rs`](https://github.com/Open-Resin-Alliance/DragonFruit/blob/main/src-tauri/src/updater_channel.rs).

## The model

We will be using semantic versioning, i.e. vMAJOR.MINOR.PATCH-prerelease.

Two branches, two channels, classic odd/even MINOR convention:

- **`dev`** — the development line. **Odd MINOR** (`0.1.x`, `0.3.x`, `0.5.x`, ...).
  Features land here continuously. Every version bump on `dev` is a real,
  shippable devel release — there's no RC ceremony for it. Bump the version,
  push, done.
- **`main`** — the stable line. **Even MINOR** (`0.2.x`, `0.4.x`, ...). Only
  reachable by promoting a `dev` commit when the odd line is feature-complete.
  Once on `main`, only bugfixes land — no new features.

There is currently no dedicated `release-X.Y` maintenance branch: `main`
*is* the stable maintenance branch. We will revisit this only if DragonFruit
ever needs to support two stable lines concurrently; until then, a separate
branch per stable release would be pure ceremony.

## Versioning: real SemVer, prerelease identifiers included

The channel is **not** a tag prefix anymore. It's encoded directly in the
version string, following [SemVer 2.0](https://semver.org)'s
`MAJOR.MINOR.PATCH-prerelease` grammar — because `tauri-plugin-updater`
parses the updater feed's `version` field as a real `semver::Version` and
compares it with plain `>`, which already implements full SemVer precedence
(including "a prerelease has lower precedence than the same version without
one"). Nothing needs to be taught to compare `1.3.0-rc.1 < 1.3.0` — the
`semver` crate already does that. What has to be correct is what you put in
the version field.

Set the version in **`package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`** together — all three must agree, since Tauri reads
its own version from the bundle config and that's what ends up baked into the
running binary as `current_version`.

Rules:

- Use dot-separated numeric identifiers for RC/beta counters:
  `-rc.1`, `-rc.2`, `-rc.10`, not `-rc1`/`-rc2`/`-rc10`. SemVer compares
  numeric fields numerically, but only if they're their own dot-separated
  field — `"rc1"` is a single alphanumeric identifier and sorts as a string
  (`rc1 < rc10 < rc2`), which silently breaks ordering once you pass RC 9.
- `alpha < beta < rc` is not something SemVer understands semantically — it's
  ASCII lexical order on whatever word you chose. It works here because
  English happens to alphabetize that way. Don't rename these words casually.

## What "prerelease" means on GitHub

GitHub's `prerelease` flag has exactly one practical effect: a non-prerelease,
non-draft release is eligible to be the repo's "Latest release" (and what
`GET /releases/latest` returns). It has no concept of channels. So the flag
is assigned by **"is this the stable/production channel"**, not by "is this a
finished version number".  The release number is stored in one JSON per channel
in the GitHub pages for the project, under the URLs
https://open-resin-alliance.github.io/DragonFruit/latest{,-dev}.json, and these
will be the rules that the release workflows are following:

| Version example | Branch | `is_prerelease` | Updater feed |
|---|---|---|---|
| `0.1.10` | `dev` | `true` | `latest-dev.json` |
| `0.1.11-rc.1` | `dev` | `true` | *none* |
| `0.2.0-rc.1` | `main` | `true` | *none* — downloadable, not auto-installed |
| `0.2.0-rc.2` | `main` | `true` | *none* |
| `0.2.0` | `main` | `false` | `latest.json` |
| `0.2.1` | `main` | `false` | `latest.json` |
| `0.3.0` | `dev` | `true` | `latest-dev.json` |

A dev-line build is *never* eligible to be "Latest release" and never touches
the stable updater feed, no matter how "final" its own version number is.
Only a final (no prerelease identifier) version pushed on `main` is stable.

An RC on `main` still builds and publishes installers — testers can grab it
from the Releases page — it's just never wired into `latest.json`, so nobody
on the stable auto-update channel can land on it by accident.

This logic lives entirely in the `detect-version-bump` job of `release.yml`;
nothing else needs to change if you're just cutting releases.

## Tags

Always `v{version}` — `v0.1.10`, `v0.2.0-rc.1`, `v0.2.0`. No more `dev_`
prefix; the branch/channel is already implied by the version's MINOR parity
and prerelease identifier, so the tag doesn't need to encode it separately.

## How to cut a release

### Regular dev release

```
# on dev, MINOR version already odd (e.g. currently 0.1.9)
# Thanks to scripts/sync-app-version.mjs, this bumps the version in:
#  package-lock.json, package.json, src-tauri/Cargo.lock,
#  src-tauri/Cargo.toml and src-tauri/tauri.conf.json
npm version 0.1.10 --no-git-tag-version
# Generate the bitmap for the NSIS installer.
./scripts/gen_nsis_images.py

git commit -a -m "chore: release 0.1.10"
git push origin dev
```

That's it — `release.yml` tags `v0.1.10`, builds, publishes a GitHub
prerelease, and points `latest-dev.json` at it. Repeat for `0.1.11`,
`0.1.12`, etc. No RC step required for dev releases.

### Contributors

`npm version` also runs `scripts/sync-contributors.mjs` (via the `postversion`
hook), so `src/components/settings/contributors.json` is refreshed in the same
release commit as the version bump — no separate step, no workflow side effect.
This is intentionally a release-procedure action, not a GH workflow step or a
dev-start hook.

The sync merges two sources: the GitHub contributors API (which only reflects
the default branch, `main`) plus a walk of the `dev` branch's commits — so a
dev-line contributor is added at the next version bump after their first commit
lands on `dev`, not held until their work is promoted to `main`. The one thing
the API doesn't let us avoid is its own staleness (contributor data can lag by
a few hours); later bumps re-run the sync, so stragglers are picked up on the
next release anyway.

New contributors are appended with the GitHub profile display name as their
default `name` (falling back to their username when the profile has no name
set), `role: "Contributor"` and `tone: "secondary"`. If you want a different
display name, role, or tone — a founder, a maintainer — edit the entry right
after the bump: the sync only ever appends, so your edit survives future runs.

### Promoting dev → main (odd → even transition)

This is the one point where a branch cut is doing real work — `dev` needs to
keep absorbing new (0.3.x) work the moment this happens, while `main`
stabilizes what's already there.

```
git checkout main
git merge --ff-only v0.1.11        # or whatever the last dev tag was
# bump version → 0.2.0-rc.1
npm version 0.2.0-rc.1 --no-git-tag-version
git commit -a -m "chore: release 0.2.0-rc.1"
git push origin main
```

Fix anything that comes up with normal commits on `main` (cherry-picked from
`dev` or written directly against `main` — either is fine at this scale).
When ready to cut another candidate, bump to `0.2.0-rc.2` and push again.
When satisfied:

```
# bump version → 0.2.0 (drop the -rc suffix)
npm version 0.2.0 --no-git-tag-version
git commit -a -m "chore: release 0.2.0"
git push origin main
```

`release.yml` will look for a prior GitHub release tagged `v0.2.0-rc.*` and
carry its notes forward automatically if you don't override `release_body`.

### Stable patch release

Same as above, entirely on `main`: bump to `0.2.1`, commit, push. No branch
needed — `main` already is the maintenance line for the current stable
series.

### Reopening dev for the next cycle

There is nothing to do here until you're actually ready to ship the first
release of the new odd line. `dev`'s version field can sit at whatever it was
before the promotion (e.g. still reading `0.1.11`) indefinitely — nothing in
the pipeline reacts to anything except a version bump being pushed. The
"0.3.x" line has no existence anywhere in the repo — no tag, no branch, no
marker — until the commit that bumps the version to `0.3.0` (or whatever the
first real 0.3.x version is). That commit is both the only record of the
reopening and the release trigger itself.

If you bump the version as its own empty commit right after the promotion,
that alone will cut a `0.3.0` devel release with no new content — harmless,
but worth knowing. Folding the bump into the first real feature commit of the
new cycle avoids the empty release, at the cost of a less clean "here's where
0.3.x began" marker in history.

## Issue tracking across the "train" (`label-dev-fixes` in `release.yml`)

GitHub only auto-closes an issue for a commit's closing keyword (`Closes #X`,
`Fixes #X`, `Resolves #X`, ...) when that commit lands on the repo's
**default branch**. `dev` isn't the default branch (`main` is), so those
commits would otherwise never mark anything as done — the issue would sit
open even after the fix has shipped in a dev build.

To compensate, every time a **final** version (no `-rc`/`-beta`/etc. suffix)
is pushed on `dev`, the `label-dev-fixes` job in `release.yml`:

1. Finds the previous `v*` tag reachable in `dev`'s history (i.e. the last
   dev release, of any kind).
2. Scans every commit message in that range for GitHub's closing-keyword
   grammar (`close(s/d)`, `fix(es/ed)`, `resolve(s/d)` followed by one or
   more `#NNN`, comma/`and`-separated).
3. Applies the `fixed in dev` label to each referenced issue — it does
   **not** close it, since the fix hasn't reached the stable line yet — and
   posts a comment pointing at the dev build (with the usual "no guarantees"
   caveat) and naming the tentative next stable version (current dev MINOR
   + 1, patch `.0`; a guess, not a promise, since promotion timing isn't
   fixed). If the issue is already labeled, the job skips it — no repeat
   comments across multiple final dev releases.

This mirrors the Mozilla-style "train" model: an issue accumulates the
`fixed in dev` label as soon as its fix rides a dev release, and stays open
(for tracking "is this in `main` yet") until whoever promotes `dev` → `main`
closes it as part of that release, or closes it by hand. RC builds on `dev`
or `main` don't trigger this job — only a final version bump does, so labels
land once per train stop rather than once per commit.

## Branch preview builds (`build-preview.yml`)

Separate from all of the above: `build-preview.yml` builds an arbitrary branch
on demand (`workflow_dispatch`, or a `/preview` comment on a pull request) and
publishes a rolling `preview_{branch}` prerelease, so a reviewer can download
and try an exact commit.

It is **not** a scheduled build of `dev`, doesn't participate in the
versioning/channel model above, and isn't wired to the auto-updater at all.
These builds used to be called *nightly*, which was misleading on both counts:
nothing about them is nightly, and nothing is on a schedule. Treat them as a
branch or pull-request preview mechanism.

### External (fork) pull requests

A preview build compiles the branch with the release signing secrets in scope,
so external pull requests are never built automatically: the `preview-build`
label does not dispatch for them, and `/preview` replies with a pointer to the
command below.

After reading the diff, a maintainer runs `/create-preview-external`. That
resolves the pull request's head SHA, points `preview/pr-<number>` at it, and
builds that branch. It imports **one commit** — later pushes need the command
again, so every external build is one a maintainer chose to run. Preview
branches whose pull request has closed are swept away the next time any
preview is activated.

## Windows Microsoft C++ prerequisite

DragonFruit's Windows installers do **not** contain Microsoft CRT DLLs or a
Microsoft redistributable executable. #683 reproduced an import-time access
violation with an older system runtime, so installation requires a sufficiently
recent registered x64 runtime and native `System32/msvcp140.dll` file version.

### Licensing boundary

The runtime is obtained directly from Microsoft on the user's machine, under
Microsoft's own terms, rather than redistributed or relicensed as part of
DragonFruit. This replaces the app-local bundling design. The
[FSF's Windows-runtime guidance](https://www.gnu.org/licenses/gpl-faq.html#WindowsRuntimeAndGPL)
permits linking but warns against shipping the proprietary DLLs with a GPL
program. Microsoft's [redistribution rules](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files)
also make redistribution conditional on the applicable Visual Studio license.
Adding a notice alone would not establish those rights.

This deployment boundary does not change DragonFruit's AGPL license or assert
that Microsoft's binaries are AGPL-covered. Build-tool use still remains subject
to the applicable Microsoft terms; a hosted runner's presence is not proof of a
release owner's licensing entitlement. Any future plan to redistribute the CRT
needs a separate qualified licensing review.

### Installation behavior

- **NSIS:** `src-tauri/nsis/runtime-prerequisite.nsh`, included by the existing
  thumbnail hooks, checks the registered native x64 runtime and compares all four
  numeric DLL-version components. An adequate installation is left alone.
- If missing or too old, an early custom page links Microsoft's terms and asks
  for explicit consent before Tauri's reinstall/uninstall pages. The separately
  pinned **InetC** plugin downloads the official installer over HTTPS. Builtin
  NSISdl is not used because it does not support HTTPS.
- Our embedded PowerShell verifier checks the pinned SHA-256, trusted Microsoft
  Authenticode signer, and exact file version before anything downloaded runs.
  The official Microsoft installer runs with **`/q /norestart`**; its bootstrapper
  handles elevation. DragonFruit setup rechecks the installed runtime afterward.
- Cancellation, download/verification/UAC failure, or an inadequate result stops
  installation. Exit `3010` requires a user-initiated restart and rerunning setup;
  it does not automatically reboot or launch DragonFruit. Fully silent `/S` and
  passive `/P` runs fail with instructions if a prerequisite installation would
  require consent. Administrators must provision it first for unattended installs.
- **Standalone MSI:** `src-tauri/wix/runtime-prerequisite.wxs` uses the native
  registered-install flag and MSI's numeric file-version search. A Type 19 error
  after MSI property searches blocks both interactive and silent installation with a
  Microsoft download link. It never starts a nested installer. Uninstall is exempt.

The updater uses these same installers. A machine with an inadequate runtime
must satisfy the prerequisite before a passive update can finish. Do not assume
the runtime can be installed offline or without administrator approval. Microsoft
services the centrally installed runtime; our minimum-version pin is not a second
runtime updater running inside the application.

### Pin, tooling, and plugin notice

`scripts/windows-runtime.json` contains the required runtime version, immutable
Microsoft x64 installer URL, and SHA-256. Ordinary builds never resolve a floating
Microsoft URL. `scripts/prepare-windows-runtime.ps1` writes generated
`runtime-version.nsh` and `runtime-version.wxi` under `src-tauri/windows-resources/`.
It does not download or extract Microsoft's software. On Windows it also rejects
a pin older than the selected MSVC toolset's redistributable version.

Preparation downloads only the free HTTPS plugin when its exact cached binary is
unavailable. `scripts/windows-runtime-download-plugin.json` pins its release,
archive, binary, and zlib license hashes. `scripts/inetc-license.txt` preserves the
upstream notice; it is shipped as `licenses/InetC.txt` and inside the NSIS helper
payload. Other platforms do not package the plugin or run prerequisite setup.

The scripts support Windows PowerShell 5.1 and PowerShell 7:

```powershell
# Generate installer metadata and stage the open-source download plugin.
./scripts/prepare-windows-runtime.ps1
# Download and verify the exact Microsoft pin; do not install it or change the pin.
./scripts/update-windows-runtime.ps1 -Check
# Same verifier embedded in NSIS, for an already downloaded installer.
./scripts/verify-windows-runtime.ps1 -InstallerPath C:\Temp\VC_redist.x64.exe -ManifestPath scripts/windows-runtime.json
```

Preparation accepts `-ManifestPath` and `-OutputDirectory` for isolated checks.
`scripts/windows-runtime-common.ps1` contains the shared metadata and installer
validation used by both build tooling and the embedded verifier. Generated files
are ignored by git. The existing native-resource build step prepares them before
Tauri resource resolution, and the Windows pre-bundle hook handles standalone
bundling. The upstream profile and target-architecture cache inputs are unchanged;
updating installer prerequisite metadata does not invalidate compiled Rust dependencies.

### Verification and update proposals

Release jobs use `scripts/verify-windows-bundles.ps1` to inspect the actual NSIS
and MSI payloads before upload; preview jobs use `-Formats nsis`. Verification
rejects bundled Microsoft CRT/redistributable payloads, requires the unmodified
InetC notice, checks NSIS's embedded verifier and pin, and checks MSI's numeric
minimum-version and blocking-action tables. This is extraction, not installation.

Before release, exercise missing/old/current runtimes on Windows, including
declined consent, failed download or validation, declined UAC, and reboot-required
results. Test fresh installation and update, then import `top-single.stl`.
Metadata generation and installer compilation do not replace those checks.

`.github/workflows/update-windows-runtime.yml` runs weekly or manually, checks out
`dev`, and calls `scripts/update-windows-runtime.ps1`. It follows Microsoft's
official latest-x64 link, validates the resulting immutable URL, signature, hash,
and version, then proposes only a newer pin from `automation/windows-vc-runtime`
to `dev`. Pinned validation and metadata generation run before PR creation.
Downloaded installers are temporary, never executed by this workflow, and never
uploaded as artifacts. There is no auto-merge, version bump, or release.

The workflow must reach default `main` for GitHub cron to run, and Actions must
be permitted to create PRs. No new PAT is required. `GITHUB_TOKEN`-created PRs do
not trigger normal PR checks: review the linked updater run and close/reopen the
PR as a maintainer to trigger required checks. **Validate Windows runtime** can
also be dispatched on the bot branch; it covers PowerShell 5.1 and 7 with
read-only permissions. This dedicated validation does not replace other required
PR checks.

## Updater implementation notes

- `src-tauri/tauri.conf.json`'s `plugins.updater.endpoints` points at the
  stable feed by default; `src-tauri/src/updater_channel.rs` overrides the
  endpoint at runtime based on the user's saved channel preference
  (`STABLE_ENDPOINT` / `DEV_ENDPOINT`), independent of the static config.
- **Linux never runs the check.** The release job builds only a `.flatpak`
  (`build_kind: flatpak`, `--no-bundle`), so `latest.json` / `latest-dev.json`
  have no `linux-x86_64` key — and the updater could not install over a running
  Flatpak anyway, since `/app` is read-only inside the sandbox. `check_updates`
  returns `None` early on Linux and the Settings → Updates tab shows a
  "Managed by Flatpak" card with the `flatpak update` command instead of the
  channel picker (`updatesAreExternal()` in
  `src/features/updater/updateBridge.ts`). Adding a Linux entry to the feed
  would only make sense alongside an AppImage build.
- The plugin's default version comparator is a plain `release.version >
  current_version` using `semver::Version::Ord` — no custom comparator is
  registered. This means there's no downgrade support: a user who updates to
  a higher-MINOR prerelease and then switches their channel preference back
  to stable will not be offered the (numerically lower) stable version until
  stable catches back up. This is expected given the current setup, not a
  bug — if channel-switch-triggered downgrades are ever wanted, that
  requires registering a custom `version_comparator` in
  `updater_channel.rs`.
