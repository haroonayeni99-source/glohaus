// Real Stripe SDK cryptography with fixture secrets; no provider network calls,
// production database, account credentials or monetary transactions are used.
import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  schedule: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/modules/payments/stripe", async () => {
  const { default: SDK } = await import("stripe");
  const client = new SDK("sk_test_local_fixture_only");
  return { stripe: () => client };
});
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async (work: (db: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
vi.mock("@/modules/payments/webhook-secrets", () => ({
  paymentWebhookSecrets: async () => [
    "whsec_old_fixture",
    "whsec_current_fixture",
  ],
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: mocks.schedule,
}));
vi.mock("@/modules/commission/provider-cost", () => ({
  reconcileBookingProviderCost: mocks.reconcile,
}));
import { POST } from "@/app/api/webhooks/stripe/route";
const sdk = new Stripe("sk_test_local_fixture_only");
const session = {
  id: "cs_test_local_fixture",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_local_fixture",
  amount_total: 2100,
  currency: "gbp",
  metadata: { booking_id: "11111111-1111-4111-8111-111111111111" },
};
function event(type = "checkout.session.completed", object: object = session) {
  return JSON.stringify({
    id: "evt_local_fixture",
    object: "event",
    livemode: false,
    type,
    data: { object },
  });
}
function request(body: string, signedBody = body, timestamp?: number) {
  return new Request("https://glohaus.test/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: {
      "stripe-signature": sdk.webhooks.generateTestHeaderString({
        payload: signedBody,
        secret: "whsec_current_fixture",
        timestamp,
      }),
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.reconcile.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each([2100, 5100])(
  "authenticates a signed paid checkout of %i pence through the real SDK before booking finance",
  async (amount_total) => {
    expect(
      (await POST(request(event(undefined, { ...session, amount_total }))))
        .status,
    ).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
      [
        "evt_local_fixture",
        session.metadata.booking_id,
        session.id,
        session.payment_intent,
        amount_total,
        "gbp",
      ],
    );
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT beauty.record_booking_payment_finance($1,$2)",
      [session.metadata.booking_id, session.payment_intent],
    );
  },
);
it("authenticates asynchronous success before applying booking finance", async () => {
  expect(
    (await POST(request(event("checkout.session.async_payment_succeeded"))))
      .status,
  ).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
    expect.any(Array),
  );
});
it("does not fulfil a correctly signed checkout that is still unpaid", async () => {
  expect(
    (
      await POST(
        request(event(undefined, { ...session, payment_status: "unpaid" })),
      )
    ).status,
  ).toBe(200);
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(["modified", "expired", "wrong-secret"])(
  "rejects %s signatures before any financial or notification work",
  async (kind) => {
    const body = event();
    const req =
      kind === "expired"
        ? request(body, body, Math.floor(Date.now() / 1000) - 600)
        : kind === "modified"
          ? request(
              body.replace('"amount_total":2100', '"amount_total":1'),
              body,
            )
          : new Request("https://glohaus.test/api/webhooks/stripe", {
              method: "POST",
              body,
              headers: {
                "stripe-signature": sdk.webhooks.generateTestHeaderString({
                  payload: body,
                  secret: "whsec_attacker_fixture",
                }),
              },
            });
    expect((await POST(req)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  },
);
it.each([
  ["checkout.session.async_payment_failed", "failed"],
  ["checkout.session.expired", "expired"],
])(
  "releases signed %s Shop holds without recording a payment",
  async (kind, status) => {
    const body = event(kind, {
      ...session,
      payment_status: "unpaid",
      metadata: { glohaus_shop_checkout_id: "shop-fixture" },
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
      "SELECT beauty.release_shop_checkout($1,$2,$3)",
      ["shop-fixture", session.id, status],
    );
  },
);
it("applies an authenticated refund to the existing refund and ledger routines", async () => {
  const body = event("refund.updated", {
    id: "re_local_fixture",
    payment_intent: session.payment_intent,
    amount: 1000,
    status: "succeeded",
    metadata: { refund_decision_id: "refund-fixture" },
  });
  expect((await POST(request(body))).status).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)",
    [
      "refund-fixture",
      "re_local_fixture",
      1000,
      "succeeded",
      session.payment_intent,
    ],
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.record_booking_refund_finance($1)",
    ["refund-fixture"],
  );
});
it("returns a retryable failure when authenticated booking finance cannot commit", async () => {
  mocks.query.mockRejectedValue(new Error("isolated transaction failure"));
  expect((await POST(request(event()))).status).toBe(503);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
