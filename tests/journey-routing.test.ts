import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  encryptOrigin,
  decryptOrigin,
  routingConfigured,
} from "@/modules/journey-routing/crypto";
import { estimateRoute, googleRequest } from "@/modules/journey-routing/google";
import {
  routeInputSchema,
  type RouteContext,
} from "@/modules/journey-routing/domain";
import {
  pushReceiptToken,
  verifyPushReceiptToken,
} from "@/modules/notifications/device-receipts";
const fetchMock = vi.fn();
const bookingId = "11111111-1111-4111-8111-111111111111";
const ctx: RouteContext = {
  bookingId,
  token: "token",
  startsAt: "2026-10-20T14:00:00Z",
  latitude: 51.5,
  longitude: -0.1,
  departureAt: "2026-10-20T13:00:00Z",
  durationMinutes: 50,
  bufferMinutes: 10,
  mode: "driving",
};
beforeEach(() => {
  vi.stubEnv("GOOGLE_ROUTES_API_KEY", "");
  vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY", "server-only-key");
  vi.stubEnv("JOURNEY_ROUTING_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("CRON_SECRET", "receipt-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the current server key name for readiness and provider requests", async () => {
  vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY", "");
  vi.stubEnv("GOOGLE_ROUTES_API_KEY", "  current-server-key  ");
  expect(routingConfigured()).toBe(true);
  fetchMock.mockResolvedValue(
    Response.json({ routes: [{ duration: "1200s" }] }),
  );
  await estimateRoute({ address: "Public fixture" }, ctx, "walking", 10);
  expect(fetchMock.mock.calls[0][1].headers["X-Goog-Api-Key"]).toBe(
    "current-server-key",
  );
});
it("prefers the current key over the legacy name and falls back when it is blank", async () => {
  vi.stubEnv("GOOGLE_ROUTES_API_KEY", "current-server-key");
  fetchMock.mockImplementation(async () =>
    Response.json({ routes: [{ duration: "1200s" }] }),
  );
  await estimateRoute({ address: "Public fixture" }, ctx, "walking", 10);
  expect(fetchMock.mock.calls[0][1].headers["X-Goog-Api-Key"]).toBe(
    "current-server-key",
  );
  vi.stubEnv("GOOGLE_ROUTES_API_KEY", "   ");
  await estimateRoute({ address: "Public fixture" }, ctx, "walking", 10);
  expect(fetchMock.mock.calls[1][1].headers["X-Goog-Api-Key"]).toBe(
    "server-only-key",
  );
});
it("refuses provider calls before networking if both key names are absent", async () => {
  vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY", "");
  expect(routingConfigured()).toBe(false);
  await expect(
    estimateRoute({ address: "Public fixture" }, ctx, "driving", 10),
  ).rejects.toThrow("ROUTING_NOT_CONFIGURED");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("encrypts only a booking-bound origin and rejects tampering, another booking and a rotated key", () => {
  const origin = { address: "Private fictional starting address" };
  const encrypted = encryptOrigin(origin, bookingId);
  expect(encrypted).not.toContain(origin.address);
  expect(encryptOrigin(origin, bookingId)).not.toBe(encrypted);
  expect(decryptOrigin(encrypted, bookingId)).toEqual(origin);
  expect(() => decryptOrigin(encrypted, "other-booking")).toThrow();
  const parts = encrypted.split(".");
  parts[3] = Buffer.from("forged").toString("base64url");
  expect(() => decryptOrigin(parts.join("."), bookingId)).toThrow();
  vi.stubEnv("JOURNEY_ROUTING_ENCRYPTION_KEY", "cd".repeat(32));
  expect(() => decryptOrigin(encrypted, bookingId)).toThrow();
});
it("requires both server credentials and explicit provider/reminder consent", () => {
  expect(routingConfigured()).toBe(true);
  vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY", "");
  expect(routingConfigured()).toBe(false);
  const body = {
    origin: { address: "SE15 5AA" },
    mode: "driving",
    bufferMinutes: 10,
    reminders: true,
    automaticUpdates: false,
    providerConsent: true,
  };
  expect(routeInputSchema.safeParse(body).success).toBe(true);
  expect(
    routeInputSchema.safeParse({ ...body, providerConsent: false }).success,
  ).toBe(false);
  expect(
    routeInputSchema.safeParse({
      ...body,
      automaticUpdates: true,
      reminders: false,
    }).success,
  ).toBe(false);
  expect(
    routeInputSchema.safeParse({ ...body, destination: "forged" }).success,
  ).toBe(false);
  expect(
    routeInputSchema.safeParse({
      ...body,
      origin: { latitude: 100, longitude: 0 },
    }).success,
  ).toBe(false);
});
it("uses the confirmed server destination, predicted driving departure and a traffic-aware request", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ routes: [{ duration: "2101s", distanceMeters: 10000 }] }),
  );
  const result = await estimateRoute(
    { address: "SE15 5AA" },
    ctx,
    "driving",
    10,
  );
  expect(result).toMatchObject({
    durationMinutes: 36,
    travelMinutes: 36,
    trafficAware: true,
  });
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  expect(url).not.toContain("server-only-key");
  expect(request.headers["X-Goog-Api-Key"]).toBe("server-only-key");
  expect(request.cache).toBe("no-store");
  expect(JSON.parse(request.body)).toMatchObject({
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    destination: { location: { latLng: { latitude: 51.5, longitude: -0.1 } } },
  });
});
it("aligns transit departure to the first scheduled service including the initial walk", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      routes: [
        {
          duration: "1800s",
          legs: [
            {
              steps: [
                { staticDuration: "0s" },
                { staticDuration: "300s" },
                {
                  transitDetails: {
                    stopDetails: { departureTime: "2026-10-20T13:10:00Z" },
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  const result = await estimateRoute(
    { latitude: 51.51, longitude: -0.2 },
    ctx,
    "transit",
    10,
  );
  expect(result).toMatchObject({
    travelMinutes: 30,
    durationMinutes: 45,
    trafficAware: false,
    transitSchedule: true,
  });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.arrivalTime).toBe("2026-10-20T13:50:00.000Z");
  expect(body.routingPreference).toBeUndefined();
  expect(body.departureTime).toBeUndefined();
});
it.each(["walking", "bicycling"] as const)(
  "does not claim traffic monitoring for %s",
  (mode) => {
    const body = googleRequest({ address: "SE15 5AA" }, ctx, mode, 10);
    expect(body).not.toHaveProperty("routingPreference");
    expect(body).not.toHaveProperty("departureTime");
  },
);
it("never returns provider errors containing an origin, token or API key", async () => {
  fetchMock.mockResolvedValue(
    new Response("Private address or provider credentials", { status: 403 }),
  );
  await expect(
    estimateRoute({ address: "Private address" }, ctx, "walking", 10),
  ).rejects.toThrow("ROUTE_PROVIDER_UNAVAILABLE");
  fetchMock.mockResolvedValue(Response.json({ routes: [] }));
  await expect(
    estimateRoute({ address: "Private address" }, ctx, "walking", 10),
  ).rejects.toThrow("ROUTE_NOT_FOUND");
  fetchMock.mockResolvedValue(new Response("limited", { status: 429 }));
  await expect(
    estimateRoute({ address: "Private address" }, ctx, "walking", 10),
  ).rejects.toThrow("ROUTE_PROVIDER_LIMIT");
});
it("limits push receipts to a signed delivery ID and expiry without a login cookie", () => {
  const now = Date.parse("2026-10-18T12:00:00Z"),
    token = pushReceiptToken(bookingId, now)!;
  expect(verifyPushReceiptToken(token, now)).toBe(bookingId);
  expect(verifyPushReceiptToken(token + "x", now)).toBeNull();
  expect(verifyPushReceiptToken(token, now + 3600000)).toBeNull();
  expect(verifyPushReceiptToken(token, now - 10000)).toBeNull();
  expect(pushReceiptToken("not-a-delivery", now)).toBeUndefined();
  vi.stubEnv("CRON_SECRET", "rotated");
  expect(verifyPushReceiptToken(token, now)).toBeNull();
});
