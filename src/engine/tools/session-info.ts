import type { ToolContext, ToolDef } from "$/engine/tools/tool-def.js";
import { DiscordSession, MatrixSession, TuiSession } from "$/harness/session.js";
import * as vb from "valibot";

// No input parameters needed — this just returns session context.
const Schema = vb.object({});

export const sessionInfo: ToolDef = {
  description:
    "Get metadata about the current session — platform type, channel/room IDs, and flags like NSFW.",
  // oxlint-disable-next-line typescript/require-await
  async execute(_input: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
    const { session } = ctx;

    if (session instanceof DiscordSession) {
      return {
        channel_id: session.channelId,
        guild_id: session.guildId,
        is_nsfw: session.isNsfw,
        platform: "discord",
        success: true,
      };
    }

    if (session instanceof MatrixSession) {
      return {
        platform: "matrix",
        room_id: session.roomId,
        success: true,
      };
    }

    if (session instanceof TuiSession) {
      return {
        label: session.label,
        platform: "tui",
        success: true,
      };
    }

    return {
      error: "Unknown session type",
      success: false,
    };
  },
  name: "session-info",
  parameters: Schema,
};
