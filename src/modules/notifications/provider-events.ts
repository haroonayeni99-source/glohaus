export type ProviderEmailEvent = {
  providerEmailId: string;
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

  return {
    providerEmailId: value.data.email_id,
    providerEventType: value.type as ProviderEmailEvent["providerEventType"],
    providerEventAt: typeof value.created_at === "string" ? value.created_at : null,
    recipientEmail: to ?? null,
  };
}
