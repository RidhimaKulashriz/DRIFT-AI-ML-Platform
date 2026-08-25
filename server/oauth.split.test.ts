import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOAuthRoutes } from "./_core/oauth";

function registeredStartHandler() {
  let handler: any;
  const app = { get: vi.fn((path: string, callback: any) => { if (path === "/api/oauth/start") handler = callback; }) };
  registerOAuthRoutes(app as any);
  return handler;
}

const original = { portal: process.env.VITE_OAUTH_PORTAL_URL, appId: process.env.VITE_APP_ID, frontend: process.env.FRONTEND_APP_URL };
afterEach(() => {
  process.env.VITE_OAUTH_PORTAL_URL = original.portal;
  process.env.VITE_APP_ID = original.appId;
  process.env.FRONTEND_APP_URL = original.frontend;
});

describe("split-host OAuth start", () => {
  it("sets the backend nonce cookie and redirects to the provider", () => {
    process.env.VITE_OAUTH_PORTAL_URL = "https://oauth.example.test";
    process.env.VITE_APP_ID = "drift-app";
    process.env.FRONTEND_APP_URL = "https://drift.vercel.app";
    const res = { cookie: vi.fn(), redirect: vi.fn(), status: vi.fn(() => res), json: vi.fn() };
    registeredStartHandler()({ protocol: "https", get: () => "api.drift.onrender.com", query: { returnTo: "https://drift.vercel.app" } }, res);
    expect(res.cookie).toHaveBeenCalledOnce();
    expect(res.cookie.mock.calls[0][0]).toContain("oauth");
    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining("https://oauth.example.test/app-auth"));
    expect(res.redirect.mock.calls[0][1]).toContain("api.drift.onrender.com%2Fapi%2Foauth%2Fcallback");
  });

  it("rejects a return origin that is not the configured frontend", () => {
    process.env.VITE_OAUTH_PORTAL_URL = "https://oauth.example.test";
    process.env.VITE_APP_ID = "drift-app";
    process.env.FRONTEND_APP_URL = "https://drift.vercel.app";
    const res = { cookie: vi.fn(), redirect: vi.fn(), status: vi.fn(() => res), json: vi.fn() };
    registeredStartHandler()({ protocol: "https", get: () => "api.drift.onrender.com", query: { returnTo: "https://attacker.example" } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
