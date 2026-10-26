import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
let pro: string;
const key = "11111111-1111-4111-8111-111111111111";
const lease = "22222222-2222-4222-8222-222222222222";
async function user<T>(
  work: (sql: SqlClient) => Promise<T>,
  id = "payout-pro",
) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [id]);
    return work(tx);
  });
}
async function worker<T>(work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}
async function request(requestKey = key, amount = 500, leaseKey = lease) {
  return (
    await user((sql) =>
      sql.query<{
        data: {
          id: string;
          claimed: boolean;
          status: string;
          stripeAccountId: string;
        };
      }>("SELECT beauty.request_my_payout_once('standard',$1,$2,$3) AS data", [
        amount,
        requestKey,
        leaseKey,
      ]),
    )
  ).rows[0].data;
}
beforeAll(async () => {
  await applyTestMigrations(db);
  pro = (
    await user((sql) =>
      enrolAccount(
        sql,
        {
          authId: "payout-pro",
          email: "payout@example.test",
          displayName: "Payout Pro",
          secondFactorAge: null,
        },
        "professional",
      ),
    )
  ).professionalId!;
  await user((sql) =>
    sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_payout_fixture')",
      [pro],
    ),
  );
  await worker(async (sql) => {
    await sql.query(
      "SELECT beauty.sync_connect_account('acct_payout_fixture',true)",
    );
    await sql.query(
      "SELECT beauty.sync_connect_verification('acct_payout_fixture',true)",
    );
    await sql.query(
      `SELECT beauty.record_financial_ledger('payout-seed','payment','booking',NULL,$1,'{}',
      '[{"accountCode":"provider_clearing","amountPence":10000},{"accountCode":"professional_available","amountPence":-10000}]')`,
      [pro],
    );
  });
});
afterAll(() => db.close());
it("reserves once, returns the same payout, and gives only one request a processing lease", async () => {
  const [first, repeat] = await Promise.all([request(), request()]);
  expect([first.claimed, repeat.claimed].filter(Boolean)).toHaveLength(1);
  expect(repeat.id).toBe(first.id);
  expect(first.stripeAccountId).toBe("acct_payout_fixture");
  expect(
    (
      await db.query<{ protected: boolean }>(
        "SELECT leased_until>now()+interval '14 minutes' AS protected FROM beauty.financial_payout_requests LIMIT 1",
      )
    ).rows[0].protected,
  ).toBe(true);
  expect(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM beauty.financial_payouts",
      )
    ).rows[0].count,
  ).toBe(1);
  expect(
    (
      await user((sql) =>
        sql.query<{ data: { availablePence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data.availablePence,
  ).toBe(9500);
  await expect(request(key, 600)).rejects.toThrow("IDEMPOTENCY_MISMATCH");
});
it("reclaims an expired lease with the same payout identity, but never reissues after the provider key window", async () => {
  await db.query(
    "UPDATE beauty.financial_payout_requests SET leased_until=now()-interval '1 second'",
  );
  expect((await request()).claimed).toBe(true);
  await db.query(
    "UPDATE beauty.financial_payout_requests SET leased_until=now()-interval '1 second',created_at=now()-interval '24 hours'",
  );
  expect((await request()).claimed).toBe(false);
});
it("prevents direct application access to request tokens and unauthorised requests", async () => {
  await expect(
    user((sql) => sql.query("SELECT * FROM beauty.financial_payout_requests")),
  ).rejects.toThrow(/permission denied/);
  await expect(
    user(
      (sql) =>
        sql.query(
          "SELECT beauty.request_my_payout_once('standard',500,$1,$2)",
          [key, lease],
        ),
      "stranger",
    ),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE anon");
      await tx.query(
        "SELECT beauty.request_my_payout_once('standard',500,$1,$2)",
        [key, lease],
      );
    }),
  ).rejects.toThrow(/permission denied/);
});
it("handles a bank return after paid exactly once, keeping available and processing balances correct", async () => {
  const payout = await request();
  await worker(async (sql) => {
    await sql.query(
      "SELECT beauty.record_payout_provider($1,'tr_local','po_local',NULL,0,now())",
      [payout.id],
    );
    await sql.query("SELECT beauty.apply_payout_result('po_local','paid')");
    await sql.query("SELECT beauty.apply_payout_result('po_local','paid')");
  });
  expect(
    (
      await user((sql) =>
        sql.query<{ data: { totalPaidPence: number } }>(
          "SELECT beauty.my_payout_summary() AS data",
        ),
      )
    ).rows[0].data.totalPaidPence,
  ).toBe(500);
  await worker(async (sql) => {
    await sql.query("SELECT beauty.apply_payout_result('po_local','failed')");
    await sql.query("SELECT beauty.apply_payout_result('po_local','failed')");
  });
  const wallet = (
    await user((sql) =>
      sql.query<{ data: { availablePence: number; processingPence: number } }>(
        "SELECT beauty.my_wallet_overview() AS data",
      ),
    )
  ).rows[0].data;
  expect(wallet).toMatchObject({ availablePence: 10000, processingPence: 0 });
  expect(
    (
      await user((sql) =>
        sql.query<{ data: { totalPaidPence: number } }>(
          "SELECT beauty.my_payout_summary() AS data",
        ),
      )
    ).rows[0].data.totalPaidPence,
  ).toBe(0);
  expect((await request()).status).toBe("failed");
  await expect(
    worker((sql) =>
      sql.query("SELECT beauty.apply_payout_result('po_local','paid')"),
    ),
  ).rejects.toThrow("PAYOUT_STATE_MISMATCH");
});
