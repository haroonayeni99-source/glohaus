import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  transfers: vi.fn(),
  transfer: vi.fn(),
  payouts: vi.fn(),
  payout: vi.fn(),
  overview: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/modules/payments/stripe", () => ({
  stripe: () => ({
    transfers: { retrieve: mock.transfer, list: mock.transfers },
    payouts: { retrieve: mock.payout, list: mock.payouts },
  }),
}));
vi.mock("@/modules/admin/repository", () => ({
  adminFinanceOverview: mock.overview,
}));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: (work: (db: unknown) => unknown) =>
    work({ query: mock.query }),
}));
import {
  auditPayout,
  type PayoutAuditRecord,
} from "@/modules/payments/payout-audit";
import { GET } from "@/app/api/v1/admin/payout-reconciliation/route";
const row: PayoutAuditRecord = {
  id: "payout-local",
  kind: "standard",
  requested_pence: 500,
  bank_amount_pence: 500,
  status: "paid",
  created_at: new Date().toISOString(),
  expected_arrival_at: null,
  provider_payout_id: "po_local",
  provider_transfer_id: "tr_local",
  stripe_account_id: "acct_pro",
  issue_code: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.overview.mockResolvedValue({
    recentPayouts: [{ id: row.id, business_name: "Fictional Studio" }],
  });
  mock.query.mockResolvedValue({ rows: [row] });
  mock.transfer.mockResolvedValue({
    id: "tr_local",
    destination: "acct_pro",
    amount: 500,
    amount_reversed: 0,
    currency: "gbp",
    metadata: { glohaus_payout_id: row.id },
  });
  mock.payout.mockResolvedValue({
    id: "po_local",
    amount: 500,
    method: "standard",
    currency: "gbp",
    status: "paid",
    metadata: { glohaus_payout_id: row.id, glohaus_transfer_id: "tr_local" },
    destination: { bank_account: "private" },
  });
});
it("returns a read-only match with no bank values or provider object exposed", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({
    readOnly: true,
    checks: [
      {
        id: row.id,
        professional: "Fictional Studio",
        platformStatus: "paid",
        stripeStatus: "paid",
        issues: [],
      },
    ],
  });
  expect(JSON.stringify(data)).not.toMatch(
    /bank_account|private|acct_pro|po_local|tr_local/,
  );
  expect(
    mock.query.mock.calls.every(([sql]) =>
      sql.trimStart().startsWith("SELECT"),
    ),
  ).toBe(true);
});
it("enforces the financial reporting boundary before database and Stripe reads", async () => {
  const { AccessError } = await import("@/modules/accounts/domain");
  mock.overview.mockRejectedValue(new AccessError("MFA_REQUIRED", 403));
  expect((await GET()).status).toBe(403);
  expect(mock.query).not.toHaveBeenCalled();
  expect(mock.payout).not.toHaveBeenCalled();
});
it("reports mismatches and failed recovery instead of silently declaring agreement", async () => {
  const result = await auditPayout({ ...row, status: "failed" });
  expect(result.issues.join(" ")).toMatch(/recovery is not confirmed/);
  expect(result.issues.join(" ")).toMatch(/statuses differ/);
});
it("keeps an unconfirmed payout inconclusive", async () => {
  mock.transfers.mockResolvedValue({ data: [] });
  mock.payouts.mockResolvedValue({ data: [] });
  const result = await auditPayout({
    ...row,
    provider_payout_id: null,
    provider_transfer_id: null,
    status: "requested",
  });
  expect(result.issues.join(" ")).toMatch(/Do not send a replacement/);
});
it("reports provider read failures without treating them as a successful check", async () => {
  mock.payout.mockRejectedValue(new Error("unavailable"));
  expect((await auditPayout(row)).issues.join(" ")).toMatch(
    /could not be checked/,
  );
});
