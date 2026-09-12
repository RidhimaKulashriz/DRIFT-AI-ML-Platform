import { afterEach, describe, expect, it } from "vitest";
import { CAMPUS_SITES } from "@shared/campusSites";
import { getReportDeliveryReadiness } from "./services/reportDelivery";

const originalRecipients = process.env.DRIFT_REPORT_RECIPIENTS_JSON;
const originalResendKey = process.env.RESEND_API_KEY;
const originalFromEmail = process.env.DRIFT_REPORT_FROM_EMAIL;

afterEach(() => {
  if (originalRecipients === undefined) delete process.env.DRIFT_REPORT_RECIPIENTS_JSON;
  else process.env.DRIFT_REPORT_RECIPIENTS_JSON = originalRecipients;
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  if (originalFromEmail === undefined) delete process.env.DRIFT_REPORT_FROM_EMAIL;
  else process.env.DRIFT_REPORT_FROM_EMAIL = originalFromEmail;
});

describe("live pipeline readiness contracts", () => {
  it("keeps IIIT Delhi and IGDTUW as distinct verified public references", () => {
    expect(CAMPUS_SITES.map(site => site.id)).toEqual(["iiit-delhi", "igdtuw"]);
    expect(new Set(CAMPUS_SITES.map(site => `${site.latitude},${site.longitude}`)).size).toBe(2);
    for (const site of CAMPUS_SITES) {
      expect(site.sourceUrl).toMatch(/^https:\/\//);
      expect(site.latitude).toBeGreaterThan(28);
      expect(site.latitude).toBeLessThan(29);
      expect(site.longitude).toBeGreaterThan(77);
      expect(site.longitude).toBeLessThan(78);
    }
  });

  it("does not claim email readiness without a provider", () => {
    process.env.DRIFT_REPORT_RECIPIENTS_JSON = JSON.stringify([
      { id: "iiit-delhi", email: "recipient-one@example.com" },
      { id: "igdtuw", email: "recipient-two@example.com" },
    ]);
    delete process.env.RESEND_API_KEY;
    delete process.env.DRIFT_REPORT_FROM_EMAIL;
    const readiness = getReportDeliveryReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.provider).toBe("not-configured");
    expect(readiness.recipients.every(recipient => recipient.maskedEmail && !recipient.maskedEmail.includes("recipient-"))).toBe(true);
  });

  it("reports ready only when provider and both campus recipients exist", () => {
    process.env.DRIFT_REPORT_RECIPIENTS_JSON = JSON.stringify([
      { id: "iiit-delhi", email: "recipient-one@example.com" },
      { id: "igdtuw", email: "recipient-two@example.com" },
    ]);
    process.env.RESEND_API_KEY = "test-only-key";
    process.env.DRIFT_REPORT_FROM_EMAIL = "reports@example.com";
    const readiness = getReportDeliveryReadiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.provider).toBe("resend");
    expect(readiness.recipients).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "iiit-delhi", configured: true }),
      expect.objectContaining({ id: "igdtuw", configured: true }),
    ]));
  });
});
