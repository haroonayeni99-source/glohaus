import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/professional/plans/checkout/route";
import { matchesMonthlyPlanPrice } from "@/modules/payments/plan-offers";
import type Stripe from "stripe";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  query: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({ withAccount: mocks.account }));
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => true,
  stripe: () => ({
    prices: { retrieve: mocks.retrieve },
    checkout: { sessions: { create: mocks.create } },
  }),
}));
const validPrice = {
  id: "price_pro_test",
  active: true,
  currency: "gbp",
  unit_amount: 999,
  type: "recurring",
  billing_scheme: "per_unit",
  transform_quantity: null,
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
} as Stripe.Price;
function request(overrides = {}, origin = "https://glohaus.test") {
  return new Request(
    "https://glohaus.test/api/v1/professional/plans/checkout",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        plan: "pro",
        pricingAccepted: true,
        quotedPriceId: "price_pro_test",
        quotedMonthlyPricePence: 999,
        ...overrides,
      }),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro_test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://glohaus.test");
  mocks.account.mockImplementation((_role, work) =>
    work(
      { query: mocks.query },
      {
        professionalId: "fixture-professional",
        email: "professional@example.test",
      },
    ),
  );
  mocks.query.mockImplementation((sql) =>
    Promise.resolve({
      rows: sql.includes("professional_plan_definitions")
        ? [{ monthly_price_pence: 999 }]
        : [],
    }),
  );
  mocks.retrieve.mockResolvedValue(validPrice);
  mocks.create.mockResolvedValue({
    url: "https://checkout.example.test/fictional",
  });
});
it("opens checkout only for the quoted catalogue amount and matching current provider price", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.retrieve).toHaveBeenCalledWith("price_pro_test");
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      line_items: [{ price: "price_pro_test", quantity: 1 }],
      cancel_url: "https://glohaus.test/professional/plans?subscription=cancelled",
      success_url: "https://glohaus.test/professional/plans?subscription=success",
      metadata: expect.objectContaining({
        glohaus_monthly_price_pence: "999",
        glohaus_pricing_ack_version: "professional-pricing-v2",
      }),
    }),
  );
});
it("returns to the initiating professional site even when the configured URL is stale", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://glohaus1.vercel.app");
  expect((await POST(request())).status).toBe(200);
  expect(mocks.create.mock.calls[0][0].cancel_url).toBe("https://glohaus.test/professional/plans?subscription=cancelled");
});
it.each([
  { quotedMonthlyPricePence: 1999 },
  { quotedPriceId: "price_old_test" },
])(
  "rejects an outdated quote before contacting checkout: %j",
  async (quote) => {
    expect((await POST(request(quote))).status).toBe(409);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  },
);
it.each([
  { unit_amount: 1999 },
  { currency: "usd" },
  { active: false },
  { recurring: { interval: "year", interval_count: 1 } },
  { recurring: { interval: "month", interval_count: 2 } },
  { billing_scheme: "tiered" },
  { transform_quantity: { divide_by: 2 } },
])("refuses a mismatched provider price: %j", async (change) => {
  const price = { ...validPrice, ...change } as Stripe.Price;
  expect(matchesMonthlyPlanPrice(price, 999)).toBe(false);
  mocks.retrieve.mockResolvedValue(price);
  expect((await POST(request())).status).toBe(503);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([
  { plan: "toString" },
  { plan: "starter" },
  { pricingAccepted: false },
  { quotedMonthlyPricePence: 0 },
])("rejects invalid plan consent/quotes: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("preserves the professional session and same-origin boundaries", async () => {
  mocks.account.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request({}, "https://untrusted.test"))).status).toBe(403);
  expect(mocks.retrieve).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
