import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
const users: Record<string, string> = {};
let pro: string, conversation: string;
async function as<T>(who: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [who]);
    return work(tx);
  });
}
const query = <T extends Record<string, unknown>>(
  who: string,
  sql: string,
  args: unknown[] = [],
) => as(who, (tx) => tx.query<T>(sql, args));
async function device(who = "customer", suffix = "one") {
  return (
    await query<{ id: string }>(
      who,
      "SELECT beauty.save_customer_push_subscription($1,$2,$3,$4) AS id",
      [
        `https://web.push.apple.com/${suffix}`,
        "B".repeat(87),
        "a".repeat(22),
        "iPhone test",
      ],
    )
  ).rows[0].id;
}
async function message() {
  return db.query(
    "INSERT INTO beauty.messages(conversation_id,sender_user_id,sender_role,body) VALUES($1,$2,'professional','Secret text never exposed on the lock screen')",
    [conversation, users.pro],
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const who of ["customer", "other", "pro"]) {
    const account = await as(who, (tx) =>
      enrolAccount(
        tx,
        {
          authId: who,
          email: `${who}@example.test`,
          displayName: who,
          secondFactorAge: null,
        },
        who === "pro" ? "professional" : "customer",
      ),
    );
    users[who] = account.id;
    if (who === "pro") pro = account.professionalId!;
  }
  conversation = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.conversations(customer_id,professional_id,customer_name,professional_name) VALUES($1,$2,'Customer','Studio') RETURNING id",
      [users.customer, pro],
    )
  ).rows[0].id;
});
beforeEach(async () => {
  await db.exec(
    "DELETE FROM beauty.push_deliveries; DELETE FROM beauty.in_app_notifications WHERE kind IN('push_test','professional_message'); DELETE FROM beauty.push_subscriptions; DELETE FROM beauty.notification_preferences;",
  );
});
afterAll(() => db.close());
it("customers can manage devices without a booking, with no push opt-in by default", async () => {
  const id = await device();
  expect(await device()).toBe(id);
  const settings = (
    await query<{
      data: { devices: { id: string }[]; preferences: { push: boolean }[] };
    }>("customer", "SELECT beauty.customer_notification_settings() AS data")
  ).rows[0].data;
  expect(settings.devices).toHaveLength(1);
  expect(settings.preferences).toHaveLength(5);
  expect(settings.preferences.every((p) => !p.push)).toBe(true);
  expect(JSON.stringify(settings)).not.toContain("https://web.push.apple.com");
  await expect(
    query("pro", "SELECT beauty.customer_notification_settings()"),
  ).rejects.toThrow("FORBIDDEN");
});
it("does not leak or transfer another account's subscription", async () => {
  const id = await device();
  await expect(device("other")).rejects.toThrow("FORBIDDEN");
  await expect(
    query("other", "SELECT beauty.customer_push_action($1,'test')", [id]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    query("other", "SELECT beauty.customer_push_action($1,'disable')", [id]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    query("customer", "SELECT * FROM beauty.push_subscriptions"),
  ).rejects.toThrow(/permission/);
});
it("generates one private customer message notice and pushes only after consent", async () => {
  await device();
  await message();
  expect(
    (await db.query("SELECT * FROM beauty.push_deliveries")).rows,
  ).toHaveLength(0);
  await query(
    "customer",
    "SELECT beauty.set_customer_push_preference('messages',true)",
  );
  await message();
  const notices = (
    await db.query<{ body: string; href: string }>(
      "SELECT body,href FROM beauty.in_app_notifications WHERE kind='professional_message'",
    )
  ).rows;
  expect(notices).toHaveLength(2);
  expect(
    notices.every(
      (n) =>
        !n.body.includes("Secret text") &&
        n.href === `/messages?thread=${conversation}`,
    ),
  ).toBe(true);
  expect(
    (await db.query("SELECT * FROM beauty.push_deliveries")).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "SELECT * FROM beauty.notification_outbox WHERE notification_id IS NOT NULL",
      )
    ).rows,
  ).toHaveLength(0);
});
it("tests exactly the selected device, throttles and disables it without changing preferences", async () => {
  const first = await device(),
    second = await device("customer", "two");
  await query("customer", "SELECT beauty.customer_push_action($1,'test')", [
    first,
  ]);
  const deliveries = (
    await db.query<{ subscription_id: string }>(
      "SELECT subscription_id FROM beauty.push_deliveries",
    )
  ).rows;
  expect(deliveries).toEqual([{ subscription_id: first }]);
  await expect(
    query("customer", "SELECT beauty.customer_push_action($1,'test')", [
      second,
    ]),
  ).rejects.toThrow("INVALID_REQUEST");
  await query("customer", "SELECT beauty.customer_push_action($1,'disable')", [
    first,
  ]);
  await expect(
    query("customer", "SELECT beauty.customer_push_action($1,'test')", [first]),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (await db.query("SELECT * FROM beauty.notification_preferences")).rows,
  ).toHaveLength(0);
});
it("push opt-out skips queued messages and preserves email choices", async () => {
  await device();
  await db.query(
    "INSERT INTO beauty.notification_preferences(user_id,category,email,push) VALUES($1,'messages',false,true)",
    [users.customer],
  );
  await message();
  await query(
    "customer",
    "SELECT beauty.set_customer_push_preference('messages',false)",
  );
  expect(
    (await db.query("SELECT status FROM beauty.push_deliveries")).rows,
  ).toEqual([{ status: "skipped" }]);
  expect(
    (
      await db.query(
        "SELECT email,push FROM beauty.notification_preferences WHERE user_id=$1",
        [users.customer],
      )
    ).rows,
  ).toEqual([{ email: false, push: false }]);
  await expect(
    query(
      "customer",
      "SELECT beauty.set_customer_push_preference('promotions',true)",
    ),
  ).rejects.toThrow("INVALID_REQUEST");
});
it("rejects untrusted endpoints and inactive, restricted or missing customer identities", async () => {
  await expect(
    query(
      "customer",
      "SELECT beauty.save_customer_push_subscription($1,$2,$3,'Phone')",
      ["https://attacker.test/", "B".repeat(87), "a".repeat(22)],
    ),
  ).rejects.toThrow("INVALID_REQUEST");
  await db.query(
    "UPDATE beauty.users SET restricted_until=now()+interval '1 hour' WHERE id=$1",
    [users.other],
  );
  await expect(device("other", "restricted")).rejects.toThrow("FORBIDDEN");
  await expect(
    query("missing", "SELECT beauty.customer_notification_settings()"),
  ).rejects.toThrow("FORBIDDEN");
});
