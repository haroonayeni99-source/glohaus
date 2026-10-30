import { describe, expect, it } from "vitest";
import { providerEmailEvent } from "@/modules/notifications/provider-events";

describe("Resend provider email events", () => {
  it("accepts supported delivery outcomes", () => {
    expect(
      providerEmailEvent({
        type: "email.delivered",
        created_at: "2026-09-28T10:30:00.000Z",
        data: { email_id: "email_123", to: ["customer@example.test"] },
      }),
    ).toEqual({
      providerEmailId: "email_123",
      providerEventType: "email.delivered",
      providerEventAt: "2026-09-28T10:30:00.000Z",
      recipientEmail: "customer@example.test",
    });
  });

  it("accepts bounce and complaint events for suppression handling", () => {
    for (const type of ["email.bounced", "email.complained", "email.suppressed"] as const) {
      expect(
        providerEmailEvent({
          type,
          data: { email_id: "email_456", to: ["blocked@example.test"] },
        })?.providerEventType,
      ).toBe(type);
    }
  });

  it("ignores unrelated or malformed events", () => {
    expect(providerEmailEvent({ type: "email.opened", data: { email_id: "email_1" } })).toBeNull();
    expect(providerEmailEvent({ type: "email.delivered", data: {} })).toBeNull();
    expect(providerEmailEvent(null)).toBeNull();
  });
});
it("recognises only valid rebooking job tags from verified provider event data",()=>{
 const job="00000000-0000-4000-8000-000000000001";
 expect(providerEmailEvent({type:"email.bounced",data:{email_id:"fixture",tags:{glohaus_rebooking_id:job}}})?.rebookingJobId).toBe(job);
 expect(providerEmailEvent({type:"email.bounced",data:{email_id:"fixture",tags:{glohaus_rebooking_id:"invalid"}}})?.rebookingJobId).toBeUndefined();
});
