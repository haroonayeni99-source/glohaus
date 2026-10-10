import { createTestDatabase, applyTestMigrations } from "./test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { customerHomeSummary } from "@/modules/home/repository";

const db = await createTestDatabase();
let professionalId: string;
let professionalUserId: string;
let customerId: string;
let otherCustomerId: string;

async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  await applyTestMigrations(db);

  const professional = await asUser("home-summary-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "home-summary-pro",
        email: "home-summary-pro@example.test",
        displayName: "Home Professional",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;
  professionalUserId = professional.id;
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [professionalId],
  );

  const customer = await asUser("home-summary-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "home-summary-customer",
        email: "home-summary-customer@example.test",
        displayName: "Home Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  customerId = customer.id;

  const otherCustomer = await asUser("home-summary-other", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "home-summary-other",
        email: "home-summary-other@example.test",
        displayName: "Other Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  otherCustomerId = otherCustomer.id;

  await db.query(
    "UPDATE beauty.professional_profiles SET business_name='Home Studio' WHERE id=$1",
    [professionalId],
  );

  const serviceId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.services(
        professional_id,name,description,duration_minutes,price_pence,deposit_pence,active
      ) VALUES($1,'Silk press','',60,5000,1200,true) RETURNING id`,
      [professionalId],
    )
  ).rows[0].id;

  const bookingId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(
        professional_id,customer_id,service_id,service_name,customer_name,
        professional_name,starts_at,ends_at,duration_minutes,price_pence,
        deposit_pence,status,hold_expires_at
      ) VALUES(
        $1,$2,$3,'Silk press','Home Customer','Home Studio',
        now()+interval '1 day',now()+interval '1 day 1 hour',
        60,5000,1200,'confirmed',now()+interval '2 hours'
      ) RETURNING id`,
      [professionalId, customerId, serviceId],
    )
  ).rows[0].id;

  await db.query(
    `INSERT INTO beauty.payments(
      booking_id,captured_pence,refunded_pence,status
    ) VALUES($1,1200,200,'partially_refunded')`,
    [bookingId],
  );

  const conversationId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.conversations(
        customer_id,professional_id,customer_name,professional_name,
        customer_read_at,last_message_at
      ) VALUES(
        $1,$2,'Home Customer','Home Studio',
        now()-interval '2 hours',now()
      ) RETURNING id`,
      [customerId, professionalId],
    )
  ).rows[0].id;

  await db.query(
    `INSERT INTO beauty.messages(
      conversation_id,sender_user_id,sender_role,booking_id,body,created_at
    ) VALUES($1,$2,'professional',$3,'See you tomorrow',now())`,
    [conversationId, professionalUserId, bookingId],
  );
});

afterAll(() => db.close());

describe("customer Home summary", () => {
  it("combines the customer next booking, inbox and verified payment totals", async () => {
    const summary = await asUser("home-summary-customer", (sql) =>
      customerHomeSummary(sql, customerId),
    );

    expect(summary.nextBooking).toMatchObject({
      id: expect.any(String),
      serviceName: "Silk press",
      professionalName: "Home Studio",
      status: "confirmed",
    });
    expect(summary.messages).toEqual({
      conversationCount: 1,
      unreadCount: 1,
      latestProfessionalName: "Home Studio",
      latestMessageBody: "See you tomorrow",
    });
    expect(summary.payments).toEqual({
      capturedPence: 1200,
      refundedPence: 200,
      pendingRefundPence: 0,
    });
  });

  it("does not expose another customer's Home data through a supplied id", async () => {
    const summary = await asUser("home-summary-other", (sql) =>
      customerHomeSummary(sql, customerId),
    );

    expect(otherCustomerId).not.toBe(customerId);
    expect(summary.nextBooking).toBeNull();
    expect(summary.messages).toEqual({
      conversationCount: 0,
      unreadCount: 0,
      latestProfessionalName: null,
      latestMessageBody: null,
    });
    expect(summary.payments).toEqual({
      capturedPence: 0,
      refundedPence: 0,
      pendingRefundPence: 0,
    });
  });
});
