/**
 * Steam OpenID 2.0 login ("Sign in through Steam"). Unlike GitHub/Google
 * OAuth, this needs no registered app, client ID, or secret — just a
 * return URL. See https://partner.steamgames.com/doc/features/auth#openid
 */

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

export function buildSteamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

/**
 * Verify a Steam OpenID callback by re-posting the params back to Steam
 * with mode=check_authentication — Steam confirms whether it actually
 * issued this assertion. Never trust the callback params without this;
 * anyone could forge a claimed_id otherwise.
 */
export async function verifySteamOpenIdCallback(
  params: URLSearchParams,
): Promise<string | null> {
  const verify = new URLSearchParams(params);
  verify.set("openid.mode", "check_authentication");

  const res = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verify.toString(),
  });
  const text = await res.text();
  if (!text.includes("is_valid:true")) return null;

  const claimedId = params.get("openid.claimed_id");
  const match = claimedId?.match(/\/openid\/id\/(\d+)$/);
  return match ? match[1] : null;
}

/** Public profile info — no Steam Web API key needed for the basic XML feed. */
export async function getSteamProfile(
  steamid: string,
): Promise<{ personaName: string | null; avatarUrl: string | null }> {
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamid}/?xml=1`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const xml = await res.text();
    const name = xml.match(/<steamID><!\[CDATA\[([^\]]*)\]\]><\/steamID>/)?.[1] ?? null;
    const avatar =
      xml.match(/<avatarMedium><!\[CDATA\[([^\]]*)\]\]><\/avatarMedium>/)?.[1] ?? null;
    return { personaName: name, avatarUrl: avatar };
  } catch {
    return { personaName: null, avatarUrl: null };
  }
}
