import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { createHash } from "node:crypto";
const db = await createTestDatabase();
let pro: string, service: string, customer: string, owner: string;
async function as<T>(
  tx: SqlClient,
  id: string,
  work: () => Promise<T>,
  mfa = true,
  role = "beauty_app",
) {
  await tx.query("SAVEPOINT caller");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [id, String(mfa)],
  );
  try {
    const result = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK TO SAVEPOINT caller");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    throw error;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await work(tx);
      throw Error("ROLLBACK_FIXTURE");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK_FIXTURE")) throw e;
  }
}
async function programme(
  tx: SqlClient,
  action: string,
  extra: Record<string, unknown> = {},
) {
  return as(tx, "fair-owner", () =>
    tx.query("SELECT beauty.owner_programme_action($1::jsonb)", [
      JSON.stringify({
        action,
        reason: "Isolated validation only",
        confirmed: true,
        ...extra,
      }),
    ]),
  );
}
async function book(tx: SqlClient, completed = false) {
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Service','Customer','Pro',now()+interval '3 days',now()+interval '3 days 1 hour',60,5000,2000,'payment_pending',now()+interval '35 minutes') RETURNING id`,
      [pro, customer, service],
    )
  ).rows[0].id;
  await tx.query("INSERT INTO beauty.payments(booking_id) VALUES($1)", [id]);
  if (completed) {
    await tx.query(
      "UPDATE beauty.bookings SET status='completed',completed_at=now()-interval '1 hour' WHERE id=$1",
      [id],
    );
    await tx.query(
      "UPDATE beauty.payments SET captured_pence=2100 WHERE booking_id=$1",
      [id],
    );
  }
  return id;
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const name of [
    "fair-owner",
    "fair-admin",
    "fair-pro",
    "fair-customer",
    "fair-other",
  ]) {
    const a = await db.transaction((tx) =>
      as(tx, name, () =>
        enrolAccount(
          tx,
          {
            authId: name,
            email: name + "@example.test",
            displayName: name,
            secondFactorAge: null,
          },
          name === "fair-pro" ? "professional" : "customer",
        ),
      ),
    );
    if (name === "fair-pro") pro = a.professionalId!;
    if (name === "fair-customer") customer = a.id;
    if (name === "fair-owner") owner = a.id;
    if (name === "fair-owner" || name === "fair-admin") {
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [a.id],
      );
      if (name === "fair-owner")
        await db.query(
          "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",
          [a.id],
        );
    }
  }
  await db.query(
    "UPDATE beauty.professional_profiles SET publication_status='published',business_name='Fair Studio',slug='fair-studio',city='London',category='Nails',bio='Isolated fair platform studio' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Service','',60,5000,2000,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
describe("founding and draft pricing safeguards", () => {
  it("starts open without activating commission or altering financial fee rules", () =>
    isolated(async (tx) => {
      const result = await as(tx, "fair-owner", () =>
        tx.query<{
          data: {
            programme: { state: string };
            pricingDraft: {
              status: string;
              platform_first_basis_points: number;
            };
          };
        }>("SELECT beauty.owner_programme_overview() AS data"),
      );
      expect(result.rows[0].data.programme.state).toBe("open");
      expect(result.rows[0].data.pricingDraft.status).toBe("draft");
      expect(result.rows[0].data.pricingDraft.platform_first_basis_points).toBe(
        800,
      );
      expect(
        (
          await tx.query<{ enabled: boolean }>(
            "SELECT enabled FROM beauty.commission_settings",
          )
        ).rows[0].enabled,
      ).toBe(false);
    }));
  it.each(["fair-admin", "fair-customer"])("rejects non-Owner %s", (id) =>
    isolated(async (tx) => {
      await expect(
        as(tx, id, () =>
          tx.query("SELECT beauty.owner_programme_action($1::jsonb)", [
            JSON.stringify({
              action: "close",
              reason: "Forbidden attempt",
              confirmed: true,
            }),
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }),
  );
  it("requires MFA at the database boundary", () =>
    isolated(async (tx) => {
      await expect(
        as(
          tx,
          "fair-owner",
          () =>
            tx.query("SELECT beauty.owner_programme_action($1::jsonb)", [
              JSON.stringify({
                action: "close",
                reason: "MFA boundary test",
                confirmed: true,
              }),
            ]),
          false,
        ),
      ).rejects.toThrow("FORBIDDEN");
    }));
  it("closes and reopens the public offer, with an audit trail", () =>
    isolated(async (tx) => {
      await programme(tx, "close");
      expect(
        (
          await as(tx, "", () =>
            tx.query<{ open: boolean }>(
              "SELECT beauty.public_founding_programme_open() AS open",
            ),
          )
        ).rows[0].open,
      ).toBe(false);
      await programme(tx, "open");
      expect(
        (
          await as(tx, "", () =>
            tx.query<{ open: boolean }>(
              "SELECT beauty.public_founding_programme_open() AS open",
            ),
          )
        ).rows[0].open,
      ).toBe(true);
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.financial_admin_audit_logs WHERE action IN('programme.close','programme.open')",
          )
        ).rows,
      ).toHaveLength(2);
    }));
  it("blocks enrolment after closure without deleting already earned benefits", () =>
    isolated(async (tx) => {
      await tx.query(
        "INSERT INTO beauty.commission_rules(kind,professional_id,basis_points,starts_at,ends_at,reason,created_by) VALUES('founding_trial',$1,0,now(),now()+interval '14 days','Existing entitlement',$2)",
        [pro, owner],
      );
      await programme(tx, "close");
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.commission_rules WHERE kind='founding_trial'",
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        tx.query(
          "INSERT INTO beauty.commission_rules(kind,professional_id,basis_points,starts_at,ends_at,reason,created_by) VALUES('founding_trial',$1,0,now(),now()+interval '14 days','Must be refused',$2)",
          [pro, owner],
        ),
      ).rejects.toThrow("FOUNDING_ENROLMENT_CLOSED");
    }));
  it("requires exact typed confirmation and cannot be reopened after retirement", () =>
    isolated(async (tx) => {
      await expect(
        programme(tx, "retire", { confirmation: "retire" }),
      ).rejects.toThrow("TYPED_CONFIRMATION_REQUIRED");
      await programme(tx, "retire", {
        confirmation: "PERMANENTLY RETIRE FOUNDING PROGRAMME",
      });
      await expect(programme(tx, "open")).rejects.toThrow("PROGRAMME_RETIRED");
    }));
  it("saves draft rates without changing any live fee or commission settings", () =>
    isolated(async (tx) => {
      const before = (
        await tx.query("SELECT * FROM beauty.financial_fee_rules ORDER BY id")
      ).rows;
      const settings = (
        await tx.query("SELECT * FROM beauty.commission_settings")
      ).rows;
      await programme(tx, "pricing_draft", {
        professionalBasisPoints: 300,
        platformFirstBasisPoints: 700,
        returningBasisPoints: 300,
      });
      expect(
        (await tx.query("SELECT * FROM beauty.financial_fee_rules ORDER BY id"))
          .rows,
      ).toEqual(before);
      expect(
        (await tx.query("SELECT * FROM beauty.commission_settings")).rows,
      ).toEqual(settings);
    }));
});
describe("acquisition security and truthful reporting", () => {
  it("keeps invitation links stable and denies customer creation", () =>
    isolated(async (tx) => {
      const call = () =>
        tx.query<{ data: { token: string } }>(
          "SELECT beauty.my_acquisition_invitation() AS data",
        );
      const first = (await as(tx, "fair-pro", call)).rows[0].data.token;
      expect((await as(tx, "fair-pro", call)).rows[0].data.token).toBe(first);
      await expect(as(tx, "fair-customer", call)).rejects.toThrow("FORBIDDEN");
    }));
  it("never treats an invitation alone as source proof", () =>
    isolated(async (tx) => {
      const invite = (
        await as(tx, "fair-pro", () =>
          tx.query<{ data: { token: string } }>(
            "SELECT beauty.my_acquisition_invitation() AS data",
          ),
        )
      ).rows[0].data.token;
      await as(tx, "fair-customer", () =>
        tx.query("SELECT beauty.accept_acquisition_invitation($1,'qr')", [
          invite,
        ]),
      );
      await book(tx, true);
      const data = (
        await as(tx, "fair-owner", () =>
          tx.query<{ data: { rows: { origin: string }[] } }>(
            "SELECT beauty.acquisition_overview(7,true) AS data",
          ),
        )
      ).rows[0].data;
      expect(data.rows[0].origin).toBe("unknown");
    }));
  it("records customer confirmations once and turns conflicting changes into a review", () =>
    isolated(async (tx) => {
      const id = await book(tx);
      const confirm = (source: string) =>
        as(tx, "fair-customer", () =>
          tx.query("SELECT beauty.confirm_customer_acquisition($1,$2)", [
            id,
            source,
          ]),
        );
      await confirm("existing_professional");
      await confirm("existing_professional");
      expect(
        (await tx.query("SELECT * FROM beauty.acquisition_history")).rows,
      ).toHaveLength(1);
      await confirm("glohaus");
      expect(
        (
          await tx.query<{ declared_source: string }>(
            "SELECT declared_source FROM beauty.customer_acquisition",
          )
        ).rows[0].declared_source,
      ).toBe("disputed");
    }));
  it("rejects another customer's booking and protects source tables from browser roles", () =>
    isolated(async (tx) => {
      const id = await book(tx);
      await expect(
        as(tx, "fair-other", () =>
          tx.query("SELECT beauty.confirm_customer_acquisition($1,'glohaus')", [
            id,
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        as(tx, "fair-customer", () =>
          tx.query("SELECT * FROM beauty.customer_acquisition"),
        ),
      ).rejects.toThrow();
    }));
  it("identifies returning customers across period boundaries and isolates professional reports", () =>
    isolated(async (tx) => {
      const old = await book(tx, true);
      await tx.query(
        "UPDATE beauty.bookings SET completed_at=now()-interval '40 days',starts_at=now()-interval '41 days',ends_at=now()-interval '41 days'+interval '1 hour' WHERE id=$1",
        [old],
      );
      await book(tx, true);
      const data = (
        await as(tx, "fair-pro", () =>
          tx.query<{
            data: { rows: { returning_bookings: number }[]; cases: unknown[] };
          }>("SELECT beauty.acquisition_overview(7,false) AS data"),
        )
      ).rows[0].data;
      expect(data.rows[0].returning_bookings).toBe(1);
      expect(data.cases).toEqual([]);
      await expect(
        as(tx, "fair-pro", () =>
          tx.query("SELECT beauty.acquisition_overview(7,true)"),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }));
  it("excludes full refunds and keeps proposal rates out of live reporting", () =>
    isolated(async (tx) => {
      const id = await book(tx, true);
      await tx.query(
        "UPDATE beauty.payments SET refunded_pence=captured_pence WHERE booking_id=$1",
        [id],
      );
      const data = (
        await as(tx, "fair-owner", () =>
          tx.query<{ data: { rows: unknown[] } }>(
            "SELECT beauty.acquisition_overview(7,true) AS data",
          ),
        )
      ).rows[0].data;
      expect(data.rows).toEqual([]);
    }));
});
const hash = createHash("sha256").update("a".repeat(64)).digest("hex");
async function ticket(tx: SqlClient) {
  const id = (
    await as(tx, "", () =>
      tx.query<{ id: string }>(
        "SELECT beauty.submit_support_request('Test Person','person@example.test','Other','','Fictional support request with enough detail',$1) AS id",
        ["f".repeat(64)],
      ),
    )
  ).rows[0].id;
  await as(tx, "", () =>
    tx.query("SELECT beauty.issue_support_access($1,$2,$3)", [
      id,
      "f".repeat(64),
      hash,
    ]),
  );
  return id;
}
describe("private support, escalation and email queue", () => {
  it("authorises a ticket with a private token and queues only an operational alert", () =>
    isolated(async (tx) => {
      const id = await ticket(tx);
      const result = await as(tx, "", () =>
        tx.query<{ data: { id: string } }>(
          "SELECT beauty.support_case($1,$2,false) AS data",
          [id, hash],
        ),
      );
      expect(result.rows[0].data.id).toBe(id);
      await expect(
        as(tx, "", () =>
          tx.query("SELECT beauty.support_case($1,$2,false)", [
            id,
            "0".repeat(64),
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.support_email_jobs WHERE request_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("hides staff notes, shows public replies and allows a customer appeal", () =>
    isolated(async (tx) => {
      const id = await ticket(tx);
      await as(tx, "fair-admin", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'under_review','Private staff analysis',false)",
          [id],
        ),
      );
      await as(tx, "fair-admin", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'resolved','The response visible to the customer',true)",
          [id],
        ),
      );
      const result = (
        await as(tx, "", () =>
          tx.query<{ data: { events: { body: string }[] } }>(
            "SELECT beauty.support_case($1,$2,false) AS data",
            [id, hash],
          ),
        )
      ).rows[0].data;
      expect(result.events).toHaveLength(1);
      expect(result.events[0].body).toContain("visible");
      await as(tx, "", () =>
        tx.query(
          "SELECT beauty.reply_support_case($1,$2,'Please review my evidence and the decision',true)",
          [id, hash],
        ),
      );
      await expect(
        as(tx, "fair-admin", () =>
          tx.query(
            "SELECT beauty.admin_support_case_action($1,'resolved','Ordinary admin cannot decide an appeal',true)",
            [id],
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
      await as(tx, "fair-owner", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'resolved','Owner reviewed the appeal and evidence',true)",
          [id],
        ),
      );
    }));
  it("allows staff reads with MFA and denies guest staff impersonation", () =>
    isolated(async (tx) => {
      const id = await ticket(tx);
      await as(tx, "fair-admin", () =>
        tx.query("SELECT beauty.support_case($1,NULL,true)", [id]),
      );
      await expect(
        as(tx, "", () =>
          tx.query("SELECT beauty.support_case($1,NULL,true)", [id]),
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        as(
          tx,
          "fair-admin",
          () => tx.query("SELECT beauty.support_case($1,NULL,true)", [id]),
          false,
        ),
      ).rejects.toThrow("FORBIDDEN");
    }));
  it("keeps evidence private and limits each ticket to five files", () =>
    isolated(async (tx) => {
      const id = await ticket(tx);
      for (let n = 0; n < 5; n++)
        await as(tx, "", () =>
          tx.query(
            "SELECT beauty.attach_support_evidence($1,$2,$3,'Fictional screenshot')",
            [id, hash, `support-evidence/${id}/${n}.webp`],
          ),
        );
      await expect(
        as(tx, "", () =>
          tx.query(
            "SELECT beauty.attach_support_evidence($1,$2,'support-evidence/extra.webp','Extra screenshot')",
            [id, hash],
          ),
        ),
      ).rejects.toThrow("SUPPORT_EVIDENCE_LIMIT");
      await expect(
        as(tx, "", () => tx.query("SELECT * FROM beauty.support_evidence")),
      ).rejects.toThrow();
    }));
  it("claims and finishes queued email idempotently without sending any email", () =>
    isolated(async (tx) => {
      await ticket(tx);
      const jobs = await as(
        tx,
        "",
        () =>
          tx.query<{ id: string }>(
            "SELECT * FROM beauty.claim_support_emails()",
          ),
        true,
        "beauty_payment_worker",
      );
      expect(jobs.rows).toHaveLength(1);
      expect(
        (
          await as(
            tx,
            "",
            () => tx.query("SELECT * FROM beauty.claim_support_emails()"),
            true,
            "beauty_payment_worker",
          )
        ).rows,
      ).toHaveLength(0);
      await as(
        tx,
        "",
        () =>
          tx.query(
            "SELECT beauty.finish_support_email($1,'fictional-provider-id')",
            [jobs.rows[0].id],
          ),
        true,
        "beauty_payment_worker",
      );
      expect(
        (
          await as(
            tx,
            "",
            () => tx.query("SELECT * FROM beauty.claim_support_emails()"),
            true,
            "beauty_payment_worker",
          )
        ).rows,
      ).toHaveLength(0);
    }));
});

describe("verified reviews and protected professional responses", () => {
  async function review(tx: SqlClient) {
    const id = await book(tx, true);
    await tx.query(
      "UPDATE beauty.bookings SET starts_at=now()-interval '2 days',ends_at=now()-interval '2 days'+interval '1 hour' WHERE id=$1",
      [id],
    );
    return (
      await tx.query<{ id: string }>(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,4,'A fictional review of a completed appointment','Test customer') RETURNING id",
        [id],
      )
    ).rows[0].id;
  }
  it("only lets the booked professional reply, with revision history", () =>
    isolated(async (tx) => {
      const id = await review(tx);
      await as(tx, "fair-pro", () =>
        tx.query(
          "SELECT beauty.respond_to_review($1,'Thank you for your considered feedback')",
          [id],
        ),
      );
      expect(
        (await tx.query("SELECT * FROM beauty.review_response_history")).rows,
      ).toHaveLength(1);
      await expect(
        as(tx, "fair-customer", () =>
          tx.query(
            "SELECT beauty.respond_to_review($1,'A customer cannot impersonate a professional')",
            [id],
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT * FROM beauty.public_review_responses WHERE review_id=$1",
              [id],
            ),
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("does not bypass response moderation through edits or expose hidden reviews", () =>
    isolated(async (tx) => {
      const id = await review(tx);
      await as(tx, "fair-pro", () =>
        tx.query(
          "SELECT beauty.respond_to_review($1,'Thank you for your helpful feedback')",
          [id],
        ),
      );
      await as(tx, "fair-admin", () =>
        tx.query(
          "SELECT beauty.admin_moderate_review_response($1,'hidden','Privacy concerns require review')",
          [id],
        ),
      );
      await as(tx, "fair-pro", () =>
        tx.query(
          "SELECT beauty.respond_to_review($1,'A changed response still requires moderation')",
          [id],
        ),
      );
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT * FROM beauty.public_review_responses WHERE review_id=$1",
              [id],
            ),
          )
        ).rows,
      ).toHaveLength(0);
      await as(tx, "fair-admin", () =>
        tx.query(
          "SELECT beauty.admin_moderate_review_response($1,'visible','Reviewed evidence and approved response')",
          [id],
        ),
      );
      await tx.query(
        "UPDATE beauty.reviews SET moderation_status='hidden' WHERE id=$1",
        [id],
      );
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT * FROM beauty.public_review_responses WHERE review_id=$1",
              [id],
            ),
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("does not expose a professional fee quote to another account", () =>
    isolated(async (tx) => {
      const id = await book(tx);
      expect(
        (
          await as(tx, "fair-other", () =>
            tx.query<{ data: unknown }>(
              "SELECT beauty.my_booking_fee_breakdown($1) AS data",
              [id],
            ),
          )
        ).rows[0].data,
      ).toBeNull();
    }));
});
