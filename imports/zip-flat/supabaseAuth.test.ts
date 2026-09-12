import { describe, expect, it } from "vitest";
import { toSupabaseIdentity } from "./services/supabaseAuth";

describe("Supabase identity mapping", () => {
  it("creates a stable external identity key while preserving approved profile fields", () => {
    expect(toSupabaseIdentity({ id: "11111111-2222-3333-4444-555555555555", email: "engineer@example.com", user_metadata: { full_name: "Approved Engineer" } })).toEqual({
      openId: "supabase:11111111-2222-3333-4444-555555555555",
      name: "Approved Engineer",
      email: "engineer@example.com",
      loginMethod: "supabase",
    });
  });

  it("does not infer a privileged DRIFT role from Supabase metadata", () => {
    expect(toSupabaseIdentity({ id: "abc", user_metadata: { role: "admin", name: "Unapproved user" } })).not.toHaveProperty("role");
  });
});
