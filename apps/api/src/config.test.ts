import { describe, expect, it } from 'vitest'

import { loadRuntimeConfig } from './config.js'

describe('runtime config', () => {
  it('uses deterministic Telegram defaults only in explicit test mode', () => {
    expect(
      loadRuntimeConfig({ JACKSON_TEST_MODE: 'true', POSTGRES_URL: 'postgres://test' }),
    ).toEqual({
      telegramBotToken: 'test-bot-token',
      telegramOperatorChatId: 424242,
      telegramWebhookSecret: 'test-webhook-secret',
      telegramApiBaseUrl: 'https://api.telegram.org',
      testMode: true,
      postgresUrl: 'postgres://test',
    })
  })

  it('requires live Telegram settings outside test mode', () => {
    expect(() => loadRuntimeConfig({ POSTGRES_URL: 'postgres://test' })).toThrow(
      'JACKSON_TELEGRAM_BOT_TOKEN is required outside JACKSON_TEST_MODE',
    )
  })

  it('loads live settings and a signed operator chat ID', () => {
    expect(
      loadRuntimeConfig({
        POSTGRES_URL: 'postgres://live',
        JACKSON_TELEGRAM_BOT_TOKEN: 'bot-token',
        JACKSON_TELEGRAM_OPERATOR_CHAT_ID: '-100123',
        JACKSON_TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      }),
    ).toMatchObject({
      postgresUrl: 'postgres://live',
      telegramBotToken: 'bot-token',
      telegramOperatorChatId: -100123,
      telegramWebhookSecret: 'webhook-secret',
      testMode: false,
    })
  })

  it('always requires the Supabase Postgres URL', () => {
    expect(() => loadRuntimeConfig({ JACKSON_TEST_MODE: 'true' })).toThrow(
      'POSTGRES_URL is required',
    )
  })
})
