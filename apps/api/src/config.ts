import type { AppConfig } from './domain.js'

const TEST_BOT_TOKEN = 'test-bot-token'
const TEST_OPERATOR_CHAT_ID = 424242
const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org'
const DEFAULT_TELEGRAM_UPDATE_MODE: TelegramUpdateMode = 'polling'

export type TelegramUpdateMode = 'polling' | 'webhook'

export interface RuntimeConfig extends AppConfig {
  telegramBotToken: string
  telegramApiBaseUrl: string
  telegramUpdateMode: TelegramUpdateMode
  testMode: boolean
  postgresUrl: string
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const testMode = env.JACKSON_TEST_MODE === 'true'

  if (testMode) {
    return {
      telegramBotToken: nonEmpty(env.JACKSON_TELEGRAM_BOT_TOKEN) ?? TEST_BOT_TOKEN,
      telegramOperatorChatId:
        parseOptionalChatId(env.JACKSON_TELEGRAM_OPERATOR_CHAT_ID) ?? TEST_OPERATOR_CHAT_ID,
      telegramWebhookSecret: nonEmpty(env.JACKSON_TELEGRAM_WEBHOOK_SECRET),
      telegramApiBaseUrl:
        nonEmpty(env.JACKSON_TELEGRAM_API_BASE_URL) ?? DEFAULT_TELEGRAM_API_BASE_URL,
      telegramUpdateMode: parseTelegramUpdateMode(env.JACKSON_TELEGRAM_UPDATE_MODE),
      testMode: true,
      postgresUrl: requiredPostgresUrl(env),
    }
  }

  return {
    telegramBotToken: required(env, 'JACKSON_TELEGRAM_BOT_TOKEN'),
    telegramOperatorChatId: parseRequiredChatId(env.JACKSON_TELEGRAM_OPERATOR_CHAT_ID),
    telegramWebhookSecret: nonEmpty(env.JACKSON_TELEGRAM_WEBHOOK_SECRET),
    telegramApiBaseUrl:
      nonEmpty(env.JACKSON_TELEGRAM_API_BASE_URL) ?? DEFAULT_TELEGRAM_API_BASE_URL,
    telegramUpdateMode: parseTelegramUpdateMode(env.JACKSON_TELEGRAM_UPDATE_MODE),
    testMode: false,
    postgresUrl: required(env, 'POSTGRES_URL'),
  }
}

function parseTelegramUpdateMode(value: string | undefined): TelegramUpdateMode {
  const mode = nonEmpty(value) ?? DEFAULT_TELEGRAM_UPDATE_MODE
  if (mode !== 'polling' && mode !== 'webhook') {
    throw new Error('JACKSON_TELEGRAM_UPDATE_MODE must be "polling" or "webhook"')
  }
  return mode
}

function requiredPostgresUrl(env: NodeJS.ProcessEnv): string {
  const value = nonEmpty(env.POSTGRES_URL)
  if (value === undefined) {
    throw new Error('POSTGRES_URL is required')
  }
  return value
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = nonEmpty(env[name])
  if (value === undefined) {
    throw new Error(`${name} is required outside JACKSON_TEST_MODE`)
  }
  return value
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined
}

function parseOptionalChatId(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) {
    return undefined
  }
  return parseChatId(value)
}

function parseRequiredChatId(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    throw new Error(
      'JACKSON_TELEGRAM_OPERATOR_CHAT_ID is required outside JACKSON_TEST_MODE',
    )
  }
  return parseChatId(value)
}

function parseChatId(value: string): number {
  const normalized = value.trim()
  if (!/^[+-]?\d+$/.test(normalized)) {
    throw new Error('JACKSON_TELEGRAM_OPERATOR_CHAT_ID must be an integer')
  }

  const chatId = Number(normalized)
  if (!Number.isSafeInteger(chatId)) {
    throw new Error('JACKSON_TELEGRAM_OPERATOR_CHAT_ID must be a safe integer')
  }
  return chatId
}
