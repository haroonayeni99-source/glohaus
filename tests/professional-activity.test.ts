import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import {
  publicProfessionals,
  publicProfile,
} from "@/modules/professionals/repository";
import {
  discoveryCursor,
  discoveryOptions,
} from "@/modules/professionals/discovery";
import { engagementEmail } from "@/modules/professional-activity/repository";
import {
  GET as overview,
  POST as decide,
} from "@/app/api/v1/admin/professional-activity/route";
import { POST as acceptBoost } from "@/app/api/v1/professional/activity/route";

const db = await createTestDatabase();
let current: SqlClient;
let actor: string | null = "activity-owner";
let mfa: number | null = 0;
let pro: string;
let other: string;
let proUser: string;
let service: string;
let customer: string;
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (!actor) throw new AccessError("UNAUTHENTICATED", 401);
    return {
      authId: actor,
      email: actor + "@example.test",
      displayName: actor,
      secondFactorAge: mfa,
    };
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(auth: string, work: (tx: SqlClient) => Promise<T>) =>
    as(current, auth, () => work(current)),
}));
async function as<T>(
  tx: SqlClient,
  auth: string,
  work: () => Promise<T>,
  role = "beauty_app",
  verified = true,
) {
  await tx.query("SAVEPOINT activity_actor");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [auth, String(verified)],
  );
  try {
    const result = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT activity_actor");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK TO SAVEPOINT activity_actor");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT activity_actor");
    throw error;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  actor = "activity-owner";
  mfa = 0;
  try {
    await db.transaction(async (tx) => {
      current = tx;
      await work(tx);
      throw Error("TEST_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error && error.message === "TEST_ROLLBACK"))
      throw error;
  }
}
async function age(tx: SqlClient, days: number, id = pro) {
  await tx.query(
    "INSERT INTO beauty.professional_activity(professional_id) VALUES($1) ON CONFLICT DO NOTHING",
    [id],
  );
  await tx.query(
    "UPDATE beauty.professional_activity SET last_activity_at=now()-$2::integer*interval '1 day',last_alert_stage=0,warning_at=NULL WHERE professional_id=$1",
    [id, days],
  );
}
async function monitor(tx: SqlClient) {
  return as(
    tx,
    "",
    async () =>
      (
        await tx.query<{ data: { alerts: number } }>(
          "SELECT beauty.run_professional_activity_monitor() AS data",
        )
      ).rows[0].data,
    "beauty_payment_worker",
  );
}
async function state(tx: SqlClient, id = pro) {
  return (
    await tx.query(
      "SELECT * FROM beauty.professional_activity WHERE professional_id=$1",
      [id],
    )
  ).rows[0];
}
async function action(
  tx: SqlClient,
  operation: string,
  id = pro,
  auth = "activity-owner",
  verified = true,
) {
  return as(
    tx,
    auth,
    () =>
      tx.query("SELECT beauty.owner_professional_activity_action($1,$2,$3)", [
        id,
        operation,
        "Reviewed professional activity",
      ]),
    "beauty_app",
    verified,
  );
}
function request(
  body: unknown,
  path = "/api/v1/admin/professional-activity",
  origin = "https://glohaus.test",
) {
  return new Request("https://glohaus.test" + path, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function emails(tx: SqlClient) {
  return as(
    tx,
    "",
    () => tx.query("SELECT * FROM beauty.claim_professional_activity_emails()"),
    "beauty_payment_worker",
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const [auth, role] of [
    ["activity-owner", "owner"],
    ["activity-admin", "admin"],
    ["activity-pro", "professional"],
    ["activity-other", "professional"],
    ["activity-customer", "customer"],
  ]) {
    const user = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.users(auth_id,email,display_name) VALUES($1,$2,$1) RETURNING id",
        [auth, auth + "@example.test"],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
      [user, role],
    );
    if (role === "owner") {
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [user],
      );
    }
    if (role === "customer") customer = user;
    if (role === "professional") {
      const p = (
        await db.query<{ id: string }>(
          "INSERT INTO beauty.professional_profiles(user_id,publication_status,slug,business_name,bio,city) VALUES($1,'published',$2,$3,'A complete professional beauty studio profile.','London') RETURNING id",
          [
            user,
            auth,
            auth === "activity-pro" ? "Zulu Studio" : "Alpha Studio",
          ],
        )
      ).rows[0].id;
      if (auth === "activity-pro") {
        pro = p;
        proUser = user;
      } else other = p;
    }
  }
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Hair styling',60,1000,400) RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
afterAll(() => db.close());

describe("professional inactivity, protected decisions and real discovery", () => {
  it("starts unknown history at a fresh baseline and emits nothing before day 14", () =>
    isolated(async (tx) => {
      expect((await monitor(tx)).alerts).toBe(0);
      expect((await state(tx)).activity_source).toBe("monitoring_started");
      await age(tx, 13);
      expect((await monitor(tx)).alerts).toBe(0);
      await age(tx, 14);
      expect((await monitor(tx)).alerts).toBe(1);
      expect((await state(tx)).last_alert_stage).toBe(14);
    }));
  it("emits one professional and one owner notice per 14/30/60-day stage without repeated cron spam", () =>
    isolated(async (tx) => {
      for (const days of [14, 30, 60]) {
        await tx.query(
          "INSERT INTO beauty.professional_activity(professional_id) VALUES($1) ON CONFLICT DO NOTHING",
          [pro],
        );
        await tx.query(
          "UPDATE beauty.professional_activity SET last_activity_at=now()-$2::integer*interval '1 day' WHERE professional_id=$1",
          [pro, days],
        );
        expect((await monitor(tx)).alerts).toBe(1);
        expect((await monitor(tx)).alerts).toBe(0);
      }
      expect(
        (
          await tx.query(
            "SELECT user_id,count(*)::int AS total FROM beauty.in_app_notifications WHERE kind='professional_activity' GROUP BY user_id ORDER BY total",
          )
        ).rows.map((r) => r.total),
      ).toEqual([3, 3]);
      expect((await state(tx)).hidden_at).toBeNull();
      expect((await state(tx)).boost_until).toBeNull();
    }));
  it("treats observed website use as activity and cancels queued stale alerts", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      await monitor(tx);
      await as(tx, "activity-pro", () =>
        tx.query("SELECT beauty.record_my_professional_visit()"),
      );
      expect((await state(tx)).activity_source).toBe("website_visit");
      expect((await state(tx)).last_alert_stage).toBe(0);
      expect((await monitor(tx)).alerts).toBe(0);
      expect((await emails(tx)).rows).toEqual([]);
      expect(
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM beauty.professional_activity_outbox WHERE cancelled_at IS NOT NULL",
          )
        ).rows[0].n,
      ).toBe(2);
    }));
  it("never counts an outsider's visit as the target professional's activity", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      const before = await state(tx);
      await as(tx, "activity-customer", () =>
        tx.query("SELECT beauty.record_my_professional_visit()"),
      );
      expect((await state(tx)).last_activity_at).toEqual(
        before.last_activity_at,
      );
    }));
  it("keeps restricted and self-hidden professionals out of automated outreach", () =>
    isolated(async (tx) => {
      await age(tx, 60);
      await tx.query(
        "UPDATE beauty.professional_profiles SET publication_status='hidden' WHERE id=$1",
        [pro],
      );
      expect((await monitor(tx)).alerts).toBe(0);
      await tx.query(
        "UPDATE beauty.professional_profiles SET publication_status='published' WHERE id=$1",
        [pro],
      );
      await tx.query(
        "UPDATE beauty.users SET restricted_until=now()+interval '1 day' WHERE id=$1",
        [proUser],
      );
      expect((await monitor(tx)).alerts).toBe(0);
    }));
  it("requires day 60 plus a seven-day warning and preserves direct profiles and account status when hidden", () =>
    isolated(async (tx) => {
      await age(tx, 60);
      await monitor(tx);
      await expect(action(tx, "hide")).rejects.toThrow("WARNING_REQUIRED");
      await tx.query(
        "UPDATE beauty.professional_activity SET warning_at=now()-interval '7 days' WHERE professional_id=$1",
        [pro],
      );
      await action(tx, "hide");
      const discovery = await as(tx, "", () => publicProfessionals(tx));
      expect(discovery.some((p) => p.id === pro)).toBe(false);
      expect(
        await as(tx, "", () => publicProfile(tx, "activity-pro")),
      ).not.toBeNull();
      expect(
        (
          await tx.query("SELECT status FROM beauty.users WHERE id=$1", [
            proUser,
          ])
        ).rows[0].status,
      ).toBe("active");
      await as(tx, "activity-pro", () =>
        tx.query("SELECT beauty.record_my_professional_visit()"),
      );
      expect((await state(tx)).hidden_at).not.toBeNull();
      await action(tx, "restore");
      expect(
        (await as(tx, "", () => publicProfessionals(tx))).some(
          (p) => p.id === pro,
        ),
      ).toBe(true);
      expect(
        (
          await tx.query(
            "SELECT action FROM beauty.admin_audit_logs WHERE target_id=$1 ORDER BY created_at,id",
            [pro],
          )
        ).rows
          .map((r) => r.action)
          .sort(),
      ).toEqual([
        "professional_activity_hide",
        "professional_activity_restore",
      ]);
    }));
  it("rejects a stale hiding decision after the professional returns", () =>
    isolated(async (tx) => {
      await age(tx, 67);
      await monitor(tx);
      await tx.query(
        "UPDATE beauty.professional_activity SET warning_at=now()-interval '7 days' WHERE professional_id=$1",
        [pro],
      );
      await as(tx, "activity-pro", () =>
        tx.query("SELECT beauty.record_my_professional_visit()"),
      );
      await expect(action(tx, "hide")).rejects.toThrow("ACTIVITY_CHANGED");
    }));
  it("offers once per inactive episode, requires acceptance and expires the real boost without changing ratings", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      await action(tx, "offer_boost");
      expect((await state(tx)).boost_until).toBeNull();
      await expect(action(tx, "offer_boost")).rejects.toThrow(
        "ACTIVITY_CHANGED",
      );
      await as(tx, "activity-other", () =>
        tx.query("SELECT beauty.record_my_professional_visit()"),
      );
      await expect(
        as(tx, "activity-other", () =>
          tx.query("SELECT beauty.accept_my_visibility_boost()"),
        ),
      ).rejects.toThrow("BOOST_UNAVAILABLE");
      actor = "activity-pro";
      expect(
        (
          await acceptBoost(
            request(
              { action: "accept_boost", confirmed: true },
              "/api/v1/professional/activity",
            ),
          )
        ).status,
      ).toBe(200);
      const results = await as(tx, "", () => publicProfessionals(tx));
      expect(results[0].id).toBe(pro);
      expect(results[0].boosted).toBe(true);
      expect(results[0].rating).toBeNull();
      const after = discoveryCursor(results[0], "");
      expect(discoveryOptions({ after }).after).toBeDefined();
      await expect(
        as(tx, "activity-pro", () =>
          tx.query("SELECT beauty.accept_my_visibility_boost()"),
        ),
      ).rejects.toThrow("BOOST_UNAVAILABLE");
      await tx.query(
        "UPDATE beauty.professional_activity SET boost_until=now()-interval '1 second' WHERE professional_id=$1",
        [pro],
      );
      expect((await as(tx, "", () => publicProfessionals(tx)))[0].id).toBe(
        other,
      );
    }));
  it("rejects expired offers and profiles without an active service", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      await action(tx, "offer_boost");
      await tx.query("UPDATE beauty.services SET active=false WHERE id=$1", [
        service,
      ]);
      await expect(
        as(tx, "activity-pro", () =>
          tx.query("SELECT beauty.accept_my_visibility_boost()"),
        ),
      ).rejects.toThrow("BOOST_UNAVAILABLE");
      await tx.query("UPDATE beauty.services SET active=true WHERE id=$1", [
        service,
      ]);
      await tx.query(
        "UPDATE beauty.professional_activity SET offer_until=now()-interval '1 second' WHERE professional_id=$1",
        [pro],
      );
      await expect(
        as(tx, "activity-pro", () =>
          tx.query("SELECT beauty.accept_my_visibility_boost()"),
        ),
      ).rejects.toThrow("BOOST_UNAVAILABLE");
    }));
  it("enforces consent and suppression at email claim time and uses a stable outbox id for retries", () =>
    isolated(async (tx) => {
      await age(tx, 14);
      await monitor(tx);
      const claimed = (await emails(tx)).rows;
      expect(claimed).toHaveLength(1);
      expect(claimed[0].email).toBe("activity-owner@example.test");
      expect((await emails(tx)).rows).toEqual([]);
      await as(
        tx,
        "",
        () =>
          tx.query(
            "SELECT beauty.finish_professional_activity_email($1,NULL)",
            [claimed[0].id],
          ),
        "beauty_payment_worker",
      );
      await tx.query(
        "UPDATE beauty.professional_activity_outbox SET due_at=now() WHERE id=$1",
        [claimed[0].id],
      );
      expect((await emails(tx)).rows[0].id).toBe(claimed[0].id);
      await tx.query(
        "INSERT INTO beauty.email_suppressions(email,reason) VALUES('activity-owner@example.test','complained')",
      );
      expect((await emails(tx)).rows).toEqual([]);
      expect(
        (
          await tx.query(
            "SELECT cancelled_at FROM beauty.professional_activity_outbox WHERE id=$1",
            [claimed[0].id],
          )
        ).rows[0].cancelled_at,
      ).not.toBeNull();
    }));
  it("rechecks promotion opt-out instead of treating a boost offer as transactional email", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      await tx.query(
        "INSERT INTO beauty.marketing_preferences(user_id,professional_promotions) VALUES($1,true)",
        [proUser],
      );
      await action(tx, "offer_boost");
      await tx.query(
        "UPDATE beauty.marketing_preferences SET professional_promotions=false WHERE user_id=$1",
        [proUser],
      );
      expect((await emails(tx)).rows).toEqual([]);
      expect(
        (
          await tx.query(
            "SELECT count(*)::int AS n FROM beauty.in_app_notifications WHERE user_id=$1 AND kind='professional_activity'",
            [proUser],
          )
        ).rows[0].n,
      ).toBe(1);
    }));
  it("protects raw tracking data, worker routines, Owner actions and MFA at the database boundary", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      await expect(
        as(tx, "activity-pro", () =>
          tx.query("SELECT * FROM beauty.professional_activity"),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        as(tx, "", () =>
          tx.query("SELECT beauty.run_professional_activity_monitor()"),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        action(tx, "offer_boost", pro, "activity-admin"),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        action(tx, "offer_boost", pro, "activity-owner", false),
      ).rejects.toThrow("FORBIDDEN");
      const projection = await as(tx, "", () =>
        tx.query("SELECT * FROM beauty.public_professional_exposure"),
      );
      expect(Object.keys(projection.rows[0]).sort()).toEqual([
        "boosted",
        "hidden",
        "professional_id",
      ]);
    }));
  it("validates API origin, explicit confirmation, Owner role and search pagination", () =>
    isolated(async (tx) => {
      await age(tx, 30);
      const payload = {
        professionalId: pro,
        action: "offer_boost",
        reason: "Reviewed profile",
        confirmed: true,
      };
      expect(
        (await decide(request(payload, undefined, "https://attacker.test")))
          .status,
      ).toBe(403);
      expect(
        (await decide(request({ ...payload, confirmed: false }))).status,
      ).toBe(400);
      actor = "activity-admin";
      expect((await decide(request(payload))).status).toBe(403);
      actor = "activity-owner";
      mfa = null;
      expect((await decide(request(payload))).status).toBe(403);
      mfa = 0;
      expect(
        (
          await overview(
            new Request(
              "https://glohaus.test/api/v1/admin/professional-activity?page=-1",
            ),
          )
        ).status,
      ).toBe(400);
      const response = await overview(
        new Request(
          "https://glohaus.test/api/v1/admin/professional-activity?q=Zulu",
        ),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).rows[0].id).toBe(pro);
      expect((await decide(request(payload))).status).toBe(200);
    }));
  it("counts confirmed bookings as activity while preserving their original financial fields", () =>
    isolated(async (tx) => {
      await age(tx, 60);
      await monitor(tx);
      const booking = (
        await tx.query<{ id: string }>(
          `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
      VALUES($1,$2,$3,'Hair styling','Test Customer','Zulu Studio',now()+interval '3 days',now()+interval '3 days 1 hour',60,1000,400,'confirmed',now()+interval '15 minutes') RETURNING id`,
          [pro, customer, service],
        )
      ).rows[0];
      expect((await state(tx)).activity_source).toBe("booking");
      expect((await state(tx)).last_alert_stage).toBe(0);
      expect(
        (
          await tx.query(
            "SELECT status,price_pence,deposit_pence FROM beauty.bookings WHERE id=$1",
            [booking.id],
          )
        ).rows[0],
      ).toEqual({ status: "confirmed", price_pence: 1000, deposit_pence: 400 });
    }));
  it("limits retries to the provider idempotency window", () =>
    isolated(async (tx) => {
      await age(tx, 14);
      await monitor(tx);
      const job = (await emails(tx)).rows[0];
      await tx.query(
        "UPDATE beauty.professional_activity_outbox SET first_attempt_at=now()-interval '24 hours',claimed_until=NULL WHERE id=$1",
        [job.id],
      );
      expect((await emails(tx)).rows).toEqual([]);
    }));
});
it("adds an unsubscribe link only to opted-in marketing emails", () => {
  const job = {
    id: "fixture",
    email: "fixture@example.test",
    subject: "Return to GLOHAUS",
    body: "Review your profile.",
    href: "/professional",
    unsubscribe_token: "token",
  };
  expect(engagementEmail(job, "https://glohaus.test").text).toContain(
    "/marketing/unsubscribe?token=token",
  );
  expect(
    engagementEmail({ ...job, unsubscribe_token: null }, "https://glohaus.test")
      .text,
  ).not.toContain("optional GLOHAUS marketing");
});
