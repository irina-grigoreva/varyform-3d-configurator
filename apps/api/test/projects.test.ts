import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  calculateBom,
  calculateParts,
  calculatePrice,
  DEFAULT_CONFIGURATION,
  type Configuration,
} from '@varyform/domain'
import type { CreatedProjectResponse, ProjectResponse } from '@varyform/shared'
import type { ProjectRow } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { ProjectData, ProjectRepository } from '../src/services/projectRepository.js'

class MemoryProjectRepository implements ProjectRepository {
  private nextId = 1
  private readonly projects = new Map<string, ProjectRow>()

  async create(publicId: string, data: ProjectData): Promise<ProjectRow> {
    const now = new Date()
    const project: ProjectRow = {
      id: this.nextId++,
      publicId,
      configuration: data.configuration,
      calculatedPrice: data.calculatedPrice,
      schemaVersion: data.schemaVersion,
      projectName: data.projectName,
      editTokenHash: data.editTokenHash,
      createdAt: now,
      updatedAt: now,
    }
    this.projects.set(publicId, project)
    return project
  }

  async findByPublicId(publicId: string): Promise<ProjectRow | undefined> {
    return this.projects.get(publicId)
  }

  async update(
    publicId: string,
    data: Omit<ProjectData, 'editTokenHash'>,
  ): Promise<ProjectRow | undefined> {
    const previous = this.projects.get(publicId)
    if (!previous) return undefined
    const updated: ProjectRow = { ...previous, ...data, updatedAt: new Date() }
    this.projects.set(publicId, updated)
    return updated
  }

  setStoredPrice(publicId: string, calculatedPrice: number): void {
    const project = this.projects.get(publicId)
    if (!project) throw new Error('Test project not found')
    this.projects.set(publicId, { ...project, calculatedPrice })
  }
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function createTestApp(repository = new MemoryProjectRepository()) {
  const app = await buildApp({ repository })
  apps.push(app)
  return app
}

async function postProject(
  app: Awaited<ReturnType<typeof buildApp>>,
  configuration: Configuration = { ...DEFAULT_CONFIGURATION },
) {
  return app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { configuration, projectName: 'Living Room Shelving' },
  })
}

test('POST creates a public project with server-calculated price and BOM', async () => {
  const app = await createTestApp()
  const response = await postProject(app)
  assert.equal(response.statusCode, 201)
  const body = response.json<CreatedProjectResponse>()
  const parts = calculateParts(body.configuration)
  assert.match(body.id, /^VRF-[A-F0-9]{32}$/u)
  assert.equal(body.projectName, 'Living Room Shelving')
  assert.equal(body.price, calculatePrice(body.configuration, parts).total)
  assert.deepEqual(body.bom, calculateBom(parts))
  assert.equal(body.dimensions.width, body.configuration.width)
  assert.equal(body.editToken.length, 64)
})

test('POST rejects invalid domain configuration', async () => {
  const app = await createTestApp()
  const response = await postProject(app, { ...DEFAULT_CONFIGURATION, width: 600, sections: 5 })
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().error.code, 'INVALID_CONFIGURATION')
})

test('POST rejects malformed and extra configuration properties', async () => {
  const app = await createTestApp()
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { configuration: { ...DEFAULT_CONFIGURATION, calculatedPrice: 1 } },
  })
  assert.equal(response.statusCode, 400)
})

test('POST rejects client-supplied calculated price instead of trusting it', async () => {
  const app = await createTestApp()
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: {
      configuration: DEFAULT_CONFIGURATION,
      price: 1,
      bom: [],
      dimensions: { width: 1, height: 1, depth: 1 },
    },
  })
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().error.code, 'INVALID_CONFIGURATION')
})

test('GET returns the saved project and never exposes edit token', async () => {
  const repository = new MemoryProjectRepository()
  const app = await createTestApp(repository)
  const created = (await postProject(app)).json<CreatedProjectResponse>()
  repository.setStoredPrice(created.id, -999)
  const response = await app.inject({ method: 'GET', url: `/api/projects/${created.id}` })
  assert.equal(response.statusCode, 200)
  const project = response.json<ProjectResponse>()
  assert.deepEqual(project.configuration, created.configuration)
  assert.deepEqual(project.bom, created.bom)
  assert.equal(project.price, calculatePrice(created.configuration).total)
  assert.notEqual(project.price, -999)
  assert.equal('editToken' in project, false)
})

test('GET returns a consistent 404 response for an unknown public id', async () => {
  const app = await createTestApp()
  const response = await app.inject({ method: 'GET', url: '/api/projects/VRF-NOTFOUND' })
  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), {
    error: { code: 'PROJECT_NOT_FOUND', message: 'Project was not found.' },
  })

})

test('PUT updates configuration with a valid edit token', async () => {
  const app = await createTestApp()
  const created = (await postProject(app)).json<CreatedProjectResponse>()
  const configuration = { ...created.configuration, width: 1800, sections: 2 }
  const response = await app.inject({
    method: 'PUT',
    url: `/api/projects/${created.id}`,
    payload: { configuration, projectName: 'Updated shelving', editToken: created.editToken },
  })
  assert.equal(response.statusCode, 200)
  const updated = response.json<ProjectResponse>()
  assert.equal(updated.configuration.width, 1800)
  assert.equal(updated.projectName, 'Updated shelving')
  assert.equal(updated.createdAt, created.createdAt)
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt))
})

test('PUT rejects an invalid edit token without disclosing project data', async () => {
  const app = await createTestApp()
  const created = (await postProject(app)).json<CreatedProjectResponse>()
  const response = await app.inject({
    method: 'PUT',
    url: `/api/projects/${created.id}`,
    payload: {
      configuration: created.configuration,
      editToken: 'wrong-token',
    },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error.code, 'INVALID_EDIT_TOKEN')
})

test('boundary configuration remains valid and all dimensions are server calculated', async () => {
  const app = await createTestApp()
  const configuration: Configuration = {
    ...DEFAULT_CONFIGURATION,
    width: 2400,
    height: 2400,
    depth: 600,
    sections: 1,
    shelves: 8,
    materialThickness: 25,
    backPanel: false,
    legs: 'none',
  }
  const response = await postProject(app, configuration)
  assert.equal(response.statusCode, 201)
  const project = response.json<ProjectResponse>()
  assert.deepEqual(project.dimensions, { width: 2400, height: 2400, depth: 600 })
  assert.equal(project.bom.length > 0, true)
  assert.equal(project.price, calculatePrice(configuration).total)
})

test('oversized bodies return 413 without internal details', async () => {
  const app = await createTestApp()
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ configuration: { padding: 'x'.repeat(20 * 1024) } }),
  })
  assert.equal(response.statusCode, 413)
  assert.deepEqual(response.json(), {
    error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
  })
})

test('write rate limit returns 429 instead of a server error', async () => {
  const app = await createTestApp()
  const statuses: number[] = []
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/projects/VRF-00000000000000000000000000000000',
      payload: { configuration: { ...DEFAULT_CONFIGURATION }, editToken: 'x' },
    })
    statuses.push(response.statusCode)
  }
  assert.deepEqual(statuses.slice(0, 12), Array(12).fill(404))
  assert.equal(statuses[12], 429)
})

test('unknown routes use the safe JSON error shape', async () => {
  const app = await createTestApp()
  const response = await app.inject({ method: 'GET', url: '/api/unknown' })
  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), { error: { code: 'NOT_FOUND', message: 'Resource was not found.' } })
})

test('CORS allows only configured origins from a comma-separated list', async () => {
  const app = await buildApp({
    repository: new MemoryProjectRepository(),
    webOrigin: 'https://varyform.example, https://preview.varyform.example/',
  })
  apps.push(app)
  const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://preview.varyform.example' } })
  const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://attacker.example' } })
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://preview.varyform.example')
  assert.equal(denied.headers['access-control-allow-origin'], undefined)
})

test('unexpected repository failures return a generic 500 without stack or message', async () => {
  const repository = new MemoryProjectRepository()
  repository.findByPublicId = async () => {
    throw new Error('connect ECONNREFUSED postgres://secret@db:5432')
  }
  const app = await createTestApp(repository)
  const response = await app.inject({ method: 'GET', url: '/api/projects/VRF-00000000000000000000000000000000' })
  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
  })
  assert.equal(response.body.includes('ECONNREFUSED'), false)
})

test('legacy MDL- project IDs created before the VARYFORM rename remain readable', async () => {
  const repository = new MemoryProjectRepository()
  const app = await createTestApp(repository)
  const created = (await postProject(app)).json<CreatedProjectResponse>()
  const stored = await repository.findByPublicId(created.id)
  if (!stored) throw new Error('Test project not found')
  const legacyId = created.id.replace(/^VRF-/u, 'MDL-')
  await repository.create(legacyId, { ...stored, editTokenHash: stored.editTokenHash })
  const response = await app.inject({ method: 'GET', url: `/api/projects/${legacyId}` })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json<ProjectResponse>().id, legacyId)
})
