import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl })
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  }
}
