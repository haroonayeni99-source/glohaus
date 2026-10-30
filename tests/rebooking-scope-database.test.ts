import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
let pro: string, client: string, owner: string, service: string;
beforeAll(async () => {
  await applyTestMigrations(db);
  await db.exec(
    await readFile(
      new URL("../db/patches/rebooking-scoped-controls.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../db/patches/rebooking-global-optout.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../db/patches/rebooking-scope-serialization.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const auth of ["rebook-pro", "rebook-client", "rebook-owner"]) {
    const a = await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE beauty_app");
      await tx.query("SELECT set_config('app.auth_id',$1,true)", [auth]);
      return enrolAccount(
        tx,
        {
          authId: auth,
          email: auth + "@example.test",
          displayName: auth,
          secondFactorAge: null,
        },
        auth === "rebook-pro" ? "professional" : "customer",
      );
    });
    if (auth === "rebook-pro") pro = a.professionalId!;
    if (auth === "rebook-client") client = a.id;
    if (auth === "rebook-owner") owner = a.id;
  }
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($1,'admin')",
    [owner],
  );
  await db.query(
    "UPDATE beauty.professional_profiles SET publication_status='published',slug='rebook-studio',business_name='Rebook Studio',bio='Complete professional beauty studio profile.',city='London' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified',standing_status='good'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Service',60,5000,2000) RETURNING id",
      [pro],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.marketing_preferences(user_id,rebooking) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET rebooking=true",
    [client],
  );
});
afterAll(() => db.close());
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO beauty.rebooking_professional_settings(professional_id,paused) VALUES($1,false)",
        [pro],
      );
      await tx.query(
        "INSERT INTO beauty.rebooking_customer_consents(user_id,professional_id,enabled) VALUES($1,$2,true)",
        [client, pro],
      );
      await tx.query(
        "CREATE OR REPLACE FUNCTION beauty.rebooking_delivery_window(at_time timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT true $$",
      );
      await work(tx);
      throw Error("ROLLBACK_REBOOK");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK_REBOOK")) throw e;
  }
}
async function worker(tx: SqlClient, sql: string, args: unknown[] = []) {
  await tx.query("SAVEPOINT rebook_worker");
  await tx.query("SET LOCAL ROLE beauty_payment_worker");
  try {
    const r = await tx.query(sql, args);
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT rebook_worker");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT rebook_worker");
    await tx.query("RELEASE SAVEPOINT rebook_worker");
    throw e;
  }
}
async function booking(
  tx: SqlClient,
  days = 29,
  status = "completed",
  refund = 0,
) {
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,completed_at) VALUES($1,$2,$3,'Service','Client','Studio',now()-$4::integer*interval '1 day'-interval '2 hours',now()-$4::integer*interval '1 day'-interval '1 hour',60,5000,2000,$5,now()+interval '1 hour',CASE WHEN $5='completed' THEN now()-$4::integer*interval '1 day' ELSE NULL END) RETURNING id`,
      [pro, client, service, days, status],
    )
  ).rows[0].id;
  await tx.query(
    "INSERT INTO beauty.payments(booking_id,captured_pence,refunded_pence,status,stripe_payment_intent_id) VALUES($1,2100,$2,'paid','pi_'||$1::uuid::text)",
    [id, refund],
  );
  return id;
}
async function prepare(tx: SqlClient) {
  return (await worker(tx, "SELECT beauty.prepare_rebooking_emails() AS count"))
    .rows[0].count;
}
async function claim(tx: SqlClient) {
  return (await worker(tx, "SELECT * FROM beauty.claim_rebooking_emails()"))
    .rows as { id: string }[];
}
async function preflight(tx: SqlClient, id: string) {
  return (
    await worker(tx, "SELECT beauty.rebooking_email_before_send($1) AS data", [
      id,
    ])
  ).rows[0].data;
}
it("defaults off and grants no customer outreach from signup or booking alone", () =>
  isolated(async (tx) => {
    await booking(tx);
    expect(await prepare(tx)).toBe(0);
    expect(await claim(tx)).toHaveLength(0);
    expect(
      (await tx.query("SELECT * FROM beauty.rebooking_outbox")).rows,
    ).toHaveLength(0);
  }));
it("queues one eligible visit idempotently and exposes only a leased send payload", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    expect(await prepare(tx)).toBe(1);
    expect(await prepare(tx)).toBe(0);
    const jobs = await claim(tx);
    expect(jobs).toHaveLength(1);
    expect(await preflight(tx, jobs[0].id)).toMatchObject({
      email: "rebook-client@example.test",
      slug: "rebook-studio",
    });
    expect(await claim(tx)).toHaveLength(0);
  }));
it("requires explicit opt-in and refuses refunded, cancelled and disputed visits", () =>
  isolated(async (tx) => {
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await booking(tx, 29, "cancelled");
    await booking(tx, 29, "completed", 1);
    const id = await booking(tx);
    await tx.query(
      "INSERT INTO beauty.booking_disputes(booking_id,stripe_dispute_id,stripe_payment_intent_id,amount_pence,currency,status) VALUES($1,'dp_'||$1::uuid::text,'pi_'||$1::uuid::text,2100,'gbp','needs_response')",
      [id],
    );
    expect(await prepare(tx)).toBe(0);
    await tx.query(
      "UPDATE beauty.marketing_preferences SET rebooking=false WHERE user_id=$1",
      [client],
    );
    await booking(tx, 28);
    expect(await prepare(tx)).toBe(0);
  }));
it("suppresses a queued reminder when consent is withdrawn before send", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await tx.query(
      "UPDATE beauty.marketing_preferences SET rebooking=false WHERE user_id=$1",
      [client],
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    expect(
      (await tx.query("SELECT state FROM beauty.rebooking_outbox")).rows[0]
        .state,
    ).toBe("suppressed");
  }));
it("suppresses for a newly booked appointment and blocks old backlog or recent visits", () =>
  isolated(async (tx) => {
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await booking(tx, 80);
    await booking(tx, 2);
    expect(await prepare(tx)).toBe(0);
    await booking(tx, 29);
    await booking(tx, -5, "confirmed");
    expect(await prepare(tx)).toBe(0);
  }));
it("honours caps and checks the emergency stop after claim", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query(
      "UPDATE beauty.rebooking_settings SET enabled=true,daily_cap=0",
    );
    expect(await prepare(tx)).toBe(0);
    await tx.query(
      "UPDATE beauty.rebooking_settings SET daily_cap=25,monthly_cap=0",
    );
    expect(await prepare(tx)).toBe(0);
    await tx.query("UPDATE beauty.rebooking_settings SET monthly_cap=100");
    await prepare(tx);
    const jobs = await claim(tx);
    await tx.query("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id','rebook-owner',true),set_config('app.admin_verified','true',true)",
    );
    await tx.query("SELECT beauty.owner_rebooking_stop()");
    await tx.query("RESET ROLE");
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    expect(await claim(tx)).toHaveLength(0);
  }));
it("rejects direct table access and non-Owner rule changes", () =>
  isolated(async (tx) => {
    await tx.query("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id','rebook-client',true),set_config('app.admin_verified','true',true)",
    );
    await tx.query("SAVEPOINT forbidden");
    await expect(
      tx.query("SELECT beauty.owner_rebooking_stop()"),
    ).rejects.toThrow("FORBIDDEN");
    await tx.query("ROLLBACK TO SAVEPOINT forbidden");
    await tx.query("SAVEPOINT private");
    await expect(
      tx.query("SELECT * FROM beauty.rebooking_outbox"),
    ).rejects.toThrow();
    await tx.query("ROLLBACK TO SAVEPOINT private");
    await tx.query("RESET ROLE");
  }));
it("suppresses for refunds and bounced-address suppression immediately before send", () =>
  isolated(async (tx) => {
    const bookingId = await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await tx.query(
      "UPDATE beauty.payments SET refunded_pence=1 WHERE booking_id=$1",
      [bookingId],
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    await tx.query(
      "UPDATE beauty.payments SET refunded_pence=0 WHERE booking_id=$1",
      [bookingId],
    );
    await tx.query(
      "INSERT INTO beauty.email_suppressions(email,reason) VALUES('rebook-client@example.test','bounced')",
    );
    expect(await prepare(tx)).toBe(0);
  }));
it("captures verified bounce events arriving before the send acknowledgement and prevents later sends", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await preflight(tx, jobs[0].id);
    expect(
      (
        await worker(
          tx,
          "SELECT beauty.record_rebooking_email_event($1,$2,$3,$4,$5) AS recorded",
          [
            "bounce-fixture",
            jobs[0].id,
            "provider-fixture",
            "email.bounced",
            "rebook-client@example.test",
          ],
        )
      ).rows[0].recorded,
    ).toBe(true);
    expect(
      (
        await worker(
          tx,
          "SELECT beauty.record_rebooking_email_event($1,$2,$3,$4,$5) AS recorded",
          [
            "bounce-fixture",
            jobs[0].id,
            "provider-fixture",
            "email.bounced",
            "rebook-client@example.test",
          ],
        )
      ).rows[0].recorded,
    ).toBe(false);
    expect(
      (
        await tx.query(
          "SELECT reason FROM beauty.email_suppressions WHERE email='rebook-client@example.test'",
        )
      ).rows[0].reason,
    ).toBe("bounced");
    await worker(tx, "SELECT beauty.finish_rebooking_email($1,$2)", [
      jobs[0].id,
      "provider-fixture",
    ]);
    expect(await claim(tx)).toHaveLength(0);
  }));
it("keeps retries inside the provider idempotency window", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    await claim(tx);
    await tx.query(
      "UPDATE beauty.rebooking_outbox SET first_attempt_at=now()-interval '24 hours',claimed_until=now()-interval '1 minute'",
    );
    expect(await claim(tx)).toHaveLength(0);
    expect(
      (await tx.query("SELECT state FROM beauty.rebooking_outbox")).rows[0]
        .state,
    ).toBe("failed");
  }));
it("uses a customer-wide cooldown and never overwrites explicit consent", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    expect(await prepare(tx)).toBe(1);
    await booking(tx, 28);
    expect(await prepare(tx)).toBe(0);
    expect(
      (
        await tx.query(
          "SELECT rebooking FROM beauty.marketing_preferences WHERE user_id=$1",
          [client],
        )
      ).rows[0].rebooking,
    ).toBe(true);
  }));
async function actor(
  tx: SqlClient,
  auth: string,
  sql: string,
  args: unknown[] = [],
) {
  await tx.query("SAVEPOINT scoped_actor");
  await tx.query("SET LOCAL ROLE beauty_app");
  await tx.query("SELECT set_config('app.auth_id',$1,true)", [auth]);
  try {
    const r = await tx.query(sql, args);
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT scoped_actor");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT scoped_actor");
    await tx.query("RELEASE SAVEPOINT scoped_actor");
    throw e;
  }
}
it("does not convert global consent into named-professional consent or silently unpause a professional", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await tx.query("DELETE FROM beauty.rebooking_customer_consents");
    expect(await prepare(tx)).toBe(0);
    await tx.query(
      "INSERT INTO beauty.rebooking_customer_consents(user_id,professional_id,enabled) VALUES($1,$2,true)",
      [client, pro],
    );
    await tx.query("DELETE FROM beauty.rebooking_professional_settings");
    expect(await prepare(tx)).toBe(0);
    const settings = (
      await actor(
        tx,
        "rebook-pro",
        "SELECT beauty.my_professional_rebooking() AS data",
      )
    ).rows[0].data as { paused: boolean };
    expect(settings.paused).toBe(true);
  }));
it("withdraws only the caller's named consent and never resurrects waiting jobs on re-opt-in", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await actor(
      tx,
      "rebook-client",
      "SELECT beauty.set_my_rebooking_consent($1,'email',false)",
      [pro],
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    await actor(
      tx,
      "rebook-client",
      "SELECT beauty.set_my_rebooking_consent($1,'email',true)",
      [pro],
    );
    expect(await prepare(tx)).toBe(0);
    expect(
      (await tx.query("SELECT state FROM beauty.rebooking_outbox")).rows[0]
        .state,
    ).toBe("suppressed");
    expect(
      (
        await tx.query(
          "SELECT rebooking FROM beauty.marketing_preferences WHERE user_id=$1",
          [client],
        )
      ).rows[0].rebooking,
    ).toBe(true);
  }));
it("does not allow another account to inspect or replace a customer's consent", () =>
  isolated(async (tx) => {
    await booking(tx);
    expect(
      (
        await actor(
          tx,
          "rebook-owner",
          "SELECT beauty.my_rebooking_consents() AS data",
        )
      ).rows[0].data,
    ).toEqual([]);
    await expect(
      actor(
        tx,
        "rebook-owner",
        "SELECT beauty.set_my_rebooking_consent($1,'email',true)",
        [pro],
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(
      (
        await tx.query(
          "SELECT enabled FROM beauty.rebooking_customer_consents WHERE user_id=$1",
          [client],
        )
      ).rows[0].enabled,
    ).toBe(true);
  }));
it("refuses unsupported channels without altering a global preference", () =>
  isolated(async (tx) => {
    await booking(tx);
    await expect(
      actor(
        tx,
        "rebook-client",
        "SELECT beauty.set_my_rebooking_consent($1,'sms',true)",
        [pro],
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    await tx.query(
      "UPDATE beauty.marketing_preferences SET rebooking=false WHERE user_id=$1",
      [client],
    );
    await actor(
      tx,
      "rebook-client",
      "SELECT beauty.set_my_rebooking_consent($1,'email',true)",
      [pro],
    );
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    expect(await prepare(tx)).toBe(0);
  }));
it("pauses only the professional's own reminders and does not revive old jobs after resuming", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ paused: true, delayDays: 28 })],
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ paused: false, delayDays: 28 })],
    );
    expect(await prepare(tx)).toBe(0);
    await expect(
      actor(
        tx,
        "rebook-client",
        "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
        [JSON.stringify({ paused: false, delayDays: 28 })],
      ),
    ).rejects.toThrow("FORBIDDEN");
  }));
it("uses a service interval below the platform default and stores the applied interval", () =>
  isolated(async (tx) => {
    await booking(tx, 15);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    expect(await prepare(tx)).toBe(0);
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ serviceId: service, delayDays: 14 })],
    );
    expect(await prepare(tx)).toBe(1);
    expect(
      (await tx.query("SELECT rule_snapshot FROM beauty.rebooking_outbox"))
        .rows[0].rule_snapshot,
    ).toMatchObject({
      effectiveDelayDays: 14,
      consentVersion: "named-professional-email-v1",
    });
  }));
it("uses a service interval above the global prefilter and supports returning to the professional default", () =>
  isolated(async (tx) => {
    await booking(tx, 41);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ serviceId: service, delayDays: 40 })],
    );
    expect(await prepare(tx)).toBe(1);
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ serviceId: service, delayDays: null })],
    );
    expect(
      (await tx.query("SELECT * FROM beauty.rebooking_service_intervals")).rows,
    ).toHaveLength(0);
  }));
it("rejects foreign service IDs, invalid intervals and hidden settings", () =>
  isolated(async (tx) => {
    for (const payload of [
      { serviceId: "11111111-1111-4111-8111-111111111111", delayDays: 28 },
      { paused: false, delayDays: 1 },
      { paused: false, delayDays: 28, optInEveryone: true },
    ])
      await expect(
        actor(
          tx,
          "rebook-pro",
          "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
          [JSON.stringify(payload)],
        ),
      ).rejects.toThrow();
  }));
it("records consent and settings changes without editable audit entries or direct application table access", () =>
  isolated(async (tx) => {
    await booking(tx);
    await actor(
      tx,
      "rebook-client",
      "SELECT beauty.set_my_rebooking_consent($1,'email',false)",
      [pro],
    );
    await actor(
      tx,
      "rebook-pro",
      "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
      [JSON.stringify({ paused: true, delayDays: 30 })],
    );
    expect(
      (await tx.query("SELECT * FROM beauty.rebooking_scope_events")).rows,
    ).toHaveLength(2);
    await expect(
      actor(
        tx,
        "rebook-client",
        "SELECT * FROM beauty.rebooking_customer_consents",
      ),
    ).rejects.toThrow();
    for (const command of [
      "UPDATE beauty.rebooking_scope_events SET details='{}'::jsonb",
      "DELETE FROM beauty.rebooking_scope_events",
    ]) {
      await tx.query("SAVEPOINT immutable");
      await expect(tx.query(command)).rejects.toThrow("APPEND_ONLY");
      await tx.query("ROLLBACK TO SAVEPOINT immutable");
    }
  }));
it("checks quiet hours again between claim and provider submission", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    await tx.query(
      "CREATE OR REPLACE FUNCTION beauty.rebooking_delivery_window(at_time timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT false $$",
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    expect(await claim(tx)).toHaveLength(0);
  }));
it("uses London daylight-saving boundaries for the 9am to 8pm window", async () => {
  for (const [at, allowed] of [
    ["2026-07-01T07:59:59Z", false],
    ["2026-07-01T08:00:00Z", true],
    ["2026-07-01T18:59:59Z", true],
    ["2026-07-01T19:00:00Z", false],
    ["2026-12-01T08:59:59Z", false],
    ["2026-12-01T09:00:00Z", true],
    ["2026-12-01T19:59:59Z", true],
    ["2026-12-01T20:00:00Z", false],
  ])
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT beauty.rebooking_delivery_window($1::timestamptz) AS allowed",
          [at],
        )
      ).rows[0].allowed,
    ).toBe(allowed);
});
it("consent for a different professional cannot qualify this booking", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    const other = (
      await tx.query<{ id: string }>(
        "INSERT INTO beauty.professional_profiles(user_id) VALUES($1) RETURNING id",
        [owner],
      )
    ).rows[0].id;
    await tx.query(
      "DELETE FROM beauty.rebooking_customer_consents WHERE professional_id=$1",
      [pro],
    );
    await tx.query(
      "INSERT INTO beauty.rebooking_customer_consents(user_id,professional_id,enabled) VALUES($1,$2,true)",
      [client, other],
    );
    expect(await prepare(tx)).toBe(0);
    const foreign = (
      await tx.query<{ id: string }>(
        "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Other service',60,5000,2000) RETURNING id",
        [other],
      )
    ).rows[0].id;
    await expect(
      actor(
        tx,
        "rebook-pro",
        "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
        [JSON.stringify({ serviceId: foreign, delayDays: 30 })],
      ),
    ).rejects.toThrow("FORBIDDEN");
  }));
it("global withdrawal suppresses waiting work and later global opt-in cannot revive named consent", () =>
  isolated(async (tx) => {
    await booking(tx);
    await tx.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await prepare(tx);
    const jobs = await claim(tx);
    const token = (
      await tx.query(
        "SELECT unsubscribe_token FROM beauty.marketing_preferences WHERE user_id=$1",
        [client],
      )
    ).rows[0].unsubscribe_token;
    expect(
      (
        await worker(tx, "SELECT beauty.unsubscribe_marketing($1) AS changed", [
          token,
        ])
      ).rows[0].changed,
    ).toBe(true);
    expect(
      (
        await tx.query(
          "SELECT enabled FROM beauty.rebooking_customer_consents WHERE user_id=$1",
          [client],
        )
      ).rows[0].enabled,
    ).toBe(false);
    expect(
      (await tx.query("SELECT details FROM beauty.rebooking_scope_events"))
        .rows[0].details,
    ).toMatchObject({ source: "global_opt_out", enabled: false });
    await tx.query(
      "UPDATE beauty.marketing_preferences SET rebooking=true WHERE user_id=$1",
      [client],
    );
    expect(await preflight(tx, jobs[0].id)).toBeNull();
    expect(await prepare(tx)).toBe(0);
  }));
it.skipIf(process.env.GLOHAUS_NATIVE_DATABASE !== "1")(
  "pause waits for a concurrent queue transaction then suppresses its new job",
  async () => {
    await db.query(
      "INSERT INTO beauty.rebooking_professional_settings(professional_id,paused) VALUES($1,false)",
      [pro],
    );
    await db.query(
      "INSERT INTO beauty.rebooking_customer_consents(user_id,professional_id,enabled) VALUES($1,$2,true)",
      [client, pro],
    );
    await db.query("UPDATE beauty.rebooking_settings SET enabled=true");
    await booking(db);
    let release!: () => void;
    let ready!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const preparing = db.transaction(async (tx) => {
      await prepare(tx);
      ready();
      await held;
    });
    await Promise.race([queued, preparing]);
    const pausing = db.transaction(async (tx) => {
      await actor(
        tx,
        "rebook-pro",
        "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
        [JSON.stringify({ paused: true, delayDays: 28 })],
      );
    });
    let waiting = false;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        waiting = (
          await db.query<{ waiting: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting",
          )
        ).rows[0].waiting;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
    }
    await Promise.all([preparing, pausing]);
    expect(waiting).toBe(true);
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM beauty.rebooking_outbox",
        )
      ).rows[0].state,
    ).toBe("suppressed");
    expect(
      (
        await db.query(
          "SELECT paused FROM beauty.rebooking_professional_settings",
        )
      ).rows[0].paused,
    ).toBe(true);
  },
);
