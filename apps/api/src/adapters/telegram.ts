import type { TelegramClient } from "../domain.js";

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 10_000;

type Fetch = typeof globalThis.fetch;

export interface TelegramAdapterOptions {
  botToken: string;
  apiBaseUrl?: string;
  testMode?: boolean;
  fetchImpl?: Fetch;
}

export class TelegramSendError extends Error {
  override readonly name = "TelegramSendError";
}

export class TelegramAdapter implements TelegramClient {
  private readonly apiBaseUrl: string;
  private readonly botToken: string;
  private readonly fetchImpl: Fetch;
  private readonly testMode: boolean;
  private nextTestMessageId = 1000;

  constructor({
    botToken,
    apiBaseUrl = TELEGRAM_API_BASE_URL,
    testMode = false,
    fetchImpl = globalThis.fetch,
  }: TelegramAdapterOptions) {
    this.botToken = botToken;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
    this.testMode = testMode;
    this.fetchImpl = fetchImpl;
  }

  async sendMessage(chatId: number, text: string): Promise<number> {
    if (this.testMode) {
      const messageId = this.nextTestMessageId;
      this.nextTestMessageId += 1;
      return messageId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(
        `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: controller.signal,
        },
      );

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new TelegramSendError("telegram returned non-json response", {
          cause: error,
        });
      }

      const body = asRecord(payload);
      if (response.status >= 400 || body?.ok !== true) {
        const description = body?.description;
        throw new TelegramSendError(
          typeof description === "string"
            ? description
            : "telegram sendMessage failed",
        );
      }

      const result = asRecord(body.result);
      const messageId = result?.message_id;
      if (!Number.isSafeInteger(messageId)) {
        throw new TelegramSendError(
          "telegram sendMessage response missing message_id",
        );
      }

      return messageId as number;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
