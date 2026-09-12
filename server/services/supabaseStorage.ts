import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

function configuration() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const bucket = (process.env.SUPABASE_EVIDENCE_BUCKET ?? "").trim();
  return url && serviceRoleKey && bucket ? { url, serviceRoleKey, bucket } : null;
}

function clientFor(config: NonNullable<ReturnType<typeof configuration>>) {
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizedObjectKey(key: string) {
  return key.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._/-]/g, "_");
}

function keyWithSuffix(key: string) {
  const normalized = normalizedObjectKey(key);
  const dot = normalized.lastIndexOf(".");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return dot === -1 ? `${normalized}_${suffix}` : `${normalized.slice(0, dot)}_${suffix}${normalized.slice(dot)}`;
}

export function supabasePortableStorageConfigured() {
  return process.env.DRIFT_SUPABASE_STORAGE_ENABLED === "true" && Boolean(configuration());
}

export function isSupabaseStorageKey(key: string) {
  return key.startsWith("supabase://");
}

/** Stable browser URL; the server resolves a fresh signed URL for every request. */
export function supabaseEvidenceProxyPath(storageKey: string) {
  return `/api/drift/evidence-media/${Buffer.from(storageKey, "utf8").toString("base64url")}`;
}

export function browserStorageUrl(storageKey: string, fallbackUrl: string) {
  return isSupabaseStorageKey(storageKey) ? supabaseEvidenceProxyPath(storageKey) : fallbackUrl;
}

function decodeStorageKey(key: string) {
  if (!isSupabaseStorageKey(key)) return null;
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(key);
  return match ? { bucket: match[1], objectKey: match[2] } : null;
}

export async function putInSupabaseEvidenceStorage(relKey: string, data: Buffer | Uint8Array | string, contentType: string) {
  const config = configuration();
  if (!config) throw new Error("Portable evidence storage is not configured.");
  const objectKey = keyWithSuffix(relKey);
  const { error } = await clientFor(config).storage.from(config.bucket).upload(objectKey, data, { contentType, upsert: false });
  if (error) throw new Error(`Supabase evidence upload failed: ${error.message}`);
  const { data: signed, error: signError } = await clientFor(config).storage.from(config.bucket).createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) throw new Error("Supabase evidence upload completed but a signed access URL could not be created.");
  return { key: `supabase://${config.bucket}/${objectKey}`, url: signed.signedUrl };
}

export async function getSupabaseEvidenceSignedUrl(storageKey: string) {
  const decoded = decodeStorageKey(storageKey);
  const config = configuration();
  if (!decoded || !config || decoded.bucket !== config.bucket) throw new Error("Portable evidence storage key is unavailable.");
  const { data, error } = await clientFor(config).storage.from(decoded.bucket).createSignedUrl(decoded.objectKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("A signed portable evidence URL could not be created.");
  return data.signedUrl;
}
