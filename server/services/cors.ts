import type { NextFunction, Request, Response } from "express";

const DEPLOYED_VERCEL_ORIGIN = "https://drift-ai-ml-platform.vercel.app";
// Vercel exposes immutable deployment URLs in this project/team namespace. Keep
// this narrowly scoped instead of allowing every `*.vercel.app` origin.
const PROJECT_VERCEL_PREVIEW_ORIGIN = /^https:\/\/drift-ai-ml-platform(?:-[a-z0-9-]+)?-sckulashri-7163s-projects\.vercel\.app$/i;

function splitOrigins(value: string) {
  return value.split(",").map(origin => origin.trim()).filter(Boolean);
}

function isProjectVercelPreviewOrigin(origin: string) {
  return PROJECT_VERCEL_PREVIEW_ORIGIN.test(origin);
}

export function createCorsMiddleware(
  allowedOriginsValue = process.env.DRIFT_ALLOWED_ORIGINS ?? "",
  frontendAppUrl = process.env.FRONTEND_APP_URL ?? "",
) {
  const allowedOrigins = new Set([
    DEPLOYED_VERCEL_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    frontendAppUrl.trim(),
    ...splitOrigins(allowedOriginsValue),
  ].filter(Boolean));
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    const allowed = Boolean(origin && (allowedOrigins.has(origin) || isProjectVercelPreviewOrigin(origin)));
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(allowed ? 204 : 403);
    return next();
  };
}
