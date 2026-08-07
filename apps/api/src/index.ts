import { Hono } from 'hono'

import { TelegramAdapter } from './adapters/telegram.js'
import { loadRuntimeConfig } from './config.js'
import { createApp } from './create-app.js'
import { createDatabase } from './db/client.js'
import { DrizzleRepository } from './repositories/drizzle.js'

const config = loadRuntimeConfig()
const { db } = createDatabase(config.postgresUrl)
const repository = new DrizzleRepository(db)
const telegram = new TelegramAdapter({
  botToken: config.telegramBotToken,
  apiBaseUrl: config.telegramApiBaseUrl,
  testMode: config.testMode,
})
const app: Hono = createApp({ repository, telegram, config })

export default app
