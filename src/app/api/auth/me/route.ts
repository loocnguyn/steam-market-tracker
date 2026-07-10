import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE.name)?.value);
  if (!session) return NextResponse.json({ user: null });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("steam_users")
    .select("steamid, persona_name, avatar_url")
    .eq("steamid", session.steamid)
    .maybeSingle();

  if (!data) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      steamid: data.steamid,
      personaName: data.persona_name,
      avatarUrl: data.avatar_url,
    },
  });
}
