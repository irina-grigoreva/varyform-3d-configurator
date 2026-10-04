import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { buildApp } from './app.js'
import { createDatabase } from './db/client.js'
import { createProjectRepository } from './db/projectRepository.js'

loadEnv({ path: resolve(process.cwd(), '../../.env') })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure it.')

const production = process.env.NODE_ENV === 'production'
const { db, close } = createDatabase(databaseUrl)
const app = await buildApp({
  repository: createProjectRepository(db),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  // Default request logs contain method/URL/IP only; bodies (and edit tokens) are never logged.
  logger: {
    level: process.env.LOG_LEVEL || (production ? 'info' : 'debug'),
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.editToken', 'editToken'],
  },
  // TRUST_PROXY=true behind a managed proxy (Render/Railway/Fly), or a comma-separated IP/CIDR list.
  trustProxy: !process.env.TRUST_PROXY || process.env.TRUST_PROXY === 'false'
    ? false
    : process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY.split(',').map((entry) => entry.trim()),
})

// Hosting platforms (Render, Railway, Fly.io) inject PORT; API_PORT wins when both are set.
const port = Number(process.env.API_PORT || process.env.PORT || '3001')
await app.listen({ host: process.env.API_HOST ?? '0.0.0.0', port })

const shutdown = async () => {
  await app.close()
  await close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
