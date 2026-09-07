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

  const exact = skills.find((s) => slug(s.name) === wanted);
  if (exact) return exact.body;

  const partial = skills.filter(
    (s) => slug(s.name).includes(wanted) || slug(s.description).includes(wanted),
  );
  if (partial.length === 1) return partial[0].body;
  if (partial.length > 1) {
    const names = partial.map((s) => s.name).join(", ");
    return `Several skills match "${name}": ${names}. Ask for one by name.`;
  }

  const names = skills.map((s) => s.name).join(", ");
  return `No skill matches "${name}". Available: ${names}.`;
}
