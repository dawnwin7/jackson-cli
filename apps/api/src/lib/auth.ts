import { dash } from "@better-auth/infra";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

import * as authSchema from "../db/auth-schema.js";
import type { JacksonDatabase } from "../db/client.js";
import { db } from "../db/runtime.js";

export function createAuth(database: JacksonDatabase) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
      schemaName: "jackson",
      transaction: true,
    }),
    plugins: [dash()],
  });
}

export const auth = createAuth(db);
