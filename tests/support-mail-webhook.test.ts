import { createHmac } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  after: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: (work: (db: object) => unknown) =>
    work({ query: mocks.query }),
}));
vi.mock("@/modules/support-mail/worker", () => ({
  deliverSupportForwarding: mocks.deliver,
}));
import { POST } from "@/app/api/webhooks/support-email/route";
const key = Buffer.from("isolated-fixture-signing-key").toString("base64");
const emailId = "11111111-1111-4111-8111-111111111111";
const event = {
  type: "email.received",
  data: { email_id: emailId, to: ["support@glohaus.shop"] },
};
function request(
  value: unknown = event,
  seconds = Math.floor(Date.now() / 1000),
  tampered = false,
) {
  const payload = typeof value === "string" ? value : JSON.stringify(value),
    id = "msg_fixture",
    timestamp = String(seconds);
  const signature = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return new Request("https://www.glohaus.shop/api/webhooks/support-email", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: tampered ? payload + " " : payload,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("SUPPORT_EMAIL_WEBHOOK_SECRET", `whsec_${key}`);
  vi.stubEnv("PAYMENT_DATABASE_URL", "fixture-only");
  mocks.query.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("verifies the original signed bytes before durably queuing and acknowledging", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.queue_support_mail($1,$2,$3)",
    [emailId, "received", null],
  );
  expect(mocks.after).toHaveBeenCalledOnce();
  expect(mocks.deliver).not.toHaveBeenCalled();
});
it.each(["tampered", "expired", "missing"])(
  "rejects %s signatures before any database work",
  async (kind) => {
    const r =
      kind === "missing"
        ? new Request("https://www.glohaus.shop/api/webhooks/support-email", {
            method: "POST",
            body: "{}",
          })
        : request(
            event,
            Math.floor(Date.now() / 1000) - (kind === "expired" ? 600 : 0),
            kind === "tampered",
          );
    expect((await POST(r)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  },
);
it("bounds the raw request and ignores signed irrelevant recipients", async () => {
  expect((await POST(request("a".repeat(524289)))).status).toBe(413);
  expect(
    (
      await POST(
        request({
          ...event,
          data: { ...event.data, to: ["other@example.test"] },
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("returns a retryable error if durable storage fails", async () => {
  mocks.query.mockRejectedValue(Error("fixture unavailable"));
  expect((await POST(request())).status).toBe(503);
  expect(mocks.after).not.toHaveBeenCalled();
});
it("records signed delivery failures separately without resending", async () => {
  const at = "2026-10-25T16:00:00Z";
  expect(
    (
      await POST(
        request({
          type: "email.bounced",
          created_at: at,
          data: { email_id: emailId, from: "support@glohaus.shop" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.record_support_mail_delivery($1,$2,$3)",
    [emailId, "email.bounced", at],
  );
  expect(mocks.after).not.toHaveBeenCalled();
});
