#!/usr/bin/env node
/**
 * Writes a redirect page at every documentation URL the site used to serve from
 * its root.
 *
 * The documentation moved from `/getting-started/installation/` to
 * `/docs/getting-started/installation/` when the landing page took over the
 * root. Those old URLs are in Discord threads, issue comments and search
 * results, so they keep working: each one gets a page that forwards to the new
 * location and points a canonical link at it, which is also what tells a search
 * engine to move the page rather than treat the two as duplicates.
 *
 * Usage: node scripts/generate-doc-redirects.mjs <built-site-dir>
 *
 * Run after both halves of the site are built into that directory - it only
 * adds files, never overwrites one, so it cannot clobber the landing page or a
 * documentation page.
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const docsDir = path.join(projectRoot, 'docs');
const siteDir = process.argv[2];

if (!siteDir) {
  console.error('usage: node scripts/generate-doc-redirects.mjs <built-site-dir>');
  process.exit(1);
}

const outputRoot = path.resolve(projectRoot, siteDir);
const origin = 'https://dragonfruit-slicer.com';

/** Every published page, as a path relative to `docs/`, POSIX-separated. */
async function collectPages(directory) {
  const pages = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'internal') continue;
      pages.push(...(await collectPages(full)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      pages.push(path.relative(docsDir, full).split(path.sep).join('/'));
    }
  }

  return pages;
}

/**
 * MkDocs' `use_directory_urls`: `a/b.md` is served at `/a/b/`, and an index page
 * at its directory's own URL.
 */
function urlPathFor(page) {
  const slug = page.replace(/\.md$/, '');
  return slug === 'index' ? '/' : `/${slug.replace(/\/index$/, '')}/`;
}

function redirectPage(from, to) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Moved to ${to}</title>
    <link rel="canonical" href="${origin}${to}" />
    <meta http-equiv="refresh" content="0; url=${to}" />
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <p>This page moved to <a href="${to}">${origin}${to}</a>.</p>
  </body>
</html>
`;
}

let written = 0;
let skipped = 0;

for (const page of await collectPages(docsDir)) {
  const from = urlPathFor(page);
  if (from === '/') continue;

  const target = path.join(outputRoot, from, 'index.html');

  try {
    await writeFile(target, redirectPage(from, `/docs${from}`), { flag: 'wx' });
    written += 1;
  } catch (error) {
    if (error.code === 'EEXIST') {
      skipped += 1;
      continue;
    }
    if (error.code === 'ENOENT') {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, redirectPage(from, `/docs${from}`), { flag: 'wx' });
      written += 1;
      continue;
    }
    throw error;
  }
}

console.log(`doc redirects: ${written} written, ${skipped} already present in ${path.relative(projectRoot, outputRoot)}`);
