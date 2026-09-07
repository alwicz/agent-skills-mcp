# Agent Skills MCP

A remote MCP server that hands agent skills to Claude on request.

Ask *"I need a skill for local lead research"* and Claude calls `get_skill`,
reads the instructions, asks you for what the skill needs, and gets to work.

Skills live in a database rather than in the deployment, so editing one is a
seed command, not a redeploy.

## What it does and does not do

This server **serves** skills. It does not **run** them, and that is deliberate.

A skill needs the user's own API tokens and writes files to the user's own
machine. A remote server has neither. So the split is:

| | Where |
|---|---|
| The instructions | Here, in the database |
| The API token | The user's machine, never sent to this server |
| Running the code | The user's agent |
| The output file | The user's disk |

The server sends instructions. The agent on the other end carries them out with
credentials this server never sees.

## Tools

| Tool | What it does |
|---|---|
| `list_skills` | Lists every skill with its description, so the agent can pick one from a topic. |
| `get_skill` | Returns one skill's full markdown. Matching is forgiving: "local lead research", "local-lead-research" and "lead" all resolve to the same skill. |

## Setup

**1. Create the table.** In your Supabase project, open the SQL editor and run
[`supabase.sql`](supabase.sql).

**2. Seed it** from the `.SKILL` files in [`skills/`](skills), which are the
source of truth:

```bash
cp .env.example .env && npm install && npm run seed
```

**3. Deploy to Vercel.** Import the repo, then set two environment variables:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon key |

The service role key stays on your machine for seeding. The server only reads,
so it only needs the anon key.

**4. Connect it to Claude.** Settings → Connectors → Add custom connector, and
paste your endpoint:

```
https://your-app.vercel.app/api/mcp
```

## Editing a skill

Edit the file in `skills/`, then:

```bash
npm run seed
```

Live within a minute, no redeploy. Responses are cached for 60 seconds so a
burst of calls hits the database once.

## Adding a skill

A skill is markdown with YAML frontmatter, saved with a `.SKILL` extension:

```markdown
---
name: my-skill
description: One sentence on what it does and when to use it. Agents read this to decide whether the skill is relevant, so it matters more than it looks.
---

# My skill

Instructions for the agent...
```

Drop it into `skills/`, run the seed, done.

## Local development

```bash
npm install
npm run dev
```

The endpoint is `http://localhost:3000/api/mcp`. Point the MCP Inspector at it
to try the tools without a Claude connector:

```bash
npx @modelcontextprotocol/inspector
```

## Security

- **No secrets pass through the conversation.** The server holds no user
  credentials and has no tool that accepts one.
- **The database is read-only in production.** Row level security allows
  anonymous `select` and nothing else; writes need the service role key, which
  never reaches the deployment.
- **The endpoint is unauthenticated.** Skills are public instructions, so
  anyone with the URL can read them. Put auth in front of it before storing
  anything you would not publish.

## License

MIT
