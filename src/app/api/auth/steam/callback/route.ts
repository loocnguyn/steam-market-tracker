import { NextRequest, NextResponse } from "next/server";
import { verifySteamOpenIdCallback, getSteamProfile } from "@/lib/steamAuth";
import { createSessionCookieValue, SESSION_COOKIE } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const steamid = await verifySteamOpenIdCallback(req.nextUrl.searchParams).catch(
    () => null,
  );

  if (!steamid) {
    return NextResponse.redirect(new URL("/?auth_error=1", req.nextUrl.origin));
  }

  const profile = await getSteamProfile(steamid);

  const supabase = createServiceClient();
  await supabase.from("steam_users").upsert(
    {
      steamid,
      persona_name: profile.personaName,
      avatar_url: profile.avatarUrl,
      last_login_at: new Date().toISOString(),
    },
    { onConflict: "steamid" },
  );

  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE.name, createSessionCookieValue({ steamid }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_COOKIE.maxAge,
    path: "/",
  });
  return res;
}
