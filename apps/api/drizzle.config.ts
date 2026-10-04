import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv({ path: resolve(process.cwd(), '../../.env') })

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://varyform@localhost:5432/varyform',
  },
})
