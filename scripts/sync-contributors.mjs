#!/usr/bin/env node

/**
 * Syncs contributors.json with live GitHub contributor data.
 *
 * - Fetches https://api.github.com/repos/Open-Resin-Alliance/DragonFruit/contributors
 * - Merges with existing contributors.json, preserving name / role / tone
 * - New contributors get default tone "secondary", role "Contributor",
 *   and their name defaults to their username
 * - Removes anyone no longer in the GitHub list (bots excluded)
 * - Skips bots (type === "Bot")
 *
 * Usage: node scripts/sync-contributors.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRIBUTORS_PATH = resolve(__dirname, '..', 'src', 'components', 'settings', 'contributors.json');
const API_URL = 'https://api.github.com/repos/Open-Resin-Alliance/DragonFruit/contributors?per_page=100';

async function main() {
  // 1. Fetch live contributors from GitHub
  console.log('Fetching contributors from GitHub API…');
  const res = await fetch(API_URL);
  if (!res.ok) {
    console.error(`GitHub API returned ${res.status}: ${res.statusText}`);
    process.exit(1);
  }
  const ghContributors = await res.json();
  if (!Array.isArray(ghContributors)) {
    console.error('Unexpected API response:', ghContributors);
    process.exit(1);
  }

  // 2. Filter bots
  const ghUsers = ghContributors.filter((c) => c.type !== 'Bot');
  const ghUserMap = new Map(ghUsers.map((c) => [c.login, c]));
  console.log(`Found ${ghUsers.length} contributors (${ghContributors.length - ghUsers.length} bots skipped)`);

  // 3. Read existing contributors
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(CONTRIBUTORS_PATH, 'utf-8'));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    console.log('No existing contributors.json found, creating new one.');
  }

  const existingMap = new Map(existing.map((c) => [c.affiliation.toLowerCase(), c]));

  // 4. Merge: start from existing, append any new GitHub contributors
  const merged = [...existing];
  const existingLookup = new Set(existing.map((c) => c.affiliation.toLowerCase()));
  let added = 0;

  for (const gh of ghUsers) {
    if (!existingLookup.has(gh.login.toLowerCase())) {
      merged.push({
        name: gh.login,
        affiliation: gh.login,
        role: 'Contributor',
        tone: 'secondary',
      });
      console.log(`   ➕ ${gh.login}`);
      added++;
    }
  }

  // 5. Report
  if (added > 0) {
    console.log(`\nAdded ${added} new contributor${added !== 1 ? 's' : ''}.`);
  } else {
    console.log('No new contributors found.');
  }

  // 6. Write
  writeFileSync(CONTRIBUTORS_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n✅ Wrote ${merged.length} contributors to contributors.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
