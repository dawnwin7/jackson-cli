import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./config.js";

describe("runtime config", () => {
  it("uses deterministic Telegram defaults only in explicit test mode", () => {
    expect(
      loadRuntimeConfig({
        JACKSON_TEST_MODE: "true",
        POSTGRES_URL: "postgres://test",
      }),
    ).toEqual({
      telegramBotToken: "test-bot-token",
      telegramOperatorChatId: 424242,
      telegramWebhookSecret: undefined,
      telegramApiBaseUrl: "https://api.telegram.org",
      telegramUpdateMode: "polling",
      testMode: true,
      postgresUrl: "postgres://test",
    });
  });

  it("requires live Telegram settings outside test mode", () => {
    expect(() =>
      loadRuntimeConfig({ POSTGRES_URL: "postgres://test" }),
    ).toThrow(
      "JACKSON_TELEGRAM_BOT_TOKEN is required outside JACKSON_TEST_MODE",
    );
  });

  it("loads live settings and a signed operator chat ID", () => {
    expect(
      loadRuntimeConfig({
        POSTGRES_URL: "postgres://live",
        JACKSON_TELEGRAM_BOT_TOKEN: "bot-token",
        JACKSON_TELEGRAM_OPERATOR_CHAT_ID: "-100123",
        JACKSON_TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
        JACKSON_TELEGRAM_UPDATE_MODE: "webhook",
      }),
    ).toMatchObject({
      postgresUrl: "postgres://live",
      telegramBotToken: "bot-token",
      telegramOperatorChatId: -100123,
      telegramWebhookSecret: "webhook-secret",
      telegramUpdateMode: "webhook",
      testMode: false,
    });
  });

  it("defaults to polling and allows the webhook secret to be unset", () => {
    expect(
      loadRuntimeConfig({
        POSTGRES_URL: "postgres://live",
        JACKSON_TELEGRAM_BOT_TOKEN: "bot-token",
        JACKSON_TELEGRAM_OPERATOR_CHAT_ID: "123",
      }),
    ).toMatchObject({
      telegramUpdateMode: "polling",
      telegramWebhookSecret: undefined,
    });
  });

  it("rejects an invalid Telegram update mode", () => {
    expect(() =>
      loadRuntimeConfig({
        POSTGRES_URL: "postgres://live",
        JACKSON_TELEGRAM_BOT_TOKEN: "bot-token",
        JACKSON_TELEGRAM_OPERATOR_CHAT_ID: "123",
        JACKSON_TELEGRAM_UPDATE_MODE: "invalid",
      }),
    ).toThrow('JACKSON_TELEGRAM_UPDATE_MODE must be "polling" or "webhook"');
  });

  it("always requires the Supabase Postgres URL", () => {
    expect(() => loadRuntimeConfig({ JACKSON_TEST_MODE: "true" })).toThrow(
      "POSTGRES_URL is required",
    );
  });
});
