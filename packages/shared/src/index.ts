import type { BomItem, Configuration, Dimensions } from '@varyform/domain'

export type { BomItem, Configuration, Dimensions }

export interface CreateProjectRequest {
  configuration: Configuration
  projectName?: string
}

export interface UpdateProjectRequest extends CreateProjectRequest {
  editToken: string
}

export interface ProjectResponse {
  id: string
  projectName: string | null
  configuration: Configuration
  price: number
  bom: BomItem[]
  dimensions: Dimensions
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface CreatedProjectResponse extends ProjectResponse {
  editToken: string
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}
