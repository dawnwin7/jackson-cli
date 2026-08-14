import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { JacksonDatabase } from "../db/client.js";
import {
  replies,
  requests,
  telegramMessages,
  telegramWebhookUpdates,
  users,
} from "../db/schema.js";
import type { Repository } from "../domain.js";

export class DrizzleRepository implements Repository {
  constructor(private readonly db: JacksonDatabase) {}

  async claimUser(input: {
    username: string;
    usernameNormalized: string;
    tokenHash: string;
  }) {
    const [inserted] = await this.db
      .insert(users)
      .values(input)
      .onConflictDoNothing({ target: users.usernameNormalized })
      .returning();

    if (inserted) {
      return { user: inserted, claimed: true };
    }

    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.usernameNormalized, input.usernameNormalized))
      .limit(1);

    if (!existing) {
      throw new Error("username claim conflicted without an existing user");
    }

    return { user: existing, claimed: false };
  }

  async findUserByTokenHash(tokenHash: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.tokenHash, tokenHash))
      .limit(1);
    return user ?? null;
  }

  async createRequest(userId: string, message: string) {
    const id = `req_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const [request] = await this.db
      .insert(requests)
      .values({ id, userId, message })
      .returning();

    if (!request) {
      throw new Error("request insert returned no row");
    }

    return request;
  }

  async getRequestForUser(requestId: string, userId: string) {
    const [request] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.userId, userId)))
      .limit(1);
    return request ?? null;
  }

  async getReply(requestId: string) {
    const [reply] = await this.db
      .select()
      .from(replies)
      .where(eq(replies.requestId, requestId))
      .limit(1);
    return reply ?? null;
  }

  async storeTelegramMessage(
    requestId: string,
    operatorChatId: number,
    sentMessageId: number,
  ) {
    await this.db
      .insert(telegramMessages)
      .values({ requestId, operatorChatId, sentMessageId })
      .onConflictDoUpdate({
        target: telegramMessages.requestId,
        set: {
          operatorChatId,
          sentMessageId,
          createdAt: new Date(),
        },
      });
  }

  async findRequestByTelegramMessage(
    operatorChatId: number,
    sentMessageId: number,
  ) {
    const [message] = await this.db
      .select({ requestId: telegramMessages.requestId })
      .from(telegramMessages)
      .where(
        and(
          eq(telegramMessages.operatorChatId, operatorChatId),
          eq(telegramMessages.sentMessageId, sentMessageId),
        ),
      )
      .limit(1);
    return message?.requestId ?? null;
  }

  async hasWebhookUpdate(updateId: number) {
    const [update] = await this.db
      .select({ updateId: telegramWebhookUpdates.updateId })
      .from(telegramWebhookUpdates)
      .where(eq(telegramWebhookUpdates.updateId, updateId))
      .limit(1);
    return update !== undefined;
  }

  async recordWebhookUpdate(input: {
    updateId: number;
    status: "processed" | "ignored" | "duplicate";
    requestId?: string | null;
    messageId?: number | null;
  }) {
    const inserted = await this.db
      .insert(telegramWebhookUpdates)
      .values(input)
      .onConflictDoNothing({ target: telegramWebhookUpdates.updateId })
      .returning({ updateId: telegramWebhookUpdates.updateId });
    return inserted.length === 1;
  }

  async addReply(input: {
    requestId: string;
    replyText: string;
    telegramUpdateId?: number | null;
    telegramMessageId?: number | null;
  }) {
    return this.db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(replies)
        .values(input)
        .onConflictDoNothing()
        .returning({ requestId: replies.requestId });

      if (inserted.length === 0) {
        return false;
      }

      await transaction
        .update(requests)
        .set({ status: "replied", updatedAt: new Date() })
        .where(eq(requests.id, input.requestId));
      return true;
    });
  }

  async recordReplyFromWebhook(input: {
    updateId: number;
    requestId: string;
    replyText: string;
    telegramMessageId?: number | null;
  }) {
    return this.db.transaction(async (transaction) => {
      const recordedUpdate = await transaction
        .insert(telegramWebhookUpdates)
        .values({
          updateId: input.updateId,
          status: "processed",
          requestId: input.requestId,
          messageId: input.telegramMessageId,
        })
        .onConflictDoNothing({ target: telegramWebhookUpdates.updateId })
        .returning({ updateId: telegramWebhookUpdates.updateId });

      if (recordedUpdate.length === 0) {
        return { duplicate: true, created: false };
      }

      const insertedReply = await transaction
        .insert(replies)
        .values({
          requestId: input.requestId,
          replyText: input.replyText,
          telegramUpdateId: input.updateId,
          telegramMessageId: input.telegramMessageId,
        })
        .onConflictDoNothing()
        .returning({ requestId: replies.requestId });

      if (insertedReply.length > 0) {
        await transaction
          .update(requests)
          .set({ status: "replied", updatedAt: new Date() })
          .where(eq(requests.id, input.requestId));
      }

      return { duplicate: false, created: insertedReply.length > 0 };
    });
  }
}
