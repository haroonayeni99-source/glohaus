import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import { setFollowing, followState, followedProfessionals } from "@/modules/follows/repository";

const db = new PGlite();
let professionalId: string;
let customerId: string;

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const pro = await asUser("pro-auth", (sql) =>
    enrolAccount(sql, { authId:"pro-auth", email:"pro@example.test", displayName:"Pro", secondFactorAge:null }, "professional"),
  );
  professionalId = pro.professionalId!;
  await asUser("pro-auth", (sql) =>
    updateProfile(sql, professionalId, {
      slug:"pro-studio", businessName:"Pro Studio",
      bio:"A professional beauty studio for follow testing.",
      city:"London", category:"Hair", publicationStatus:"published",
    }),
  );
  const customer = await asUser("customer-auth", (sql) =>
    enrolAccount(sql, { authId:"customer-auth", email:"customer@example.test", displayName:"Customer", secondFactorAge:null }, "customer"),
  );
  customerId = customer.id;
});
afterAll(() => db.close());

describe.sequential("professional following", () => {
  it("lets a customer follow a published professional exactly once", async () => {
    expect(await asUser("customer-auth", (sql) => setFollowing(sql, customerId, professionalId, true)))
      .toEqual({ following:true, followerCount:1 });
    expect(await asUser("customer-auth", (sql) => setFollowing(sql, customerId, professionalId, true)))
      .toEqual({ following:true, followerCount:1 });
  });
  it("shows followed professionals only to the owning customer", async () => {
    const rows = await asUser("customer-auth", (sql) => followedProfessionals(sql, customerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id:professionalId, slug:"pro-studio", business_name:"Pro Studio" });
    expect(await asUser("pro-auth", (sql) => followedProfessionals(sql, customerId))).toEqual([]);
  });
  it("does not expose follower identity anonymously", async () => {
    expect((await asUser("", (sql) => sql.query("SELECT * FROM beauty.professional_follows"))).rows).toEqual([]);
    expect(await asUser("", (sql) => followState(sql, null, professionalId)))
      .toEqual({ following:false, followerCount:1 });
  });
  it("allows the customer to unfollow", async () => {
    expect(await asUser("customer-auth", (sql) => setFollowing(sql, customerId, professionalId, false)))
      .toEqual({ following:false, followerCount:0 });
  });
});
