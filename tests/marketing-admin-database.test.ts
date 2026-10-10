import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
const ids: Record<string, string> = {};
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>, verified = true) {
  return db.transaction(async sql => {
    await sql.exec("SET LOCAL ROLE beauty_app");
    await sql.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified) await sql.query("SELECT set_config('app.admin_verified','true',true)");
    return work(sql);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  await db.exec(await readFile(new URL("./fixtures/marketing-functions.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/migrations/20261010170139_fix_owner_console_audit_writes.sql", import.meta.url), "utf8"));
  for (const authId of ["owner", "admin", "customer", "professional", "opted-out"]) {
    const user = await asUser(authId, sql => enrolAccount(sql, { authId, email: `${authId}@example.test`, displayName: authId, secondFactorAge: null }, "customer"), false);
    ids[authId] = user.id;
  }
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($2,'admin'),($3,'professional')", [ids.owner, ids.admin, ids.professional]);
  const preferences = ["customer_offers","new_professionals","availability","discover","shop","rebooking","professional_growth","marketplace_features","professional_promotions","academy","milestones","shop_selling"];
  for (const user of [ids.customer, ids.professional]) await db.query(`INSERT INTO beauty.marketing_preferences(user_id,${preferences.join(",")}) VALUES($1,${preferences.map(() => "true").join(",")})`, [user]);
});
afterAll(() => db.close());
const presets = ["last_minute_availability","new_professionals","followed_updates","saved_availability","discover_weekly","shop_recommendations","rebooking","customer_referral","professional_growth","professional_features","professional_referrals","academy","milestones","shop_selling"];
it("reproduces the missing audit-table failures and rolls both original actions back", async () => {
  await db.exec(await readFile(new URL("./fixtures/marketing-functions.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/migrations/0103_owner_homepage_media_controls.sql", import.meta.url), "utf8"));
  try {
    await expect(asUser("owner", sql => sql.query("SELECT beauty.owner_launch_marketing_preset('discover_weekly')"))).rejects.toThrow('relation "beauty.owner_audit_log" does not exist');
    await expect(asUser("owner", sql => sql.query("SELECT beauty.owner_set_homepage_media('https://image.example.test/photo.webp',NULL,'Audit reproduction')"))).rejects.toThrow('relation "beauty.owner_audit_log" does not exist');
    expect((await db.query("SELECT id FROM beauty.marketing_campaigns")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM beauty.marketing_outbox")).rows).toHaveLength(0);
  } finally {
    await db.exec(await readFile(new URL("../db/migrations/20261010170139_fix_owner_console_audit_writes.sql", import.meta.url), "utf8"));
  }
});
it.each(presets)("queues the existing %s preset locally for opted-in recipients only", async preset => {
  const result = await asUser("owner", async sql => (await sql.query<{ data: { campaignId: string; recipients: number } }>("SELECT beauty.owner_launch_marketing_preset($1) AS data", [preset])).rows[0].data);
  const rows = (await db.query<{ recipient_user_id: string; cta_url: string }>("SELECT recipient_user_id,cta_url FROM beauty.marketing_outbox WHERE campaign_id=$1", [result.campaignId])).rows;
  expect(result.recipients).toBe(rows.length);
  expect(rows.every(row => [ids.customer, ids.professional].includes(row.recipient_user_id))).toBe(true);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.cta_url.startsWith("/") && !row.cta_url.startsWith("//"))).toBe(true);
  expect((await db.query("SELECT id FROM beauty.admin_audit_logs WHERE target_id=$1", [result.campaignId])).rows).toHaveLength(1);
});
it.each([["customer",true],["admin",true],["owner",false]] as const)("blocks campaign launch for %s with verified=%s", async (who, verified) => {
  const before = (await db.query("SELECT id FROM beauty.marketing_campaigns")).rows.length;
  await expect(asUser(who, sql => sql.query("SELECT beauty.owner_launch_marketing_preset('discover_weekly')"), verified)).rejects.toThrow("FORBIDDEN");
  expect((await db.query("SELECT id FROM beauty.marketing_campaigns")).rows).toHaveLength(before);
});
it("rejects unknown presets and leaves the local campaign queue unchanged", async () => {
  const before = (await db.query("SELECT id FROM beauty.marketing_campaigns")).rows.length;
  await expect(asUser("owner", sql => sql.query("SELECT beauty.owner_launch_marketing_preset('invalid-preset')"))).rejects.toThrow("INVALID_PRESET");
  expect((await db.query("SELECT id FROM beauty.marketing_campaigns")).rows).toHaveLength(before);
});
it("publishes a private feature vote using the unchanged Owner routine", async () => {
  const result = await asUser("owner", async sql => (await sql.query<{ id: string }>("SELECT beauty.owner_create_feature_request('all','Clearer booking','Make booking easier for everyone.') AS id")).rows[0].id);
  expect((await db.query("SELECT id FROM beauty.feature_requests WHERE id=$1", [result])).rows).toHaveLength(1);
  await expect(asUser("customer", sql => sql.query("SELECT beauty.owner_create_feature_request('all','Not allowed','This should remain Owner-only.')"))).rejects.toThrow("FORBIDDEN");
});
it("saves desktop and mobile homepage images atomically with the existing audit log", async () => {
  const desktop = "https://glohaus.test/api/homepage-media?image=homepage-photo.webp";
  await asUser("owner", sql => sql.query("SELECT beauty.owner_set_homepage_media($1,NULL,'Refresh homepage images')", [desktop]));
  expect((await db.query<{ value: { desktopHero: string } }>("SELECT value FROM beauty.platform_settings WHERE key='homepage_media'")).rows[0].value.desktopHero).toBe(desktop);
  expect((await db.query("SELECT id FROM beauty.admin_audit_logs WHERE action='homepage_media_updated'")).rows).toHaveLength(1);
  await expect(asUser("admin", sql => sql.query("SELECT beauty.owner_set_homepage_media(NULL,NULL,'Not authorised')"))).rejects.toThrow("FORBIDDEN");
  await expect(asUser("owner", sql => sql.query("SELECT beauty.owner_set_homepage_media('http://invalid.test',NULL,'Invalid image URL')"))).rejects.toThrow("INVALID_REQUEST");
  expect((await db.query<{ value: { desktopHero: string } }>("SELECT value FROM beauty.platform_settings WHERE key='homepage_media'")).rows[0].value.desktopHero).toBe(desktop);
});
