import { integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { Configuration } from '@varyform/domain'

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  publicId: varchar('public_id', { length: 40 }).notNull().unique(),
  configuration: jsonb('configuration').$type<Configuration>().notNull(),
  calculatedPrice: integer('calculated_price').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  projectName: varchar('project_name', { length: 100 }),
  editTokenHash: varchar('edit_token_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ProjectRow = typeof projects.$inferSelect
export type NewProjectRow = typeof projects.$inferInsert
