import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState, encodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    const oauthPortalUrl = process.env.VITE_OAUTH_PORTAL_URL;
    const appId = process.env.VITE_APP_ID;
    const backendOrigin = `${req.protocol}://${req.get("host")}`;
    const frontendOrigin = process.env.FRONTEND_APP_URL?.replace(/\/$/, "");
    const returnTo = getQueryParam(req, "returnTo") ?? frontendOrigin ?? backendOrigin;
    if (!oauthPortalUrl || !appId || !process.env.OAUTH_SERVER_URL) {
      res.status(503).json({ error: "External OAuth is not configured. Public monitoring remains available; configure an external identity provider before using protected actions." });
      return;
    }
    if ((frontendOrigin && returnTo !== frontendOrigin) || !/^https?:\/\//.test(returnTo)) {
      res.status(500).json({ error: "OAuth split-host configuration is incomplete or invalid" });
      return;
    }
    const nonce = crypto.randomUUID();
    res.cookie(OAUTH_STATE_COOKIE, nonce, { path: "/", maxAge: 600_000, sameSite: "none", secure: req.protocol === "https" || req.header("x-forwarded-proto") === "https" });
    const redirectUri = `${backendOrigin}/api/oauth/callback`;
    const state = encodeOAuthState({ redirectUri, nonce });
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const frontendOrigin = process.env.FRONTEND_APP_URL?.replace(/\/$/, "");
      if (frontendOrigin) {
        try {
          const parsed = new URL(frontendOrigin);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error("Unsupported frontend protocol");
          res.redirect(302, `${parsed.origin}/`);
          return;
        } catch {
          res.status(500).json({ error: "Invalid FRONTEND_APP_URL configuration" });
          return;
        }
      }
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
