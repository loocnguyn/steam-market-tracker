import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE } from "@/lib/session";
import {
  getStoredSteamCookie,
  setStoredSteamCookie,
  decodeSteamCookieExpiry,
} from "@/lib/appSettings";

export const dynamic = "force-dynamic";

function requireOwner(req: NextRequest): boolean {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE.name)?.value);
  return !!session && session.steamid === process.env.OWNER_STEAMID;
}

/**
 * Owner-only. Never returns the actual cookie value — only whether one is
 * configured and, if so, when it expires (decoded from the JWT payload,
 * not the secret bytes themselves).
 */
export async function GET(req: NextRequest) {
  if (!requireOwner(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookie = await getStoredSteamCookie();
  if (!cookie) return NextResponse.json({ configured: false });

  const expiresAt = decodeSteamCookieExpiry(cookie);
  return NextResponse.json({
    configured: true,
    expiresAt: expiresAt?.toISOString() ?? null,
    expired: expiresAt ? expiresAt.getTime() < Date.now() : null,
  });
}

export async function POST(req: NextRequest) {
  if (!requireOwner(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const cookie = String(body?.cookie ?? "").trim();
  if (!cookie) {
    return NextResponse.json({ error: "cookie is required" }, { status: 400 });
  }

  await setStoredSteamCookie(cookie);
  return NextResponse.json({ ok: true });
}
