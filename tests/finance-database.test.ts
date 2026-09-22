import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";

const db = new PGlite();
let professionalId: string;
let professionalUserId: string;
let customerId: string;

async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = false,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await tx.query("SELECT set_config('app.admin_verified','true',true)");
    return work(tx);
  });
}

async function worker<T>(work: (sql: SqlClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("professional", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "professional",
        email: "professional@example.test",
        displayName: "Professional",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;
  professionalUserId = professional.id;
  customerId = (
    await asUser("customer", (sql) =>
      enrolAccount(
        sql,
        {
          authId: "customer",
          email: "customer@example.test",
          displayName: "Customer",
          secondFactorAge: null,
        },
        "customer",
      ),
    )
  ).id;
});

afterAll(() => db.close());

describe.sequential("financial ledger and financial access controls", () => {
  it("does not expose journals to the application database role", async () => {
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT * FROM beauty.financial_ledger_entries"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser("professional", (sql) =>
        sql.query(
          "SELECT beauty.record_financial_ledger('forged','payment','booking',NULL,$1,'{}','[]')",
          [professionalId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("posts only balanced, append-only transactions and derives pending money", async () => {
    const first = await worker((sql) =>
      sql.query<{ id: string }>(
        `SELECT beauty.record_financial_ledger(
          'provider-event-1','payment','booking',NULL,$1,'{}',
          '[{"accountCode":"provider_clearing","amountPence":1500},{"accountCode":"professional_pending","amountPence":-1400},{"accountCode":"platform_fee_revenue","amountPence":-100}]'
        ) AS id`,
        [professionalId],
      ),
    );
    const retry = await worker((sql) =>
      sql.query<{ id: string }>(
        `SELECT beauty.record_financial_ledger(
          'provider-event-1','payment','booking',NULL,$1,'{}',
          '[{"accountCode":"provider_clearing","amountPence":1500},{"accountCode":"professional_pending","amountPence":-1400},{"accountCode":"platform_fee_revenue","amountPence":-100}]'
        ) AS id`,
        [professionalId],
      ),
    );
    expect(retry.rows[0].id).toBe(first.rows[0].id);
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.financial_ledger_entries",
        )
      ).rows[0].count,
    ).toBe(3);
    expect(
      (
        await asUser("professional", (sql) =>
          sql.query<{ data: { pendingPence: number; availablePence: number } }>(
            "SELECT beauty.my_wallet_overview() AS data",
          ),
        )
      ).rows[0].data,
    ).toMatchObject({ pendingPence: 1400, availablePence: 0 });
  });

  it("does not commit an unbalanced journal", async () => {
    await expect(
      worker((sql) =>
        sql.query(
          `SELECT beauty.record_financial_ledger(
            'provider-event-unbalanced','payment','booking',NULL,$1,'{}',
            '[{"accountCode":"provider_clearing","amountPence":100},{"accountCode":"professional_pending","amountPence":-90}]'
          )`,
          [professionalId],
        ),
      ),
    ).rejects.toThrow("UNBALANCED_LEDGER");
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.financial_ledger_transactions WHERE event_reference='provider-event-unbalanced'",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("moves released money to available without allowing an overdrawn display", async () => {
    await worker((sql) =>
      sql.query(
        `SELECT beauty.record_financial_ledger(
          'service-release-1','release','booking',NULL,$1,'{}',
          '[{"accountCode":"professional_pending","amountPence":1400},{"accountCode":"professional_available","amountPence":-1400}]'
        )`,
        [professionalId],
      ),
    );
    expect(
      (
        await asUser("professional", (sql) =>
          sql.query<{
            data: { pendingPence: number; availablePence: number; outstandingObligationPence: number };
          }>("SELECT beauty.my_wallet_overview() AS data"),
        )
      ).rows[0].data,
    ).toMatchObject({
      pendingPence: 0,
      availablePence: 1400,
      outstandingObligationPence: 0,
    });
  });

  it("only the owner can create a future fee rule and records the decision", async () => {
    await expect(
      asUser("customer", (sql) =>
        sql.query(
          "SELECT beauty.set_financial_fee_rule('booking','Nails','customer',200,0,30,NULL,100,'platform','Customer tries to set a fee')",
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await db.query(
      "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",
      [professionalUserId],
    );
    await asUser(
      "professional",
      (sql) =>
        sql.query(
          "SELECT beauty.set_financial_fee_rule('booking','Nails','customer',200,0,30,NULL,100,'platform','Initial financial policy')",
        ),
      true,
    );
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.financial_fee_rules",
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.financial_admin_audit_logs",
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("records versioned tax acknowledgement for the professional only", async () => {
    await asUser("professional", (sql) =>
      sql.query("SELECT beauty.acknowledge_professional_tax('uk-tax-2026-01')"),
    );
    expect(
      (
        await db.query<{ user_id: string; professional_id: string }>(
          "SELECT user_id,professional_id FROM beauty.professional_tax_acknowledgements",
        )
      ).rows[0],
    ).toEqual({ user_id: professionalUserId, professional_id: professionalId });
    expect(customerId).toBeTruthy();
  });
});
