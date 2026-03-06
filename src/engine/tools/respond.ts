import type { ToolContext, ToolDef } from "$/engine/tools/tool-def.js";
import * as vb from "valibot";

const RespondSchema = vb.strictObject({
  attachments: vb.exactOptional(vb.nullable(vb.array(vb.pipe(vb.string(), vb.nonEmpty())))),
  content: vb.pipe(vb.string(), vb.nonEmpty()),
  final: vb.exactOptional(vb.boolean(), true),
});

type RespondInput = vb.InferOutput<typeof RespondSchema>;

const respond: ToolDef = {
  description:
    "Send a message to the user. This is the ONLY way to communicate with the user — text written to files is not delivered.\n\n" +
    "Set `final` to `false` to send an intermediate status update and continue working. `attachments` is Discord-only. Every turn must end with a `final: true` respond call.",
  async execute(input: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
    const { content, final, attachments } = vb.parse(RespondSchema, input);
    await ctx.send(content, attachments ?? undefined);
    return { final, sent: true };
  },
  name: "respond",
  parameters: RespondSchema,
};

export { respond };
export type { RespondInput };
