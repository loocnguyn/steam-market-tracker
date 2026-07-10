import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Server-only key/value settings. Never exposed to the client directly —
 * routes that read these must only ever return derived/masked info, never
 * the raw value.
 */
export async function getSetting(key: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// --- Encryption for secrets stored in app_settings ---------------------
// The Supabase row itself is just ciphertext; decrypting requires this
// server-only key (never in the DB, never sent to the client), so a leaked
// DB row alone can't be used to hijack the Steam session.
const ENC_KEY = process.env.COOKIE_ENCRYPTION_KEY
  ? Buffer.from(process.env.COOKIE_ENCRYPTION_KEY, "hex")
  : null;

function encrypt(plaintext: string): string {
  if (!ENC_KEY) throw new Error("COOKIE_ENCRYPTION_KEY is not configured");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

function decrypt(stored: string): string {
  if (!ENC_KEY) throw new Error("COOKIE_ENCRYPTION_KEY is not configured");
  const [ivB64, tagB64, dataB64] = stored.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const STEAM_COOKIE_KEY = "steam_login_cookie";

/** Stored encrypted — a leaked DB row alone is useless without ENC_KEY. */
export async function getStoredSteamCookie(): Promise<string | null> {
  const stored = await getSetting(STEAM_COOKIE_KEY);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export async function setStoredSteamCookie(value: string): Promise<void> {
  return setSetting(STEAM_COOKIE_KEY, encrypt(value));
}

/**
 * Steam's `steamLoginSecure` cookie is `<steamid>||<JWT>` (URL-encoded).
 * The JWT payload has a plain (unsigned-here, we're not verifying — just
 * reading) `exp` field we can surface so the owner knows when to refresh
 * it, without ever needing to expose the cookie value itself.
 */
export function decodeSteamCookieExpiry(cookieValue: string): Date | null {
  try {
    const decoded = decodeURIComponent(cookieValue);
    const jwt = decoded.split("||")[1];
    const payloadB64 = jwt?.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}
