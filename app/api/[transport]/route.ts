import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { listSkills, getSkill } from "@/lib/skills";

/**
 * Remote MCP endpoint.
 *
 * Serves skills only. Running a skill stays on the user's own machine, because
 * the API tokens a skill needs belong to the user and the files it writes have
 * to land on their disk. This server hands over the instructions; their agent
 * carries them out.
 */
const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_skills",
      "List every skill available, with a description of what each one does " +
        "and when to use it. Call this first when the user asks for a skill by " +
        "topic rather than by exact name, for example \"I need something for " +
        "local lead research\".",
      {},
      async () => ({
        content: [{ type: "text", text: await listSkills() }],
      }),
    );

    server.tool(
      "get_skill",
      "Return the full instructions for one skill as markdown. Matching is " +
        "forgiving: \"local lead research\", \"local-lead-research\" and \"lead\" " +
        "all resolve to the same skill. Read the returned text and follow it as " +
        "your instructions for the rest of the task, including asking the user " +
        "for anything the skill says it needs.",
      {
        name: z
          .string()
          .describe('Skill name or topic, e.g. "local lead research"'),
      },
      async ({ name }) => ({
        content: [{ type: "text", text: await getSkill(name) }],
      }),
    );
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST, handler as DELETE };
