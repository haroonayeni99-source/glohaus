import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import {
  professionalClients,
  professionalDashboard,
} from "@/modules/dashboard/repository";

const db = new PGlite();
let adaProfessionalId: string;
let beaProfessionalId: string;
let customerId: string;
let adaServiceId: string;

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

  const ada = await asUser("ada", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "ada",
        email: "ada@example.test",
        displayName: "Ada",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  const bea = await asUser("bea", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "bea",
        email: "bea@example.test",
        displayName: "Bea",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  const customer = await asUser("customer", (sql) =>
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
  );
  adaProfessionalId = ada.professionalId!;
  beaProfessionalId = bea.professionalId!;
  customerId = customer.id;
  adaServiceId = (
    await asUser("ada", (sql) =>
      saveService(sql, adaProfessionalId, {
        name: "Gel manicure",
        description: "A careful gel manicure.",
        durationMinutes: 60,
        pricePence: 4500,
        depositPence: 1500,
        active: true,
      }),
    )
  ).id as string;

  await db.query(
    `INSERT INTO beauty.bookings(
      professional_id,customer_id,service_id,service_name,customer_name,professional_name,
      starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at
    ) VALUES ($1,$2,$3,'Gel manicure','Customer','Ada Studio',now()+interval '2 days',now()+interval '2 days 1 hour',60,4500,1500,'confirmed',now()+interval '30 minutes')`,
    [adaProfessionalId, customerId, adaServiceId],
  );
  await db.query(
    "INSERT INTO beauty.payments(booking_id,status) SELECT id,'pending' FROM beauty.bookings WHERE professional_id=$1",
    [adaProfessionalId],
  );
});

afterAll(() => db.close());

describe.sequential("professional dashboard data", () => {
  it("uses the professional's actual services and appointment relationships", async () => {
    const dashboard = await asUser("ada", (sql) =>
      professionalDashboard(sql, adaProfessionalId),
    );
    expect(dashboard.profile).toMatchObject({ businessName: "" });
    expect(dashboard.stats).toMatchObject({
      newBookings: 1,
      upcomingAppointments: 1,
      activeServices: 1,
      reviewCount: 0,
      rating: null,
    });
    expect(dashboard.upcoming).toHaveLength(1);
    expect(dashboard.upcoming[0]).toMatchObject({
      customer_name: "Customer",
      service_name: "Gel manicure",
    });
    expect(dashboard.wallet).toMatchObject({
      availablePence: 0,
      pendingPence: 0,
    });

    const clients = await asUser("ada", (sql) =>
      professionalClients(sql, adaProfessionalId),
    );
    expect(clients).toEqual([
      expect.objectContaining({
        customer_id: customerId,
        customer_name: "Customer",
        appointment_count: 1,
      }),
    ]);
  });

  it("does not disclose another professional's dashboard, clients or wallet", async () => {
    const foreign = await asUser("ada", (sql) =>
      professionalDashboard(sql, beaProfessionalId),
    );
    expect(foreign).toMatchObject({
      profile: null,
      stats: {
        newBookings: 0,
        upcomingAppointments: 0,
        activeServices: 0,
        reviewCount: 0,
        rating: null,
      },
      upcoming: [],
      wallet: null,
    });
    expect(
      await asUser("ada", (sql) => professionalClients(sql, beaProfessionalId)),
    ).toEqual([]);
  });
});
