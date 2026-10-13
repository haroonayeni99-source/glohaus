import { beforeEach, describe, it, expect, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  denied: false,
  query: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("@/modules/admin/repository", () => ({
  withOwner: async (work: (db: unknown) => unknown) => {
    if (mocks.denied) throw new AccessError("FORBIDDEN", 403);
    return work({ query: mocks.query });
  },
}));
vi.mock("@/modules/payments/stripe", () => ({
  stripe: () => ({ paymentIntents: { retrieve: mocks.retrieve } }),
}));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async (work: (db: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
import { POST as change } from "@/app/api/v1/admin/commission/route";
import { POST as simulate } from "@/app/api/v1/admin/commission/simulate/route";
import { reconcileBookingProviderCost } from "@/modules/commission/provider-cost";
const id = "11111111-1111-4111-8111-111111111111";
function request(path: string, body: unknown, origin = "https://glohaus.test") {
  return new Request(`https://glohaus.test/api/v1/admin/commission${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  mocks.denied = false;
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({
    rows: [
      {
        data: {
          rule: {
            basisPoints: 800,
            standardBasisPoints: 800,
            ruleId: null,
            ruleReference: "standard:starter",
            pricingVersion: "v2",
            expiresAt: null,
          },
          fee: 100,
          verified: true,
        },
      },
    ],
  });
});
describe("Commission API security and read-only simulation", () => {
  it("denies cross-origin and malformed mutations before SQL", async () => {
    expect((await change(request("", {}, "https://evil.test"))).status).toBe(
      403,
    );
    expect((await change(request("", {}))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("requires exact positive confirmation", async () => {
    expect(
      (
        await change(
          request("", {
            action: "activation",
            enabled: true,
            reason: "Owner activation",
            confirmed: false,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("blocks non-owner mutation and simulation", async () => {
    mocks.denied = true;
    expect(
      (
        await change(
          request("", {
            action: "activation",
            enabled: true,
            reason: "Owner activation",
            confirmed: true,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await simulate(
          request("/simulate", {
            professionalId: id,
            atTime: "2026-10-16T10:00:00Z",
            servicePence: 5000,
            depositPence: 2000,
            bookings: 1,
            providerBasisPoints: 150,
            providerFixedPence: 20,
            refundPence: 0,
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("sends reviewed rule values to the authoritative database routine", async () => {
    const body = {
      action: "create",
      kind: "platform",
      professionalId: null,
      scope: "verified",
      basisPoints: 200,
      startsAt: "2026-10-16T10:00:00Z",
      endsAt: "2026-11-16T10:00:00Z",
      reason: "Owner scheduled offer",
      confirmed: true,
    };
    expect((await change(request("", body))).status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT beauty.owner_commission_action($1::jsonb) AS data",
      [JSON.stringify(body)],
    );
  });
  for (const scenario of ["zero", "two", "standard"])
    it(`simulates ${scenario} using only the read-only resolver`, async () => {
      const response = await simulate(
        request("/simulate", {
          professionalId: id,
          scenario,
          atTime: "2026-10-16T10:00:00Z",
          servicePence: 5000,
          depositPence: 2000,
          bookings: 1,
          providerBasisPoints: 150,
          providerFixedPence: 20,
          refundPence: 0,
        }),
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.rule.pricingVersion).toBe("simulation-only");
      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.query.mock.calls[0][0]).toBe(
        "SELECT beauty.owner_simulate_commission_rule($1,$2) AS data",
      );
    });
});
describe("Stripe actual-cost reconciliation", () => {
  const intent = () => ({
    metadata: { booking_id: id },
    currency: "gbp",
    latest_charge: {
      payment_intent: "pi_test",
      currency: "gbp",
      amount: 2100,
      balance_transaction: {
        id: "txn_test",
        amount: 2100,
        fee: 52,
        currency: "gbp",
      },
    },
  });
  it("records actual provider cost without creating payments or transfers", async () => {
    mocks.retrieve.mockResolvedValue(intent());
    expect(await reconcileBookingProviderCost(id, "pi_test")).toBe(true);
    expect(mocks.retrieve).toHaveBeenCalledWith("pi_test", {
      expand: ["latest_charge.balance_transaction"],
    });
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,$4,$5,$6)",
      [id, "pi_test", "txn_test", 2100, 52, "gbp"],
    );
  });
  it("leaves unavailable balance transactions pending instead of using an estimate", async () => {
    mocks.retrieve.mockResolvedValue({ latest_charge: null });
    expect(await reconcileBookingProviderCost(id, "pi_test")).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects a balance transaction for another booking", async () => {
    const data = intent();
    data.metadata.booking_id = "other";
    mocks.retrieve.mockResolvedValue(data);
    await expect(reconcileBookingProviderCost(id, "pi_test")).rejects.toThrow(
      "PAYMENT_MISMATCH",
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
