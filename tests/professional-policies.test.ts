import { policyBookingTime } from "./fixtures/policy-booking-time";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  defaultPolicy,
  inheritedPolicy,
  policyFieldsSchema,
  type PolicyPreview,
  type BookingPolicy,
  type PolicyFields,
} from "@/modules/policies/domain";
const db = await createTestDatabase();
let pro: string;
let service: string;
async function as<T>(
  tx: SqlClient,
  auth: string,
  work: () => Promise<T>,
  role = "beauty_app",
  verified = true,
) {
  await tx.query("SAVEPOINT actor");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [auth, String(verified)],
  );
  try {
    const r = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT actor");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT actor");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT actor");
    throw e;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await work(tx);
      throw Error("ROLLBACK_TEST");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK_TEST")) throw e;
  }
}
const time = policyBookingTime;
async function save(
  tx: SqlClient,
  fields: Partial<PolicyFields> = {},
  specific = false,
  operation = "publish",
) {
  const scope = (
    await tx.query<{ revision: number }>(
      "SELECT revision FROM beauty.professional_policy_scopes WHERE professional_id=$1 AND service_id IS NOT DISTINCT FROM $2::uuid",
      [pro, specific ? service : null],
    )
  ).rows[0];
  return as(
    tx,
    "policy-pro",
    async () =>
      (
        await tx.query<{
          data: { versionId: string; reviewRequired: boolean };
        }>(
          "SELECT beauty.save_my_professional_policy($1,$2,$3,$4::jsonb) AS data",
          [
            specific ? service : null,
            operation,
            scope?.revision || 0,
            JSON.stringify({
              ...(specific ? inheritedPolicy : defaultPolicy),
              ...fields,
            }),
          ],
        )
      ).rows[0].data,
  );
}
async function preview(tx: SqlClient) {
  return as(
    tx,
    "",
    async () =>
      (
        await tx.query<{ data: PolicyPreview }>(
          "SELECT beauty.public_service_policy($1) AS data",
          [service],
        )
      ).rows[0].data,
  );
}
async function reserve(tx: SqlClient, hours = 72) {
  const p = await preview(tx);
  return as(
    tx,
    "policy-customer",
    async () =>
      (
        await tx.query<{ data: { id: string; depositPence: number } }>(
          "SELECT beauty.reserve_booking($1,$2,$3,true) AS data",
          [service, time(hours), p.token],
        )
      ).rows[0].data,
  );
}
async function operation(
  tx: SqlClient,
  id: string,
  payload: Record<string, unknown>,
  auth = "policy-pro",
) {
  return as(tx, auth, () =>
    tx.query("SELECT beauty.policy_booking_action($1,$2::jsonb)", [
      id,
      JSON.stringify(payload),
    ]),
  );
}
async function overview(tx: SqlClient, id: string, auth = "policy-customer") {
  return as(
    tx,
    auth,
    async () =>
      (
        await tx.query<{ data: BookingPolicy }>(
          "SELECT beauty.booking_policy_overview($1) AS data",
          [id],
        )
      ).rows[0].data,
  );
}
async function review(
  tx: SqlClient,
  body: Record<string, unknown>,
  verified = true,
) {
  return as(
    tx,
    "policy-admin",
    () =>
      tx.query("SELECT beauty.admin_policy_action($1::jsonb)", [
        JSON.stringify({
          reason: "Isolated fair-terms review",
          confirmed: true,
          ...body,
        }),
      ]),
    "beauty_app",
    verified,
  );
}
async function paid(tx: SqlClient, id: string) {
  const q = await as(
    tx,
    "policy-customer",
    async () =>
      (
        await tx.query<{ q: { customerTotalPence: number } }>(
          "SELECT beauty.prepare_booking_financial_quote($1) AS q",
          [id],
        )
      ).rows[0].q,
  );
  await as(tx, "policy-customer", () =>
    tx.query("SELECT beauty.attach_checkout($1,$2)", [id, "cs_" + id]),
  );
  await as(
    tx,
    "",
    async () => {
      await tx.query(
        "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
        ["evt_" + id, id, "cs_" + id, "pi_" + id, q.customerTotalPence, "gbp"],
      );
      await tx.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
        id,
        "pi_" + id,
      ]);
    },
    "beauty_payment_worker",
  );
  return q.customerTotalPence;
}
async function cancel(tx: SqlClient, id: string, auth = "policy-customer") {
  await as(tx, auth, () =>
    tx.query(
      "SELECT beauty.change_booking($1,'cancelled','Changed appointment plans')",
      [id],
    ),
  );
}
async function refund(
  tx: SqlClient,
  id: string,
  accepted = false,
  percentage = 0,
) {
  return as(
    tx,
    "policy-pro",
    async () =>
      (
        await tx.query<{
          data: { id: string; amountPence: number; status: string };
        }>(
          "SELECT beauty.decide_refund($1,$2,$3,'Isolated refund assessment') AS data",
          [id, accepted, percentage],
        )
      ).rows[0].data,
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const auth of [
    "policy-pro",
    "policy-customer",
    "policy-other",
    "policy-admin",
  ]) {
    const a = await db.transaction((tx) =>
      as(tx, auth, () =>
        enrolAccount(
          tx,
          {
            authId: auth,
            email: auth + "@example.test",
            displayName: auth,
            secondFactorAge: null,
          },
          auth === "policy-pro" ? "professional" : "customer",
        ),
      ),
    );
    if (auth === "policy-pro") pro = a.professionalId!;
    if (auth === "policy-admin")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [a.id],
      );
  }
  await db.query(
    "UPDATE beauty.professional_profiles SET slug='policy-studio',business_name='Policy Studio',bio='Professional appointments in London',city='London',category='Nails',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Policy service','',60,5000,2000,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_policy',true)",
    [pro],
  );
  for (let weekday = 0; weekday < 7; weekday++)
    await db.query(
      "INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,$2,0,1440)",
      [pro, weekday],
    );
});
afterAll(() => db.close());
describe("versioned professional policies and payments", () => {
  it("preserves email suppressions for confirmation and policy update deliveries", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await paid(tx, b.id);
      await operation(
        tx,
        b.id,
        {
          action: "requirements",
          preparationInfo: "Agreed products",
          healthInfo: "",
          healthConsent: false,
          consultationDone: false,
          patchTestDone: false,
        },
        "policy-customer",
      );
      await tx.query(
        "INSERT INTO beauty.email_suppressions(email,reason) VALUES('policy-customer@example.test','bounced')",
      );
      const jobs = await as(
        tx,
        "",
        async () =>
          (
            await tx.query<{ email: string; kind: string }>(
              "SELECT * FROM beauty.claim_notifications()",
            )
          ).rows,
        "beauty_payment_worker",
      );
      expect(jobs.length).toBeGreaterThan(0);
      expect(
        jobs.every((j) => j.email !== "policy-customer@example.test"),
      ).toBe(true);
      expect(jobs.map((j) => j.kind)).toContain("requirements_update");
    }));
  it("protects policy tables with forced RLS and keeps internal financial helpers out of public API roles", async () => {
    const tables = (
      await db.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='beauty'::regnamespace AND relname IN('professional_policy_scopes','professional_policy_versions','professional_policy_reviews','booking_policy_terms','booking_policy_events','booking_preparation','booking_reference_photos','booking_retention_reviews','professional_policy_audit')",
      )
    ).rows;
    expect(tables).toHaveLength(9);
    expect(tables.every((t) => t.relrowsecurity && t.relforcerowsecurity)).toBe(
      true,
    );
    const roles = (
      await db.query<{
        rolname: string;
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>(
        "SELECT rolname,rolbypassrls,rolsuper FROM pg_roles WHERE rolname IN('beauty_booking_ops','beauty_admin_ops')",
      )
    ).rows;
    expect(roles.every((r) => !r.rolbypassrls && !r.rolsuper)).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege('anon','beauty.notification_booking_policy(uuid)','EXECUTE') OR has_function_privilege('authenticated','beauty.policy_refund_assessment(uuid)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it("records a rejection explanation without moving the appointment or creating a charge", () =>
    isolated(async (tx) => {
      await save(tx, { freeReschedule: false, maxReschedules: 2 });
      const b = await reserve(tx);
      await paid(tx, b.id);
      await operation(
        tx,
        b.id,
        {
          action: "reschedule",
          startsAt: time(96),
          reason: "Request a later appointment",
        },
        "policy-customer",
      );
      const before = await overview(tx, b.id);
      const request = before.events.find(
        (e) => e.kind === "reschedule_requested",
      )!;
      await expect(
        operation(tx, b.id, {
          action: "approve_reschedule",
          eventId: request.id,
          accepted: false,
        }),
      ).rejects.toThrow("RESCHEDULE_REASON_REQUIRED");
      await operation(tx, b.id, {
        action: "approve_reschedule",
        eventId: request.id,
        accepted: false,
        reason: "The proposed time cannot be accommodated.",
      });
      const after = await overview(tx, b.id);
      expect(
        after.events.find((e) => e.kind === "reschedule_rejected")!.details
          .reason,
      ).toContain("cannot be accommodated");
      expect(after.terms).toEqual(before.terms);
      expect(
        (
          await tx.query<{ starts_at: Date }>(
            "SELECT starts_at FROM beauty.bookings WHERE id=$1",
            [b.id],
          )
        ).rows[0].starts_at,
      ).toEqual(new Date(before.terms!.original_starts_at));
    }));
  it("validates deposit bounds, enums, text limits and inherited service choices", () => {
    expect(policyFieldsSchema.safeParse(defaultPolicy).success).toBe(true);
    expect(
      policyFieldsSchema.safeParse({ ...defaultPolicy, depositPercent: 41 })
        .success,
    ).toBe(false);
    expect(
      policyFieldsSchema.safeParse({ ...defaultPolicy, graceMinutes: 1 })
        .success,
    ).toBe(false);
    expect(
      policyFieldsSchema.safeParse({
        ...defaultPolicy,
        customRules: "x".repeat(3001),
      }).success,
    ).toBe(false);
    expect(policyFieldsSchema.safeParse(inheritedPolicy).success).toBe(true);
  });
  it("preserves existing prices, deposits and separate customer fees in defaults", () =>
    isolated(async (tx) => {
      const p = await preview(tx);
      expect(p).toMatchObject({
        pricePence: 5000,
        depositPence: 2000,
        bookingFeePence: 100,
      });
      expect(p.rules.cancellationHours).toBe(24);
      expect(p).not.toHaveProperty("commission");
      expect(p).not.toHaveProperty("basisPoints");
    }));
  it("validates policies on the database and rejects stale editors", () =>
    isolated(async (tx) => {
      await save(tx, {}, false, "save");
      await expect(
        as(tx, "policy-pro", () =>
          tx.query(
            "SELECT beauty.save_my_professional_policy(NULL,'publish',0,$1::jsonb)",
            [JSON.stringify(defaultPolicy)],
          ),
        ),
      ).rejects.toThrow("POLICY_EDIT_CONFLICT");
      await expect(save(tx, { depositPercent: 99 })).rejects.toThrow(
        "INVALID_POLICY",
      );
    }));
  it("keeps drafts private and custom wording pending until authorised review", () =>
    isolated(async (tx) => {
      const v = await save(tx, {
        customRules: "Bring the agreed extensions to your appointment.",
      });
      expect(v.reviewRequired).toBe(true);
      expect((await preview(tx)).generalVersionId).toBeNull();
      await expect(
        review(tx, { action: "approve", versionId: v.versionId }, false),
      ).rejects.toThrow("FORBIDDEN");
      await review(tx, { action: "approve", versionId: v.versionId });
      expect((await preview(tx)).generalCustomRules).toContain("extensions");
      await expect(
        as(tx, "policy-other", () =>
          tx.query("SELECT * FROM beauty.professional_policy_versions"),
        ),
      ).rejects.toThrow("permission denied");
    }));
  it("does not republish a version after the professional withdraws it", () =>
    isolated(async (tx) => {
      const v = await save(tx, {
        restrictions: "A consultation is needed for safe service preparation.",
      });
      await save(tx, {}, false, "unpublish");
      await expect(
        review(tx, { action: "approve", versionId: v.versionId }),
      ).rejects.toThrow("POLICY_EDIT_CONFLICT");
    }));
  it("combines general requirements and service-specific preparation with clear timing precedence", () =>
    isolated(async (tx) => {
      await save(tx, {
        requireConsultation: true,
        preparation: ["clean_hair"],
        cancellationHours: 48,
      });
      await save(
        tx,
        {
          requireReferences: true,
          requireConsultation: false,
          preparation: ["reference_photos"],
          cancellationHours: 12,
          depositPercent: 25,
        },
        true,
      );
      const p = await preview(tx);
      expect(p.rules).toMatchObject({
        cancellationHours: 12,
        requireConsultation: true,
        requireReferences: true,
      });
      expect(p.rules.preparation).toEqual(["clean_hair", "reference_photos"]);
      expect(p.depositPence).toBe(1250);
      expect(p.publishedAt).toBeTruthy();
    }));
  it("requires an affirmative version acknowledgement and blocks the old reservation function", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2)", [service, time()]),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking_before_policies($1,$2)", [
            service,
            time(),
          ]),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2,$3,true)", [
            service,
            time(),
            "wrong-token",
          ]),
        ),
      ).rejects.toThrow("POLICY_CHANGED");
    }));
  it("rejects a stale acknowledgement after policy or pricing changes without holding a slot", () =>
    isolated(async (tx) => {
      const p = await preview(tx);
      await save(tx, { cancellationHours: 48 });
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2,$3,true)", [
            service,
            time(),
            p.token,
          ]),
        ),
      ).rejects.toThrow("POLICY_CHANGED");
      expect(
        (await tx.query("SELECT id FROM beauty.bookings")).rows,
      ).toHaveLength(0);
    }));
  it("records immutable accepted versions and commission pricing versions on reservations", () =>
    isolated(async (tx) => {
      const v = await save(tx, { depositPercent: 30, cancellationHours: 48 });
      const b = await reserve(tx);
      expect(b.depositPence).toBe(1500);
      await paid(tx, b.id);
      await save(tx, { depositPercent: 40, cancellationHours: 6 });
      const d = await overview(tx, b.id);
      expect(d.terms!.snapshot.generalVersionId).toBe(v.versionId);
      expect(d.terms!.snapshot.rules.cancellationHours).toBe(48);
      expect(d.terms!.deposit_pence).toBe(1500);
      expect(d.terms!.acknowledged_at).toBeTruthy();
      const t = (
        await tx.query<{ pricing_version: string }>(
          "SELECT pricing_version FROM beauty.booking_policy_terms WHERE booking_id=$1",
          [b.id],
        )
      ).rows[0];
      expect(t.pricing_version).toBe("commission-v2-baseline");
      expect(
        (
          await tx.query<{ commission_pence: number }>(
            "SELECT commission_pence FROM beauty.booking_commission_terms WHERE booking_id=$1",
            [b.id],
          )
        ).rows[0].commission_pence,
      ).toBe(400);
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("UPDATE beauty.booking_policy_terms SET deposit_pence=0"),
        ),
      ).rejects.toThrow("permission denied");
    }));
  it("retains full prepayment for unverified professionals despite a published deposit choice", () =>
    isolated(async (tx) => {
      await save(tx, { depositPercent: 15 });
      await tx.query(
        "UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",
        [pro],
      );
      await tx.query("UPDATE beauty.services SET deposit_pence=0 WHERE id=$1", [
        service,
      ]);
      const p = await preview(tx);
      expect(p.fullPrepayment).toBe(true);
      expect(p.depositPence).toBe(5000);
      expect((await reserve(tx)).depositPence).toBe(5000);
    }));
  it("requires an express early-service request without treating it as a refund waiver", () =>
    isolated(async (tx) => {
      const p = await preview(tx);
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2,$3,false)", [
            service,
            time(48),
            p.token,
          ]),
        ),
      ).rejects.toThrow("EARLY_SERVICE_REQUEST_REQUIRED");
      const b = await reserve(tx, 4);
      const captured = await paid(tx, b.id);
      await cancel(tx, b.id);
      expect((await overview(tx, b.id)).assessment.coolingOff).toBe(true);
      expect((await refund(tx, b.id)).amountPence).toBe(captured);
    }));
  it("allows one free available reschedule and preserves original time, pricing and terms", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await paid(tx, b.id);
      const before = (await overview(tx, b.id)).terms;
      await operation(
        tx,
        b.id,
        {
          action: "reschedule",
          startsAt: time(96),
          reason: "Request a different available appointment",
        },
        "policy-customer",
      );
      const after = await overview(tx, b.id);
      expect(after.events.filter((e) => e.kind === "rescheduled")).toHaveLength(
        1,
      );
      expect(after.terms).toEqual(before);
      await expect(
        operation(
          tx,
          b.id,
          {
            action: "reschedule",
            startsAt: time(120),
            reason: "Another new appointment time",
          },
          "policy-customer",
        ),
      ).rejects.toThrow("RESCHEDULE_LIMIT");
    }));
  it("enforces notice periods on direct rescheduling requests", () =>
    isolated(async (tx) => {
      const b = await reserve(tx, 4);
      await paid(tx, b.id);
      await expect(
        operation(
          tx,
          b.id,
          {
            action: "reschedule",
            startsAt: time(96),
            reason: "New appointment request",
          },
          "policy-customer",
        ),
      ).rejects.toThrow("RESCHEDULE_NOTICE");
    }));
  it("requires approval when a free change is not offered and rechecks availability on approval", () =>
    isolated(async (tx) => {
      await save(tx, { freeReschedule: false, maxReschedules: 2 });
      const b = await reserve(tx);
      await paid(tx, b.id);
      await operation(
        tx,
        b.id,
        {
          action: "reschedule",
          startsAt: time(96),
          reason: "Choose an appointment later in the week",
        },
        "policy-customer",
      );
      const d = await overview(tx, b.id);
      const request = d.events.find((e) => e.kind === "reschedule_requested")!;
      expect(d.events.some((e) => e.kind === "rescheduled")).toBe(false);
      await tx.query(
        "INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at,label) VALUES($1,$2,$2::timestamptz+interval '1 hour','Unavailable')",
        [pro, time(96)],
      );
      await expect(
        operation(tx, b.id, {
          action: "approve_reschedule",
          eventId: request.id,
          accepted: true,
        }),
      ).rejects.toThrow("SLOT_TAKEN");
    }));
  it("records late arrival without financial penalty and requires customer agreement to shorten", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await paid(tx, b.id);
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '20 minutes',ends_at=now()+interval '40 minutes' WHERE id=$1",
        [b.id],
      );
      await operation(tx, b.id, {
        action: "late",
        decision: "offer_shorten",
        shortenMinutes: 15,
        reason: "Customer arrived after the grace period",
      });
      let d = await overview(tx, b.id);
      const offer = d.events.find((e) => e.kind === "late")!;
      expect(offer.details.financialPenalty).toBe(false);
      expect(
        (
          await tx.query<{ status: string }>(
            "SELECT status FROM beauty.payments WHERE booking_id=$1",
            [b.id],
          )
        ).rows[0].status,
      ).toBe("paid");
      await expect(
        operation(tx, b.id, {
          action: "accept_shorten",
          eventId: offer.id,
          accepted: true,
        }),
      ).rejects.toThrow("FORBIDDEN");
      await operation(
        tx,
        b.id,
        { action: "accept_shorten", eventId: offer.id, accepted: true },
        "policy-customer",
      );
      d = await overview(tx, b.id);
      expect(d.events.some((e) => e.kind === "shorten_accepted")).toBe(true);
      expect(d.terms!.price_pence).toBe(5000);
    }));
  it("does not allow recording late arrival before the grace period", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await paid(tx, b.id);
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '55 minutes' WHERE id=$1",
        [b.id],
      );
      await expect(
        operation(tx, b.id, {
          action: "late",
          decision: "proceed",
          reason: "A reported delayed arrival",
        }),
      ).rejects.toThrow("INVALID_LATE_RECORD");
    }));
  it("gives full-refund protection when a professional cancels during late arrival handling", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      const captured = await paid(tx, b.id);
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '20 minutes',ends_at=now()+interval '40 minutes' WHERE id=$1",
        [b.id],
      );
      await operation(tx, b.id, {
        action: "late",
        decision: "cancel",
        reason: "Unable to deliver the booked appointment",
      });
      expect((await overview(tx, b.id)).assessment.mandatoryFullRefund).toBe(
        true,
      );
      expect((await refund(tx, b.id)).amountPence).toBe(captured);
    }));
  it("keeps optional health information private with separate consent and withdrawal", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await expect(
        operation(
          tx,
          b.id,
          {
            action: "requirements",
            preparationInfo: "",
            healthInfo: "Optional relevant health information",
            healthConsent: false,
            consultationDone: false,
            patchTestDone: false,
          },
          "policy-customer",
        ),
      ).rejects.toThrow("INVALID_REQUIREMENTS");
      await operation(
        tx,
        b.id,
        {
          action: "requirements",
          preparationInfo: "Bring agreed products",
          healthInfo: "Optional relevant health information",
          healthConsent: true,
          consultationDone: false,
          patchTestDone: false,
        },
        "policy-customer",
      );
      expect(
        (await overview(tx, b.id, "policy-pro")).requirements!.health_info,
      ).toContain("Optional");
      await expect(overview(tx, b.id, "policy-other")).rejects.toThrow(
        "FORBIDDEN",
      );
      const admin = await as(
        tx,
        "policy-admin",
        async () =>
          (
            await tx.query<{ data: unknown }>(
              "SELECT beauty.admin_policy_overview('',NULL) AS data",
            )
          ).rows[0].data,
      );
      expect(JSON.stringify(admin)).not.toContain(
        "Optional relevant health information",
      );
      await operation(
        tx,
        b.id,
        { action: "withdraw_health" },
        "policy-customer",
      );
      expect((await overview(tx, b.id)).requirements!.health_info).toBeNull();
    }));
  it("requires professional preparation review before service completion", () =>
    isolated(async (tx) => {
      await save(tx, {
        requirePatchTest: true,
        requireConsultation: true,
        requireReferences: true,
      });
      const b = await reserve(tx);
      await paid(tx, b.id);
      await expect(
        operation(tx, b.id, { action: "ready", confirmed: true }),
      ).rejects.toThrow("REQUIREMENTS_INCOMPLETE");
      await operation(
        tx,
        b.id,
        {
          action: "requirements",
          preparationInfo: "Agreed preparation completed",
          healthInfo: "",
          healthConsent: false,
          consultationDone: true,
          patchTestDone: true,
        },
        "policy-customer",
      );
      await as(tx, "policy-customer", () =>
        tx.query("SELECT beauty.add_booking_reference_photo($1,$2)", [
          b.id,
          Buffer.from("isolated reference bytes"),
        ]),
      );
      await operation(tx, b.id, { action: "ready", confirmed: true });
      expect(
        (await overview(tx, b.id)).requirements!.professional_ready_at,
      ).toBeTruthy();
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",
        [b.id],
      );
      await as(tx, "policy-pro", () =>
        tx.query(
          "SELECT beauty.change_booking($1,'completed','Service delivered')",
          [b.id],
        ),
      );
    }));
  it("does not retain money just because a professional marks no-show", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await paid(tx, b.id);
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",
        [b.id],
      );
      await as(tx, "policy-pro", () =>
        tx.query(
          "SELECT beauty.change_booking($1,'no_show','Reported no attendance')",
          [b.id],
        ),
      );
      expect(
        (
          await tx.query<{ status: string }>(
            "SELECT status FROM beauty.payments WHERE booking_id=$1",
            [b.id],
          )
        ).rows[0].status,
      ).toBe("refund_required");
      expect(
        (await overview(tx, b.id)).events.some(
          (e) => e.kind === "no_show_review",
        ),
      ).toBe(true);
    }));
  it("requires evidence and Admin review for lawful late cancellation retention", () =>
    isolated(async (tx) => {
      await save(tx, { cancellationHours: 48 });
      const b = await reserve(tx, 4);
      await paid(tx, b.id);
      await tx.query(
        "UPDATE beauty.booking_policy_terms SET acknowledged_at=now()-interval '20 days' WHERE booking_id=$1",
        [b.id],
      );
      await cancel(tx, b.id);
      await expect(refund(tx, b.id)).rejects.toThrow(
        "RETENTION_REVIEW_REQUIRED",
      );
      await operation(tx, b.id, {
        action: "retention",
        lossPence: 1000,
        evidence:
          "Documented direct costs incurred for this cancelled booking.",
        mitigation:
          "The slot was offered again but no replacement booking was received.",
      });
      expect((await overview(tx, b.id)).retention!.status).toBe("pending");
      await expect(refund(tx, b.id, true, 50)).rejects.toThrow(
        "RETENTION_REVIEW_REQUIRED",
      );
      await review(tx, {
        action: "retention",
        bookingId: b.id,
        approved: true,
      });
      const d = await refund(tx, b.id, true, 60);
      expect(d.amountPence).toBe(1260);
      expect((await refund(tx, b.id, true, 100)).id).toBe(d.id);
    }));
  it("rejects retention of a mandatory statutory refund", () =>
    isolated(async (tx) => {
      const b = await reserve(tx, 4);
      await paid(tx, b.id);
      await cancel(tx, b.id);
      await expect(
        operation(tx, b.id, {
          action: "retention",
          lossPence: 1000,
          evidence: "Documented direct costs for the appointment.",
          mitigation: "The appointment was advertised to fill the slot again.",
        }),
      ).rejects.toThrow("INVALID_RETENTION_REVIEW");
    }));
  it("removes preparation text, consent and private photographs after the retention window without altering accepted terms", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await operation(
        tx,
        b.id,
        {
          action: "requirements",
          preparationInfo: "Agreed preparation",
          healthInfo: "Private optional information",
          healthConsent: true,
          consultationDone: false,
          patchTestDone: false,
        },
        "policy-customer",
      );
      await as(tx, "policy-customer", () =>
        tx.query("SELECT beauty.add_booking_reference_photo($1,$2)", [
          b.id,
          Buffer.from("isolated reference bytes"),
        ]),
      );
      await tx.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '32 days',ends_at=now()-interval '32 days'+interval '1 hour' WHERE id=$1",
        [b.id],
      );
      await as(
        tx,
        "",
        () => tx.query("SELECT beauty.purge_booking_preparation()"),
        "beauty_payment_worker",
      );
      const d = await overview(tx, b.id);
      expect(d.requirements!.health_info).toBeNull();
      expect(d.requirements!.preparation_info).toBe("");
      expect(d.photos).toHaveLength(0);
      expect(d.terms!.acknowledged_at).toBeTruthy();
      expect(JSON.stringify(d.events)).not.toContain(
        "Private optional information",
      );
    }));
  it("flags policies for future bookings while preserving accepted versions", () =>
    isolated(async (tx) => {
      const v = await save(tx, { cancellationHours: 48 });
      const b = await reserve(tx);
      await review(tx, { action: "flag", versionId: v.versionId });
      expect((await preview(tx)).generalVersionId).toBeNull();
      expect((await overview(tx, b.id)).terms!.snapshot.generalVersionId).toBe(
        v.versionId,
      );
    }));
  it("rejects acknowledgement after a service price change without holding the slot", () =>
    isolated(async (tx) => {
      const p = await preview(tx);
      await tx.query(
        "UPDATE beauty.services SET price_pence=6000 WHERE id=$1",
        [service],
      );
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2,$3,true)", [
            service,
            time(),
            p.token,
          ]),
        ),
      ).rejects.toThrow("POLICY_CHANGED");
      expect(
        (await tx.query("SELECT id FROM beauty.bookings")).rows,
      ).toHaveLength(0);
    }));
  it("counts the cooling-off period in complete London calendar days across clock changes", () =>
    isolated(async (tx) => {
      const ends = await as(
        tx,
        "",
        async () =>
          (
            await tx.query<{ cutoff: Date }>(
              "SELECT beauty.policy_cooling_off_end('2026-03-21T23:30:00Z'::timestamptz) AS cutoff",
            )
          ).rows[0].cutoff,
      );
      expect(new Date(ends).toISOString()).toBe("2026-04-04T23:00:00.000Z");
      const autumn = await as(
        tx,
        "",
        async () =>
          (
            await tx.query<{ cutoff: Date }>(
              "SELECT beauty.policy_cooling_off_end('2026-10-24T22:45:00Z'::timestamptz) AS cutoff",
            )
          ).rows[0].cutoff,
      );
      expect(new Date(autumn).toISOString()).toBe("2026-11-08T00:00:00.000Z");
    }));
  it("claims policy notifications through the existing retry queue and supplies only accepted public terms", () =>
    isolated(async (tx) => {
      const v = await save(tx, { cancellationHours: 48 });
      const b = await reserve(tx);
      await paid(tx, b.id);
      await operation(
        tx,
        b.id,
        {
          action: "requirements",
          preparationInfo: "Private customer preparation",
          healthInfo: "Private customer health",
          healthConsent: true,
          consultationDone: false,
          patchTestDone: false,
        },
        "policy-customer",
      );
      await operation(
        tx,
        b.id,
        {
          action: "reschedule",
          startsAt: time(96),
          reason: "Request a later available appointment",
        },
        "policy-customer",
      );
      await save(tx, { cancellationHours: 6 });
      const jobs = await as(
        tx,
        "",
        async () =>
          (
            await tx.query<{ kind: string; accepted_policy: PolicyPreview }>(
              "SELECT n.*,beauty.notification_booking_policy(n.booking_id) AS accepted_policy FROM beauty.claim_notifications() n",
            )
          ).rows,
        "beauty_payment_worker",
      );
      expect(jobs.map((j) => j.kind)).toContain("rescheduled");
      expect(jobs.map((j) => j.kind)).toContain("requirements_update");
      expect(
        jobs.find((j) => j.kind === "confirmation")!.accepted_policy
          .generalVersionId,
      ).toBe(v.versionId);
      expect(JSON.stringify(jobs)).not.toContain("Private customer");
      await expect(
        as(tx, "policy-customer", () =>
          tx.query("SELECT beauty.notification_booking_policy($1)", [b.id]),
        ),
      ).rejects.toThrow("permission denied");
    }));
  it("prevents an Admin appeal from bypassing the accepted refund floor", () =>
    isolated(async (tx) => {
      const b = await reserve(tx, 4);
      const captured = await paid(tx, b.id);
      await cancel(tx, b.id);
      const decision = (
        await tx.query<{ id: string }>(
          "INSERT INTO beauty.refund_decisions(booking_id,actor_id,reasonable_cause_accepted,refund_percent,amount_pence,reason,status) SELECT $1,user_id,false,0,0,'Historical erroneous denial','no_refund' FROM beauty.professional_profiles WHERE id=$2 RETURNING id",
          [b.id, pro],
        )
      ).rows[0].id;
      const appeal = await as(
        tx,
        "policy-customer",
        async () =>
          (
            await tx.query<{ data: { id: string } }>(
              "SELECT beauty.submit_refund_appeal($1,$2) AS data",
              [b.id, "Request the statutory cancellation refund"],
            )
          ).rows[0].data.id,
      );
      await expect(
        as(tx, "policy-admin", () =>
          tx.query("SELECT beauty.resolve_refund_appeal($1,false,0,$2)", [
            appeal,
            "Reviewed request with no payment return",
          ]),
        ),
      ).rejects.toThrow("RETENTION_REVIEW_REQUIRED");
      const resolved = await as(
        tx,
        "policy-admin",
        async () =>
          (
            await tx.query<{ data: { amountPence: number } }>(
              "SELECT beauty.resolve_refund_appeal($1,true,100,$2) AS data",
              [appeal, "Full refund due under accepted terms"],
            )
          ).rows[0].data,
      );
      expect(resolved.amountPence).toBe(captured);
      expect(
        (
          await tx.query("SELECT id FROM beauty.refund_decisions WHERE id=$1", [
            decision,
          ])
        ).rows,
      ).toHaveLength(1);
    }));
  it("exposes policy audit entries to verified Admins and excludes private preparation", () =>
    isolated(async (tx) => {
      const v = await save(tx, {
        preparationText: "Bring your agreed extensions.",
      });
      await review(tx, { action: "approve", versionId: v.versionId });
      const admin = await as(
        tx,
        "policy-admin",
        async () =>
          (
            await tx.query<{
              data: {
                audit: { action: string; actor_name: string }[];
                disputes: unknown[];
              };
            }>(
              "SELECT beauty.admin_policy_overview('Policy Studio',NULL) AS data",
            )
          ).rows[0].data,
      );
      expect(admin.audit.map((a) => a.action)).toContain("approve");
      expect(admin.audit.find((a) => a.action === "approve")?.actor_name).toBe(
        "policy-admin",
      );
      expect(admin.disputes).toEqual([]);
    }));
});

// These exercises run the real PostgreSQL reservation, snapshot and ledger functions.
async function paymentPreview(tx: SqlClient, choice = "auto") {
  return as(tx, "", async () => (await tx.query<{data:PolicyPreview}>(
    "SELECT beauty.service_payment_policy($1,NULL,'{}',$2) AS data",[service,choice])).rows[0].data);
}
async function paymentReserve(tx: SqlClient, choice = "auto", token?: string) {
  const p = await paymentPreview(tx,choice);
  return as(tx,"policy-customer",async ()=>(await tx.query<{data:{id:string;depositPence:number;pricePence:number}}>(
    "SELECT beauty.reserve_booking_with_payment($1,$2,$3,true,NULL,'{}',$4) AS data",[service,time(72),token??p.token,choice])).rows[0].data);
}
describe("optional full service payments",()=>{
  it("keeps new privileged entry points unavailable to public database roles",async()=>{
    for(const role of ["anon","authenticated"]){
      const rows=(await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,'beauty.reserve_booking_with_payment(uuid,timestamptz,text,boolean,uuid,uuid[],text)','EXECUTE') OR has_function_privilege($1,'beauty.service_payment_policy(uuid,uuid,uuid[],text)','EXECUTE') AS allowed",[role])).rows;
      expect(rows[0].allowed).toBe(false);
    }
  });
  it("defaults to the existing deposit, while customers may choose the full price",()=>isolated(async tx=>{
    const deposit=await paymentPreview(tx); const full=await paymentPreview(tx,"full");
    expect(deposit.depositPence).toBe(2000); expect(deposit.paymentChoice).toBe("deposit");
    expect(full).toMatchObject({pricePence:5000,depositPence:5000,requiredDepositPence:2000,paymentChoice:"full",fullPrepayment:true,fullPaymentReason:"customer"});
    expect(full.token).not.toBe(deposit.token);
    expect((await paymentPreview(tx)).depositPence).toBe(2000);
    const b=await paymentReserve(tx,"full",full.token); expect(b.depositPence).toBe(5000);
    expect((await overview(tx,b.id)).terms?.snapshot).toMatchObject({paymentChoice:"full",depositPence:5000});
    const row=(await as(tx,"policy-customer",()=>tx.query<{accepted_policy:PolicyPreview}>("SELECT beauty.booking_policy_overview(id)->'terms'->'snapshot' AS accepted_policy FROM beauty.bookings WHERE id=$1",[b.id]))).rows[0];
    expect(row.accepted_policy.fullPrepayment).toBe(true);
  }));
  it("collects the full service amount plus one booking fee and records commission once",()=>isolated(async tx=>{
    const b=await paymentReserve(tx,"full");
    expect(await paid(tx,b.id)).toBe(5100);
    const quote=(await tx.query<{customer_total_pence:number;professional_platform_fee_pence:number;professional_proceeds_pence:number}>("SELECT customer_total_pence,professional_platform_fee_pence,professional_proceeds_pence FROM beauty.financial_quotes WHERE booking_id=$1",[b.id])).rows[0];
    expect(quote.customer_total_pence).toBe(5100);
    expect(quote.professional_proceeds_pence+quote.professional_platform_fee_pence).toBe(5000);
    expect(quote.professional_platform_fee_pence).toBeGreaterThanOrEqual(0);
    const p=(await tx.query<{captured_pence:number}>("SELECT captured_pence FROM beauty.payments WHERE booking_id=$1",[b.id])).rows[0];expect(p.captured_pence).toBe(5100);
    await as(tx,"",()=>tx.query("SELECT beauty.record_booking_payment_finance($1,$2)",[b.id,"pi_"+b.id]),"beauty_payment_worker");
    const n=(await tx.query<{n:number}>("SELECT count(*)::int AS n FROM beauty.financial_ledger_transactions WHERE event_reference=$1",["booking-payment:"+b.id])).rows[0];expect(n.n).toBe(1);
  }));
  it("lets professionals require full payment and forbids a deposit downgrade",()=>isolated(async tx=>{
    await save(tx,{paymentRequirement:"full"});
    expect(await paymentPreview(tx)).toMatchObject({depositPence:5000,paymentRequirement:"full",fullPaymentReason:"professional"});
    await expect(paymentPreview(tx,"deposit")).rejects.toThrow("FULL_PAYMENT_REQUIRED");
    expect((await paymentReserve(tx)).depositPence).toBe(5000);
  }));
  it("inherits general payment settings and supports a service-specific override",()=>isolated(async tx=>{
    await save(tx,{paymentRequirement:"full"});await save(tx,{paymentRequirement:null},true);
    expect((await paymentPreview(tx)).paymentRequirement).toBe("full");
    await save(tx,{paymentRequirement:"deposit_or_full"},true);
    expect((await paymentPreview(tx)).depositPence).toBe(2000);
    expect((await paymentPreview(tx,"full")).depositPence).toBe(5000);
  }));
  it("does not rewrite a paid booking when the professional changes the policy",()=>isolated(async tx=>{
    const b=await paymentReserve(tx,"full");await paid(tx,b.id);const old=await overview(tx,b.id);
    await save(tx,{paymentRequirement:"full"});await save(tx,{paymentRequirement:"deposit_or_full",depositPercent:15});
    expect((await overview(tx,b.id)).terms).toEqual(old.terms);
  }));
  it("rejects stale or forged payment tokens without leaving a booking",()=>isolated(async tx=>{
    const deposit=await paymentPreview(tx);
    await expect(paymentReserve(tx,"full",deposit.token)).rejects.toThrow("POLICY_CHANGED");
    expect((await tx.query("SELECT id FROM beauty.bookings WHERE professional_id=$1",[pro])).rows).toHaveLength(0);
  }));
  it("reuses the same full-payment reservation on retry and rejects a changed amount",()=>isolated(async tx=>{
    const b=await paymentReserve(tx,"full");const retry=await paymentReserve(tx,"full");expect(retry.id).toBe(b.id);
    await expect(paymentReserve(tx,"deposit")).rejects.toThrow("POLICY_CHANGED");
  }));
  it("keeps unverified full payment and restrictions regardless of the published setting",()=>isolated(async tx=>{
    await tx.query("UPDATE beauty.services SET deposit_pence=0 WHERE id=$1",[service]);
    await tx.query("UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",[pro]);
    await save(tx,{paymentRequirement:"deposit_or_full"});
    expect(await paymentPreview(tx)).toMatchObject({depositPence:5000,fullPrepayment:true,fullPaymentReason:"starter",paymentRequirement:"full"});
    await expect(paymentPreview(tx,"deposit")).rejects.toThrow("FULL_PAYMENT_REQUIRED");
    expect((await paymentReserve(tx)).depositPence).toBe(5000);
  }));
  it("preserves refund assessment for full payments",()=>isolated(async tx=>{
    const b=await paymentReserve(tx,"full");await paid(tx,b.id);await cancel(tx,b.id,"policy-pro");
    const state=await overview(tx,b.id);expect(state.assessment.remainingPaidPence).toBe(5100);
    expect(state.assessment.mandatoryFullRefund).toBe(true);
  }));
});
