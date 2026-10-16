import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isPushEndpoint,
  preferenceSchema,
  safeNotificationHref,
} from "@/modules/notifications/preferences";
const mocks = vi.hoisted(() => ({ send: vi.fn(), query: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async (work: (db: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
import {
  deliverPushNotifications,
  pushFailure,
} from "@/modules/notifications/push-worker";
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Web Push delivery", () => {
  it("blocks private, credentialed, non-HTTPS and spoofed push endpoints", () => {
    for (const url of [
      "http://fcm.googleapis.com/send",
      "https://localhost/",
      "https://169.254.169.254/",
      "https://fcm.googleapis.com.evil.test/",
      "https://user@fcm.googleapis.com/send",
      "https://fcm.googleapis.com:8443/send",
    ])
      expect(isPushEndpoint(url)).toBe(false);
    for (const url of [
      "https://web.push.apple.com/Q123",
      "https://updates.push.services.mozilla.com/wpush/v2/test",
      "https://fcm.googleapis.com/fcm/send/test",
    ])
      expect(isPushEndpoint(url)).toBe(true);
  });
  it("locks essential email and blocks off-site notification links", () => {
    expect(
      preferenceSchema.safeParse({
        category: "bookings",
        email: false,
        push: false,
      }).success,
    ).toBe(false);
    expect(safeNotificationHref("//evil.test")).toBe(
      "/notifications?view=professional",
    );
    expect(safeNotificationHref("/professional/orders")).toBe(
      "/professional/orders",
    );
  });
  it("does not claim work when VAPID is missing", async () => {
    expect(await deliverPushNotifications()).toEqual({
      configured: false,
      processed: 0,
      accepted: 0,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("sends privacy-preserving lock-screen copy with a stable notification tag", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:support@glohaus.shop");
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "job",
            endpoint: "https://fcm.googleapis.com/fcm/send/test",
            p256dh: "key",
            auth: "auth",
            notification_id: "notification",
            href: "/professional/orders",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    mocks.send.mockResolvedValue({ statusCode: 201 });
    expect(await deliverPushNotifications()).toMatchObject({ accepted: 1 });
    expect(mocks.send.mock.calls[0][1]).toContain("glohaus-notification");
    expect(mocks.send.mock.calls[0][1]).not.toMatch(
      /customer|payment|service|product|email/i,
    );
    expect(mocks.query).toHaveBeenLastCalledWith(
      "SELECT beauty.finish_push_delivery($1,$2)",
      ["job", "accepted"],
    );
  });
  it("classifies expired, temporary and permanent provider failures", () => {
    expect(pushFailure({ statusCode: 410 })).toBe("expired");
    expect(pushFailure({ statusCode: 404 })).toBe("expired");
    expect(pushFailure({ statusCode: 429 })).toBe("retry");
    expect(pushFailure({ statusCode: 503 })).toBe("retry");
    expect(pushFailure({ statusCode: 400 })).toBe("failed");
    expect(pushFailure(new Error("timeout"))).toBe("retry");
  });
});
