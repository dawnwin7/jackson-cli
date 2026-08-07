import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

const apiDirectory = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(apiDirectory, '.env.development.local') })

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

if (!databaseUrl) {
  throw new Error('POSTGRES_URL_NON_POOLING or POSTGRES_URL is required')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['jackson'],
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
})
