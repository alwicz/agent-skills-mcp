/**
 * Push every .SKILL file in ./skills into the Supabase `skills` table.
 *
 * The files in this repo are the source of truth. The database is a serving
 * copy so the remote server can pick up an edit without a redeploy.
 *
 *   node scripts/seed.mjs
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key can
 * write, so keep it out of the repo and out of the deployed environment; the
 * server itself only ever needs the anon key.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "skills");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the seed.",
  );
  process.exit(1);
}

/** Split a leading --- block into a dict, keeping wrapped values intact. */
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return [{}, text];

  const end = text.indexOf("\n---", 3);
  if (end === -1) return [{}, text];

  const block = text.slice(3, end).replace(/^\n+|\n+$/g, "");
  const body = text.slice(end + 4).replace(/^\n+/, "");

  const meta = {};
  let key = null;
  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      key = match[1];
      meta[key] = match[2].trim();
    } else if (key && line.trim()) {
      meta[key] += " " + line.trim();
    }
  }
  return [meta, body];
}

const files = (await readdir(SKILLS_DIR)).filter((f) => f.endsWith(".SKILL"));

if (files.length === 0) {
  console.error(`No .SKILL files found in ${SKILLS_DIR}`);
  process.exit(1);
}

const rows = [];
for (const file of files) {
  const text = await readFile(join(SKILLS_DIR, file), "utf8");
  const [meta] = parseFrontmatter(text);

  const name = meta.name || basename(file, ".SKILL");
  if (!meta.description) {
    console.warn(`  ! ${name} has no description; agents rely on it to choose.`);
  }

  // Store the whole file, frontmatter included, so what an agent receives is
  // byte-for-byte what is in the repo.
  rows.push({ name, description: meta.description || "", body: text });
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/skills?on_conflict=name`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(rows),
});

if (!res.ok) {
  console.error(`Seed failed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

for (const row of rows) console.log(`  ✓ ${row.name}`);
console.log(`\nSeeded ${rows.length} skill(s).`);
