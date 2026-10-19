# The site and the landing page

`dragonfruit-slicer.com` is two builds published as one GitHub Pages artifact: an Astro
landing page at the root, and this MkDocs documentation under `/docs/`. Both live in this
repository — the Markdown you are reading is the Markdown a contributor edits, and the
landing page is a project inside it — so one pull request can change the docs, the landing
page, or the workflow that publishes them.

This page is for anyone changing either half. It says what each build owns, what the
constraints are, and what to run before pushing.

## What is where

| Path | What it is |
|---|---|
| `website/` | The landing page: an Astro project with the Open Resin Alliance design language. Builds to `website/dist/`. |
| `website/src/styles/ora.css` | The design language — tokens, layout shell, buttons, surfaces. |
| `website/src/assets/wordmark.svg` | The wordmark, inlined by `Wordmark.astro` so the part of it drawn in white can follow the theme. |
| `website/public/brand/` | The emblem (`simple_icon.svg`) and the social card. MkDocs serves its own copy of the emblem from `docs/assets/branding/`, so a change to it belongs in both. |
| `website/public/media/` | The four screenshots in the grid, re-encoded from the marketing renders. |
| `website/src/og/` | The social cards: a build hook, the renderer, the fonts and the emblem PNG. |
| `website/src/lib/og.ts` | Where a card lives, and the digest its URL carries. |
| `docs/` | The documentation source, unchanged: one Markdown file per page, `docs/internal/` excluded from the build. |
| `mkdocs.yml` | The documentation build: nav, theme, Markdown extensions, `site_url`. |
| `scripts/generate-doc-redirects.mjs` | Writes the redirect pages that keep the old root-level document URLs working. |
| `.github/workflows/docs-pages.yml` | Builds both halves, composes them, injects the updater feeds, deploys. |

## Building it locally

The landing page:

```bash
cd website
npm install
npm run dev        # http://localhost:4321
npm run check      # astro check: types and template diagnostics, must be 0 errors
npm run build      # website/dist/
```

The documentation needs Python and the pinned requirements:

```bash
pip install -r docs/requirements.txt
mkdocs serve       # http://localhost:8000
mkdocs build --strict --site-dir site/docs
```

`--strict` is the documentation's gate, as it was before: a broken internal link, a nav
entry with no page, or a missing reference fails the build. The landing page has no test
suite; `npm run check` plus a real build is the gate, and a layout change wants the page
opened in a browser at 1600 / 1280 / 1024 / 820 / 480 / 360 px with no horizontal overflow.

To reproduce what CI publishes:

```bash
node scripts/materialize-doc-placeholder-assets.mjs   # screenshots that are not committed yet
mkdocs build --strict --site-dir site/docs
(cd website && npm run build)
cp -R website/dist/. site/
node scripts/generate-doc-redirects.mjs site
```

`site/` is the artifact: `site/index.html` is the landing page, `site/docs/` is the manual,
and every other directory is a redirect to its `/docs/` equivalent.

`npm run serve:site` (`scripts/serve-site.mjs`) is those five steps in one command,
followed by a static server over the composed `site/` at http://localhost:8123 —
`--port` moves it. It is the way to check anything that only exists once the two halves
sit together: the landing page's `/docs/` links, a redirect from an old URL, or a
documentation page whose relative links assume the `/docs/` prefix. Neither `astro dev`
(the landing page alone, at :4321) nor `mkdocs serve` (the manual alone, at :8000) can
serve the other half, so a `/docs/` link is a 404 under both.

The launcher rebuilds both halves every time and deletes `site/` first, so it takes as
long as the two builds do; it is not a watcher. It finds mkdocs in `.venv` (Windows
`.venv/Scripts/mkdocs.exe` or `.venv/bin/mkdocs`) and falls back to `mkdocs` on `PATH`,
and it runs `npm ci` in `website/` when that directory has no `node_modules` yet.

### The social cards need the plugin's font cache

`mkdocs build` runs Material's `social` plugin, which renders one Open Graph card per page.
With a cold cache it downloads its fonts into `.cache/fonts`; if that directory is missing
or half-written the plugin recurses and the build dies with a recursion error. `.cache/` is
gitignored — never commit it, and delete it if a build starts failing this way. The venv
used for a local build needs the `[imaging]` extra from `docs/requirements.txt`, which is
what supplies Pillow and CairoSVG.

## The two halves, and the one artifact

GitHub Pages serves one site per repository and routes by path, not by host, so a second
hostname (`docs.dragonfruit-slicer.com`) cannot be pointed at only part of it. The split is
therefore by path:

```
https://dragonfruit-slicer.com/                 landing page          (Astro)
https://dragonfruit-slicer.com/docs/            documentation index   (MkDocs)
https://dragonfruit-slicer.com/docs/<page>/     one documentation page
https://dragonfruit-slicer.com/latest.json      updater feed          (injected by CI)
```

Two consequences worth knowing before changing anything:

- **Every document URL carries `/docs/`.** `mkdocs.yml`'s `site_url` ends in `/docs/` for
  exactly this reason: it is what canonical links, the search index and the social cards are
  built from. A page linked from the landing page is written through `docs()` in
  `website/src/data/site.ts`, which is the single place the prefix appears.
- **The old root-level URLs still resolve.** `scripts/generate-doc-redirects.mjs` writes a
  forwarding page at each one (123 of them), pointing at `/docs/<page>/` with a canonical
  link. It only ever adds files, so it cannot overwrite the landing page. Once the old URLs
  are gone from the wild the script and those pages can be deleted.

### The updater feeds are not part of either build

`latest.json` and `latest-dev.json` — the feeds an installed app polls — are copied out of
release assets into the artifact root by the deploy workflow, which validates them first
(HTTPS, this repository's releases path, a signature per platform) and keeps the copy
already on Pages if no release carries one. They are deliberately not built by MkDocs or
Astro; see [Release Process](releases.md) for the release side of that loop.

## The design language

`website/src/styles/ora.css` is openresin.org's own stylesheet — the
[`global.css` in `Open-Resin-Alliance/website`](https://github.com/Open-Resin-Alliance/website/blob/main/src/styles/global.css) —
copied: the same type scale, `.shell` layout, glass surfaces and buttons. The header, footer, theme toggle and back-to-top control are ports of
that site's components with DragonFruit's links in them, and the theme preference is stored
under the same `ora-theme` key so the two sites agree about a visitor's choice.

The two repositories share no package, and a package for two files would be more machinery
than the problem deserves, so the copy is kept in step by hand. When you change a token or a
primitive here, check the other repository; when you change it there, check here. What is
*not* copied is the part of that stylesheet which is about that site: its rail navigation
and its `.prose` block.

## Open Graph cards

Every page gets one, generated at build time by `website/src/og/`. A build hook
(`integration.mjs`) walks the pages that were just written, reads the `card:title`,
`card:summary` and `card:meta` metas that `Base.astro` puts in their head, and renders
`/og/<page>.png` with satori and resvg (`render.mjs`). Nothing registers a page: a page has
a card the moment it has a URL. The URL in the markup comes from `ogImagePath()` plus a
digest of the card's own words (`cardFingerprint()`), so a crawler fetches a new image when
the text changes while the URL a share already points at keeps resolving.

- The home page's card carries the project tagline (`SITE.motto`) rather than its title. That
  is the `cardSummary` prop in `Base.astro`; a page can override the summary and add a corner
  label (`cardMeta`).
- The background is computed in floating point and dithered by hand (`diffuseBase`), because
  the wash spans about sixteen levels across the card and an 8-bit rasteriser would show every
  step of it. The rule, the type and the emblem are drawn over that by satori.
- `src/og/fonts/` holds static TTFs of the two families the site uses: satori reads neither
  woff2 nor a variable font's `fvar` table. `website/src/og/brand/mark.png` is the emblem rasterised
  from `public/brand/simple_icon.svg`; regenerate it at 256 px with `sharp` if the emblem
  changes.
- The documentation half is not part of this: MkDocs renders its own cards with Material's
  `social` plugin, with the theme's `cards_layout`.

## The screenshots

`website/public/media/*.webp` are re-encoded from the marketing renders supplied for the
0.2.0 release. The grid is read two by two; the captions are not in it — a tile is the image
and nothing else, and its caption is shown under the enlarged image when it is opened:

| Image | Source | What it is there to show |
|---|---|---|
| `ui.webp` | `general_view.png` | the workspace itself — a clean window with nothing in the way |
| `support-studio.webp` | `supports.png` | Support Studio with island scanning on |
| `multi-plate.webp` | `multi-plate.png` | four plates in one scene |
| `3daa.webp` | `3daa.png` | 3D anti-aliasing (3DAA in the code) — grey levels in the layer mask, which is what removes stair-stepping |

The fifth render, `high-speed-slicing.png`, is not on the page: it is a modal over a darkened
window, and the 1.01 s it reports is already a sentence in the copy above the grid. The
`high-speed-slicing` WebP is gone with it — re-encode and re-add both if that changes.

The sources are 2560×1392 PNGs of about a megabyte each; the WebPs are 1600 px wide at
quality 80, which is 169 KB for all four. Re-encode the same way when they change, and keep
the order and the captions in `ScreenshotGrid.astro` in step with the images: every
caption describes what is on screen, so a replaced image means a rewritten caption. The
captions are the dialog's text and nothing else — a caption that reads well under a tile at
half page width is not the same sentence as one under the full-size image, and the grid does
not show them at all.

## Pages, and what the network is for

The landing project has two pages and one grid:

| Page | Source | Data |
|---|---|---|
| `/` | `website/src/pages/index.astro` | none at build time; `website/src/lib/release-feed.ts` narrows the download button to the visitor's platform in the browser. |
| `/builds/` | `website/src/pages/builds.astro` | two lists, both read **at build time**: the developer build from the updater's own `latest-dev.json` at the site root, and the branch previews from the GitHub releases API. Each section degrades on its own. |
| the screenshot grid, below *What it does* | `website/src/components/ScreenshotGrid.astro` | none — four images, one per view, laid out two by two with none of them paged. A click opens one full size in a `<dialog>`, with its caption and arrows under it: the arrows (and Left/Right) step to the next image without closing, and wrap at either end. That lightbox is the only script, and without JavaScript the grid is still a grid. |

The split is deliberate and worth keeping:

- **The developer build comes from the feed, not from GitHub.** `latest-dev.json` is what an
  install on the dev channel updates to, and it is the only source that answers "what is the
  developer build". Asking the releases API for the newest prerelease answers a different
  question and gets it wrong — it has named a build the dev channel had already moved past.
  The feed's `platforms` are Rust target triples (`windows-x86_64`, `darwin-universal`) and
  its macOS artifact is the updater's `DragonFruit.app.tar.gz`, so the row shows those files
  with their file names as tooltips and links to the build's release page for everything else.
- **Anything that has to be right without JavaScript is built, not fetched.** The previews
  list is rendered at build time and degrades to a note plus a link to GitHub if the API was
  unreachable — an empty list would read as "there are no builds", which is a different
  claim. `releases.ts` takes an optional token for that build request (the deploy workflow
  passes `GITHUB_TOKEN`); the browser never sees it.
- **The download button is an enhancement.** The built markup already carries a working link
  to the latest release and a line saying where the number came from, and every failure path —
  offline, rate limited, API down — leaves the built page exactly as it is. If you add a
  number that comes from the network, keep it that way.
