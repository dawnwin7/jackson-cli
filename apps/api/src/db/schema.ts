import {
  bigint,
  char,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const jacksonSchema = pgSchema('jackson')

export const requestStatus = jacksonSchema.enum('request_status', ['pending', 'replied'])
export const webhookUpdateStatus = jacksonSchema.enum('webhook_update_status', [
  'processed',
  'ignored',
  'duplicate',
])

const timestampColumn = (name: string) =>
  timestamp(name, { mode: 'date', withTimezone: true }).defaultNow().notNull()

export const users = jacksonSchema
  .table(
    'users',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      username: text('username').notNull(),
      usernameNormalized: text('username_normalized').notNull(),
      tokenHash: char('token_hash', { length: 64 }).notNull(),
      createdAt: timestampColumn('created_at'),
    },
    (table) => [
      uniqueIndex('uniq_username_normalized').on(table.usernameNormalized),
      uniqueIndex('uniq_token_hash').on(table.tokenHash),
    ],
  )
  .enableRLS()

export const requests = jacksonSchema
  .table(
    'requests',
    {
      id: text('id').primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      message: text('message').notNull(),
      status: requestStatus('status').default('pending').notNull(),
      createdAt: timestampColumn('created_at'),
      updatedAt: timestampColumn('updated_at'),
    },
    (table) => [index('by_user_created').on(table.userId, table.createdAt.desc())],
  )
  .enableRLS()

export const replies = jacksonSchema
  .table(
    'replies',
    {
      requestId: text('request_id')
        .notNull()
        .references(() => requests.id),
      replyText: text('reply_text').notNull(),
      telegramUpdateId: bigint('telegram_update_id', { mode: 'number' }),
      telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
      createdAt: timestampColumn('created_at'),
    },
    (table) => [
      primaryKey({ name: 'uniq_reply_per_request', columns: [table.requestId] }),
      uniqueIndex('uniq_reply_update_id').on(table.telegramUpdateId),
    ],
  )
  .enableRLS()

export const telegramMessages = jacksonSchema
  .table(
    'telegram_messages',
    {
      requestId: text('request_id')
        .notNull()
        .references(() => requests.id),
      operatorChatId: bigint('operator_chat_id', { mode: 'number' }).notNull(),
      sentMessageId: bigint('sent_message_id', { mode: 'number' }).notNull(),
      createdAt: timestampColumn('created_at'),
    },
    (table) => [
      primaryKey({ name: 'uniq_telegram_message_request', columns: [table.requestId] }),
      uniqueIndex('uniq_operator_sent_message').on(table.operatorChatId, table.sentMessageId),
    ],
  )
  .enableRLS()

export const telegramWebhookUpdates = jacksonSchema
  .table(
    'telegram_webhook_updates',
    {
      updateId: bigint('update_id', { mode: 'number' }).notNull(),
      status: webhookUpdateStatus('status').notNull(),
      requestId: text('request_id').references(() => requests.id),
      messageId: bigint('message_id', { mode: 'number' }),
      createdAt: timestampColumn('created_at'),
    },
    (table) => [
      primaryKey({ name: 'uniq_telegram_update_id', columns: [table.updateId] }),
      index('by_request_status').on(table.requestId, table.status),
    ],
  )
  .enableRLS()
