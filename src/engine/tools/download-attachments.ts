import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ToolContext, ToolDef } from "$/engine/tools/tool-def.js";
import { sanitizeError, sandboxToReal } from "$/util/paths.js";
import * as vb from "valibot";

const Schema = vb.strictObject({
  message_id: vb.pipe(
    vb.string(),
    vb.nonEmpty(),
    vb.description("ID of the message whose attachments to download."),
  ),
  to: vb.pipe(
    vb.string(),
    vb.nonEmpty(),
    vb.description("Sandbox directory path to save files into (e.g. /workspace/downloads)."),
  ),
});

const downloadAttachments: ToolDef = {
  description:
    "Download all file attachments from a message into the sandbox. Returns the list of saved sandbox paths.\n\n" +
    "Only works on platforms that support attachment downloads (check capabilities in system prompt).",
  async execute(input: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
    try {
      if (ctx.downloadAttachments === undefined) {
        return { error: "This channel does not support downloading attachments", success: false };
      }

      const { message_id, to } = vb.parse(Schema, input);

      const files = await ctx.downloadAttachments(message_id);

      const saved: string[] = [];
      for (const { filename, data } of files) {
        const sandboxPath = join(to, filename).replaceAll("\\", "/");
        const realPath = sandboxToReal(sandboxPath, ctx.agentSlug);
        await mkdir(dirname(realPath), { recursive: true });
        await writeFile(realPath, data);
        saved.push(sandboxPath);
      }

      return { count: saved.length, saved, success: true };
    } catch (error: unknown) {
      if (error instanceof vb.ValiError) {
        return { error: error.message, issues: error.issues, success: false };
      }
      return { error: sanitizeError(error, ctx.agentSlug), success: false };
    }
  },
  name: "download-attachments",
  parameters: Schema,
};

export { downloadAttachments };
