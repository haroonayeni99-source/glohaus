import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";

const db = new PGlite();
let professionalId: string;
let customerId: string;
let serviceId: string;
let bookingId: string;

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("location-pro", (sql) =>
    enrolAccount(sql, {
      authId: "location-pro",
      email: "location-pro@example.test",
      displayName: "Location Pro",
      secondFactorAge: null,
    }, "professional"),
  );
  const customer = await asUser("location-customer", (sql) =>
    enrolAccount(sql, {
      authId: "location-customer",
      email: "location-customer@example.test",
      displayName: "Location Customer",
      secondFactorAge: null,
    }, "customer"),
  );
  professionalId = professional.professionalId!;
  customerId = customer.id;

  serviceId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.services(
         professional_id,name,description,duration_minutes,price_pence,deposit_pence,active
       ) VALUES($1,'Journey test','',60,5000,0,true) RETURNING id`,
      [professionalId],
    )
  ).rows[0].id;

  bookingId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(
         professional_id,customer_id,service_id,service_name,customer_name,
         professional_name,starts_at,ends_at,duration_minutes,price_pence,
         deposit_pence,status,hold_expires_at
       ) VALUES(
         $1,$2,$3,'Journey test','Location Customer','Location Pro',
         now()+interval '30 minutes',now()+interval '90 minutes',
         60,5000,0,'confirmed',now()+interval '30 minutes'
       ) RETURNING id`,
      [professionalId, customerId, serviceId],
    )
  ).rows[0].id;
});

afterAll(() => db.close());

describe.sequential("booking journey location privacy", () => {
  it("lets the customer share a current position for their confirmed booking", async () => {
    await asUser("location-customer", (sql) =>
      sql.query(
        `INSERT INTO beauty.booking_location_sessions(
           booking_id,customer_id,professional_id,expires_at,
           last_latitude,last_longitude,last_accuracy_m,last_observed_at
         )
         SELECT id,customer_id,professional_id,ends_at,51.5074,-0.1278,20,now()
         FROM beauty.bookings WHERE id=$1`,
        [bookingId],
      ),
    );

    const own = await asUser("location-customer", (sql) =>
      sql.query<{ sharing: boolean; last_latitude: number }>(
        "SELECT sharing,last_latitude FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [bookingId],
      ),
    );
    expect(own.rows[0]).toMatchObject({ sharing: true, last_latitude: 51.5074 });
  });

  it("lets only the linked professional read the latest shared position", async () => {
    const professional = await asUser("location-pro", (sql) =>
      sql.query<{ last_longitude: number }>(
        "SELECT last_longitude FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [bookingId],
      ),
    );
    expect(professional.rows[0].last_longitude).toBe(-0.1278);

    const stranger = await asUser("location-stranger", async (sql) => {
      await enrolAccount(sql, {
        authId: "location-stranger",
        email: "location-stranger@example.test",
        displayName: "Stranger",
        secondFactorAge: null,
      }, "customer");
      return sql.query(
        "SELECT booking_id FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [bookingId],
      );
    });
    expect(stranger.rows).toEqual([]);
  });

  it("allows the customer to stop sharing while preserving the consent record", async () => {
    await asUser("location-customer", (sql) =>
      sql.query(
        `UPDATE beauty.booking_location_sessions
         SET sharing=false,stopped_at=now()
         WHERE booking_id=$1`,
        [bookingId],
      ),
    );

    const stopped = await asUser("location-pro", (sql) =>
      sql.query<{ sharing: boolean; stopped_at: Date | null }>(
        "SELECT sharing,stopped_at FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [bookingId],
      ),
    );
    expect(stopped.rows[0].sharing).toBe(false);
    expect(stopped.rows[0].stopped_at).not.toBeNull();
  });
});
