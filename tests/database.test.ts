import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  enrolAccount,
  findAccount,
  type SqlClient,
} from "@/modules/accounts/repository";
import type { Identity } from "@/modules/accounts/domain";

const db = new PGlite();
const alice: Identity = {
  authId: "user_alice",
  email: "alice@example.test",
  displayName: "Alice",
  secondFactorAge: null,
};
const bob: Identity = {
  authId: "user_bob",
  email: "bob@example.test",
  displayName: "Bob",
  secondFactorAge: null,
};
async function asUser<T>(
  authId: string,
  fn: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id', $1, true)", [authId]);
    return fn(tx);
  });
}

beforeAll(async () => {
  await db.exec(
    await readFile(
      new URL("../db/migrations/0001_accounts.sql", import.meta.url),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await db.close();
});

describe.sequential("real PostgreSQL account policies and enrollment", () => {
  it("creates a customer atomically and repeat enrollment is idempotent", async () => {
    const first = await asUser(alice.authId, (sql) =>
      enrolAccount(sql, alice, "customer"),
    );
    const second = await asUser(alice.authId, (sql) =>
      enrolAccount(sql, alice, "customer"),
    );
    expect(second.id).toBe(first.id);
    expect(second.roles).toEqual(["customer"]);
    const result = await db.query("SELECT * FROM beauty.customer_profiles");
    expect(result.rows).toHaveLength(1);
  });
  it("creates a separate professional and supports both roles", async () => {
    const pro = await asUser(bob.authId, (sql) =>
      enrolAccount(sql, bob, "professional"),
    );
    expect(pro.professionalId).toBeTruthy();
    const both = await asUser(bob.authId, (sql) =>
      enrolAccount(sql, bob, "customer"),
    );
    expect(both.roles).toEqual(["customer", "professional"]);
  });
  it("filters another customer's identity even without a WHERE clause", async () => {
    const rows = await asUser(alice.authId, (sql) =>
      sql.query("SELECT auth_id FROM beauty.users"),
    );
    expect(rows.rows).toEqual([{ auth_id: alice.authId }]);
    expect(
      await asUser(alice.authId, (sql) => findAccount(sql, bob.authId)),
    ).toBeNull();
  });
  it("hides other professionals' private records", async () => {
    const rows = await asUser(alice.authId, (sql) =>
      sql.query("SELECT * FROM beauty.professional_profiles"),
    );
    expect(rows.rows).toEqual([]);
  });
  it("denies rows without a verified identity context", async () => {
    const rows = await asUser("", (sql) =>
      sql.query("SELECT * FROM beauty.users"),
    );
    expect(rows.rows).toEqual([]);
  });
  it("rejects forged identity insertion at database level", async () => {
    await expect(
      asUser(alice.authId, (sql) =>
        sql.query(
          "INSERT INTO beauty.users (auth_id, email, display_name) VALUES ('forged', 'x@example.test', 'X')",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("rejects admin role escalation even through direct SQL", async () => {
    await expect(
      asUser(alice.authId, (sql) =>
        sql.query(
          "INSERT INTO beauty.user_roles(user_id, role) SELECT id, 'admin' FROM beauty.users",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("denies changing account status", async () => {
    await expect(
      asUser(alice.authId, (sql) =>
        sql.query("UPDATE beauty.users SET status = 'suspended'"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies publishing a professional during enrollment", async () => {
    await expect(
      asUser(alice.authId, (sql) =>
        sql.query(
          "INSERT INTO beauty.professional_profiles(user_id, publication_status) SELECT id, 'published' FROM beauty.users",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("rolls back all records if profile creation fails", async () => {
    const failing = { ...alice, authId: "user_failure" };
    await expect(
      asUser(failing.authId, async (sql) => {
        await enrolAccount(sql, failing, "professional");
        throw new Error("simulated failure");
      }),
    ).rejects.toThrow("simulated failure");
    expect(
      (
        await db.query(
          "SELECT id FROM beauty.users WHERE auth_id = 'user_failure'",
        )
      ).rows,
    ).toEqual([]);
  });
  it("denies audit history to the runtime role", async () => {
    await expect(
      asUser(bob.authId, (sql) =>
        sql.query("SELECT * FROM beauty.admin_audit_logs"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("suspension takes effect with an existing identity and cannot be undone by reenrollment", async () => {
    await db.query(
      "UPDATE beauty.users SET status = 'suspended' WHERE auth_id = $1",
      [bob.authId],
    );
    const account = await asUser(bob.authId, (sql) =>
      findAccount(sql, bob.authId),
    );
    expect(account?.status).toBe("suspended");
    expect(account?.roles).toEqual([]);
    expect(account?.professionalId).toBeNull();
    await expect(
      asUser(bob.authId, (sql) => enrolAccount(sql, bob, "professional")),
    ).rejects.toThrow("ACCOUNT_INACTIVE");
  });
});
