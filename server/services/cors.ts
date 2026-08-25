import type { NextFunction, Request, Response } from "express";

export function createCorsMiddleware(allowedOriginsValue = process.env.DRIFT_ALLOWED_ORIGINS ?? "") {
  const allowedOrigins = new Set(allowedOriginsValue.split(",").map(value => value.trim()).filter(Boolean));
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    const allowed = Boolean(origin && allowedOrigins.has(origin));
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
