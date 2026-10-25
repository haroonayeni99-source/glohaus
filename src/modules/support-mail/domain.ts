import { z } from "zod";
export const SUPPORT_ADDRESS = "support@glohaus.shop";
export const SUPPORT_DESTINATION = "glohausuk@gmail.com";
export const SUPPORT_INBOX = "6ae7aafe-53ff-4c6e-a88e-56641c1eab4f";
const uuid = z.uuid();
export function mailbox(value: string): string | null {
  if (/[\r\n\x00-\x1f\x7f]/.test(value)) return null;
  const s = value.trim();
  const match = s.match(/^[^<>]*<([^<>]+)>$/);
  const address = (match ? match[1] : s).toLowerCase();
  return z.email().max(254).safeParse(address).success ? address : null;
}
export function caseReference(subject: string): string | null {
  const ids = [
    ...new Set(
      subject
        .match(
          /[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/gi,
        )
        ?.map((s) => s.toLowerCase()) ?? [],
    ),
  ];
  return ids.length === 1 && uuid.safeParse(ids[0]).success ? ids[0] : null;
}
export type MailEvent = {
  kind: "received" | "sent";
  emailId: string;
  threadId: string | null;
};
export function supportMailEvent(event: unknown): MailEvent | null {
  const e = z
    .object({
      type: z.string(),
      data: z.object({
        email_id: uuid,
        inbox_id: uuid.optional(),
        thread_id: uuid.optional(),
        from: z.string().optional(),
        to: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        received_for: z.array(z.string()).optional(),
      }),
    })
    .safeParse(event);
  if (!e.success) return null;
  const { type, data } = e.data;
  if (type === "inbox.email.received")
    return data.inbox_id === SUPPORT_INBOX
      ? {
          kind: "received",
          emailId: data.email_id,
          threadId: data.thread_id ?? null,
        }
      : null;
  if (
    type === "email.received" &&
    [
      ...(data.to ?? []),
      ...(data.bcc ?? []),
      ...(data.received_for ?? []),
    ].some((s) => mailbox(s) === SUPPORT_ADDRESS)
  )
    return { kind: "received", emailId: data.email_id, threadId: null };
  if (
    type === "email.sent" &&
    data.from &&
    mailbox(data.from) === SUPPORT_ADDRESS &&
    data.to?.length === 1 &&
    mailbox(data.to[0]) !== SUPPORT_DESTINATION
  )
    return { kind: "sent", emailId: data.email_id, threadId: null };
  return null;
}
export function header(
  headers: Record<string, string> | null | undefined,
  name: string,
) {
  return (
    Object.entries(headers ?? {}).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1] ?? ""
  );
}
export function inboundDecision(email: {
  from: string;
  to: string[];
  bcc?: string[] | null;
  received_for?: string[];
  headers?: Record<string, string> | null;
  authentication?: { dmarc?: string; dkim?: string } | null;
}): {
  state: "process" | "ignored" | "quarantined";
  reason: string;
  sender: string | null;
} {
  const sender = mailbox(email.from);
  if (!sender)
    return { state: "quarantined", reason: "invalid_sender", sender: null };
  if (
    ![...email.to, ...(email.bcc ?? []), ...(email.received_for ?? [])].some(
      (s) => mailbox(s) === SUPPORT_ADDRESS,
    )
  )
    return { state: "ignored", reason: "wrong_recipient", sender };
  if (
    sender === SUPPORT_ADDRESS ||
    header(email.headers, "x-glohaus-support-forward") ||
    header(email.headers, "x-loop").toLowerCase().includes(SUPPORT_ADDRESS) ||
    /^auto-replied$/i.test(header(email.headers, "auto-submitted"))
  )
    return { state: "ignored", reason: "forwarding_loop", sender };
  // Only receiving-server computed results; never parse Authentication-Results supplied by senders.
  const a = email.authentication;
  if (a?.dmarc !== "pass" && !(a?.dkim === "pass" && a?.dmarc === "gray"))
    return {
      state: "quarantined",
      reason: "sender_authentication_review",
      sender,
    };
  return { state: "process", reason: "verified_transport", sender };
}
export function safeSubject(subject: string) {
  return (
    subject.replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, 900) || "(no subject)"
  );
}

export function supportDeliveryEvent(value: unknown) {
  const p = z
    .object({
      type: z.enum([
        "email.delivered",
        "email.delivery_delayed",
        "email.bounced",
        "email.complained",
        "email.failed",
        "email.suppressed",
      ]),
      created_at: z.iso.datetime({ offset: true }),
      data: z.object({ email_id: z.uuid(), from: z.string() }),
    })
    .safeParse(value);
  return p.success && mailbox(p.data.data.from) === SUPPORT_ADDRESS
    ? {
        providerEmailId: p.data.data.email_id,
        providerEventType: p.data.type,
        providerEventAt: p.data.created_at,
      }
    : null;
}
