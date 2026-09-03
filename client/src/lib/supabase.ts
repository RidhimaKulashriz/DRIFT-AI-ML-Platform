import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let browserClient: SupabaseClient | null = null;

function getBrowserClient() {
  if (!isSupabaseAuthConfigured) return null;
  if (!browserClient) browserClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return browserClient;
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

export async function getSupabaseAccessToken() {
  const client = getBrowserClient();
  if (!client) return null;
  try {
    const sessionPromise = client.auth.getSession();
    const timeoutPromise = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 1500));
    const result = await Promise.race([sessionPromise, timeoutPromise]);
    if (!result || !("data" in result)) return null;
    const session = result.data.session;
    if (!session?.access_token) return null;

    // A tab can retain an old session while auto-refresh is paused. Decode only
    // the untrusted expiry claim locally; Supabase remains the authority.
    const tokenPart = session.access_token.split(".")[1];
    let expiresSoon = false;
    if (tokenPart) {
      try {
        const payload = JSON.parse(atob(tokenPart.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
        expiresSoon = typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000) + 60;
      } catch {
        expiresSoon = true;
      }
    }
    if (!expiresSoon) return session.access_token;

    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token) {
      await client.auth.signOut().catch(() => undefined);
      return null;
    }
    return refreshed.data.session.access_token;
  } catch {
    await client.auth.signOut().catch(() => undefined);
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

export async function signOutOfSupabase() {
  const client = getBrowserClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
