import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { account, session, user, verification } from "./auth-schema.js";

describe("Better Auth Drizzle schema metadata", () => {
  it("defines the core tables in the private jackson schema", () => {
    const configs = [user, session, account, verification].map(getTableConfig);

    expect(configs.map(({ name }) => name)).toEqual([
      "user",
      "session",
      "account",
      "verification",
    ]);
    for (const config of configs) {
      expect(config.schema).toBe("jackson");
    }
  });

  it("keeps Better Auth identities separate from legacy CLI users", () => {
    expect(getTableConfig(user).name).toBe("user");
    expect(getTableConfig(user).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["email", "email_verified"]),
    );
    expect(getTableConfig(user).columns.map(({ name }) => name)).not.toContain(
      "token_hash",
    );
  });
});
