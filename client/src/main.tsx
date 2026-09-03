import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from '@shared/const';
import { getBackendOrigin } from "@/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getSupabaseAccessToken, isSupabaseTokenUsable } from "./lib/supabase";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (_error: unknown) => {
  // Public demo mode must not redirect to an unconfigured external OAuth provider.
  // Protected mutations remain protected and surface their typed authorization error.
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const backendOrigin = getBackendOrigin();

async function authHeaders(forceRefresh = false) {
  const supabaseToken = await getSupabaseAccessToken(forceRefresh);
  if (supabaseToken) return { Authorization: `Bearer ${supabaseToken}` };

  // Preview auto-login fallback: when the browser blocks iframe cookies
  // (Safari ITP / private browsing / WebView), the runtime mirrors the
  // session into sessionStorage so we can forward it as a Bearer token.
  // Never forward this fallback once its exp claim has elapsed.
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    if (raw) {
      const prefix = `${COOKIE_NAME}=`;
      const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
      const token = pair?.trim().slice(prefix.length);
      if (token && isSupabaseTokenUsable(token)) return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // sessionStorage unavailable
  }
  return {};
}

function isExpiredJwtResponse(response: Response) {
  if (response.status !== 400 && response.status !== 401) return Promise.resolve(false);
  return response.clone().text().then(body => /InvalidJWT|exp claim|JWT.*expired|token.*expired/i.test(body)).catch(() => false);
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: backendOrigin ? `${backendOrigin}/api/trpc` : "/api/trpc",
      transformer: superjson,
      headers: () => authHeaders(),
      async fetch(input, init) {
        const requestInit = { ...(init ?? {}), credentials: "include" as const };
        const firstHeaders = new Headers(requestInit.headers);
        Object.assign(firstHeaders, await authHeaders());
        const firstResponse = await globalThis.fetch(input, { ...requestInit, headers: firstHeaders });
        if (!(await isExpiredJwtResponse(firstResponse))) return firstResponse;

        // A token can expire between header creation and the server check.
        // Refresh once and replay the same tRPC request; never loop retries.
        const refreshedHeaders = new Headers(requestInit.headers);
        Object.assign(refreshedHeaders, await authHeaders(true));
        return globalThis.fetch(input, { ...requestInit, headers: refreshedHeaders });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
