import {z} from "zod";
export type ProviderEmailEvent = {
  providerEmailId: string;
  rebookingJobId?: string;
  providerEventType:
    | "email.delivered"
    | "email.bounced"
    | "email.complained"
    | "email.failed"
    | "email.suppressed";
  providerEventAt: string | null;
  recipientEmail: string | null;
};

const supported = new Set<ProviderEmailEvent["providerEventType"]>([
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function providerEmailEvent(value: unknown): ProviderEmailEvent | null {
  if (!isRecord(value) || typeof value.type !== "string" || !supported.has(value.type as ProviderEmailEvent["providerEventType"])) {
    return null;
  }
  if (!isRecord(value.data) || typeof value.data.email_id !== "string") return null;

  const to = Array.isArray(value.data.to)
    ? value.data.to.find((item): item is string => typeof item === "string")
    : null;

  const tag=isRecord(value.data.tags)?value.data.tags.glohaus_rebooking_id:undefined;
  const jobId=z.uuid().safeParse(tag);
  return {
    ...(jobId.success?{rebookingJobId:jobId.data}:{}),
    providerEmailId: value.data.email_id,
    providerEventType: value.type as ProviderEmailEvent["providerEventType"],
    providerEventAt: typeof value.created_at === "string" ? value.created_at : null,
    recipientEmail: to ?? null,
  };
}
