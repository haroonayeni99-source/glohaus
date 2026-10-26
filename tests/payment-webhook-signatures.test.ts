// Real Stripe SDK cryptography with fixture secrets; no provider network calls,
// production database, account credentials or monetary transactions are used.
import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  schedule: vi.fn(),
  reconcile: vi.fn(),
  payout: vi.fn(),
  transfer: vi.fn(),
  reverse: vi.fn(),
}));
vi.mock("@/modules/payments/stripe", async () => {
  const { default: SDK } = await import("stripe");
  const client = new SDK("sk_test_local_fixture_only");
  client.payouts.retrieve = mocks.payout;
  client.transfers.retrieve = mocks.transfer;
  client.transfers.createReversal = mocks.reverse;
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
function event(
  type = "checkout.session.completed",
  object: object = session,
  account?: string,
) {
  return JSON.stringify({
    id: "evt_local_fixture",
    object: "event",
    livemode: false,
    type,
    account,
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

const localPayout = {
  id: "po_local",
  amount: 500,
  currency: "gbp",
  method: "standard",
  status: "paid",
  arrival_date: 1900000000,
  metadata: {
    glohaus_payout_id: "payout-local",
    glohaus_transfer_id: "tr_local",
  },
};
function payoutSetup(status = "processing") {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("coalesce(r.stripe_account_id")
      ? [
          {
            stripe_account_id: "acct_pro",
            requested_pence: 500,
            bank_amount_pence: 500,
            kind: "standard",
            provider_payout_id: "po_local",
            provider_transfer_id: "tr_local",
          },
        ]
      : sql.includes("payout_reversal_details")
        ? [{ data: { transferId: "tr_local", status } }]
        : [],
  }));
  mocks.payout.mockResolvedValue(localPayout);
  mocks.transfer.mockResolvedValue({
    id: "tr_local",
    amount: 500,
    currency: "gbp",
    amount_reversed: 0,
    destination: "acct_pro",
    metadata: { glohaus_payout_id: "payout-local" },
  });
  mocks.reverse.mockResolvedValue({ id: "trr_local" });
}
it("checks the signed Connect account and current provider amount before recording paid", async () => {
  payoutSetup();
  expect(
    (await POST(request(event("payout.paid", localPayout, "acct_pro")))).status,
  ).toBe(200);
  expect(mocks.payout).toHaveBeenCalledWith(
    "po_local",
    {},
    { stripeAccount: "acct_pro" },
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.apply_payout_result($1,$2)",
    ["po_local", "paid"],
  );
  expect(mocks.reverse).not.toHaveBeenCalled();
});
it.each([undefined, "acct_other"])(
  "refuses a payout event from the wrong or absent Connect account",
  async (account) => {
    payoutSetup();
    expect(
      (await POST(request(event("payout.paid", localPayout, account)))).status,
    ).toBe(503);
    expect(mocks.payout).not.toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("record_payout_provider"),
      ),
    ).toBe(false);
  },
);
it.each(["amount", "transfer"])(
  "refuses mismatched payout %s without moving money",
  async (field) => {
    payoutSetup();
    if (field === "amount")
      mocks.payout.mockResolvedValue({ ...localPayout, amount: 1000 });
    else
      mocks.transfer.mockResolvedValue({
        destination: "acct_other",
        amount: 500,
        currency: "gbp",
      });
    expect(
      (await POST(request(event("payout.paid", localPayout, "acct_pro"))))
        .status,
    ).toBe(503);
    expect(mocks.reverse).not.toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("record_payout_provider"),
      ),
    ).toBe(false);
  },
);
it("uses current failed bank status instead of an old paid event, reversing only unrecovered transfer funds", async () => {
  payoutSetup("paid");
  mocks.payout.mockResolvedValue({ ...localPayout, status: "failed" });
  mocks.transfer.mockResolvedValue({
    amount: 500,
    amount_reversed: 100,
    currency: "gbp",
    destination: "acct_pro",
    metadata: { glohaus_payout_id: "payout-local" },
  });
  expect(
    (await POST(request(event("payout.paid", localPayout, "acct_pro")))).status,
  ).toBe(200);
  expect(mocks.reverse).toHaveBeenCalledWith(
    "tr_local",
    { amount: 400 },
    { idempotencyKey: "payout-transfer-reversal-po_local" },
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.apply_payout_result($1,$2)",
    ["po_local", "failed"],
  );
});
it("keeps the wallet reserved when a failed payout's transfer recovery fails", async () => {
  payoutSetup();
  mocks.payout.mockResolvedValue({ ...localPayout, status: "failed" });
  mocks.reverse.mockRejectedValue(new Error("network"));
  expect(
    (await POST(request(event("payout.failed", localPayout, "acct_pro"))))
      .status,
  ).toBe(503);
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes("apply_payout_result")),
  ).toBe(false);
});
it("does not reverse or post a repeated completed failure twice", async () => {
  payoutSetup("failed");
  mocks.payout.mockResolvedValue({ ...localPayout, status: "failed" });
  expect(
    (await POST(request(event("payout.failed", localPayout, "acct_pro"))))
      .status,
  ).toBe(200);
  expect(mocks.reverse).not.toHaveBeenCalled();
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes("apply_payout_result")),
  ).toBe(false);
});
