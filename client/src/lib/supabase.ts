import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let browserClient: SupabaseClient | null = null;
let refreshInFlight: Promise<string | null> | null = null;

function getBrowserClient() {
  if (!isSupabaseAuthConfigured) return null;
  if (!browserClient) browserClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return browserClient;
}

/**
 * Reads only the untrusted exp claim to prevent sending a known-expired token.
 * Supabase remains the authority for token validity and signature verification.
 */
export function isSupabaseTokenUsable(token: string, leewaySeconds = 60) {
  try {
    const tokenPart = token.split(".")[1];
    if (!tokenPart) return false;
    const normalized = tokenPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000) + leewaySeconds;
  } catch {
    return false;
  }
}

async function clearExpiredSession(client: SupabaseClient) {
  // Do not call signOut here. Supabase emits SIGNED_OUT for signOut(), and the
  // auth hook responds by invalidating auth.me. Calling it while auth.me is
  // already being fetched creates an invalidation/request loop when no session
  // or an expired session is present. The next explicit sign-in or sign-out
  // operation can still update Supabase's session state normally.
  try {
    sessionStorage.removeItem("manus-cookie");
  } catch {
    // sessionStorage may be unavailable in a restricted browser context.
  }
}

export async function refreshSupabaseSession() {
  const client = getBrowserClient();
  if (!client) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    // Avoid calling refreshSession when there is no session. In addition to
    // being unnecessary, Supabase may emit an auth event for that call.
    const current = await client.auth.getSession();
    if (!current.data.session?.refresh_token) return null;

    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token || !isSupabaseTokenUsable(refreshed.data.session.access_token)) {
      await clearExpiredSession(client);
      return null;
    }
    return refreshed.data.session.access_token;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export function magicLinkErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalidjwt") || message.includes("exp claim") || (message.includes("jwt") && message.includes("expired"))) {
    return "Your sign-in session has expired. Sign in again to continue.";
  }
  if (message.includes("email rate") || message.includes("rate limit") || message.includes("too many")) {
    return "Supabase has temporarily limited sign-in emails. Wait at least 60 seconds before retrying. If it still fails, the project owner must configure approved transactional email delivery in Supabase.";
  }
  if (message.includes("redirect") || message.includes("url not allowed") || message.includes("site url")) {
    return "This deployment is not yet approved as a Supabase sign-in redirect. The project owner must add the current Vercel URL in Supabase Auth URL Configuration before retrying.";
  }
  if (message.includes("valid email") || message.includes("email")) {
    return "Enter a valid personal email address, then retry once. A work email is not required.";
  }
  return "Supabase could not send the sign-in link. Check the email address, wait 60 seconds, and retry once. If it still fails, the project owner must verify Supabase email delivery and approved redirect URLs.";
}

export async function getSupabaseAccessToken(forceRefresh = false) {
  const client = getBrowserClient();
  if (!client) return null;
  try {
    if (forceRefresh) return await refreshSupabaseSession();
    const sessionPromise = client.auth.getSession();
    const timeoutPromise = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 1500));
    const result = await Promise.race([sessionPromise, timeoutPromise]);
    if (!result || !("data" in result)) return null;
    const token = result.data.session?.access_token;
    if (token && isSupabaseTokenUsable(token)) return token;
    return await refreshSupabaseSession();
  } catch {
    await clearExpiredSession(client);
    return null;
  }
}

export async function requestSupabaseMagicLink(email: string) {
  if (!emailPattern.test(email)) throw new Error("Enter a valid personal email address.");
  const client = getBrowserClient();
  if (!client) throw new Error("Supabase Auth is not configured for this deployment.");
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

export function onSupabaseAuthStateChange(callback: (event: string) => void) {
  const client = getBrowserClient();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((event) => callback(event));
  return () => data.subscription.unsubscribe();
}

export async function signOutOfSupabase() {
  const client = getBrowserClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
