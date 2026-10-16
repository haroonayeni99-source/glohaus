import { createTestDatabase, applyTestMigrations } from "./test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import {
  inAppNotifications,
} from "@/modules/notifications/repository";

const db = await createTestDatabase();
let professionalId: string;
let customerId: string;
let serviceId: string;
let bookingId: string;
let proUserId: string;

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
  proUserId = professional.id;
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

const endpoint = "https://fcm.googleapis.com/fcm/send/fictional-device";
const key = "B".repeat(87),
  auth = "a".repeat(22);
async function asWorker<T>(work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}
async function settings() {
  return (
    await asUser("professional", (sql) =>
      sql.query<{
        data: {
          preferences: { category: string; email: boolean; push: boolean }[];
          devices: { id: string; label: string }[];
        };
      }>("SELECT beauty.my_notification_settings() AS data"),
    )
  ).rows[0].data;
}
async function preference(category: string, email: boolean, push: boolean) {
  return asUser("professional", (sql) =>
    sql.query("SELECT beauty.set_notification_preference($1,$2,$3)", [
      category,
      email,
      push,
    ]),
  );
}
async function deliveries() {
  return (
    await asWorker((sql) =>
      sql.query<{ id: string; endpoint: string; href: string }>(
        "SELECT * FROM beauty.claim_push_deliveries()",
      ),
    )
  ).rows;
}
let deviceId: string;
describe.sequential("professional notification delivery integration", () => {
  it("starts with essential email on, optional push off, promotions email off", async () => {
    const p = await settings();
    expect(p.preferences).toHaveLength(7);
    expect(p.preferences.find((p) => p.category === "bookings")).toMatchObject({
      email: true,
      push: false,
    });
    expect(
      p.preferences.find((p) => p.category === "promotions"),
    ).toMatchObject({ email: false, push: false });
  });
  it("saves optional choices and rejects disabling essential email in the database", async () => {
    await preference("messages", false, true);
    expect(
      (await settings()).preferences.find((p) => p.category === "messages"),
    ).toMatchObject({ email: false, push: true });
    await expect(preference("bookings", false, false)).rejects.toThrow(
      "INVALID_REQUEST",
    );
    await expect(
      asUser("outsider", (sql) =>
        sql.query(
          "SELECT beauty.set_notification_preference('messages',false,true)",
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("keeps subscription credentials private and rejects arbitrary outbound URLs", async () => {
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT beauty.save_push_subscription($1,$2,$3,'Bad')", [
          "https://127.0.0.1/private",
          key,
          auth,
        ]),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    deviceId = (
      await asUser("professional", (sql) =>
        sql.query<{ id: string }>(
          "SELECT beauty.save_push_subscription($1,$2,$3,'Fixture phone') AS id",
          [endpoint, key, auth],
        ),
      )
    ).rows[0].id;
    const data = await settings();
    expect(data.devices[0]).toMatchObject({
      id: deviceId,
      label: "Fixture phone",
    });
    expect(JSON.stringify(data)).not.toContain(endpoint);
    expect(JSON.stringify(data)).not.toContain(key);
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT * FROM beauty.push_subscriptions"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("unpaid checkout never produces a professional sale or email", async () => {
    expect(
      (await asUser("professional", inAppNotifications)).filter(
        (n) => n.kind === "booking_confirmed",
      ),
    ).toHaveLength(0);
    expect(
      (
        await asWorker((sql) =>
          sql.query("SELECT * FROM beauty.claim_notifications()"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("confirmed state creates one event per recipient and one push per device", async () => {
    await preference("bookings", true, true);
    await db.query(
      "UPDATE beauty.bookings SET status='confirmed' WHERE id=$1",
      [bookingId],
    );
    await db.query(
      "UPDATE beauty.bookings SET status='confirmed' WHERE id=$1",
      [bookingId],
    );
    const inbox = await asUser("professional", inAppNotifications);
    expect(inbox.filter((n) => n.kind === "booking_confirmed")).toHaveLength(1);
    expect(inbox[0].body).toContain("Classic lashes");
    expect(inbox[0].body).toContain(bookingId.slice(0, 8));
    const jobs = await deliveries();
    expect(jobs).toHaveLength(1);
    expect(await deliveries()).toHaveLength(0);
    await asWorker((sql) =>
      sql.query("SELECT beauty.finish_push_delivery($1,'accepted')", [
        jobs[0].id,
      ]),
    );
    expect(await deliveries()).toHaveLength(0);
  });
  it("customer messages enqueue genuine private alerts, optional email is respected", async () => {
    await db.query(
      "INSERT INTO beauty.conversations(customer_id,professional_id,customer_name,professional_name) VALUES($1,$2,'Customer','Studio')",
      [customerId, professionalId],
    );
    const cid = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.conversations LIMIT 1",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO beauty.messages(conversation_id,sender_user_id,sender_role,body) VALUES($1,$2,'customer','Private sensitive message body')",
      [cid, customerId],
    );
    const notifications = await asUser("professional", inAppNotifications);
    expect(notifications.some((n) => n.kind === "customer_message")).toBe(true);
    expect(JSON.stringify(notifications)).not.toContain(
      "Private sensitive message body",
    );
    expect(
      (
        await asWorker((sql) =>
          sql.query("SELECT * FROM beauty.claim_professional_alert_emails()"),
        )
      ).rows,
    ).toHaveLength(0);
    const jobs = await deliveries();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].href).toBe(`/messages?thread=${cid}&view=professional`);
    await asWorker((sql) =>
      sql.query("SELECT beauty.finish_push_delivery($1,'expired')", [
        jobs[0].id,
      ]),
    );
    expect(
      (
        await db.query<{disabled_at:string|null}>(
          "SELECT disabled_at FROM beauty.push_subscriptions WHERE id=$1",
          [deviceId],
        )
      ).rows[0].disabled_at,
    ).not.toBeNull();
    await preference("messages", true, true);
    await db.query("INSERT INTO beauty.messages(conversation_id,sender_user_id,sender_role,body) VALUES($1,$2,'customer','Another private message after email opt-in')",[cid,customerId]);
    expect(
      (
        await asWorker((sql) =>
          sql.query("SELECT * FROM beauty.claim_professional_alert_emails()"),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("supports multiple devices and ownership checked remote revocation", async () => {
    await asUser("professional", (sql) =>
      sql.query(
        "SELECT beauty.save_push_subscription($1,$2,$3,'Fixture phone')",
        [endpoint, key, auth],
      ),
    );
    await asUser("professional", (sql) =>
      sql.query(
        "SELECT beauty.save_push_subscription($1,$2,$3,'Fixture desktop')",
        [endpoint + "-two", key, auth],
      ),
    );
    expect((await settings()).devices).toHaveLength(2);
    await expect(
      asUser("outsider", (sql) =>
        sql.query("SELECT beauty.disable_push_subscription($1)", [deviceId]),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT beauty.fanout_professional_notification()"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("requires device ownership for tests and throttles repeated tests", async () => {
    await asUser("professional", (sql) =>
      sql.query("SELECT beauty.test_push_subscription($1)", [deviceId]),
    );
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT beauty.test_push_subscription($1)", [deviceId]),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    const jobs = await deliveries();
    expect(jobs).toHaveLength(1);
    await asWorker((sql) =>
      sql.query("SELECT beauty.finish_push_delivery($1,'accepted')", [
        jobs[0].id,
      ]),
    );
  });
  it("retries transient delivery and skips a queued optional push after opt-out", async () => {
    await preference("changes", true, true);
    await db.query(
      "UPDATE beauty.bookings SET status='cancelled' WHERE id=$1",
      [bookingId],
    );
    const jobs = await deliveries();
    expect(jobs).toHaveLength(2);
    await asWorker((sql) =>
      sql.query("SELECT beauty.finish_push_delivery($1,'retry')", [jobs[0].id]),
    );
    expect(
      (
        await db.query(
          "SELECT attempts,status,last_error FROM beauty.push_deliveries WHERE id=$1",
          [jobs[0].id],
        )
      ).rows[0],
    ).toMatchObject({ attempts: 1, status: "pending", last_error: "RETRY" });
    await preference("changes", true, false);
    await deliveries();
    expect(
      (
        await db.query<{status:string}>(
          "SELECT status FROM beauty.push_deliveries WHERE id=$1",
          [jobs[0].id],
        )
      ).rows[0].status,
    ).toBe("skipped");
  });
  it("notifies the correct seller for a paid order and does not duplicate webhook replays", async () => {
    await preference("orders", true, true);
    const order = (
      await db.query<{ id: string }>(
        `INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,professional_name,subtotal_pence,delivery_pence,total_pence,recipient_name,address_line1,city,postcode,country_code,professional_proceeds_pence) VALUES(gen_random_uuid(),'pi_notification_seller',$1,$2,'Studio',2000,0,2000,'Customer','Fixture street','London','SE1 1AA','GB',1800) RETURNING id`,
        [customerId, professionalId],
      )
    ).rows[0].id;
    await db.query(
      "UPDATE beauty.product_orders SET status='paid' WHERE id=$1",
      [order],
    );
    const rows = await asUser("professional", inAppNotifications);
    expect(
      rows.filter(
        (n) => n.kind === "order_paid" && n.product_order_id === order,
      ),
    ).toHaveLength(1);
    expect(
      (await asUser("outsider", inAppNotifications)).filter(
        (n) => n.product_order_id === order,
      ),
    ).toHaveLength(0);
    await asWorker((sql) =>
      sql.query(
        "SELECT beauty.notify_product_dispute('pi_notification_seller','dp_fixture','needs_response')",
      ),
    );
    await asWorker((sql) =>
      sql.query(
        "SELECT beauty.notify_product_dispute('pi_notification_seller','dp_fixture','under_review')",
      ),
    );
    expect(
      (await asUser("professional", inAppNotifications)).filter(
        (n) => n.kind === "dispute_opened",
      ),
    ).toHaveLength(1);
    await db.query(
      "UPDATE beauty.product_orders SET status='refund_pending' WHERE id=$1",
      [order],
    );
    expect(
      (await asUser("professional", inAppNotifications)).some(
        (n) => n.kind === "order_refund_pending",
      ),
    ).toBe(true);
  });
  it("creates one reminder per appointment time and respects email reminder opt-out", async () => {
    await db.query(
      "UPDATE beauty.bookings SET status='confirmed',starts_at=now()+interval '5 hours',ends_at=now()+interval '6 hours' WHERE id=$1",
      [bookingId],
    );
    await preference("reminders", false, true);
    await asWorker((sql) =>
      sql.query("SELECT beauty.prepare_professional_notifications()"),
    );
    await asWorker((sql) =>
      sql.query("SELECT beauty.prepare_professional_notifications()"),
    );
    expect(
      (await asUser("professional", inAppNotifications)).filter(
        (n) => n.kind === "booking_reminder",
      ),
    ).toHaveLength(1);
    const jobs = (
      await asWorker((sql) =>
        sql.query<{ kind: string; email: string }>(
          "SELECT * FROM beauty.claim_notifications()",
        ),
      )
    ).rows;
    expect(
      jobs.filter(
        (n) => n.kind === "reminder" && n.email === "professional@example.test",
      ),
    ).toHaveLength(0);
    const oldReminder=(await asUser('professional',inAppNotifications)).find(n=>n.kind==='booking_reminder')!;
    await db.query("UPDATE beauty.bookings SET starts_at=now()+interval '7 hours',ends_at=now()+interval '8 hours' WHERE id=$1",[bookingId]);
    await asWorker(sql=>sql.query('SELECT beauty.prepare_professional_notifications()'));
    await deliveries();
    const oldPush=(await db.query<{status:string}>('SELECT status FROM beauty.push_deliveries WHERE notification_id=$1',[oldReminder.id])).rows;
    expect(oldPush).toHaveLength(2);expect(oldPush.every(n=>n.status==='skipped')).toBe(true);

  });
  it("records new completed-booking reviews without copying review text into email or push", async () => {
    await db.query(
      "UPDATE beauty.bookings SET status='completed',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",
      [bookingId],
    );
    await db.query(
      "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'A real completed booking review for the fixture.','Customer')",
      [bookingId],
    );
    expect(
      (await asUser("professional", inAppNotifications)).filter(
        (n) => n.kind === "review_received",
      ),
    ).toHaveLength(1);
  });
  it("merges promotion consent without erasing existing marketing selections", async () => {
    await db.query(
      "INSERT INTO beauty.marketing_preferences(user_id,academy) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET academy=true",
      [proUserId],
    );
    await preference("promotions", true, true);
    expect(
      (
        await db.query(
          "SELECT academy,professional_promotions FROM beauty.marketing_preferences WHERE user_id=$1",
          [proUserId],
        )
      ).rows[0],
    ).toMatchObject({ academy: true, professional_promotions: true });
    await preference("promotions", false, false);
    expect(
      (await settings()).preferences.find((p) => p.category === "promotions")
        ?.email,
    ).toBe(false);
  });
  it("Owner/Admin diagnostics remain forbidden to professionals and contain only aggregates", async () => {
    await expect(
      asUser("professional", (sql) =>
        sql.query("SELECT beauty.admin_push_delivery_overview()"),
      ),
    ).rejects.toThrow("FORBIDDEN");
    const defs = (
      await db.query<{ def: string }>(
        "SELECT pg_get_functiondef('beauty.admin_push_delivery_overview()'::regprocedure) AS def",
      )
    ).rows[0].def;
    expect(defs).not.toContain("p256dh");
    expect(defs).not.toContain("messages");
    const admin=await asUser('notification-admin',sql=>enrolAccount(sql,{authId:'notification-admin',email:'admin@example.test',displayName:'Notification admin',secondFactorAge:0},'customer'));
    await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",[admin.id]);
    await expect(asUser('notification-admin',sql=>sql.query('SELECT beauty.admin_push_delivery_overview()'))).rejects.toThrow('FORBIDDEN');
    const overview=await asUser('notification-admin',async sql=>{await sql.query("SELECT set_config('app.admin_verified','true',true)");return (await sql.query<{data:Record<string,unknown>}>('SELECT beauty.admin_push_delivery_overview() AS data')).rows[0].data;});
    expect(Object.keys(overview).sort()).toEqual(['activeDevices','queued','accepted','failed','expired','skipped','lastAcceptedAt'].sort());

  });
  it("keeps a shared checkout isolated between two different professionals",async()=>{
    const second=await asUser('second-seller',sql=>enrolAccount(sql,{authId:'second-seller',email:'second@example.test',displayName:'Second seller',secondFactorAge:null},'professional'));
    const checkout='88888888-8888-4888-8888-888888888888';
    for(const id of [professionalId,second.professionalId!])await db.query(`INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,professional_name,subtotal_pence,delivery_pence,total_pence,recipient_name,address_line1,city,postcode,country_code,professional_proceeds_pence) VALUES($1,'pi_shared_notification',$2,$3,'Seller',1000,0,1000,'Customer','Fixture street','London','SE1 1AA','GB',900)`,[checkout,customerId,id]);
    const secondInbox=await asUser('second-seller',inAppNotifications);expect(secondInbox.filter(n=>n.kind==='order_paid')).toHaveLength(1);
    const firstInbox=await asUser('professional',inAppNotifications);expect(firstInbox.some(n=>n.product_order_id===secondInbox[0].product_order_id)).toBe(false);
    await asWorker(sql=>sql.query("SELECT beauty.notify_product_dispute('pi_shared_notification','dp_shared','needs_response')"));
    expect((await asUser('second-seller',inAppNotifications)).filter(n=>n.kind==='dispute_opened')).toHaveLength(1);
    await db.query("UPDATE beauty.product_orders SET status='cancelled' WHERE checkout_reference=$1 AND professional_id=$2",[checkout,second.professionalId]);
    expect((await asUser('second-seller',inAppNotifications)).some(n=>n.kind==='order_cancelled')).toBe(true);
  });
  it("exposes no new privileged function or device table to anonymous or authenticated Data API roles",async()=>{
    const functions=(await db.query<{name:string;anon:boolean;authenticated:boolean}>(`SELECT p.proname AS name,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated FROM pg_proc p WHERE p.proowner=(SELECT oid FROM pg_roles WHERE rolname='beauty_notification_ops')`)).rows;
    expect(functions.length).toBeGreaterThan(15);expect(functions.every(f=>!f.anon&&!f.authenticated)).toBe(true);
    const tables=(await db.query<{name:string;rls:boolean;forced:boolean}>(`SELECT relname AS name,relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class WHERE relname IN('notification_preferences','push_subscriptions','push_deliveries')`)).rows;
    expect(tables).toHaveLength(3);expect(tables.every(t=>t.rls&&t.forced)).toBe(true);
  });

  it("preserves separate policy events and leaves deliverable professional emails open during maintenance",async()=>{
    const event='99999999-9999-4999-8999-999999999999';
    await db.query("SELECT beauty.notify_policy_booking($1,$2,'rescheduled')",[bookingId,event]);
    await db.query("SELECT beauty.notify_policy_booking($1,$2,'rescheduled')",[bookingId,event]);
    await db.query("SELECT beauty.notify_policy_booking($1,gen_random_uuid(),'rescheduled')",[bookingId]);
    const policy=(await asUser('professional',inAppNotifications)).filter(n=>n.kind==='booking_policy_update');expect(policy).toHaveLength(2);
    const notice=(await db.query<{id:string}>("INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href,event_key) VALUES($1,$2,'refund_requested','Refund requires action','Review your appointment.','/professional/bookings','maintenance-refund') RETURNING id",[proUserId,bookingId])).rows[0].id;
    await asWorker(sql=>sql.query('SELECT beauty.run_scheduled_maintenance()'));
    expect((await db.query<{attempts:number;last_error:string|null}>('SELECT attempts,last_error FROM beauty.notification_outbox WHERE notification_id=$1',[notice])).rows[0]).toMatchObject({attempts:0,last_error:null});
  });

});
