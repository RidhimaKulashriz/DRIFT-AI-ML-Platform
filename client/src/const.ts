import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { isSupabaseAuthConfigured, magicLinkErrorMessage, requestSupabaseMagicLink } from "@/lib/supabase";

export { COOKIE_NAME, ONE_YEAR_MS } from '@shared/const';

// External hosting builds the frontend on Vercel and the API on Render. Keep local
// development same-origin, while making a production build usable even when the
// Vercel environment variable was omitted during deployment.
export const DEFAULT_BACKEND_ORIGIN = "https://drift-node-api.onrender.com";
export const getBackendOrigin = () =>
  (import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname.endsWith(".manus.computer") ? "" : (import.meta.env.PROD ? DEFAULT_BACKEND_ORIGIN : ""))).replace(/\/$/, "");

// Start the configured login flow. Supabase is preferred because it does not depend
// on the external Manus OAuth portal. The legacy external OAuth path is opt-in via
// VITE_EXTERNAL_OAUTH_ENABLED so a public Vercel build never redirects to an
// unconfigured Render OAuth endpoint.
export const startLogin = () => {
  if (isSupabaseAuthConfigured) {
    const email = window.prompt("Enter your email to receive a DRIFT sign-in link. Personal email is accepted; protected DRIFT roles require separate approval.");
    if (!email) return;
    requestSupabaseMagicLink(email.trim())
      .then(() => window.alert("A DRIFT sign-in link was sent. Open it in this browser to continue. New accounts remain in the public/citizen role until explicitly approved for protected work."))
      .catch(error => window.alert(magicLinkErrorMessage(error)));
    return;
  }

  const externalOAuthEnabled = import.meta.env.VITE_EXTERNAL_OAUTH_ENABLED === "true";
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!externalOAuthEnabled || !oauthPortalUrl || !appId) {
    console.warn("[OAuth] No login provider is configured; public DRIFT monitoring remains available and protected actions stay disabled.");
    window.alert("DRIFT is running in public monitoring mode. Sign-in is not configured for this deployment yet.");
    return;
  }

  const backendOrigin = getBackendOrigin();
  if (backendOrigin) {
    window.location.href = `${backendOrigin}/api/oauth/start?returnTo=${encodeURIComponent(window.location.origin)}`;
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
