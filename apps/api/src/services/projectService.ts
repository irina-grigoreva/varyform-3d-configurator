import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  calculateBom,
  calculateBoundingDimensions,
  calculateParts,
  calculatePrice,
  isConfiguration,
  validateConfiguration,
  type Configuration,
} from '@varyform/domain'
import type { CreatedProjectResponse, ProjectResponse } from '@varyform/shared'
import type { ProjectRow } from '../db/schema.js'
import type { ProjectData, ProjectRepository } from './projectRepository.js'

const SCHEMA_VERSION = 1
const PUBLIC_ID_PREFIX = 'VRF-'

export class ProjectError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ProjectError'
  }
}

function failConfiguration(message: string): never {
  throw new ProjectError(400, 'INVALID_CONFIGURATION', message)
}

function parseProjectInput(value: unknown): { configuration: Configuration; projectName: string | null } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failConfiguration('Request body must be an object.')
  }
  const body = value as Record<string, unknown>
  if (!isConfiguration(body.configuration)) {
    failConfiguration('Configuration is missing or malformed.')
  }
  const issues = validateConfiguration(body.configuration)
  if (issues.length > 0) {
    failConfiguration(issues.map((issue) => issue.message).join('; '))
  }

  let projectName: string | null = null
  if (body.projectName !== undefined) {
    if (typeof body.projectName !== 'string' || body.projectName.length > 100) {
      throw new ProjectError(400, 'INVALID_PROJECT_NAME', 'Project name must be 100 characters or fewer.')
    }
    const normalized = body.projectName.trim()
    if (containsControlCharacter(normalized)) {
      throw new ProjectError(400, 'INVALID_PROJECT_NAME', 'Project name must not contain control characters.')
    }
    projectName = normalized || null
  }

  return { configuration: body.configuration, projectName }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127) return true
  }
  return false
}

function matchesToken(provided: string, storedHash: string): boolean {
  const actual = Buffer.from(tokenHash(provided), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function calculateProjectResponse(project: ProjectRow): ProjectResponse {
  if (!isConfiguration(project.configuration)) {
    throw new Error(`Stored configuration for ${project.publicId} is invalid`)
  }
  const issues = validateConfiguration(project.configuration)
  if (issues.length > 0) {
    throw new Error(`Stored configuration for ${project.publicId} no longer validates`)
  }
  const parts = calculateParts(project.configuration)
  return {
    id: project.publicId,
    projectName: project.projectName,
    configuration: project.configuration,
    price: calculatePrice(project.configuration, parts).total,
    bom: calculateBom(parts),
    dimensions: calculateBoundingDimensions(project.configuration),
    schemaVersion: project.schemaVersion,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

function createProjectData(
  configuration: Configuration,
  projectName: string | null,
  editTokenHash: string,
): ProjectData {
  const parts = calculateParts(configuration)
  return {
    configuration,
    calculatedPrice: calculatePrice(configuration, parts).total,
    schemaVersion: SCHEMA_VERSION,
    projectName,
    editTokenHash,
  }
}

export function createProjectService(repository: ProjectRepository) {
  return {
    async create(value: unknown): Promise<CreatedProjectResponse> {
      const { configuration, projectName } = parseProjectInput(value)
      const editToken = randomBytes(32).toString('hex')
      const project = await repository.create(
        `${PUBLIC_ID_PREFIX}${randomUUID().replaceAll('-', '').toUpperCase()}`,
        createProjectData(configuration, projectName, tokenHash(editToken)),
      )
      return { ...calculateProjectResponse(project), editToken }
    },

    async get(publicId: string): Promise<ProjectResponse> {
      const project = await repository.findByPublicId(publicId)
      if (!project) throw new ProjectError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
      return calculateProjectResponse(project)
    },

    async update(publicId: string, editToken: string, value: unknown): Promise<ProjectResponse> {
      const project = await repository.findByPublicId(publicId)
      if (!project) throw new ProjectError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
      if (!matchesToken(editToken, project.editTokenHash)) {
        throw new ProjectError(403, 'INVALID_EDIT_TOKEN', 'The edit token is invalid.')
      }
      const { configuration, projectName } = parseProjectInput(value)
      const { editTokenHash: _editTokenHash, ...updateData } = createProjectData(
        configuration,
        projectName,
        project.editTokenHash,
      )
      const updated = await repository.update(
        publicId,
        updateData,
      )
      if (!updated) throw new ProjectError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
      return calculateProjectResponse(updated)
    },
  }
}
