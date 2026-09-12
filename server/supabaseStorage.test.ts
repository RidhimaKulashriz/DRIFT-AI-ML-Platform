import { describe, expect, it } from "vitest";
import { isSupabaseStorageKey, supabasePortableStorageConfigured } from "./services/supabaseStorage";

describe("Supabase portable evidence storage activation", () => {
  it("recognizes only opaque Supabase-backed storage references", () => {
    expect(isSupabaseStorageKey("supabase://drift-evidence/drift/1/frame.jpg")).toBe(true);
    expect(isSupabaseStorageKey("/manus-storage/drift/1/frame.jpg")).toBe(false);
  });

  it("remains fail-closed until a server-side enablement flag is set", () => {
    const original = process.env.DRIFT_SUPABASE_STORAGE_ENABLED;
    delete process.env.DRIFT_SUPABASE_STORAGE_ENABLED;
    expect(supabasePortableStorageConfigured()).toBe(false);
    if (original === undefined) delete process.env.DRIFT_SUPABASE_STORAGE_ENABLED;
    else process.env.DRIFT_SUPABASE_STORAGE_ENABLED = original;
  });
});
