import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  replies,
  requests,
  telegramMessages,
  telegramWebhookUpdates,
  users,
} from "./schema.js";

describe("Drizzle schema metadata", () => {
  it("defines the five archived persistence tables in a private RLS-enabled schema", () => {
    const configs = [
      getTableConfig(users),
      getTableConfig(requests),
      getTableConfig(replies),
      getTableConfig(telegramMessages),
      getTableConfig(telegramWebhookUpdates),
    ];

    expect(configs.map(({ name }) => name)).toEqual([
      "users",
      "requests",
      "replies",
      "telegram_messages",
      "telegram_webhook_updates",
    ]);
    for (const config of configs) {
      expect(config.schema).toBe("jackson");
      expect(config.enableRLS).toBe(true);
    }
  });

  it("stores only token hashes and defines the required uniqueness constraints", () => {
    const userConfig = getTableConfig(users);
    expect(userConfig.columns.map(({ name }) => name)).toContain("token_hash");
    expect(userConfig.columns.map(({ name }) => name)).not.toContain("token");
    expect(
      userConfig.indexes.map(({ config }) => [config.name, config.unique]),
    ).toEqual(
      expect.arrayContaining([
        ["uniq_username_normalized", true],
        ["uniq_token_hash", true],
      ]),
    );

    const replyConfig = getTableConfig(replies);
    expect(replyConfig.primaryKeys.map(({ name }) => name)).toContain(
      "uniq_reply_per_request",
    );
    expect(
      replyConfig.indexes.map(({ config }) => [config.name, config.unique]),
    ).toContainEqual(["uniq_reply_update_id", true]);

    const messageConfig = getTableConfig(telegramMessages);
    expect(messageConfig.primaryKeys.map(({ name }) => name)).toContain(
      "uniq_telegram_message_request",
    );
    expect(
      messageConfig.indexes.map(({ config }) => [config.name, config.unique]),
    ).toContainEqual(["uniq_operator_sent_message", true]);

    expect(
      getTableConfig(telegramWebhookUpdates).primaryKeys.map(
        ({ name }) => name,
      ),
    ).toContain("uniq_telegram_update_id");
  });
});
