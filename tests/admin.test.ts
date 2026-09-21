import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = new PGlite();
let customer: string;
let admin: string;
async function asUser<T>(
  authId: string,
  verified: boolean,
  work: (sql: SqlClient) => Promise<T>,
) {
  return db
    .transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE beauty_app");
      await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
      if (verified)
        await tx.query("SELECT set_config('app.admin_verified','true',true)");
      return work(tx);
    })
    .finally(async () => {
      await db.exec("RESET SESSION AUTHORIZATION; RESET ROLE;");
    });
}
beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec(
    "CREATE ROLE beauty_test_login NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT beauty_app TO beauty_test_login;",
  );
  for (const authId of ["customer", "admin"]) {
    const account = await asUser(authId, false, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        "customer",
      ),
    );
    if (authId === "customer") customer = account.id;
    else admin = account.id;
  }
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
    [admin],
  );
});
afterAll(() => db.close());
describe.sequential(
  "admin functions protect private data and audit decisions",
  () => {
    it("denies anonymous and customer access even with a forged MFA flag", async () => {
      for (const authId of ["", "customer"])
        await expect(
          asUser(authId, true, (sql) =>
            sql.query("SELECT beauty.admin_overview()"),
          ),
        ).rejects.toThrow("FORBIDDEN");
    });
    it("denies an admin without fresh application-verified MFA", async () => {
      await expect(
        asUser("admin", false, (sql) =>
          sql.query("SELECT beauty.admin_overview()"),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("returns bounded user data to a verified admin", async () => {
      const result = await asUser("admin", true, (sql) =>
        sql.query<{ data: { users: unknown[]; counts: { users: number } } }>(
          "SELECT beauty.admin_overview() AS data",
        ),
      );
      expect(result.rows[0].data.counts.users).toBe(2);
      expect(result.rows[0].data.users).toHaveLength(2);
    });
    it("does not leak verified context into another transaction", async () => {
      await expect(
        asUser("admin", false, (sql) =>
          sql.query("SELECT beauty.admin_overview()"),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("prevents customers from suspending anyone", async () => {
      await expect(
        asUser("customer", true, (sql) =>
          sql.query(
            "SELECT beauty.admin_set_user_status($1,'suspended','Reviewed account')",
            [customer],
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("requires a substantive reason and leaves account unchanged on error", async () => {
      await expect(
        asUser("admin", true, (sql) =>
          sql.query("SELECT beauty.admin_set_user_status($1,'suspended','x')", [
            customer,
          ]),
        ),
      ).rejects.toThrow("INVALID_REQUEST");
      expect(
        (
          await db.query<{ status: string }>(
            "SELECT status FROM beauty.users WHERE id=$1",
            [customer],
          )
        ).rows[0].status,
      ).toBe("active");
    });
    it("suspends atomically with an audit record", async () => {
      await asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.admin_set_user_status($1,'suspended','Account misuse reviewed')",
          [customer],
        ),
      );
      expect(
        (
          await db.query<{ status: string }>(
            "SELECT status FROM beauty.users WHERE id=$1",
            [customer],
          )
        ).rows[0].status,
      ).toBe("suspended");
      const audit = await db.query<{ actor_reference: string; action: string }>(
        "SELECT actor_reference,action FROM beauty.admin_audit_logs",
      );
      expect(audit.rows[0]).toEqual({
        actor_reference: admin,
        action: "account.status.suspended",
      });
    });
    it("cannot suspend or remove an admin from the web application", async () => {
      await expect(
        asUser("admin", true, (sql) =>
          sql.query(
            "SELECT beauty.admin_set_user_status($1,'removed','Peer admin removal attempt')",
            [admin],
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("restores accounts without deleting their records", async () => {
      await asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.admin_set_user_status($1,'active','Appeal reviewed and accepted')",
          [customer],
        ),
      );
      expect(
        (
          await db.query<{ status: string }>(
            "SELECT status FROM beauty.users WHERE id=$1",
            [customer],
          )
        ).rows[0].status,
      ).toBe("active");
    });
    it("runtime role has no direct admin-table privilege", async () => {
      await expect(
        asUser("admin", true, (sql) =>
          sql.query("SELECT * FROM beauty.admin_audit_logs"),
        ),
      ).rejects.toThrow(/permission denied/);
      expect(
        (
          await db.query<{ member: boolean }>(
            "SELECT pg_has_role('beauty_app','beauty_admin_ops','MEMBER') AS member",
          )
        ).rows[0].member,
      ).toBe(false);
    });
  },
);

describe("admin display names", () => {
  it("only allows a verified admin to rename labels", async () => {
    for (const [who, verified] of [
      ["", true],
      ["customer", true],
      ["admin", false],
    ] as const)
      await expect(
        asUser(who, verified, (sql) =>
          sql.query(
            "SELECT beauty.admin_set_label('Nails','Nail artistry','Brand update')",
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("customer", false, (sql) =>
        sql.query(
          "UPDATE beauty.platform_labels SET label='Forged' WHERE key='Nails'",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await asUser("admin", true, (sql) =>
      sql.query(
        "SELECT beauty.admin_set_label('Nails','Nail artistry','Brand update')",
      ),
    );
    expect(
      (
        await asUser("", false, (sql) =>
          sql.query<{ key: string; label: string }>(
            "SELECT key,label FROM beauty.platform_labels WHERE key='Nails'",
          ),
        )
      ).rows[0],
    ).toEqual({ key: "Nails", label: "Nail artistry" });
    expect(
      (
        await db.query(
          "SELECT action FROM beauty.admin_audit_logs WHERE action='label.Nails'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects new role keys and blank labels", async () => {
    await expect(
      asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.admin_set_label('admin','Anyone','Invalid rename')",
        ),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    await expect(
      asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.admin_set_label('Professional',' ','Invalid rename')",
        ),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
  });
});
