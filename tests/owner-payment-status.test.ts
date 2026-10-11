// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OwnerBackendHealthPanel } from "@/components/owner-backend-health-panel";
import type {
  OwnerBackendHealth,
  PaymentLaunchReadiness,
} from "@/modules/admin/repository";
const health: OwnerBackendHealth = {
  jobs: {
    maintenance: { lastSuccessAt: null, lastFailureAt: null, failures24h: 0 },
    notifications: { lastSuccessAt: null, lastFailureAt: null, failures24h: 0 },
  },
  queues: {
    bookingEmailPending: 0,
    bookingEmailExhausted: 0,
    productEmailPending: 0,
    productEmailExhausted: 0,
    marketingPending: 0,
    marketingExhausted: 0,
  },
  integrity: {
    unbalancedLedgerTransactions: 0,
    negativeProfessionalAvailableBalances: 0,
    bookingsMissingQuote: 0,
    paidOrdersMissingPaymentLedger: 0,
    bookingRefundAmountMismatches: 0,
    bookingTransfersMissingProviderId: 0,
    productTransfersMissingProviderId: 0,
    payoutAmountMismatches: 0,
    openDisputeReserveMismatches: 0,
  },
};
function render(payment: PaymentLaunchReadiness | null) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    React.createElement(OwnerBackendHealthPanel, { health, payment }),
  );
  return {
    metric: root.querySelectorAll(".analytics-grid article")[3],
    payment: [...root.querySelectorAll(".service-edit-row")].find(
      (row) => row.querySelector("h3")?.textContent === "Payment setup",
    )!,
  };
}
it("shows unavailable rather than zero issues and healthy when payment checks fail to load", () => {
  const result = render(null);
  expect(result.metric.querySelector("strong")?.textContent).toBe("—");
  expect(result.payment.querySelector(".admin-status")?.textContent).toBe(
    "UNAVAILABLE",
  );
  expect(result.payment.textContent).toContain("could not be loaded");
  expect(result.payment.querySelector("a")?.getAttribute("href")).toBe(
    "#payment-readiness",
  );
});
it("keeps required missing checks visible and does not report healthy", () => {
  const result = render({
    ready: false,
    checks: [
      {
        key: "processor",
        label: "Payment processor",
        ready: false,
        required: true,
      },
    ],
  });
  expect(result.metric.querySelector("strong")?.textContent).toBe("1");
  expect(result.payment.querySelector(".admin-status")?.textContent).toBe(
    "ATTENTION",
  );
  expect(result.payment.textContent).toContain("Payment processor");
});
it("shows required checks passing while preserving optional setup behavior", () => {
  const result = render({
    ready: true,
    checks: [
      {
        key: "processor",
        label: "Payment processor",
        ready: true,
        required: true,
      },
      {
        key: "optional",
        label: "Optional feature",
        ready: false,
        required: false,
      },
    ],
  });
  expect(result.metric.querySelector("strong")?.textContent).toBe("0");
  expect(result.payment.querySelector(".admin-status")?.textContent).toBe(
    "HEALTHY",
  );
});
