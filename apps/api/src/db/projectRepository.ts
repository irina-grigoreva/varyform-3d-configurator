import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ProjectRepository } from '../services/projectRepository.js'
import { projects } from './schema.js'
import type * as schema from './schema.js'

type Database = NodePgDatabase<typeof schema>

export function createProjectRepository(db: Database): ProjectRepository {
  return {
    async create(publicId, data) {
      const [project] = await db.insert(projects).values({ publicId, ...data }).returning()
      if (!project) throw new Error('Project insert returned no row')
      return project
    },
    async findByPublicId(publicId) {
      const [project] = await db.select().from(projects).where(eq(projects.publicId, publicId))
      return project
    },
    async update(publicId, data) {
      const [project] = await db.update(projects)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(projects.publicId, publicId))
        .returning()
      return project
    },
  }
}
