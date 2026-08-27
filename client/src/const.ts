import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { isSupabaseAuthConfigured, requestSupabaseMagicLink } from "@/lib/supabase";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the configured OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  if (isSupabaseAuthConfigured) {
    const email = window.prompt("Enter your email to receive a DRIFT sign-in link. Personal email is accepted; protected DRIFT roles require separate approval.");
    if (!email) return;
    requestSupabaseMagicLink(email.trim())
      .then(() => window.alert("A DRIFT sign-in link was sent. Open it in this browser to continue. New accounts remain in the public/citizen role until explicitly approved for protected work."))
      .catch(() => window.alert("The sign-in link could not be sent. Confirm the email address and try again."));
    return;
  }
  const backendOrigin = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "");
  if (backendOrigin) {
    window.location.href = `${backendOrigin}/api/oauth/start?returnTo=${encodeURIComponent(window.location.origin)}`;
    return;
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (!oauthPortalUrl || !appId) {
    console.warn("[OAuth] No external provider is configured; protected DRIFT actions are unavailable in public mode.");
    window.alert("External sign-in is not configured for this deployment. Public monitoring remains available; configure an external identity provider to use protected actions.");
    return;
  }
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};
