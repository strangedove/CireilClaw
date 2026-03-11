import { createRequire } from "node:module";

import { loadAgents, loadChannel } from "$/config/index.js";
import { getDb, initDb } from "$/db/index.js";
import { sessions } from "$/db/schema.js";
import { updateSessionImages } from "$/db/sessions.js";
import colors from "$/output/colors.js";
import { error as logError, info, warning } from "$/output/log.js";
import { toWebp } from "$/util/image.js";
import { select } from "@inquirer/prompts";
import { buildCommand } from "@stricli/core";
import { eq } from "drizzle-orm";
import { ChannelTypes } from "oceanic.js";

// oceanic.js's ESM shim breaks under tsx's module loader (.default.default chain
// resolves to undefined). Force CJS to get the real constructors.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const { Client, Intents } = createRequire(import.meta.url)(
  "oceanic.js",
  // oxlint-disable-next-line typescript/consistent-type-imports
) as typeof import("oceanic.js");

// Type alias for the client from the CJS require
type OceanicClient = InstanceType<typeof Client>;

// Media types supported by OpenAI's vision API.
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface DiscordSessionRow {
  channelId: string;
  guildId?: string;
  id: string;
}

interface RepairResult {
  failed: number;
  skipped: number;
  updated: number;
}

// Create REST-only Discord client (no gateway connection needed for fetching messages)
function createDiscordClient(token: string): OceanicClient {
  return new Client({
    auth: `Bot ${token}`,
    gateway: {
      intents: Intents.GUILD_MESSAGES | Intents.DIRECT_MESSAGES,
    },
    rest: {},
  });
}

// Fetch session display name from Discord API
async function fetchSessionDisplayName(
  client: OceanicClient,
  channelId: string,
  guildId?: string,
): Promise<{ channelName: string; guildName: string }> {
  try {
    const channel = await client.rest.channels.get(channelId);

    if (channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM) {
      // DM channel - extract recipient names
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const dmChannel = channel as { recipients: Map<string, { username: string }> };
      const names = [...dmChannel.recipients.values()]
        .map((recipient) => recipient.username)
        .join(", ");
      return { channelName: `DM with ${names}`, guildName: "" };
    }

    // Guild channel - get channel name and guild name
    let guildName = "";
    if (guildId !== undefined) {
      try {
        const guild = await client.rest.guilds.get(guildId);
        guildName = guild.name;
      } catch {
        guildName = "Unknown Server";
      }
    }

    // channel.name exists on guild channels
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const channelName = (channel as { name?: string }).name ?? "Unknown Channel";
    return { channelName, guildName };
  } catch {
    return { channelName: channelId, guildName: guildId ?? "" };
  }
}

// Core repair logic for a single session
async function repairSessionImages(
  agentSlug: string,
  sessionId: string,
  client: OceanicClient,
): Promise<RepairResult> {
  const db = getDb(agentSlug);

  // Get the session row
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

  if (row === undefined) {
    logError("Session not found:", sessionId);
    return { failed: 0, skipped: 0, updated: 0 };
  }

  // Parse session metadata
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const meta = JSON.parse(row.meta) as { channelId: string; guildId?: string };
  const { channelId } = meta;

  // Parse history to find user messages with images
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const history = JSON.parse(row.history) as Record<string, unknown>[];

  const result: RepairResult = { failed: 0, skipped: 0, updated: 0 };
  const newImages = new Map<string, Uint8Array>(); // messageId -> image data

  for (const msg of history) {
    if (msg["role"] !== "user" || msg["id"] === undefined) {
      continue;
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const msgId = msg["id"] as string;
    const { content } = msg;

    // Check if this message has image refs
    if (!Array.isArray(content)) {
      continue;
    }

    const hasImageRefs = content.some(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        (block as { type: string }).type === "image_ref",
    );

    if (!hasImageRefs) {
      continue;
    }

    // Fetch the message from Discord
    try {
      const discordMsg = await client.rest.channels.getMessage(channelId, msgId);

      // Get attachments, filter to images, sort by ID (same as original storage)
      const imageAttachments = [...discordMsg.attachments.values()]
        .filter((attachment) => {
          const mediaType = attachment.contentType?.split(";")[0]?.trim();
          return mediaType !== undefined && SUPPORTED_IMAGE_TYPES.has(mediaType);
        })
        .toSorted((first, second) => first.id.localeCompare(second.id));

      if (imageAttachments.length === 0) {
        warning("No image attachments found for message", msgId, "- skipping");
        result.skipped++;
        continue;
      }

      // Download and convert the first attachment (we only store one image per message currently)
      // If there are multiple images, we process them in order
      const [firstAttachment] = imageAttachments;
      if (firstAttachment === undefined) {
        result.skipped++;
        continue;
      }

      try {
        const response = await fetch(firstAttachment.url);
        if (!response.ok) {
          warning("Failed to fetch attachment from", firstAttachment.url);
          result.failed++;
          continue;
        }

        const raw = await response.arrayBuffer();
        const data = await toWebp(raw);
        newImages.set(msgId, data);
        result.updated++;
      } catch (caughtError) {
        warning(
          "Failed to process attachment:",
          caughtError instanceof Error ? caughtError.message : String(caughtError),
        );
        result.failed++;
      }
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.message.includes("Unknown Message")) {
        warning("Message", msgId, "was deleted - keeping existing images");
      } else {
        warning(
          "Failed to fetch message",
          msgId,
          ":",
          caughtError instanceof Error ? caughtError.message : String(caughtError),
        );
      }
      result.failed++;
    }
  }

  // Update the session with new images if we have any
  if (newImages.size > 0) {
    updateSessionImages(agentSlug, sessionId, newImages);
    info("Updated", colors.keyword(result.updated.toString()), "images for session", sessionId);
  }

  return result;
}

async function run(): Promise<void> {
  const slugs = await loadAgents();

  if (slugs.length === 0) {
    warning("No agents found.");
    return;
  }

  // Select agent
  const agentSlug = await select({
    choices: slugs.map((slug) => ({ name: slug, value: slug })),
    message: "Which agent?",
  });

  // Load Discord config
  let token: string | undefined = undefined;
  try {
    const { token: configToken } = await loadChannel("discord", agentSlug);
    token = configToken;
  } catch {
    logError("Failed to load Discord config for agent", agentSlug);
    return;
  }

  // Create Discord client and connect
  const client = createDiscordClient(token);

  // Initialize DB for this agent
  initDb(agentSlug);

  // Get Discord sessions from DB
  const db = getDb(agentSlug);
  const rows = db.select().from(sessions).all();

  const discordSessions: DiscordSessionRow[] = [];
  for (const row of rows) {
    if (row.channel !== "discord") {
      continue;
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const meta = JSON.parse(row.meta) as { channelId: string; guildId?: string };
    discordSessions.push({
      channelId: meta.channelId,
      guildId: meta.guildId,
      id: row.id,
    });
  }

  if (discordSessions.length === 0) {
    info("No Discord sessions found for agent", colors.keyword(agentSlug));
    return;
  }

  // Connect to Discord
  info("Connecting to Discord...");
  await client.connect();

  // Wait for ready
  await new Promise<void>((resolve) => {
    client.once("ready", () => {
      resolve();
    });
  });

  // Fetch display names for all sessions
  info("Fetching session info...");
  const sessionChoices: { name: string; value: string }[] = [];

  for (const session of discordSessions) {
    const { channelName, guildName } = await fetchSessionDisplayName(
      client,
      session.channelId,
      session.guildId,
    );

    const displayName = guildName === "" ? channelName : `${channelName} (${guildName})`;
    sessionChoices.push({
      name: `${displayName} [${session.id}]`,
      value: session.id,
    });
  }

  // Select session to repair
  const sessionId = await select({
    choices: sessionChoices,
    message: "Which session to repair images for?",
  });

  // Repair the session
  info("Repairing images for session", colors.keyword(sessionId), "...");
  const result = await repairSessionImages(agentSlug, sessionId, client);

  info(
    "Repair complete:",
    colors.keyword(result.updated.toString()),
    "updated,",
    colors.keyword(result.failed.toString()),
    "failed,",
    colors.keyword(result.skipped.toString()),
    "skipped",
  );

  // Disconnect
  client.disconnect(false);
}

export const repairImagesCommand = buildCommand({
  docs: {
    brief: "Repair corrupted images by re-fetching from Discord",
  },
  func: run,
  parameters: {},
});
