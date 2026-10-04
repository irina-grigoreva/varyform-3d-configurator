import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify'
import { ProjectError } from './services/projectService.js'
import { registerProjectRoutes } from './routes/projects.js'
import type { ProjectRepository } from './services/projectRepository.js'

export interface AppOptions {
  repository: ProjectRepository
  /** One origin or a comma-separated list of allowed browser origins. */
  webOrigin?: string
  logger?: FastifyServerOptions['logger']
  /** Trust X-Forwarded-* from the hosting proxy so rate limits see client IPs. */
  trustProxy?: FastifyServerOptions['trustProxy']
}

/** Safe, client-facing messages for framework errors (body limit, rate limit, ...). */
const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request content type is not supported.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
}

export function parseOrigins(value: string | undefined): string[] {
  const origins = (value ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/u, ''))
    .filter(Boolean)
  return origins.length > 0 ? origins : ['http://localhost:3000']
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await app.register(cors, {
    origin: parseOrigins(options.webOrigin),
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  })
  await app.register(rateLimit, { global: false })

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ProjectError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }
    if (error.validation || error.statusCode === 400) {
      return reply.code(400).send({
        error: { code: 'INVALID_CONFIGURATION', message: 'Request body is invalid.' },
      })
    }
    const status = error.statusCode ?? 500
    if (status >= 400 && status < 500) {
      // Client errors keep their status but never echo framework/internal details.
      return reply.code(status).send({
        error: CLIENT_ERRORS[status] ?? { code: 'BAD_REQUEST', message: 'The request could not be processed.' },
      })
    }
    app.log.error(error)
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
    })
  })

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({
    error: { code: 'NOT_FOUND', message: 'Resource was not found.' },
  }))

  app.get('/health', async () => ({ status: 'ok' }))
  await app.register(async (api) => registerProjectRoutes(api, options.repository), { prefix: '/api' })
  return app
}
