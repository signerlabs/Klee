import { drizzle } from "drizzle-orm/node-postgres"
import { drizzle as supaBaseDrizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

interface DbClientMap {
  production: PostgresJsDatabase
  development: NodePgDatabase
}

let dbClient: DbClientMap[keyof DbClientMap]

const getDbConnection = () => {
  if (!dbClient && process.env.APP_ENV === "production") {
    const client = postgres(process.env.DATABASE_URL!, {
      prepare: false,
    })
    dbClient = supaBaseDrizzle(client)
  }

  if (!dbClient && process.env.APP_ENV === "development") {
    dbClient = drizzle(process.env.DATABASE_URL!)
  }

  return dbClient
}

export const db = getDbConnection()
