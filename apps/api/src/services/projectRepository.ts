import type { Configuration } from '@varyform/domain'
import type { ProjectRow } from '../db/schema.js'

export interface ProjectData {
  configuration: Configuration
  calculatedPrice: number
  schemaVersion: number
  projectName: string | null
  editTokenHash: string
}

export interface ProjectRepository {
  create(publicId: string, data: ProjectData): Promise<ProjectRow>
  findByPublicId(publicId: string): Promise<ProjectRow | undefined>
  update(publicId: string, data: Omit<ProjectData, 'editTokenHash'>): Promise<ProjectRow | undefined>
}
