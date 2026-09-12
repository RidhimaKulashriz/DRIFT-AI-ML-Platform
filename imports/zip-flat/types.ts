/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export const INSPECTION_DOMAINS = [
  "roads", "bridges", "railways", "buildings", "utilities", "drainage", "pavement", "signage", "barriers", "lighting", "tunnels", "under-structure",
] as const;
export type InspectionDomain = (typeof INSPECTION_DOMAINS)[number];

export const CAPTURE_ZONES = ["above-deck", "under-bridge", "tunnel", "confined", "low-light", "oblique", "elevated-facade", "trackside"] as const;
export type CaptureZone = (typeof CAPTURE_ZONES)[number];

export const QUALITY_STATUSES = ["pending", "pass", "review", "fail"] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];
