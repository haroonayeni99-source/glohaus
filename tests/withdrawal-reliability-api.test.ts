import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  account: vi.fn(),
  query: vi.fn(),
  transfer: vi.fn(),
  retrieveTransfer: vi.fn(),
  reverse: vi.fn(),
  payout: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({ withAccount: mock.account }));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: (work: (db: unknown) => unknown) =>
    work({ query: mock.query }),
}));
vi.mock("@/modules/payments/webhook-secrets", () => ({
  connectWebhookReady: async () => true,
}));
vi.mock("@/modules/professionals/verification", () => ({
  professionalAccessState: async () => ({ verified: true }),
  assertWithdrawalAllowed: vi.fn(),
}));
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => true,
  stripe: () => ({
    accounts: { retrieve: mock.provider },
    transfers: {
      create: mock.transfer,
      retrieve: mock.retrieveTransfer,
      createReversal: mock.reverse,
    },
    payouts: { create: mock.payout },
  }),
}));
import { POST } from "@/app/api/v1/professional/withdrawals/route";
const key = "11111111-1111-4111-8111-111111111111";
const payout = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "standard",
  requestedPence: 500,
  bankAmountPence: 500,
  withdrawalFeePence: 0,
  status: "requested",
  claimed: true,
  createdAt: new Date().toISOString(),
  stripeAccountId: "acct_pro",
  providerTransferId: null,
  providerPayoutId: null,
  expectedArrivalAt: null,
};
let record = { ...payout };
const request = (extra = {}) =>
  new Request("https://glohaus.test/api/v1/professional/withdrawals", {
    method: "POST",
    headers: {
      origin: "https://glohaus.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind: "standard",
      amountPence: 500,
      requestKey: key,
      ...extra,
    }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  record = { ...payout };
  mock.account.mockImplementation((_role, work) =>
    work({ query: mock.query }, { professionalId: "pro" }),
  );
  mock.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT stripe_account_id")
      ? [{ stripe_account_id: "acct_pro", charges_enabled: true }]
      : sql.includes("request_my_payout_once")
        ? [{ data: record }]
        : sql.includes("RETURNING id")
          ? [{ id: payout.id }]
          : [],
  }));
  mock.provider.mockResolvedValue({
    payouts_enabled: true,
    capabilities: { transfers: "active" },
  });
  mock.transfer.mockResolvedValue({ id: "tr_local" });
  mock.retrieveTransfer.mockResolvedValue({
    id: "tr_local",
    destination: "acct_pro",
    amount: 500,
    amount_reversed: 0,
    currency: "gbp",
    metadata: { glohaus_payout_id: payout.id },
  });
  mock.payout.mockResolvedValue({ id: "po_local", arrival_date: 1900000000 });
  mock.reverse.mockResolvedValue({ id: "trr_local" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("binds the request and provider idempotency keys to one withdrawal", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mock.query).toHaveBeenCalledWith(
    "SELECT beauty.request_my_payout_once($1,$2,$3,$4) AS data",
    ["standard", 500, key, expect.any(String)],
  );
  expect(mock.transfer.mock.calls[0][1]).toEqual({
    idempotencyKey: `withdrawal-transfer-${payout.id}`,
  });
  expect(mock.payout.mock.calls[0][1]).toEqual({
    stripeAccount: "acct_pro",
    idempotencyKey: `withdrawal-payout-${payout.id}`,
  });
});
it.each(["requested", "processing", "paid", "failed", "cancelled"])(
  "replays %s without creating or cancelling provider money",
  async (status) => {
    record.claimed = false;
    record.status = status;
    expect((await POST(request())).status).toBe(
      status === "requested" ? 202 : 200,
    );
    expect(mock.transfer).not.toHaveBeenCalled();
    expect(mock.payout).not.toHaveBeenCalled();
    expect(mock.reverse).not.toHaveBeenCalled();
  },
);
it("checks current provider eligibility before reserving funds", async () => {
  mock.provider.mockResolvedValue({
    payouts_enabled: false,
    capabilities: { transfers: "active" },
  });
  expect((await POST(request())).status).toBe(409);
  expect(
    mock.query.mock.calls.some(([sql]) =>
      sql.includes("request_my_payout_once"),
    ),
  ).toBe(false);
});
it.each(["transfer", "payout"])(
  "keeps funds reserved after an uncertain %s response",
  async (stage) => {
    mock[stage as "transfer" | "payout"].mockRejectedValue({
      type: "StripeConnectionError",
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PAYOUT_REVIEW_REQUIRED");
    expect(mock.reverse).not.toHaveBeenCalled();
    expect(
      mock.query.mock.calls.some(([sql]) =>
        sql.includes("cancel_requested_payout"),
      ),
    ).toBe(false);
  },
);
it("restores the wallet only after a definitive rejection and a confirmed reversal", async () => {
  mock.payout.mockRejectedValue({
    type: "StripeInvalidRequestError",
    statusCode: 400,
  });
  await POST(request());
  expect(mock.reverse).toHaveBeenCalledOnce();
  expect(mock.query).toHaveBeenCalledWith(
    "SELECT beauty.cancel_requested_payout($1)",
    [payout.id],
  );
});
it("does not restore the wallet if transfer recovery fails", async () => {
  mock.payout.mockRejectedValue({
    type: "StripeInvalidRequestError",
    statusCode: 400,
  });
  mock.reverse.mockRejectedValue(new Error("temporary"));
  expect((await POST(request())).status).toBe(503);
  expect(
    mock.query.mock.calls.some(([sql]) =>
      sql.includes("cancel_requested_payout"),
    ),
  ).toBe(false);
});
it("does not create a payout against a reversed or mismatched transfer", async () => {
  mock.retrieveTransfer.mockResolvedValue({
    destination: "acct_other",
    amount: 500,
    amount_reversed: 500,
    currency: "gbp",
    metadata: { glohaus_payout_id: payout.id },
  });
  expect((await POST(request())).status).toBe(503);
  expect(mock.payout).not.toHaveBeenCalled();
  expect(mock.reverse).not.toHaveBeenCalled();
});
it("does not release funds after an uncertain reservation commit", async () => {
  mock.account.mockImplementation(async (_role, work) => {
    await work({ query: mock.query }, { professionalId: "pro" });
    throw new Error("commit uncertain");
  });
  expect((await POST(request())).status).toBe(503);
  expect(mock.transfer).not.toHaveBeenCalled();
  expect(
    mock.query.mock.calls.some(([sql]) =>
      sql.includes("cancel_requested_payout"),
    ),
  ).toBe(false);
});
it("rejects invalid request keys and unexpected amounts before financial work", async () => {
  expect((await POST(request({ requestKey: "invalid" }))).status).toBe(400);
  expect((await POST(request({ amountPence: 0 }))).status).toBe(400);
  expect(mock.account).not.toHaveBeenCalled();
});
