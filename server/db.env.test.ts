import { describe, expect, it } from "vitest";
import { buildDatabaseConfig } from "./db";

describe("database bootstrap", () => {
  it("enables SSL for Render Postgres URLs", () => {
    const config = buildDatabaseConfig("postgresql://user:pass@dpg-example-a.oregon-postgres.render.com/drift_db");

    expect(config.connectionString).toBe("postgresql://user:pass@dpg-example-a.oregon-postgres.render.com/drift_db");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("accepts postgres:// URLs as valid database config", () => {
    const config = buildDatabaseConfig("postgres://user:pass@localhost:5432/drift");

    expect(config.connectionString).toBe("postgres://user:pass@localhost:5432/drift");
    expect(config.ssl).toBeUndefined();
  });
});
