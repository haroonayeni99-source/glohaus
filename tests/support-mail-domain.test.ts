import { it, expect } from "vitest";
import {
  caseReference,
  inboundDecision,
  supportMailEvent,
  SUPPORT_INBOX,
  SUPPORT_ADDRESS,
} from "@/modules/support-mail/domain";
const id = "11111111-1111-4111-8111-111111111111";
const mail = {
  from: "Customer <customer@example.test>",
  to: [SUPPORT_ADDRESS],
  headers: {},
  authentication: { dmarc: "pass", dkim: "pass" },
};
it("accepts only the existing inbox and exact support recipients", () => {
  expect(
    supportMailEvent({
      type: "inbox.email.received",
      data: { email_id: id, inbox_id: SUPPORT_INBOX, thread_id: id },
    })?.kind,
  ).toBe("received");
  expect(
    supportMailEvent({
      type: "inbox.email.received",
      data: { email_id: id, inbox_id: id },
    }),
  ).toBeNull();
  expect(
    supportMailEvent({
      type: "email.received",
      data: { email_id: id, to: ["not-support@glohaus.shop"] },
    }),
  ).toBeNull();
  expect(
    supportMailEvent({
      type: "email.received",
      data: { email_id: id, bcc: [SUPPORT_ADDRESS] },
    })?.kind,
  ).toBe("received");
});
it("does not trust forged authentication headers or missing/failed provider authentication", () => {
  expect(inboundDecision(mail).state).toBe("process");
  expect(
    inboundDecision({
      ...mail,
      authentication: null,
      headers: { "Authentication-Results": "dmarc=pass; dkim=pass" },
    }).state,
  ).toBe("quarantined");
  expect(
    inboundDecision({
      ...mail,
      authentication: { dmarc: "fail", dkim: "pass" },
    }).state,
  ).toBe("quarantined");
});
it("stops same-address, marked-forward and automatic-reply loops", () => {
  for (const patch of [
    { from: SUPPORT_ADDRESS },
    { headers: { "X-GLOHAUS-Support-Forward": "1" } },
    { headers: { "X-Loop": SUPPORT_ADDRESS } },
    { headers: { "Auto-Submitted": "auto-replied" } },
  ] as Partial<Parameters<typeof inboundDecision>[0]>[])
    expect(inboundDecision({ ...mail, ...patch }).state).toBe("ignored");
});
it("rejects header injection and ambiguous case references", () => {
  expect(
    inboundDecision({
      ...mail,
      from: "customer@example.test\r\nBcc: attacker@example.test",
    }).state,
  ).toBe("quarantined");
  expect(caseReference(`Re: [GLOHAUS ${id}] help`)).toBe(id);
  expect(
    caseReference(`${id} 22222222-2222-4222-8222-222222222222`),
  ).toBeNull();
});
it("never queues automatic forwards as outgoing customer conversations", () => {
  expect(
    supportMailEvent({
      type: "email.sent",
      data: {
        email_id: id,
        from: SUPPORT_ADDRESS,
        to: ["glohausuk@gmail.com"],
      },
    }),
  ).toBeNull();
  expect(
    supportMailEvent({
      type: "email.sent",
      data: {
        email_id: id,
        from: SUPPORT_ADDRESS,
        to: ["customer@example.test"],
      },
    })?.kind,
  ).toBe("sent");
});
