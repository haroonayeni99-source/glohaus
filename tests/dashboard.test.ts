import { createTestDatabase, applyTestMigrations } from "./test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import {
  professionalClients,
  professionalDashboard,
} from "@/modules/dashboard/repository";

const db = await createTestDatabase();
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
  await applyTestMigrations(db);

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
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [adaProfessionalId],
  );
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

  const conversationId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.conversations(
        customer_id,professional_id,customer_name,professional_name,
        customer_read_at,professional_read_at,last_message_at
      ) VALUES(
        $1,$2,'Customer','Ada Studio',now(),NULL,now()
      ) RETURNING id`,
      [customerId, adaProfessionalId],
    )
  ).rows[0].id;
  await db.query(
    `INSERT INTO beauty.messages(
      conversation_id,sender_user_id,sender_role,body,created_at
    ) VALUES($1,$2,'customer','Can I move my appointment?',now())`,
    [conversationId, customerId],
  );

  await db.query(
    `INSERT INTO beauty.product_orders(
      checkout_reference,provider_payment_intent_id,customer_id,professional_id,
      professional_name,subtotal_pence,delivery_pence,total_pence,status,
      recipient_name,address_line1,city,postcode,country_code
    ) VALUES(
      gen_random_uuid(),'pi_dashboard_order',$1,$2,'Ada Studio',
      2500,0,2500,'paid','Customer','1 Test Street','London','SE1 1AA','GB'
    )`,
    [customerId, adaProfessionalId],
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
      unreadMessages: 1,
      openOrders: 1,
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
    expect(dashboard.plan).toBe("starter");
    expect(dashboard.insights).toBeNull();

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

  it("unlocks business insights only after an active paid plan", async () => {
    await db.query(
      `INSERT INTO beauty.bookings(
        professional_id,customer_id,service_id,service_name,customer_name,professional_name,
        starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,
        completed_at
      ) VALUES
        ($1,$2,$3,'Gel manicure','Customer','Ada Studio',
         now()-interval '8 days',now()-interval '8 days'+interval '1 hour',
         60,4500,1500,'completed',now()-interval '9 days',now()-interval '8 days'),
        ($1,$2,$3,'Gel manicure','Customer','Ada Studio',
         now()-interval '3 days',now()-interval '3 days'+interval '1 hour',
         60,5500,1500,'completed',now()-interval '4 days',now()-interval '3 days')`,
      [adaProfessionalId, customerId, adaServiceId],
    );

    await db.query(
      `INSERT INTO beauty.professional_subscriptions(
        professional_id,plan_key,status,provider_customer_id,
        provider_subscription_id,provider_price_id,current_period_end,
        accepted_terms_version,accepted_at
      ) VALUES($1,'pro','active','cus_insights','sub_insights','price_pro',
        now()+interval '30 days','pricing-v1',now())
       ON CONFLICT(professional_id) DO UPDATE SET
        plan_key='pro',status='active'`,
      [adaProfessionalId],
    );

    const dashboard = await asUser("ada", (sql) =>
      professionalDashboard(sql, adaProfessionalId),
    );

    expect(dashboard.plan).toBe("pro");
    expect(dashboard.insights).toMatchObject({
      completedServiceValuePence: 10000,
      completedBookings: 2,
      repeatClients: 1,
      averageServiceValuePence: 5000,
      cancellationRate: 0,
    });
    expect(dashboard.insights?.busiestWeekday).toBeTruthy();
    expect(dashboard.insights?.quietestWeekday).toBeTruthy();
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
        unreadMessages: 0,
        openOrders: 0,
      },
      upcoming: [],
      wallet: null,
    });
    expect(
      await asUser("ada", (sql) => professionalClients(sql, beaProfessionalId)),
    ).toEqual([]);
  });
});
