import { createTestDatabase, applyTestMigrations } from "./test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import {
  inAppNotifications,
  markInAppNotificationRead,
} from "@/modules/notifications/repository";

const db = await createTestDatabase();
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
  await applyTestMigrations(db);
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
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [professionalId],
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


describe.sequential("product-order in-app notifications", () => {
  let orderId = "";

  it("notifies both customer and professional when a product order is paid", async () => {
    orderId = (
      await db.query<{ id: string }>(
        `INSERT INTO beauty.product_orders(
          checkout_reference,provider_payment_intent_id,customer_id,
          professional_id,professional_name,subtotal_pence,delivery_pence,
          total_pence,recipient_name,address_line1,city,postcode,country_code,
          professional_proceeds_pence
        ) VALUES(
          gen_random_uuid(),'pi_notification_order',$1,$2,'Professional Studio',
          2000,0,2000,'Customer','1 Beauty Road','London','SE1 1AA','GB',1800
        ) RETURNING id`,
        [customerId, professionalId],
      )
    ).rows[0].id;

    expect(await asUser("customer", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_paid",
          title: "Order confirmed",
        }),
      ]),
    );
    expect(await asUser("professional", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_paid",
          title: "New Shop order",
        }),
      ]),
    );
  });

  it("notifies the customer when the product order ships", async () => {
    await db.query(
      `UPDATE beauty.product_orders
       SET status='shipped',tracking_carrier='Royal Mail',
           tracking_number='RM123456',shipped_at=now()
       WHERE id=$1`,
      [orderId],
    );

    expect(await asUser("customer", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_shipped",
          title: "Order shipped",
        }),
      ]),
    );
  });

  it("notifies both sides when a product refund is confirmed", async () => {
    await db.query(
      "UPDATE beauty.product_orders SET status='refund_pending' WHERE id=$1",
      [orderId],
    );
    await db.query(
      "UPDATE beauty.product_orders SET status='refunded' WHERE id=$1",
      [orderId],
    );

    expect(await asUser("customer", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_refund_pending",
        }),
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_refunded",
        }),
      ]),
    );
    expect(await asUser("professional", inAppNotifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_order_id: orderId,
          kind: "order_refunded",
        }),
      ]),
    );
  });
});
