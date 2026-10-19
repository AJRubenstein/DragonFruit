#!/usr/bin/env node
/**
 * Builds both halves of dragonfruit-slicer.com into `site/` and serves it, so the
 * landing page's `/docs/` links and the old root-level document URLs resolve the way
 * they do in production. See docs/dev/site-and-landing.md.
 *
 * Usage: npm run serve:site [-- --port 8123]
 *
 * It runs the same five steps CI runs, in the same order - placeholder assets, the docs
 * build, the landing build, the compose, the redirects - and then serves the artifact with
 * a static server that behaves like GitHub Pages: a directory URL without its trailing
 * slash redirects to the one with it. Rebuild is what makes it worth re-running; it is not
 * a watcher.
 */

import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, cp, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const siteDir = path.join(projectRoot, 'site');
const websiteDir = path.join(projectRoot, 'website');

const portArg = process.argv.indexOf('--port');
const port = portArg === -1 ? 8123 : Number(process.argv[portArg + 1]);

function run(command, args, { missingHint, ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    // npm on Windows is a .cmd shim, which CreateProcess cannot start on its own.
    shell: process.platform === 'win32' && command === 'npm',
    ...options,
  });

  if (result.error) {
    console.error(`\n${command} could not be started: ${result.error.message}`);
    if (result.error.code === 'ENOENT' && missingHint) console.error(missingHint);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n${command} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

/** The mkdocs the repo's `.venv` holds, if there is one - it is not on PATH unactivated. */
async function resolveMkdocs() {
  const candidates = [
    path.join(projectRoot, '.venv', 'Scripts', 'mkdocs.exe'),
    path.join(projectRoot, '.venv', 'bin', 'mkdocs'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next one
    }
  }

  console.warn('warning: no .venv mkdocs found - falling back to `mkdocs` on PATH');
  return 'mkdocs';
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

// A bare `pip install mkdocs` (or Homebrew's mkdocs) is not enough: mkdocs.yml needs the
// Material theme and its `social` plugin, which is what docs/requirements.txt pins.
const MKDOCS_MISSING_HINT = `
mkdocs is not installed. Install it with the pinned requirements (Material theme and the
social-card plugin included); serve:site picks up a .venv in the repo root on its own.

  Windows:
    py -m venv .venv
    .venv\\Scripts\\pip install -r docs/requirements.txt

  macOS (Homebrew's Python refuses a global pip install, so use a venv; the social
  cards also need Cairo):
    brew install cairo
    python3 -m venv .venv
    .venv/bin/pip install -r docs/requirements.txt

  Linux:
    python3 -m venv .venv
    .venv/bin/pip install -r docs/requirements.txt

A plain \`pip install mkdocs\` or \`brew install mkdocs\` installs mkdocs without the
Material theme, and the build then fails with "Unrecognised theme name: 'material'".
See docs/dev/site-and-landing.md.`;

/**
 * The social cards load Homebrew's libcairo through cffi, and dyld does not look in
 * Homebrew's lib directories on its own. Exporting DYLD_FALLBACK_LIBRARY_PATH in the
 * shell does not help: `npm run` goes through /bin/sh, and SIP strips every DYLD_*
 * variable from a protected binary. Node starts mkdocs directly, so set it here.
 */
function mkdocsEnv() {
  if (process.platform !== 'darwin') return process.env;
  const fallback = [process.env.DYLD_FALLBACK_LIBRARY_PATH, '/opt/homebrew/lib', '/usr/local/lib', '/usr/lib']
    .filter(Boolean)
    .join(':');
  return { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: fallback };
}

function step(label) {
  console.log(`\n==> ${label}`);
}

const mkdocs = await resolveMkdocs();

// CI starts from a clean checkout, so anything a previous run left behind goes first: a
// stale hashed asset in `site/` is a file Pages would never serve, and it has to happen
// before the docs build writes into `site/docs`.
await rm(siteDir, { recursive: true, force: true });

step('Building the documentation');
// The docs link screenshots that are not committed yet, and `--strict` fails on a
// missing target, so the placeholders come first. See docs/dev/site-and-landing.md.
run(process.execPath, [path.join(projectRoot, 'scripts', 'materialize-doc-placeholder-assets.mjs')]);
run(mkdocs, ['build', '--strict', '--site-dir', path.join('site', 'docs')], {
  env: mkdocsEnv(),
  missingHint: MKDOCS_MISSING_HINT,
});

step('Building the landing page');
if (!(await exists(path.join(websiteDir, 'node_modules')))) {
  run('npm', ['ci'], { cwd: websiteDir });
}
run('npm', ['run', 'build'], { cwd: websiteDir });

step('Composing the artifact');
for (const entry of await readdir(path.join(websiteDir, 'dist'))) {
  await cp(path.join(websiteDir, 'dist', entry), path.join(siteDir, entry), { recursive: true });
}
run(process.execPath, [path.join(projectRoot, 'scripts', 'generate-doc-redirects.mjs'), 'site']);

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
};

async function sendFile(response, filePath) {
  const info = await stat(filePath);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // A preview that caches is a preview that lies about what was just built.
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    // A stray `%` would otherwise throw out of the handler and take the server with it.
    response.writeHead(400).end('bad url');
    return;
  }

  const requested = path.join(siteDir, pathname);

  if (!requested.startsWith(siteDir + path.sep) && requested !== siteDir) {
    response.writeHead(400).end('bad path');
    return;
  }

  let filePath = requested;

  try {
    if ((await stat(filePath)).isDirectory()) {
      // GitHub Pages serves a directory at the URL with the slash; `/docs` is a 301.
      if (!pathname.endsWith('/')) {
        response.writeHead(301, { Location: `${pathname}/` }).end();
        console.log(`301 ${pathname} -> ${pathname}/`);
        return;
      }
      filePath = path.join(filePath, 'index.html');
    }

    if (!(await exists(filePath))) throw new Error('missing');
  } catch {
    response.writeHead(404, { 'Content-Type': MIME_TYPES['.txt'] }).end(`404 ${pathname}`);
    console.log(`404 ${pathname}`);
    return;
  }

  await sendFile(response, filePath);
  console.log(`200 ${pathname}`);
});

// `localhost` rather than a literal address, so the name the banner prints and the
// address the socket is on resolve the same way on a machine that prefers `::1`.
server.listen(port, 'localhost', () => {
  console.log(`\nServing ${path.relative(projectRoot, siteDir)} at http://localhost:${port}/`);
  console.log(`  landing page   http://localhost:${port}/`);
  console.log(`  documentation  http://localhost:${port}/docs/`);
  console.log('\nCtrl+C to stop.');
});
