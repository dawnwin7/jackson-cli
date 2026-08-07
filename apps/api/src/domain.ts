export type RequestStatus = 'pending' | 'replied'
export type WebhookUpdateStatus = 'processed' | 'ignored' | 'duplicate'

export interface UserRecord {
  id: string
  username: string
  usernameNormalized: string
  tokenHash: string
  createdAt: Date
}

export interface RequestRecord {
  id: string
  userId: string
  message: string
  status: RequestStatus
  createdAt: Date
  updatedAt: Date
}

export interface ReplyRecord {
  requestId: string
  replyText: string
  telegramUpdateId: number | null
  telegramMessageId: number | null
  createdAt: Date
}

export interface Repository {
  claimUser(input: {
    username: string
    usernameNormalized: string
    tokenHash: string
  }): Promise<{ user: UserRecord; claimed: boolean }>
  findUserByTokenHash(tokenHash: string): Promise<UserRecord | null>
  createRequest(userId: string, message: string): Promise<RequestRecord>
  getRequestForUser(requestId: string, userId: string): Promise<RequestRecord | null>
  getReply(requestId: string): Promise<ReplyRecord | null>
  storeTelegramMessage(requestId: string, operatorChatId: number, sentMessageId: number): Promise<void>
  findRequestByTelegramMessage(operatorChatId: number, sentMessageId: number): Promise<string | null>
  hasWebhookUpdate(updateId: number): Promise<boolean>
  recordWebhookUpdate(input: {
    updateId: number
    status: WebhookUpdateStatus
    requestId?: string | null
    messageId?: number | null
  }): Promise<boolean>
  recordReplyFromWebhook(input: {
    updateId: number
    requestId: string
    replyText: string
    telegramMessageId?: number | null
  }): Promise<{ duplicate: boolean; created: boolean }>
  addReply(input: {
    requestId: string
    replyText: string
    telegramUpdateId?: number | null
    telegramMessageId?: number | null
  }): Promise<boolean>
}

export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<number>
}

export interface AppConfig {
  telegramOperatorChatId: number
  telegramWebhookSecret: string
}
