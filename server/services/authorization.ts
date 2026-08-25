import { TRPCError } from "@trpc/server";

export type DriftRole = "admin" | "engineer" | "citizen" | "user";

export function requireDriftRole(user: { role: DriftRole } | null | undefined, allowed: DriftRole[]) {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to perform this operational action." });
  if (!allowed.includes(user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Your assigned role does not permit this operational action." });
}

export function canReview(user: { role: DriftRole } | null | undefined) {
  return Boolean(user && ["admin", "engineer", "user"].includes(user.role));
}
