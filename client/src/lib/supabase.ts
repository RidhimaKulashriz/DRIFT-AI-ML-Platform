import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let browserClient: SupabaseClient | null = null;

function getBrowserClient() {
  if (!isSupabaseAuthConfigured) return null;
  if (!browserClient) browserClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return browserClient;
}

export async function getSupabaseAccessToken() {
  const client = getBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function requestSupabaseMagicLink(email: string) {
  const client = getBrowserClient();
  if (!client) throw new Error("Supabase Auth is not configured for this deployment.");
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

export async function signOutOfSupabase() {
  const client = getBrowserClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
