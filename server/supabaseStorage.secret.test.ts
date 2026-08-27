import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const hasSupabaseStorageCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_EVIDENCE_BUCKET);

describe("Supabase private evidence storage configuration", () => {
  it.skipIf(!hasSupabaseStorageCredentials)("can list the configured bucket through a server-only credential without mutation", async () => {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_EVIDENCE_BUCKET;
    expect(Boolean(url && serviceRoleKey && bucket)).toBe(true);
    const client = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.storage.listBuckets();
    expect(error).toBeNull();
    expect(data?.some(candidate => candidate.name === bucket && candidate.public === false)).toBe(true);
  }, 20_000);
});
