import { createClient } from "@supabase/supabase-js";

export type SupabaseIdentity = {
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: "supabase";
};

function configuration() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

export function supabaseAuthConfigured() {
  return Boolean(configuration());
}

export function toSupabaseIdentity(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): SupabaseIdentity {
  const fullName = user.user_metadata?.full_name;
  const displayName = user.user_metadata?.name;
  return {
    openId: `supabase:${user.id}`,
    name: typeof fullName === "string" ? fullName.slice(0, 300) : typeof displayName === "string" ? displayName.slice(0, 300) : null,
    email: user.email?.slice(0, 320) ?? null,
    loginMethod: "supabase",
  };
}

export async function verifySupabaseBearerToken(token: string | undefined): Promise<SupabaseIdentity | null> {
  const config = configuration();
  if (!config || !token) return null;
  const client = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return toSupabaseIdentity(data.user);
}
