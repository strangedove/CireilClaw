// Compact tool descriptions for token-efficient operation.
// These are shorter alternatives to the default verbose descriptions,
// intended for larger pay-per-token models that don't need the extra
// guidance that smaller local LLMs benefit from.
//
// Enable via `compactPrompts = true` in engine.toml.

export const compactDescriptions: Record<string, string> = {
  "brave-search":
    "Search the web via Brave Search and return a list of results. Each result contains a title, description snippet, and URL.\n\n" +
    "Returns search result metadata only — not full page content. You cannot fetch URLs from the sandbox.\n\n" +
    "Use this when the user's request requires up-to-date information or references you don't have in context.",

  "download-attachments":
    "Download all file attachments from a message into the sandbox. Returns the list of saved sandbox paths.\n\n" +
    "Only available on platforms that support attachment downloads.",

  exec:
    "Run a shell command in a sandbox. The working directory is /workspace.\n\n" +
    "Only binaries listed in the agent's tools.toml [exec] config are available — all other commands will fail. Returns stdout, stderr, and exit code.\n\n" +
    "`command` must be a single binary name with no shell metacharacters. Use `args` for arguments.\n\n" +
    "Filesystem access outside the sandbox is restricted. Commands exceeding the configured timeout are killed.\n\n" +
    "Tip: Run `ls /bin` to see available binaries. `/workspace/.env` is sourced and can affect $PATH.",

  "list-dir":
    "List the files and subdirectories at the given sandbox path. Returns each entry's name and type (file, directory, or symlink).",

  "open-file":
    "Pin a file to the system prompt so its full contents are included in every subsequent turn until you call `close-file`.\n\n" +
    "When to use:\n" +
    "- You need to reference or edit a file across multiple turns and want its contents always visible.\n\n" +
    "When NOT to use:\n" +
    "- You only need to see a file once — use `read` instead to avoid wasting context space.\n\n" +
    "The file must exist at the given path.",

  read:
    "Read the full contents of a file at the given sandbox path and return it as text.\n\n" +
    "Image files (.jpg, .jpeg, .png, .gif, .webp) are automatically converted to WebP and injected into your next turn as a visual — you will see the image, not raw bytes.\n\n" +
    "When NOT to use:\n" +
    "- To load a skill by its slug — use `read-skill` instead.\n" +
    "- For files you plan to edit repeatedly — use `open-file` to pin them to context.",

  "read-skill":
    "Load the full contents of a skill document by its slug.\n\n" +
    "Your available skills are listed in the system prompt. Call this tool when you need the complete instructions for a skill before following its process.\n\n" +
    'To browse available skills, use `list-dir` with path "/skills".',

  respond:
    "Send a message to the user. This is the ONLY way to communicate with the user — text written to files is not delivered.\n\n" +
    "Set `final` to `false` to send an intermediate status update and continue working. `attachments` is Discord-only. Every turn must end with a `final: true` respond call.",

  schedule:
    "Schedule a one-shot task to run at a specific time in the future.\n\n" +
    "`at` must be an ISO 8601 timestamp. `delivery`: `announce` (default) sends output to the creating session, `none` discards it.",

  "session-info":
    "Get metadata about the current session — platform type, channel/room IDs, and flags like NSFW.",

  "str-replace":
    "Find and replace exactly one occurrence of a literal string in an existing file.\n\n" +
    "The match is exact — whitespace, indentation, and newlines all matter. On success, returns a few lines of context around the replacement.\n\n" +
    "Error conditions:\n" +
    "- `old_text` not found → include more surrounding context to verify your match.\n" +
    "- `old_text` found more than once → include additional surrounding lines to disambiguate.\n\n" +
    "Tips:\n" +
    "- To delete lines, set `new_text` to the surrounding context with the target lines removed.\n" +
    "- Use `read` or `open-file` first to see the current file contents and craft an accurate match.\n\n" +
    "When NOT to use:\n" +
    "- Creating new files or full rewrites — use `write` instead.",

  write:
    "Create a new file or completely overwrite an existing file with the provided content.\n\n" +
    "Parent directories are created automatically. Files under /blocks/ must have a .md extension.\n\n" +
    "When NOT to use:\n" +
    "- Making small, targeted changes to an existing file — use `str-replace` instead, which is safer and preserves surrounding content.",
};
