import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Provider } from "./domain";
import { encryptionReady, seal, unseal } from "./secrets";
export type Tokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  feedUrl?: string;
  watch?: import("./watch").CalendarWatch;
};
export type OAuthState = {
  nonce: string;
  authId: string;
  professionalId: string;
  provider: Provider;
  verifier: string;
  expiresAt: number;
  writeCalendar: boolean;
};
const names = {
  google: "GOOGLE_CALENDAR",
  outlook: "MICROSOFT_CALENDAR",
  instagram: "INSTAGRAM",
  tiktok: "TIKTOK",
  ics: "ICS",
};
export function configuration(provider: Provider) {
  const prefix = names[provider];
  const origin = process.env.GLOHAUS_PUBLIC_URL || "https://www.glohaus.shop";
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    !["glohaus.shop", "www.glohaus.shop"].includes(base.hostname)
  )
    throw Error("NOT_CONFIGURED");
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`] || "",
    secret: process.env[`${prefix}_CLIENT_SECRET`] || "",
    redirectUri: `${base.origin}/api/v1/professional/connections/${provider}/callback`,
  };
}
export function providerReady(provider: Provider) {
  if (!encryptionReady()) return false;
  if (provider === "ics") return true;
  if (
    provider === "instagram" &&
    !/^v\d+\.\d+$/.test(process.env.INSTAGRAM_API_VERSION || "")
  )
    return false;
  const config = configuration(provider);
  // Credentials alone do not imply approved public access.
  return Boolean(
    config.clientId &&
    config.secret &&
    process.env[`${names[provider]}_ENABLED`] === "true",
  );
}
const authEndpoints = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  outlook: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  instagram: "https://www.instagram.com/oauth/authorize",
  tiktok: "https://www.tiktok.com/v2/auth/authorize/",
};
export function beginOAuth(
  provider: Exclude<Provider, "ics">,
  authId: string,
  professionalId: string,
  writeCalendar: boolean,
) {
  if (!providerReady(provider)) throw Error("NOT_CONFIGURED");
  const verifier = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("hex");
  const state: OAuthState = {
    provider,
    authId,
    professionalId,
    nonce,
    verifier,
    writeCalendar,
    expiresAt: Date.now() + 600000,
  };
  const config = configuration(provider),
    url = new URL(authEndpoints[provider]);
  url.search = new URLSearchParams({
    [provider === "tiktok" ? "client_key" : "client_id"]: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state: nonce,
    scope:
      provider === "google"
        ? `https://www.googleapis.com/auth/calendar.events${writeCalendar ? "" : ".readonly"}`
        : provider === "outlook"
          ? `offline_access Calendars.${writeCalendar ? "ReadWrite" : "ReadBasic"}`
          : provider === "instagram"
            ? "instagram_business_basic"
            : "user.info.basic,video.list",
  }).toString();
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  if (provider === "google" || provider === "outlook") {
    url.searchParams.set(
      "code_challenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { url: url.toString(), cookie: seal(state, `oauth:${provider}`) };
}
export function validateOAuthState(
  cookie: string,
  nonce: string,
  provider: Provider,
  authId: string,
) {
  const state = unseal<OAuthState>(cookie, `oauth:${provider}`);
  const a = Buffer.from(state.nonce),
    b = Buffer.from(nonce);
  if (
    a.length !== b.length ||
    !timingSafeEqual(a, b) ||
    state.provider !== provider ||
    state.authId !== authId ||
    state.expiresAt < Date.now()
  )
    throw Error("INVALID_STATE");
  return state;
}
export async function providerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw Error(
      [400, 401, 403].includes(response.status)
        ? "RECONNECT_REQUIRED"
        : "SYNC_FAILED",
    );
  return response.json();
}
export async function exchangeCode(
  state: OAuthState,
  code: string,
): Promise<Tokens> {
  const p = state.provider,
    config = configuration(p);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.secret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  if (p === "google" || p === "outlook")
    body.set("code_verifier", state.verifier);
  if (p === "tiktok") {
    body.delete("client_id");
    body.set("client_key", config.clientId);
  }
  const endpoints = {
    google: "https://oauth2.googleapis.com/token",
    outlook: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    instagram: "https://api.instagram.com/oauth/access_token",
    tiktok: "https://open.tiktokapis.com/v2/oauth/token/",
    ics: "",
  };
  const response = await providerJson(endpoints[p], { method: "POST", body });
  if (!response.access_token) throw Error("RECONNECT_REQUIRED");
  if (p === "instagram") {
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.search = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: config.secret,
      access_token: response.access_token,
    }).toString();
    const long = await providerJson(longUrl.toString());
    if (!long.access_token) throw Error("RECONNECT_REQUIRED");
    return {
      accessToken: long.access_token,
      expiresAt: Date.now() + Number(long.expires_in) * 1000,
    };
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
  };
}
export async function freshTokens(
  provider: Provider,
  tokens: Tokens,
): Promise<Tokens> {
  if (tokens.expiresAt > Date.now() + 120000 || provider === "ics")
    return tokens;
  if (provider === "instagram") {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: tokens.accessToken,
    }).toString();
    const response = await providerJson(url.toString());
    if (!response.access_token) throw Error("RECONNECT_REQUIRED");
    return {
      ...tokens,
      accessToken: response.access_token,
      expiresAt: Date.now() + Number(response.expires_in) * 1000,
    };
  }
  if (!tokens.refreshToken) throw Error("RECONNECT_REQUIRED");
  const config = configuration(provider),
    body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.secret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
  if (provider === "tiktok") {
    body.delete("client_id");
    body.set("client_key", config.clientId);
  }
  const endpoint =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : provider === "outlook"
        ? "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        : "https://open.tiktokapis.com/v2/oauth/token/";
  const response = await providerJson(endpoint, { method: "POST", body });
  if (!response.access_token) throw Error("RECONNECT_REQUIRED");
  return {
    ...tokens,
    accessToken: response.access_token,
    refreshToken: response.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
  };
}
