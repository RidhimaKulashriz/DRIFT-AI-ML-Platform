import { describe, expect, it, vi } from "vitest";
import { createCorsMiddleware } from "./services/cors";

function response() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: (key: string, value: string) => headers.set(key, value),
    sendStatus: vi.fn(),
  };
}

function request(origin: string | undefined, method = "GET") {
  return {
    method,
    header: (key: string) => key.toLowerCase() === "origin" ? origin : undefined,
  } as any;
}

describe("split-host CORS middleware", () => {
  it("allows the deployed Vercel origin when the runtime configuration is temporarily empty", () => {
    const res = response();
    const next = vi.fn();
    createCorsMiddleware("")(request("https://drift-ai-ml-platform.vercel.app"), res as any, next);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://drift-ai-ml-platform.vercel.app");
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows configured Vercel origins with credentials", () => {
    const res = response();
    const next = vi.fn();
    createCorsMiddleware("https://drift.vercel.app, https://drift.example.com")(request("https://drift.example.com"), res as any, next);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://drift.example.com");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects unconfigured origins on preflight", () => {
    const res = response();
    const next = vi.fn();
    createCorsMiddleware("https://drift.vercel.app")(request("https://evil.example", "OPTIONS"), res as any, next);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("answers configured preflight with allowed methods and headers", () => {
    const res = response();
    const next = vi.fn();
    createCorsMiddleware("https://drift.vercel.app")(request("https://drift.vercel.app", "OPTIONS"), res as any, next);
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
