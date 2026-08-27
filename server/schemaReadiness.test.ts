import { describe, expect, it } from "vitest";
import { summarizeReadOnlySchemaReadiness } from "./db";

describe("read-only PostgreSQL schema readiness", () => {
  it("reports accountability, contractor/UAV, and security gaps without attempting a database mutation", () => {
    const readiness = summarizeReadOnlySchemaReadiness(
      ["assets", "missions", "telemetry", "evidence", "defects", "reports", "alerts", "auditEvents"],
      { present: true, appliedCount: 1 },
    );

    expect(readiness.queryMode).toBe("read_only");
    expect(readiness.groups.core.ready).toBe(true);
    expect(readiness.groups.accountability.ready).toBe(false);
    expect(readiness.groups.accountability.missing).toContain("contractorTickets");
    expect(readiness.groups.contractorAndUav.missing).toContain("uavFollowUpRecommendations");
    expect(readiness.groups.security.missing).toEqual(["securityObservations"]);
    expect(readiness.safeToApplyLaterMigrations).toBe(true);
  });

  it("does not describe later migration application as safe without a migration journal", () => {
    const readiness = summarizeReadOnlySchemaReadiness(
      ["assets", "missions", "telemetry", "evidence", "defects", "reports", "alerts", "auditEvents"],
      { present: false, appliedCount: null },
    );

    expect(readiness.safeToApplyLaterMigrations).toBe(false);
  });
});
