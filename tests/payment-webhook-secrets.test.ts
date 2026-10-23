import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: (work: (db: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
import { paymentWebhookSecrets } from "@/modules/payments/webhook-secrets";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("supports both endpoint secrets during an explicitly approved rotation overlap", async () => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture-platform-current");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET_PREVIOUS", "fixture-platform-previous");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "fixture-connect-current");
  vi.stubEnv(
    "STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS",
    "fixture-connect-previous",
  );
  expect(await paymentWebhookSecrets()).toEqual([
    "fixture-platform-current",
    "fixture-platform-previous",
    "fixture-connect-current",
    "fixture-connect-previous",
  ]);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("keeps the restricted database fallback when no environment secret is configured", async () => {
  for (const key of [
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET_PREVIOUS",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS",
  ])
    vi.stubEnv(key, "");
  mocks.query.mockResolvedValue({
    rows: [{ secret_value: "fixture-fallback" }],
  });
  expect(await paymentWebhookSecrets()).toEqual(["fixture-fallback"]);
});
