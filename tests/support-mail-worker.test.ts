import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  get: vi.fn(),
  sentGet: vi.fn(),
  send: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: (work: (db: object) => unknown) =>
    work({ query: mocks.query }),
}));
import {
  deliverSupportForwarding,
  originalEmail,
} from "@/modules/support-mail/worker";
const job = {
  id: "11111111-1111-4111-8111-111111111111",
  provider_email_id: "22222222-2222-4222-8222-222222222222",
  kind: "received",
  thread_id: null,
  lease: "33333333-3333-4333-8333-333333333333",
};
const original = {
  id: job.provider_email_id,
  from: "Customer <customer@example.test>",
  to: ["support@glohaus.shop"],
  subject: "Original subject",
  text: "Original private message",
  html: "<p>Original private message</p>",
  headers: {},
  authentication: { dmarc: "pass", dkim: "pass" },
  message_id: "<original@example.test>",
  raw: { download_url: "https://cdn.resend.app/receiving/raw/fixture" },
  attachments: [{ filename: "evidence.pdf" }],
};
const client = () =>
  ({
    emails: {
      receiving: { get: mocks.get },
      get: mocks.sentGet,
      send: mocks.send,
    },
  }) as never;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("SUPPORT_EMAIL_FORWARDING_ENABLED", "true");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_support_mail")
      ? [job]
      : sql.includes("identify_support_mail")
        ? [{ data: { duplicate: false, caseId: null } }]
        : [],
  }));
  mocks.get.mockResolvedValue({ data: original, error: null });
  mocks.fetch.mockResolvedValue(
    new Response("Original MIME with private message and PDF attachment", {
      status: 200,
    }),
  );
  mocks.send.mockResolvedValue({
    data: { id: "44444444-4444-4444-8444-444444444444" },
    error: null,
  });
});
it("forwards the exact original MIME to fixed Gmail with the real customer Reply-To and an idempotency key", async () => {
  await deliverSupportForwarding(client());
  const [message, options] = mocks.send.mock.calls[0];
  expect(message.to).toBe("glohausuk@gmail.com");
  expect(message.from).toBe("GLOHAUS Support <support@glohaus.shop>");
  expect(message.replyTo).toBe("customer@example.test");
  expect(message.headers["X-GLOHAUS-Support-Forward"]).toBe("1");
  expect(message.attachments[0].content.toString()).toContain("PDF attachment");
  expect(options.idempotencyKey).toBe(`glohaus-support-forward-${job.id}`);
  expect(
    mocks.query.mock.calls.find((c) =>
      c[0].includes("finish_support_mail"),
    )?.[1][2],
  ).toBe("forwarded");
});
it("quarantines failed sender verification without forwarding or downloading attachments", async () => {
  mocks.get.mockResolvedValue({
    data: { ...original, authentication: null },
    error: null,
  });
  await deliverSupportForwarding(client());
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(
    mocks.query.mock.calls.find((c) =>
      c[0].includes("finish_support_mail"),
    )?.[1][2],
  ).toBe("quarantined");
});
it("stops duplicates before downloading or sending", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_support_mail")
      ? [job]
      : [{ data: { duplicate: true, caseId: null } }],
  }));
  await deliverSupportForwarding(client());
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("retries provider failures without claiming delivery", async () => {
  mocks.send.mockResolvedValue({
    data: null,
    error: { message: "temporary failure" },
  });
  await deliverSupportForwarding(client());
  expect(
    mocks.query.mock.calls
      .find((c) => c[0].includes("finish_support_mail"))?.[1]
      .slice(2, 4),
  ).toEqual(["retry", "provider_retry_required"]);
});
it("never fetches sender-controlled or redirected original locations", async () => {
  await expect(originalEmail("http://127.0.0.1/private")).rejects.toThrow(
    "unsafe_original_location",
  );
  await expect(
    originalEmail("https://attacker.example.test/file"),
  ).rejects.toThrow("unsafe_original_location");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("holds oversized originals rather than silently dropping attachments", async () => {
  mocks.fetch.mockResolvedValue(
    new Response("", {
      headers: { "content-length": String(25 * 1024 * 1024) },
    }),
  );
  await deliverSupportForwarding(client());
  expect(mocks.send).not.toHaveBeenCalled();
  expect(
    mocks.query.mock.calls
      .find((c) => c[0].includes("finish_support_mail"))?.[1]
      .slice(2, 4),
  ).toEqual(["quarantined", "original_too_large"]);
});
it("does no provider or database work when disabled", async () => {
  vi.stubEnv("SUPPORT_EMAIL_FORWARDING_ENABLED", "false");
  expect(await deliverSupportForwarding(client())).toEqual({
    enabled: false,
    processed: 0,
  });
  expect(mocks.query).not.toHaveBeenCalled();
});

it("records outgoing SMTP replies only against a safely matched ticket", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_support_mail")
      ? [{ ...job, kind: "sent" }]
      : sql.includes("identify_support_mail")
        ? [{ data: { caseId: job.id } }]
        : [],
  }));
  mocks.sentGet.mockResolvedValue({
    data: {
      from: "GLOHAUS Support <support@glohaus.shop>",
      to: ["customer@example.test"],
      subject: `Re: [GLOHAUS ${job.id}] Help`,
      last_event: "delivered",
    },
    error: null,
  });
  await deliverSupportForwarding(client());
  expect(mocks.send).not.toHaveBeenCalled();
  expect(
    mocks.query.mock.calls.find((c) =>
      c[0].includes("identify_support_mail"),
    )?.[1],
  ).toEqual([job.id, job.lease, job.id, "customer@example.test"]);
  expect(
    mocks.query.mock.calls.find((c) =>
      c[0].includes("finish_support_mail"),
    )?.[1][2],
  ).toBe("linked");
});
it("does not redirect Gmail replies to an unverified customer-supplied Reply-To", async () => {
  mocks.get.mockResolvedValue({
    data: {
      ...original,
      reply_to: ["attacker@example.test"],
      headers: { "reply-to": "attacker@example.test" },
    },
    error: null,
  });
  await deliverSupportForwarding(client());
  expect(mocks.send.mock.calls[0][0].replyTo).toBe("customer@example.test");
});
