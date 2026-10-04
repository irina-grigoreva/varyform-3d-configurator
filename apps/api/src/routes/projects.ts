import type { FastifyInstance } from 'fastify'
import type { CreatedProjectResponse, ProjectResponse } from '@varyform/shared'
import type { ProjectRepository } from '../services/projectRepository.js'
import { createProjectService } from '../services/projectService.js'

const createBodySchema = {
  type: 'object',
  required: ['configuration'],
  additionalProperties: false,
  properties: {
    configuration: { type: 'object', additionalProperties: true },
    projectName: { type: 'string', maxLength: 100 },
  },
} as const

const updateBodySchema = {
  type: 'object',
  required: ['configuration', 'editToken'],
  additionalProperties: false,
  properties: {
    configuration: { type: 'object', additionalProperties: true },
    projectName: { type: 'string', maxLength: 100 },
    editToken: { type: 'string' },
  },
} as const

export async function registerProjectRoutes(
  app: FastifyInstance,
  repository: ProjectRepository,
): Promise<void> {
  const service = createProjectService(repository)
  const rateLimit = { max: 12, timeWindow: '1 minute' }

  app.post<{ Body: unknown; Reply: CreatedProjectResponse }>(
    '/projects',
    { schema: { body: createBodySchema }, config: { rateLimit } },
    async (request, reply) => reply.code(201).send(await service.create(request.body)),
  )

  app.get<{ Params: { id: string }; Reply: ProjectResponse }>(
    '/projects/:id',
    async (request) => service.get(request.params.id),
  )

  app.put<{ Params: { id: string }; Body: unknown; Reply: ProjectResponse }>(
    '/projects/:id',
    { schema: { body: updateBodySchema }, config: { rateLimit } },
    async (request) => {
      const body = request.body
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return service.update(request.params.id, '', body)
      }
      const payload = body as Record<string, unknown>
      const projectInput = {
        configuration: payload.configuration,
        projectName: payload.projectName,
      }
      return service.update(
        request.params.id,
        typeof payload.editToken === 'string' ? payload.editToken : '',
        projectInput,
      )
    },
  )
}
