import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import {
  inAppNotifications,
  markInAppNotificationRead,
} from "@/modules/notifications/repository";

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
  customerId = customer.id;
  await asUser("outsider", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "outsider",
        email: "outsider@example.test",
        displayName: "Outsider",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  serviceId = (
    await asUser("professional", (sql) =>
      saveService(sql, professionalId, {
        name: "Classic lashes",
        description: "A classic lash appointment.",
        durationMinutes: 60,
        pricePence: 4500,
        depositPence: 1500,
        active: true,
      }),
    )
  ).id as string;
  bookingId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(
        professional_id,customer_id,service_id,service_name,customer_name,professional_name,
        starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at
      ) VALUES($1,$2,$3,'Classic lashes','Customer','Professional Studio',now()+interval '2 days',now()+interval '2 days 1 hour',60,4500,1500,'payment_pending',now()+interval '30 minutes')
       RETURNING id`,
      [professionalId, customerId, serviceId],
    )
  ).rows[0].id;
});

afterAll(() => db.close());

describe.sequential("private in-app notifications", () => {
  it("records a booking-held event for the booking customer", async () => {
    const notifications = await asUser("customer", inAppNotifications);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      booking_id: bookingId,
      kind: "booking_created",
      title: "Booking held",
    });
  });

  it("creates distinct participant events from a confirmed booking", async () => {
    await db.query("UPDATE beauty.bookings SET status='confirmed' WHERE id=$1", [
      bookingId,
    ]);
    expect(await asUser("customer", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "booking_confirmed", title: "Booking confirmed" }),
      ]),
    );
    expect(await asUser("professional", inAppNotifications)).toEqual([
      expect.objectContaining({
        booking_id: bookingId,
        kind: "booking_confirmed",
        title: "New booking confirmed",
      }),
    ]);
  });

  it("prevents a different customer from reading or changing the inbox", async () => {
    const customerNotification = (await asUser("customer", inAppNotifications))[0];
    expect(await asUser("outsider", inAppNotifications)).toEqual([]);
    expect(
      await asUser("outsider", (sql) =>
        markInAppNotificationRead(sql, customerNotification.id),
      ),
    ).toBeNull();
    await expect(
      asUser("outsider", (sql) =>
        sql.query(
          "INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href) VALUES($1,'booking_created','Forged','Forged','/x')",
          [customerId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("only marks the owned notification as read", async () => {
    const notification = (await asUser("customer", inAppNotifications))[0];
    expect(
      await asUser("customer", (sql) =>
        markInAppNotificationRead(sql, notification.id),
      ),
    ).toMatchObject({ id: notification.id });
    expect(
      (await asUser("customer", inAppNotifications)).find(
        (item) => item.id === notification.id,
      )?.read_at,
    ).not.toBeNull();
  });
});
