/**
 * Skill storage.
 *
 * Skills live in a Supabase table so they can be edited without redeploying.
 * Reads go through the REST endpoint directly, so there is no SDK dependency
 * and no connection pool to manage in a serverless function.
 */

export type Skill = {
  name: string;
  description: string;
  body: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const SETUP_HINT =
  "This server has no skill store configured yet. Set SUPABASE_URL and " +
  "SUPABASE_ANON_KEY in the deployment environment, run the schema in " +
  "supabase.sql, then seed it with `npm run seed`.";

/** Loose key so "Local Lead Research" matches "local-lead-research". */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * How well one skill answers a query. Higher wins; 0 means no match.
 *
 * Ordered so an exact name beats a phrase that contains the name, which beats
 * word overlap, which beats a word appearing only in the description.
 */
function score(skill: Skill, wanted: string, wantedTokens: string[]): number {
  const nameSlug = slug(skill.name);

  if (nameSlug === wanted) return 1000;
  if (wanted.includes(nameSlug) || nameSlug.includes(wanted)) return 500;

  const nameTokens = new Set(nameSlug.split("-"));
  const descSlug = slug(skill.description);

  let total = 0;
  for (const token of wantedTokens) {
    if (nameTokens.has(token)) total += 10;
    else if (descSlug.includes(token)) total += 1;
  }
  return total;
}

async function fetchSkills(): Promise<Skill[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const url =
    `${SUPABASE_URL}/rest/v1/skills` +
    `?select=name,description,body&order=name.asc`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    // Skills change rarely. Cache briefly so a burst of calls hits the DB once,
    // while an edit still shows up within a minute without a redeploy.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Skill store returned ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as Skill[];
}

export async function listSkills(): Promise<string> {
  let skills: Skill[] | null;
  try {
    skills = await fetchSkills();
  } catch (err) {
    return `Could not reach the skill store: ${(err as Error).message}`;
  }

  if (skills === null) return SETUP_HINT;
  if (skills.length === 0) return "The skill store is empty. Run `npm run seed`.";

  const lines = [`${skills.length} skill(s) available:`, ""];
  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`);
  }
  lines.push("", "Call get_skill with a name to read the full instructions.");
  return lines.join("\n");
}

export async function getSkill(name: string): Promise<string> {
  let skills: Skill[] | null;
  try {
    skills = await fetchSkills();
  } catch (err) {
    return `Could not reach the skill store: ${(err as Error).message}`;
  }

  if (skills === null) return SETUP_HINT;
  if (skills.length === 0) return "The skill store is empty. Run `npm run seed`.";

  const wanted = slug(name);
  // Agents pass anything from "video-analysis" to a whole sentence, so score
  // candidates rather than requiring the query to be a substring of the name.
  const wantedTokens = wanted.split("-").filter((t) => t.length > 2);

  const scored = skills
    .map((skill) => ({ skill, score: score(skill, wanted, wantedTokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const names = skills.map((s) => s.name).join(", ");
    return `No skill matches "${name}". Available: ${names}.`;
  }

  // A clear winner wins. A tie means the request was genuinely ambiguous.
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return scored[0].skill.body;
  }

  const tied = scored
    .filter((row) => row.score === scored[0].score)
    .map((row) => row.skill.name)
    .join(", ");
  return `Several skills match "${name}": ${tied}. Ask for one by name.`;
}
