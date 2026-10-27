import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { configuration, providerJson, type Tokens } from "./oauth";
import type { Provider } from "./domain";
import { seal } from "./secrets";
export type CalendarWatch = {
  id: string;
  nonce: string;
  expiresAt: number;
  resourceId?: string;
};
export type WatchRoute = {
  authId: string;
  professionalId: string;
  connectionId: string;
  provider: Provider;
  nonce: string;
  expiresAt: number;
};
export async function renewWatch(
  provider: Provider,
  tokens: Tokens,
  authId: string,
  professionalId: string,
  connectionId: string,
): Promise<Tokens> {
  if (
    !["google", "outlook"].includes(provider) ||
    (tokens.watch && tokens.watch.expiresAt > Date.now() + 3600000)
  )
    return tokens;
  const nonce = randomBytes(24).toString("hex"),
    expiresAt = Date.now() + 2 * 86400000;
  const route = seal(
    {
      authId,
      professionalId,
      connectionId,
      provider,
      nonce,
      expiresAt: expiresAt + 3600000,
    } satisfies WatchRoute,
    "calendar-notification",
  );
  const url = new URL(
    "/api/v1/integrations/calendar/notify",
    configuration(provider).redirectUri,
  );
  url.searchParams.set("route", route);
  const headers = {
    Authorization: `Bearer ${tokens.accessToken}`,
    "Content-Type": "application/json",
  };
  try {
    let watch: CalendarWatch;
    if (provider === "google") {
      const id = randomUUID();
      const result = await providerJson(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            id,
            type: "web_hook",
            address: url.toString(),
            token: nonce,
            expiration: String(expiresAt),
          }),
        },
      );
      watch = {
        id,
        nonce,
        expiresAt: Number(result.expiration),
        resourceId: result.resourceId,
      };
    } else {
      const result = await providerJson(
        "https://graph.microsoft.com/v1.0/subscriptions",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            changeType: "created,updated,deleted",
            notificationUrl: url.toString(),
            resource: "me/events",
            expirationDateTime: new Date(expiresAt).toISOString(),
            clientState: nonce,
          }),
        },
      );
      watch = {
        id: result.id,
        nonce,
        expiresAt: Date.parse(result.expirationDateTime),
      };
    }
    // Older channels expire naturally; only the current ID/nonce is accepted.
    return { ...tokens, watch };
  } catch {
    // Some providers/accounts do not support notifications. Polling remains authoritative.
    return tokens;
  }
}
