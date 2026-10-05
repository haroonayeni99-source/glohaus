import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("keeps the payment login inert and confined to the payment worker", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA beauty;
      CREATE ROLE beauty_app NOLOGIN; CREATE ROLE beauty_catalog NOLOGIN;
      CREATE ROLE beauty_admin_ops NOLOGIN; CREATE ROLE beauty_booking_ops NOLOGIN;
      CREATE ROLE beauty_financial_worker NOLOGIN; CREATE ROLE beauty_payment_worker NOLOGIN;
      CREATE TABLE beauty.private_data(id integer);`);
    const migration = await readFile(new URL("../db/migrations/0095_payment_runtime_login_role.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const row = (await db.query(`SELECT rolcanlogin,rolsuper,rolbypassrls,rolinherit,
      rolcreatedb,rolcreaterole,rolreplication,
      pg_has_role(rolname,'beauty_payment_worker','MEMBER') AS payment_member,
      pg_has_role(rolname,'beauty_booking_ops','MEMBER') AS booking_member,
      has_schema_privilege(rolname,'beauty','CREATE') AS schema_create,
      has_table_privilege(rolname,'beauty.private_data','SELECT') AS table_read
      FROM pg_roles WHERE rolname='glohaus_payment_runtime'`)).rows[0];
    expect(row).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false,
      rolinherit: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false,
      payment_member: true, booking_member: false, schema_create: false, table_read: false });
    await db.exec("SET ROLE glohaus_payment_runtime; SET ROLE beauty_payment_worker; RESET ROLE;");
    await db.exec("ALTER ROLE glohaus_payment_runtime BYPASSRLS;");
    await expect(db.exec(migration)).rejects.toThrow("GLOHAUS_PAYMENT_RUNTIME_ROLE_UNSAFE");
  } finally {
    await db.close();
  }
});
