import crypto from "crypto";

/**
 * Minimal signed-cookie session — not Supabase Auth, since Steam OpenID
 * (no OAuth client/secret needed, unlike GitHub) isn't one of its providers.
 * Payload is base64url JSON + an HMAC-SHA256 signature; verifying just
 * recomputes the HMAC and compares in constant time. No external JWT lib
 * needed for this small a payload.
 */

const SECRET = process.env.SESSION_SECRET!;
const COOKIE_NAME = "steam_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  steamid: string;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionCookieValue(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
};
