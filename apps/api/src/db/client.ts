import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type JacksonDatabase = PostgresJsDatabase<typeof schema>;

export function normalizePostgresConnectionString(
  connectionString: string,
): string {
  if (!connectionString.includes("postgres:postgres@supabase_db_")) {
    return connectionString;
  }

  const url = new URL(connectionString);
  url.hostname = url.hostname.split("_")[1];
  return url.href;
}

export function createDatabase(connectionString = process.env.POSTGRES_URL) {
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required");
  }

  const client = postgres(normalizePostgresConnectionString(connectionString), {
    prepare: false,
  });
  const db: JacksonDatabase = drizzle(client, { schema });

  return { client, db };
}
