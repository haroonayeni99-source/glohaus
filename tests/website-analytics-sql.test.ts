import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const payload = (extra = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  visitor: "00000000-0000-4000-8000-000000000002",
  session: "00000000-0000-4000-8000-000000000003",
  page: "home",
  device: "mobile",
  sequence: 1,
  activeMs: 0,
  scroll: 0,
  clicks: {},
  videos: [],
  ...extra,
});
async function ingest(p = payload()) {
  return (
    await db.query<{ ok: boolean }>(
      "SELECT beauty.ingest_engagement($1::jsonb) ok",
      [JSON.stringify(p)],
    )
  ).rows[0].ok;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE beauty_admin_ops NOLOGIN NOBYPASSRLS;CREATE ROLE beauty_app NOLOGIN NOBYPASSRLS;CREATE ROLE beauty_payment_worker NOLOGIN NOBYPASSRLS;CREATE ROLE anon;CREATE ROLE authenticated;GRANT beauty_admin_ops TO postgres;CREATE SCHEMA beauty;GRANT USAGE ON SCHEMA beauty TO beauty_admin_ops,beauty_app,beauty_payment_worker;
CREATE FUNCTION beauty.auth_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.auth_id',true),'')::uuid$$;
CREATE FUNCTION beauty.require_owner() RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF current_setting('app.admin_verified',true) IS DISTINCT FROM 'true' OR current_setting('app.is_owner',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;RETURN '00000000-0000-4000-8000-000000000009'::uuid;END$$;
CREATE TABLE beauty.users(id uuid,auth_id uuid,status text);CREATE TABLE beauty.bookings(id uuid,customer_id uuid,created_at timestamptz,status text);CREATE TABLE beauty.payments(booking_id uuid,status text,captured_pence integer,refunded_pence integer);CREATE TABLE beauty.product_orders(checkout_reference uuid,customer_id uuid,created_at timestamptz,status text);GRANT SELECT ON ALL TABLES IN SCHEMA beauty TO beauty_admin_ops;`);
  try {
    await db.exec(
      readFileSync("db/proposals/20261106120000_owner_engagement.sql", "utf8"),
    );
  } catch (e) {
    const x = e as {
      position?: string;
      internalQuery?: string;
      where?: string;
    };
    console.error({
      position: x.position,
      internalQuery: x.internalQuery,
      where: x.where,
    });
    throw e;
  }
}, 30000);
afterAll(async () => {
  await db.close();
});
it("accepts a view, deduplicates retries, and refuses private/free text or time inflation", async () => {
  expect(await ingest()).toBe(true);
  expect(await ingest()).toBe(true);
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM glohaus_analytics.visits",
      )
    ).rows[0].n,
  ).toBe(1);
  expect(await ingest(payload({ email: "private" }))).toBe(false);
  expect(await ingest(payload({ sequence: 2, activeMs: 999999 }))).toBe(false);
  expect(
    await ingest(
      payload({ sequence: 2, activeMs: 1000, clicks: { search: 1 } }),
    ),
  ).toBe(true);
  expect(
    await ingest(
      payload({ sequence: 3, activeMs: 1001, clicks: { private: 1 } }),
    ),
  ).toBe(false);
});
it("prevents a different visitor replacing a stored view", async () => {
  expect(
    await ingest(
      payload({
        visitor: "00000000-0000-4000-8000-000000000005",
        sequence: 10,
      }),
    ),
  ).toBe(false);
});
it("denies direct raw-table access and reports to non-Owners", async () => {
  await db.exec("SET ROLE beauty_app");
  try {
    await expect(
      db.query("SELECT * FROM glohaus_analytics.visits"),
    ).rejects.toThrow();
    await expect(
      db.query(
        "SELECT beauty.owner_engagement_rows(now()-interval '1 day',now(),'all')",
      ),
    ).rejects.toThrow("FORBIDDEN");
  } finally {
    await db.exec("RESET ROLE");
  }
});
it("allows only fresh verified Owner reports, with strict date bounds", async () => {
  await db.exec(
    "SET app.admin_verified='true'; SET app.is_owner='true';SET ROLE beauty_app",
  );
  try {
    const r = await db.query<{ data: unknown[] }>(
      "SELECT beauty.owner_engagement_rows(now()-interval '1 day',now(),'all') data",
    );
    expect(r.rows[0].data.length).toBe(1);
    await expect(
      db.query(
        "SELECT beauty.owner_engagement_rows(now()-interval '1 year',now(),'all')",
      ),
    ).rejects.toThrow("INVALID_REQUEST");
  } finally {
    await db.exec("RESET ROLE; RESET app.admin_verified;RESET app.is_owner");
  }
});
it("does not count a conversion without an authenticated paid receipt", async () => {
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.verify_engagement_conversion($1,'booking',null) ok",
        [payload().id],
      )
    ).rows[0].ok,
  ).toBe(false);
});
it("records only an authenticated customer's verified paid completion and deduplicates receipts", async () => {
  const id = "00000000-0000-4000-8000-000000000021",
    receipt = "00000000-0000-4000-8000-000000000022",
    actor = "00000000-0000-4000-8000-000000000023",
    auth = "00000000-0000-4000-8000-000000000024";
  expect(await ingest(payload({ id, page: "service" }))).toBe(true);
  await db.query("INSERT INTO beauty.users VALUES($1,$2,'active')", [
    actor,
    auth,
  ]);
  await db.query(
    "INSERT INTO beauty.bookings VALUES($1,$2,now(),'confirmed')",
    [receipt, actor],
  );
  await db.query("INSERT INTO beauty.payments VALUES($1,'pending',0,0)", [
    receipt,
  ]);
  await db.query("SELECT set_config('app.auth_id',$1,false)", [auth]);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.verify_engagement_conversion($1,'booking',$2) ok",
        [id, receipt],
      )
    ).rows[0].ok,
  ).toBe(false);
  await db.query(
    "UPDATE beauty.payments SET status='paid',captured_pence=100 WHERE booking_id=$1",
    [receipt],
  );
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.verify_engagement_conversion($1,'booking',$2) ok",
        [id, receipt],
      )
    ).rows[0].ok,
  ).toBe(true);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.verify_engagement_conversion($1,'booking',$2) ok",
        [id, receipt],
      )
    ).rows[0].ok,
  ).toBe(true);
  const stored = await db.query<{ conversion: string; conversion_key: string }>(
    "SELECT conversion,conversion_key FROM glohaus_analytics.visits WHERE id=$1",
    [id],
  );
  expect(stored.rows[0].conversion).toBe("booking");
  expect(stored.rows[0].conversion_key).toMatch(/^[a-f0-9]{64}$/);
  expect(stored.rows[0].conversion_key).not.toContain(receipt);
  await db.exec("RESET app.auth_id");
});
it("restricts retention to its dedicated worker and removes expired activity only", async () => {
  await db.exec(
    "UPDATE glohaus_analytics.visits SET first_at=now()-interval '91 days' WHERE page='home';SET ROLE beauty_app",
  );
  try {
    await expect(
      db.query("SELECT beauty.run_engagement_retention()"),
    ).rejects.toThrow();
  } finally {
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE beauty_payment_worker");
  try {
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT beauty.run_engagement_retention() n",
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await db.exec("RESET ROLE");
  }
});
