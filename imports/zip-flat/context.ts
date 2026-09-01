import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserByOpenId, upsertUser } from "../db";
import { verifySupabaseBearerToken } from "../services/supabaseAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const bearer = opts.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const supabaseIdentity = await verifySupabaseBearerToken(bearer);
    if (supabaseIdentity) {
      await upsertUser(supabaseIdentity);
      user = (await getUserByOpenId(supabaseIdentity.openId)) ?? null;
    } else {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
