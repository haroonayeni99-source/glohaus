import { beforeAll, afterAll, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
const db = await createTestDatabase();
beforeAll(() => applyTestMigrations(db));
afterAll(() => db.close());
const provider = "11111111-1111-4111-8111-111111111111";
async function isolated(work: () => Promise<void>) {
  await db.exec("BEGIN");
  try {
    await work();
  } finally {
    await db.exec("ROLLBACK");
  }
}
it("restricts all mail metadata to private workers and Owner review functions", async () => {
  const r = await db.query<{ allowed: boolean }>(
    "SELECT has_table_privilege('anon','beauty.support_mail_jobs','SELECT') OR has_table_privilege('authenticated','beauty.support_mail_jobs','SELECT') OR has_function_privilege('authenticated','beauty.queue_support_mail(uuid,text,uuid)','EXECUTE') OR has_function_privilege('anon','beauty.owner_support_mail_overview(uuid)','EXECUTE') AS allowed",
  );
  expect(r.rows[0].allowed).toBe(false);
  await expect(
    db.query("SELECT beauty.owner_support_mail_overview(NULL)"),
  ).rejects.toThrow();
});
it("deduplicates events, enforces leases and never reclaims a forwarded message", () =>
  isolated(async () => {
    await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
      provider,
    ]);
    await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
      provider,
    ]);
    const job = (
      await db.query<{ id: string; lease: string }>(
        "SELECT * FROM beauty.claim_support_mail()",
      )
    ).rows[0];
    expect(job).toBeTruthy();
    expect(
      (await db.query("SELECT * FROM beauty.claim_support_mail()")).rows,
    ).toHaveLength(0);
    await db.query(
      "SELECT beauty.finish_support_mail($1,$2,'forwarded','provider_accepted',$3)",
      [job.id, provider, provider],
    );
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM beauty.support_mail_jobs",
        )
      ).rows[0].state,
    ).toBe("processing");
    await db.query(
      "SELECT beauty.finish_support_mail($1,$2,'forwarded','provider_accepted',$3)",
      [job.id, job.lease, provider],
    );
    expect(
      (await db.query("SELECT * FROM beauty.claim_support_mail()")).rows,
    ).toHaveLength(0);
  }));
it("deduplicates the same original under different provider IDs", () =>
  isolated(async () => {
    for (const id of [provider, "22222222-2222-4222-8222-222222222222"]) {
      await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
        id,
      ]);
      const job = (
        await db.query<{ id: string; lease: string }>(
          "SELECT * FROM beauty.claim_support_mail()",
        )
      ).rows[0];
      const data = (
        await db.query<{ data: { duplicate: boolean } }>(
          "SELECT beauty.identify_support_mail($1,$2,$3,NULL,'customer@example.test') AS data",
          [job.id, job.lease, "a".repeat(64)],
        )
      ).rows[0].data;
      if (id === provider) {
        expect(data.duplicate).toBe(false);
        await db.query(
          "SELECT beauty.finish_support_mail($1,$2,'forwarded','provider_accepted',$3)",
          [job.id, job.lease, provider],
        );
      } else expect(data.duplicate).toBe(true);
    }
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM beauty.support_mail_jobs WHERE state='forwarded'",
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it("stops automatic retries before the provider idempotency window expires and records delivery separately", () =>
  isolated(async () => {
    await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
      provider,
    ]);
    await db.query(
      "UPDATE beauty.support_mail_jobs SET state='retry',first_attempt_at=now()-interval '24 hours'",
    );
    expect(
      (await db.query("SELECT * FROM beauty.claim_support_mail()")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM beauty.support_mail_jobs",
        )
      ).rows[0].state,
    ).toBe("failed");
    await db.query(
      "UPDATE beauty.support_mail_jobs SET state='forwarded',provider_send_id=$1",
      [provider],
    );
    await db.query(
      "SELECT beauty.record_support_mail_delivery($1,'email.bounced',now())",
      [provider],
    );
    expect(
      (
        await db.query<{ state: string; delivery_state: string }>(
          "SELECT state,delivery_state FROM beauty.support_mail_jobs",
        )
      ).rows[0],
    ).toEqual({ state: "forwarded", delivery_state: "email.bounced" });
  }));

it("allows only an active Owner with MFA to view and queue existing messages", () =>
  isolated(async () => {
    for (const role of ["owner", "admin", "customer"]) {
      const id = (
        await db.query<{ id: string }>(
          "INSERT INTO beauty.users(auth_id,email,display_name) VALUES($1,$2,$1) RETURNING id",
          ["mail-" + role, role + "@example.test"],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
        [id, role],
      );
    }
    async function caller(who: string, mfa: boolean) {
      await db.exec("SAVEPOINT caller");
      try {
        await db.exec("SET LOCAL ROLE beauty_app");
        await db.query(
          "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
          [who, String(mfa)],
        );
        await db.query("SELECT beauty.owner_queue_support_mail($1)", [
          provider,
        ]);
        const r = await db.query<{ data: { items: unknown[] } }>(
          "SELECT beauty.owner_support_mail_overview(NULL) AS data",
        );
        await db.exec("RESET ROLE; RELEASE SAVEPOINT caller");
        return r.rows[0].data;
      } catch (e) {
        await db.exec(
          "ROLLBACK TO SAVEPOINT caller; RESET ROLE; RELEASE SAVEPOINT caller",
        );
        throw e;
      }
    }
    for (const [who, mfa] of [
      ["mail-admin", true],
      ["mail-customer", true],
      ["mail-owner", false],
    ] as const)
      await expect(caller(who, mfa)).rejects.toThrow("FORBIDDEN");
    expect((await caller("mail-owner", true)).items).toHaveLength(1);
    expect(
      (
        await db.query<{ queued_by: string }>(
          "SELECT queued_by FROM beauty.support_mail_jobs",
        )
      ).rows[0].queued_by,
    ).toBeTruthy();
  }));
it("links references and follow-up threads only when the customer email also matches", () =>
  isolated(async () => {
    const ticket = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.support_requests(name,email,topic,reference,message,rate_key) VALUES('Fixture','customer@example.test','Other','','Fictional support message',$1) RETURNING id",
        ["a".repeat(64)],
      )
    ).rows[0].id;
    const thread = "44444444-4444-4444-8444-444444444444";
    for (const [id, peer, candidate, expected] of [
      [provider, "other@example.test", ticket, null],
      [
        "22222222-2222-4222-8222-222222222222",
        "CUSTOMER@example.test",
        ticket,
        ticket,
      ],
      [
        "33333333-3333-4333-8333-333333333333",
        "customer@example.test",
        null,
        ticket,
      ],
    ] as const) {
      await db.query("SELECT beauty.queue_support_mail($1,'received',$2)", [
        id,
        thread,
      ]);
      const job = (
        await db.query<{ id: string; lease: string }>(
          "SELECT * FROM beauty.claim_support_mail()",
        )
      ).rows[0];
      const match = (
        await db.query<{ data: { caseId: string | null } }>(
          "SELECT beauty.identify_support_mail($1,$2,NULL,$3,$4) AS data",
          [job.id, job.lease, candidate, peer],
        )
      ).rows[0].data;
      expect(match.caseId).toBe(expected);
      await db.query(
        "SELECT beauty.finish_support_mail($1,$2,'forwarded','provider_accepted',NULL)",
        [job.id, job.lease],
      );
    }
  }));
it("holds excessive sender volume for review without deleting the original", () =>
  isolated(async () => {
    await db.query(
      "INSERT INTO beauty.support_mail_jobs(provider_email_id,kind,state,sender_key) SELECT gen_random_uuid(),'received','forwarded',encode(sha256(convert_to('customer@example.test','UTF8')),'hex') FROM generate_series(1,20)",
    );
    await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
      provider,
    ]);
    const job = (
      await db.query<{ id: string; lease: string }>(
        "SELECT * FROM beauty.claim_support_mail()",
      )
    ).rows[0];
    const result = (
      await db.query<{ data: { held: boolean } }>(
        "SELECT beauty.identify_support_mail($1,$2,$3,NULL,'customer@example.test') AS data",
        [job.id, job.lease, "f".repeat(64)],
      )
    ).rows[0].data;
    expect(result.held).toBe(true);
    expect(
      (
        await db.query<{ reason: string }>(
          "SELECT reason FROM beauty.support_mail_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0].reason,
    ).toBe("sender_rate_review");
  }));

it("retains early delivery events and ignores older updates", () =>
  isolated(async () => {
    await db.query(
      "SELECT beauty.record_support_mail_delivery($1,'email.delivered',now())",
      [provider],
    );
    await db.query("SELECT beauty.queue_support_mail($1,'received',NULL)", [
      provider,
    ]);
    const job = (
      await db.query<{ id: string; lease: string }>(
        "SELECT * FROM beauty.claim_support_mail()",
      )
    ).rows[0];
    await db.query(
      "SELECT beauty.finish_support_mail($1,$2,'forwarded','provider_accepted',$3)",
      [job.id, job.lease, provider],
    );
    await db.query(
      "SELECT beauty.record_support_mail_delivery($1,'email.delivery_delayed',now()-interval '1 minute')",
      [provider],
    );
    expect(
      (
        await db.query<{ delivery_state: string }>(
          "SELECT delivery_state FROM beauty.support_mail_jobs",
        )
      ).rows[0].delivery_state,
    ).toBe("email.delivered");
  }));
