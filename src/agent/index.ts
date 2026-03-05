import type { EngineConfig } from "$/config/schemas.js";
import { Engine } from "$/engine/index.js";
import type { ChannelType, Session } from "$/harness/session.js";

type SendFn = (session: Session, content: string, attachments?: string[]) => Promise<void>;
type ReactFn = (session: Session, emoji: string, messageId?: string) => Promise<void>;
type DownloadDiscordAttachmentsFn = (
  session: Session,
  messageId: string,
) => Promise<{ filename: string; data: Buffer }[]>;

export class Agent {
  private _engine: Engine;
  private readonly _slug: string;
  private readonly _sessions: Map<string, Session>;
  private readonly _sendHandlers = new Map<ChannelType, SendFn>();
  private readonly _reactHandlers = new Map<ChannelType, ReactFn>();
  private _downloadDiscordAttachments: DownloadDiscordAttachmentsFn | undefined = undefined;

  constructor(slug: string, cfg: EngineConfig, sessions: Map<string, Session>) {
    this._engine = new Engine(cfg);
    this._slug = slug;
    this._sessions = sessions;
  }

  get engine(): Engine {
    return this._engine;
  }

  updateEngine(cfg: EngineConfig): void {
    this._engine = new Engine(cfg);
  }

  get slug(): string {
    return this._slug;
  }

  get sessions(): Map<string, Session> {
    return this._sessions;
  }

  registerSend(channel: ChannelType, fn: SendFn): void {
    this._sendHandlers.set(channel, fn);
  }

  registerReact(channel: ChannelType, fn: ReactFn): void {
    this._reactHandlers.set(channel, fn);
  }

  registerDownloadDiscordAttachments(fn: DownloadDiscordAttachmentsFn): void {
    this._downloadDiscordAttachments = fn;
  }

  async send(session: Session, content: string, attachments?: string[]): Promise<void> {
    // Allow the session to intercept and optionally suppress delivery.
    if (session.sendFilter !== undefined && !session.sendFilter(content)) {
      return;
    }

    const handler = this._sendHandlers.get(session.channel);
    if (handler === undefined) {
      throw new Error(`Agent ${this._slug} has no send handler for channel "${session.channel}"`);
    }
    await handler(session, content, attachments);
  }

  async runTurn(session: Session): Promise<void> {
    const send = async (content: string, attachments?: string[]): Promise<void> => {
      await this.send(session, content, attachments);
    };
    const reactHandler = this._reactHandlers.get(session.channel);
    const react =
      reactHandler === undefined
        ? undefined
        : async (emoji: string, messageId?: string): Promise<void> => {
            await reactHandler(session, emoji, messageId);
          };
    const downloadDiscordAttachments =
      this._downloadDiscordAttachments === undefined
        ? undefined
        : async (messageId: string): Promise<{ filename: string; data: Buffer }[]> => {
            const result = await this._downloadDiscordAttachments?.(session, messageId);
            return result ?? [];
          };
    await this._engine.runTurn(session, this._slug, send, react, downloadDiscordAttachments);
  }
}
